# Report: 傅里叶模式 (fourier-impl)

## 改了什么

`index.html` 新增拟合模式开关(贝塞尔默认 / 傅里叶),分叉点严格按 brief:轮廓追踪 + 间隙桥接完成后的像素级路径(`paths`,RDP 之前)。

1. **纯函数(PURE PIPELINE 区块新增)**:`pathArcLength` `resamplePathUniform`(均匀弧长重采样)`isPathClosed` `chooseResampleCount`(自适应 2 的幂重采样点数)`mirrorClosePath`(开路径 forth-and-back 镜像闭合)`complexDFT`(复数 DFT,z(t)=x+iy,保留正负双向频率)`topHarmonics`(DC 永久保留 + 按模取前 N)`reconstructPoint`/`reconstructPath`(截断级数重建)`flipHarmonicsY`(像素空间→Desmos 数学空间的频域系数翻转,见下)`epicycleChain`(本轮系逐圈坐标)。
2. **Desmos latex**:`fourierPathLatex`,紧凑 `list + total()` 形式,x/y 共用同一组 R(模)/N(频率)/P(相位)list,y 轴用 `sin` 而非额外的相位偏移 list(见推导)。
3. **UI**:工具栏加 `[~] 傅里叶` toggle(与 `[*] 填色` 同款样式);新增"谐波数"滑杆(4–120,默认 40),与"容差"滑杆互斥显示;stats 行按模式分叉(路径数/谐波总数/耗时 vs 边缘像素/路径/曲线/耗时);填色统计两模式共用不变。
4. **render() 分叉**:`paths` 之后按 `fourierMode` 分两支,贝塞尔分支代码**逐字节未改动**(只是包进 `if (!fourierMode) {...}`),傅里叶分支产出 `currentFourierPaths`(数学空间,供 Desmos + 动画 + 预览共用)。填色管线(`extractFillPolygons` 及其调用)完全共用、未拆分。
5. **动画**:新增独立的 `startFourierDrawAnimation`(不改动、不复用 `startDrawAnimation` 内部逻辑,避免任何风险传导到已验收的贝塞尔路径),按弧长降序取最长 5 条("featured")顺序展示完整本轮系(圆圈链 + 转动 + 笔迹),其余路径("batch")并发只画笔迹加速扫过;两阶段共用现有 fills-then-final-commit 骨架、paint-barrier 收尾、`speedMultiplier`/`graphpaperBounds`/`performance.now()`/dt 钳制等第五期基建原样复用。
6. **预览面板**:新增 `drawFourierPreview`,用预计算的重建采样点画"图 2. 拟合曲线",两模式共用同一 `#previewCanvas`/折叠/降级机制,`showDesmosFailureNotice` 未改动。
7. 新增 `test_fourier.js`(直接从 `index.html` 抽取纯函数,不维护副本,防止漂移),22 项断言全绿。

## Spike 结论(node + playwright,真实 Desmos v1.11 API)

Brief 要求的紧凑 `list + total()` 参数方程写法**验证结果:能用,但有一个必须绕开的解析陷阱**——`calculator.expressionAnalysis` 显示,裸标量后面紧跟 `\left[...\right]`(如 `2\pi\left[1,2,-3\right]`)会被 Desmos 解析成**列表索引**(`Cannot index a number with a list of numbers`),不是乘法;这个规则对任意表达式生效,不只是具名变量。修法:list 字面量前面永远用显式 `\cdot`(实现里把 list 放在乘积最前面:`N\cdot 2\pi\cdot t+P`)。修正后用 `expressionAnalysis`(`isGraphable:true, isError:false`)+ 截图双重确认可用,故未回退到展开求和式。

## 频域系数的像素→数学空间翻转(flipHarmonicsY)

贝塞尔分支翻转 y 是逐控制点 `height - y`,傅里叶的 dc/harmonics 是频域系数,不能逐点套用。推导:z(t)=x+iy,翻转 y 等价于 `new_z(t) = conj(z(t)) + i·height`;对 `z(t)=Σc_n·exp(i2πnt)` 取共轭把 n 变成 -n(模不变、相位取负),`i·height` 只平移 DC 的虚部。即:每个谐波 `{n,mag,phase}` → `{-n, mag, -phase}`,DC → `[dc_x, height-dc_y]`。已用 Node 数值验证(直接对翻转后的点重新 DFT vs 对系数做上述变换)两者重建曲线在 50 个采样点上最大偏差 ~3e-12px(浮点噪声量级),见 `test_fourier.js` 第 6 组断言。

## 参数取值依据

- **谐波数默认 40**(滑杆 4–120):brief 建议 30–60,实测圆只需 1 个谐波就近乎完美,40 对矩形四角已足够清晰且无明显 Gibbs 抖边,demo-dragon-v2 在 40 下轮廓连续可辨、变换耗时远低于预算,故取区间中段而非上限,兼顾视觉质量与 latex/圆圈数量(避免 Desmos 表达式过长)。
- **重采样点数 M**:2 的幂,从 32 起倍增直到 ≥ 路径弧长(上限 512)——短路径不过采样,长路径(龙身轮廓)有足够密度支撑 40+ 谐波。
- **闭合判定阈值**:`max(4px, 弧长×2%)`——绝对下限防止极短路径被误判,相对项让长路径(龙身)容忍桥接后残留的几像素缺口。
- **动画调度**:featured 固定 5 条 × 1600ms = 8000ms,与 `SWEEP_TOTAL_TARGET_MS`(贝塞尔 ~8s)对齐;batch 路径复用贝塞尔的 interval 钳制公式(2–40ms)分摊在同一时间窗口内并发画,不单独发明新常量。
- **"曲线上限"滑杆在傅里叶模式下保留可见但不生效**:brief 只要求隐藏"容差"、显示"谐波数",未提及重新定义此滑杆;实测所有测试图傅里叶路径数(5–573)远低于任何有意义的 cap 阈值,强行复用容易引入新语义歧义,故按兵不动,已在代码注释标注。

## 自测结果(真机 + 真 Desmos,node+playwright headless Chrome,127.0.0.1:8742)

Playwright MCP 桥接在任务期间断线(`gateway_status` 显示 `unavailable`),改用 `playwright-core` 直接驱动本机已装的 Google Chrome(`channel:'chrome'`),同样是真实浏览器 + 真实 Desmos API,未降级为"代码像对的"。

逐判据:

1. **零回归**:5 张基线图在贝塞尔模式下曲线数与 progress.md 第四期基线**逐位精确匹配**(test-shapes 33、reference 1217、bunny 890、dragon-v1 3116、dragon-v2 1049 曲线/86 路径),0 console error。另做了模式来回切换测试(贝塞尔→傅里叶→贝塞尔,同一页面同一张图),切回后曲线数与首次渲染完全一致,证明共享状态变量(`currentMathBeziers`/`currentCurveCount`/`currentFillPolygons`)无跨模式污染。已通过。
2. **test-shapes 傅里叶**:圆近乎完美(1 谐波级精度可达 <1px RMS,实际用 40),矩形四角清晰可辨、角部轻微圆化、无 Gibbs 大幅抖边,截图确认(5 路径/200 谐波总数/161ms)。已通过。
3. **demo-dragon-v2 傅里叶**:86 路径 = 86 表达式(与路径数完全相等),轮廓目视连续可辨,截图确认;耗时 707ms(<2s 预算)。已通过。顺带跑了另外 4 张图(reference 322 路径 758ms、bunny 335 路径 837ms、dragon-v1 573 路径 1526ms)全部 <2s、0 错误,超出判据要求但确认了缩放稳健性。
4. **动画**:程序断言 `epicycleChain` 的圆圈链末端 tip 与 `reconstructPoint` 在 5 个采样 t 上精确重合(<1e-9px,数值恒等,非仅目视);截图确认动画中笔尖轨迹与圆圈链末端在像素空间对齐;中途 `setMathBounds` 平移(模拟用户拖拽)后截图确认曲线与圆圈整体随之平移、无漂移(复用与贝塞尔完全相同的 `graphpaperBounds` 逐帧重查机制);重播([>] 按钮)测试:动画重启、进度归零、完成后 stats 与首次渲染完全一致(无 NaN/无污染);绘制中拖动速度滑杆到 3x 立即生效(`speedVal` 同步更新);完成后笔迹到 Desmos 真曲线换手截图确认无感(位置精确重合)。已通过。
5. **console 0 error**:全部测试场景(5 图 × 2 模式、fox-color 填色+傅里叶组合、重播、dpr=2)仅出现 1 条预期内的 Desmos 试用 key warning,无其他 error;dpr=2(`deviceScaleFactor:2` 真实浏览器上下文,非 CSS 缩放模拟)下 overlay canvas 缓冲区/CSS 尺寸比精确等于 2.000,截图确认动画中与终态均无偏移。已通过。
6. **Desmos 加载失败降级模式**:用 `page.route` 真实拦截 desmos.com 请求触发降级(而非凭空调用内部函数),截图确认傅里叶模式下离线预览画布全屏显示重建后的龙轮廓曲线,计算器隐藏、折叠面板自动展开,行为与贝塞尔模式降级路径完全一致(共用同一套 CSS/JS 机制)。已通过。

填色+傅里叶组合额外验证(brief 明确要求两者共用不冲突):demo-fox-color.png 在傅里叶模式下 182 路径/7271 谐波总数/83 填色区块同屏正确渲染(填色在下、线稿在上,与贝塞尔模式相同的 z-order 约定),0 console error。

## Node 单测

`test_fourier.js`:直接从 `index.html` 用标记注释边界抽取纯函数源码并 `vm.runInContext` 求值(不维护独立副本),22 项断言全绿,覆盖:圆 1 谐波高精度重建、方形 RMS 随谐波数单调不增且有界、开路径镜像闭合无跳变+半程笔迹匹配真实路径起止点、DC 永久保留、`epicycleChain` 末端与解析重建的数值恒等、`flipHarmonicsY` 系数变换与"先翻转再 DFT"的数值恒等(<1e-6px)。

现有 `test.js`/`test_thinning.js`/`test_rectangle_regression.js`(progress.md 与 brief 提及)在项目目录及机器上均**不存在**(推测是此前会话的临时脚本,未落盘提交)——用等价但更强的真机浏览器回归(判据 1)覆盖了这一缺口,而非跳过验证。

## 遗留

- "谐波数"默认 40 是在 5 张测试图上目视调出的折中值,未做用户可感知的自动谐波数推荐(按路径复杂度自适应默认值);如需更智能的默认值,可参考 `chooseResampleCount` 的思路按弧长/路径数动态调整。
- "曲线上限"滑杆在傅里叶模式下 visible-but-inert,是有意选择而非疏漏(见"参数取值依据"),如产品需要可后续加一个傅里叶专属的"路径上限"。
- Playwright MCP 桥接在本任务期间处于 `unavailable` 状态(非本次改动导致),所有真机验证改用本机 `playwright-core` + 系统 Chrome 完成,结论同等可信,但建议后续检查/修复该 MCP 连接以恢复标准工作流。
- 动画的 featured/batch 5 条阈值、1600ms 单条时长为固定常量,未做"根据路径总数/总弧长动态调整 featured 数量"这类更精细的自适应;当前 5 张测试图与常见图片规模下观感良好,极端案例(例如只有 1-2 条超长路径 + 数百条极短路径)未专门测试。
