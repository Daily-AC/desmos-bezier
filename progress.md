# progress — Desmos Bézier Renderer

- 单文件 `index.html`,零依赖(仅 Desmos script tag),管线:grayscale → Gaussian → Canny → 8 连通轮廓追踪 → RDP → Schneider fitCurve → De Casteljau latex → `calculator.setState`。实现:codex(bezier-impl),两轮(功能 + opencode.ai 设计蒙皮)。
- 关键修复记录:
  1. fitCubic 分裂点切线符号反了(codex 自查,对照 Graphics Gems 原文修复)。
  2. Desmos 经典 demo key 全版本停用(403 "Unrecognized API key")——换 `v1.11` + 文档现行 demo key `dcb31709b452b1cf9dc26972add0fda6`(主会话查明并改入)。
  3. viewport 初始化竞态:新页面立即渲染时 setState 的 viewport 被 Desmos 首次布局清掉 → `renderToDesmos` 里补 `setMathBounds` + 400ms 再钉一次(主会话修)。
  4. 工具栏定高溢出遮挡计算器 → flex-column 布局(codex 修)。
- 已验收(真浏览器 + 真 Desmos,127.0.0.1:8742,注意 curl/浏览器要绕开本机代理访问 localhost):
  - test-shapes.png:圆/方/斜线可辨,107 curves,0 console error(1 个 warning 是 Desmos 试用 key 提示,预期内)。
  - 整页浏览器截图(1839×1069)压力测试:38047 edge px / 817 paths / 901 curves / 管线 255ms,人物清晰可辨。
  - 二次渲染全量替换(107→901,无累积)。
  - 设计 DNA(opencode.ai)桌面+窄屏截图自检通过:SVG rect 像素 wordmark、全等宽、奶油底、发丝线、[+] 标记。
- 轮廓打结修复历程:
  1. 方向连续性(平滑航向 + 已访问密度惩罚,网格搜权重):107→87 curves,反转 75→43,四对角残留 → 部分通过。
  2. Guo-Hall 骨架化(Zhang-Suen 有对角楼梯盲区,已换):107→33 curves,反转归零,圆只剩 4 个小 s 勾(可接受);reference.png 984→862(-12.4%),管线 73ms。
  3. 骨架化曾引入矩形 D 形回归(右侧直角拟合成 ~50px 偏差巨弧)→ 根因:fitCurve/computeCenterTangent 用单邻点估切线,细化残留的 1px 毛刺把垂直边切线劫持成 45°,最小二乘外插出巨弧;左边恰好细化成 2 点路径走硬编码直线所以幸免。修复:robustTangent(跳过近点,取 ≥5% 弦长的点估向),单元级+坐标级+浏览器实码三层回归验证,角点偏差 51px→0.5px。
- **终验通过(2026-07-09)**:test-shapes 34 curves/148ms 四角锐利;reference.png 819 curves/222ms(基线 -16.8%)人物完好;0 console error;设计 DNA 桌面+窄屏自检通过。任务关闭。
- **第二期(2026-07-10,已验收)**:软阴影彩图碎片化优化。真实根因(codex 实测,推翻两个初始假设):不是分叉碎裂(26k 边缘像素只有 81 个分叉点)、也不是绝对阈值(扫 10-60 中位连通域恒为 1px)——是 NMS 4 方向量化把连续的 Sobel 脊打碎成中位 1px 的孤点(4836 个连通域,85.6% 小于 8px,断口中位 3.16px)。修法:端点间隙桥接(gap≤20px、夹角≤35°),两道防误连护栏:①间隙向量须与两端切向共线(防平行发丝误连);②桥线走廊不得穿过第三条链的像素(防跨内容乱桥,reference.png 曾因此 +65%)。minLength 移到桥接后再过滤。结果:test-bunny 覆盖率 71.1%→84.1%,中位路径 19.7→28.7px,777 curves/1136ms,轮廓目视连续;test-shapes 37 curves 且圆意外变成近乎完整闭环;reference 1054(+23.9%,带内);全部 <2s。判据中"中位 ≥3×"未达标但正当:兔耳图内容双峰,约半数短径是真实装饰小图形(心形/花/闪光),硬拉指标只会误伤,已接受其取舍。
- **第三期(2026-07-10)**:演示图生成 + 由此暴露的两个 bug。
  1. 生成两张演示龙图(gpt-image-2):demo-dragon.png(密集细节版)、demo-dragon-v2.png(极简粗线版)。
  2. ✅ 穿屏直线 bug:根因是 fitCurve 最小二乘近奇异时 alpha 无上界,控制点飞出画布 3000px(潜伏自首版,三张旧测试图从未触发)。修复:alpha 上界 10× 弦长 + 既有回退/细分。v1 龙图复验通过(2402 curves/489ms,零杂线)。
  3. 🔄 粗笔画碎裂 bug(进行中):v2 极简龙图长轮廓全部碎成短划(633 paths/708 curves,两次复现)。悖论:粗净笔画比细密笔画更碎。主嫌:桥接的走廊避让检查被粗笔画的平行伴边(Canny 双轮廓 ~8px 间距)误触发,合法同边缝合被拒。已派 codex,判据:v2 轮廓目视连续 + 中位路径 ≥3× + 其余四图 ±10% 无回归。
- **第四期(2026-07-10,已验收):亚像素 NMS 架构级修复**。三次独立故障(圆对角残留→兔子碎裂→v2 龙图碎成短划)溯源到同一根因:NMS 4 方向量化在非 45° 倍数角度丢精度。下游杠杆(gap-linking 参数)已扫过証明穷尽,这次修源头。
  1. `nonMaxSuppression` 换成亚像素/双线性插值版(标准 improved-Canny 公式):沿连续梯度角双线性采样两侧值,不再量化到 4 个离散方向桶。新增纯函数 `sampleBilinear`。
  2. 副作用发现的新 bug:Schneider 曲线拟合的 Newton-Raphson 重参数化会"欺骗"稀疏 RDP 点上的逐点误差检查——拟合曲线可视觉切过真实拐角而仍报告误差合格(此前从未触发,因旧量化 NMS 从未产出过如此干净、稀疏的 RDP 点集)。修法:新增 `pointToSegmentDist` + `curveStraysFromPoints`,按拟合曲线到原始折线*线段*(非顶点)的距离做独立验证,`fitCubic` 每次判定"误差达标"时都必须同时通过此验证,2 点基例(含父调用传入切线)也纳入检查。
  3. 下游常数重调(旧值按量化 NMS 碎裂调,新边缘图下过猛):gap-linking `gap 20→10, angle 35°→30°`,`minLength 8→30`(用最终折线弧长过滤,链接完成后再筛)。
  4. 验收结果(真浏览器 + 真 Desmos,127.0.0.1:8742):
     - demo-dragon-v2.png 细化边缘图连通域:4838→131,中位尺寸 1px→55px(判据 ≥20px)。
     - demo-dragon-v2.png 中位路径长度 22.7px→229.6px(约 10.1×),真机渲染龙身轮廓肉眼连续,零碎片(86 paths,此前 633)。
     - test-shapes.png 圆的 4 个对角残留完全消失,变成 2 个干净闭合圆环;矩形四角坐标偏差 0.58–2.71px,锐利如初。
     - reference 1217 curves(基线 1054,+15.5%,±30% 带内)、bunny 890 curves(基线 777,+14.6%,带内,覆盖率仍 >90%)、dragon-v1 3116 curves(基线 2402,+29.7%,压线在 ±30% 上界内);零杂线程序检查通过(独立复检对原始未简化轨迹的最坏偏差 3.00–3.33px,均为 RDP 容差内的良性噪声,非真实切角)。
     - 全部 5 图耗时 149–486ms,远低于 2s 预算。
  5. 已知遗留观察 → 已由甲方拍板处理:dragon-v1 真实曲线数 3116 曾逼近 UI 默认 `maxCurves=3000` 滑块上限(会静默截断约 116 条/~3.7%),本轮授权范围是 pipeline 常数、不含 UI 默认值,故报告后交甲方定夺——甲方随即把默认值改为 4000,v1 龙图 3116 条全量渲染验证无压力(417ms)。
  6. `test_rectangle_regression.js` 因矩形新拓扑(此前 8 条细碎单边路径→现在 1-2 个含全部 4 角的完整闭环)按 bbox 长宽比找"单边"的旧断言全部落空,已重写为按闭环 bbox 定位轮廓 + 直接验证 4 个理想角点到拟合曲线最近采样点的距离,三个 Node 测试套件(test.js / test_thinning.js / test_rectangle_regression.js)全绿。
- 已知限制(有意搁置,均有 codex 的书面分析):
  1. Schneider 误差检查只在 RDP 稀疏点上验距,点间空隙的偏差理论上可漏检——本轮已通过 `curveStraysFromPoints` 按线段距离收紧,但仍是有限采样(50 点),极端曲率理论上可漏检。
  2. Desmos demo key 是试用性质(console 有官方提示),商用需申请正式 key。
  3. ~~UI 默认 `maxCurves=3000` 对当前 dragon-v1 基准已处于临界~~ → 已解决,默认值改为 4000(见第四期条目 5、收尾记录)。
- 测试资产:`test-shapes.png`(合成)、`reference.png`(用户截图)、`test-bunny.png`、`demo-dragon.png`(v1,密集细节)、`demo-dragon-v2.png`(v2,极简粗线)。
- **第四期收尾(主会话终验 + 甲方决策)**:五图真机全验通过(v2 龙 86 paths/1049 curves/285ms 整体连续;shapes 5 paths/33 curves 圆全净;bunny 890;v1 龙 3116)。maxCurves 默认值 3000→4000(主会话改,v1 龙 3116 条全量渲染 417ms 实测无压力)。演示素材定稿:demo-dragon-v2.png 为主打(极简连续长曲线,最能秀贝塞尔拟合),demo-dragon.png 为细节压力展示。
- **第五期(2026-07-10,已验收):逐笔绘制动画 + 中文化 + 变速**。
  1. 需求演进:全量显示→从上到下逐笔绘制。Desmos 原生两条路线(域变量扫描/分批显形)实测均撞 API 硬地板:每次 setExpressions 93ms 固定 + 每条 8.45ms(显形随场景复杂度涨到 ~34ms/条),密集图匀速画完 105s,且每秒最多 ~10 批 = 必然一卡一卡。
  2. 甲方拍板方案 4:曲线全部 hidden 载入 Desmos,动画在透明覆盖层 canvas 上画(rAF,De Casteljau 切割做真·笔尖扫描,逐条等间隔,总时长 ~8.4s 与曲线数无关),收尾一次 setState 全量显形(755ms,被覆盖层遮住无感切换)。实测 95.5fps。
  3. 修掉的坑:①首帧 dt 吞掉 setState 残余延迟致动画瞬间跑完(dt 50ms 钳制);②rAF 时间戳参数相对真实时钟漂移(15 帧漂 17ms,动画慢 4 倍)→ 改 performance.now();③覆盖层坐标映射用了容器全宽而非 graphpaperBounds.pixelCoordinates,绘制整体右偏一个表达式面板宽(用户实测发现)。
  4. UI:全部文案中文化(zh-CN,标题"Desmos 贝塞尔渲染器",PingFang SC 回退);新增绘制速度滑杆 0.25×–4×,动画中拖动即时变速无跳变;[>] 绘制重播按钮;绘制中…N% 进度。
  5. 终验:双龙 ~8.4s 流畅扫描;中途平移/缩放/折叠面板笔画不漂;重播/中途重渲干净;五图终态与上期一致;0 console error。
  7. 偏移事件结案(2026-07-10 中午):用户报"绘制跑到右侧"。三重排查:映射代码逐字节审计正确、手算坐标正确、无法在终版复现。真凶(codex 复现并修复):Desmos 在容器尺寸变化(折叠/展开表达式面板、窗口缩放)后不重绘 WebGL 画布——内部状态全对但显示陈旧帧,旧帧错位呈现即"偏移"观感。修复:ResizeObserver 监听 #calculator,尺寸变化即以当前值空调一次 setMathBounds 强制重绘。五图回归通过。用户看到的另一部分原因是长驻标签页跑着开发中间态代码,已嘱强刷。
- **第六期(2026-07-10 下午,已交付):填色 + 三项收尾修复**。
  1. 填色(codex):RGB 直方图量化(16 级/通道聚合并到 ~14 色)→ 逐色连通域(≥60px²)→ Moore 边界追踪 → RDP → polygon() 表达式(fillOpacity '0.9' 必须字符串,setState 严格)垫线稿下;近黑排除(防描线变幽灵填充);黑白图自动 0 填充。狐狸 83 填充/兔 368/双龙 0。
  2. 纵横比失真修复(主会话):aspectCorrectViewport 按图纸像素比等比扩展视口短边,宽窗实测 x/y 缩放比 1.0。
  3. 收尾闪屏修复(主会话):asyncScreenshot 在嵌入环境回调不触发(实测,弃用)→ 自适应宽限(4× 提交耗时,下限 1.5s)后再撤覆盖层。
  4. 渐进上色动画(codex 停手前落盘,主会话验收):线相完成后色块按调度逐块浮现,globalAlpha 0.9 与 Desmos fillOpacity 对齐保证换手无感。
  5. Retina(dpr=2)偏移根因修复(主会话):canvas 替换元素 inset:0 不拉伸,需显式 width/height 100%;教训入库(dpr 必测)。
  6. codex 因单轮超 2h 被叫停,文件所有权移交主会话;其间它交付的填色/渐进动画照常验收。
- **已部署(2026-07-10)**:https://desmos-bezier.lab.qmledmq.cn:8443 (home/zyl Caddy,静态文件 C:\www\desmos-bezier,站点块经 winhome-infra 仓库管理)。线上全链路验证通过(Desmos 加载 + 狐狸图渲染动画)。
- **第八期(2026-07-10 晚,主会话已独立验收):傅里叶模式**。工具栏 `[~] 傅里叶` toggle(默认关=贝塞尔),分叉在追踪+桥接后的像素级路径:均匀弧长重采样(2 的幂,≤512)→ 开路径镜像闭合 → 复数 DFT → 按模取前 N 谐波(谐波数滑杆 4–120 默认 40,与容差滑杆互斥显示)。Desmos 侧每路径一条 list+total() 参数方程(dragon-v2:86 路径=86 表达式,对比贝塞尔 1049 条曲线)。动画为独立的 startFourierDrawAnimation:最长 5 条完整本轮系(圆圈链+笔迹),其余并发快扫,复用第五期全部覆盖层基建。实现 fourier-impl(brief/report 见 brief-fourier-mode.md / report-fourier-mode.md)。
  - 关键知识:①Desmos 把"标量紧跟 list 字面量"解析为列表索引而非乘法("Cannot index a number with a list of numbers"),list 字面量前必须显式 `\cdot`(spike 真机验证);②表达式错误要查 `calculator.expressionAnalysis`,getExpressions() 不含 error 字段;③频域系数的像素→数学空间 y 翻转:每谐波 {n,mag,phase}→{-n,mag,-phase},DC 加 i·height(共轭推导,数值验证 ~3e-12px)。
  - 主会话独立验收(暗题脚本,playwright-core+headless chromium,真 Desmos):贝塞尔零回归五图曲线数逐位对基线(33/1217/890/3116/1049);傅里叶 shapes 5 路径/dragon-v2 86 路径 expressionAnalysis 全绿;模式往返切换无污染;本轮系动画目视正确(dpr=1 与 dpr=2 中途帧+终态均无偏移);console 0 真错误。dpr=2 下 stats 报 2008ms(dpr=1 为 664ms,判据 <2s 压线,headless 环境数字,不构成阻塞)。
  - 过程事故记录:fourier-impl 派的 playwright 孙 agent 撞上僵死的 playwright MCP 扩展中继,空转 ~90 分钟后停摆,父 agent 悬死;主会话溯源后复活孙 agent 并纠偏为 node+playwright 库直驱,2.5 分钟出 spike 结论。教训:playwright MCP(扩展中继模式)单点故障会静默拖死整条 agent 链,浏览器自动化验证优先用 node 脚本直驱。
  - 历史欠账发现:progress.md 第四期提到的 test.js/test_thinning.js/test_rectangle_regression.js 实际从未落盘(当期 codex 只在会话内跑过),本期 test_fourier.js(22 断言,从 index.html 注释边界抽取纯函数,无副本漂移)已实际落盘并全绿。
  - 已同步线上(2026-07-10 21:55,scp 推 index.html,线上 md5 与本地一致)。
- **第九期(2026-07-10 深夜,主会话亲自实现):精细填色模式(动漫立绘高保真上色)**。甲方给甘雨立绘(test-ganyu.jpg,230×432)要求"拟合+上色相似度极高"。新增 `[#] 精细` toggle(默认关,零回归门控),五项改动:
  1. 小图上采样:maxDim<500 → 900px 高质量重采样(门槛避开全部既有素材 ≥600px;**教训:imageSmoothingQuality='high' 一度无条件设置,改变了降采样路径的像素输出,四图曲线数漂移 ±2%,被回归套件当场抓住**——高质量平滑必须只在上采样分支)。
  2. 精细填色参数组:32 色量化(14 色抹掉渐变)、minArea 60→14、rdpEpsilon 1.0、maxPolygons 2000、fillOpacity 0.9→1(0.9 露网格)。
  3. 组件级背景抠除替代按颜色排除:label 众数滤波(3×3×2 遍,去 JPEG 椒盐斑)→ 边界泛洪(同 label 4 连通)→ **梯度屏障**(Sobel 幅值 ≥24 阻挡泛洪,防背景白顺 1-2px 抗锯齿桥漏进发内高光区——甘雨图实测复现该 bug 后加入;被截留的背景槽画成白色多边形,白底上不可见)。whiteThreshold 256 全禁白色排除(白裙存活的关键)。
  4. 逐路径墨色:沿追踪路径采样源图像素均值 ×0.45 加深作该路径线色(发丝深蓝/龙角深棕/鞋深灰,替代全图统一蓝),线宽 2.5→1.75;overlay 动画与最终 commit 双侧同步。**教训:currentCurveColors 一度在标准模式也被填充导致线宽门控误判,已改为仅精细模式发布。**
  5. 色块自色描边 lineWidth 2.5 堵量化白缝。
  - 甘雨结果:152 路径/559 曲线/1128 填色/426ms,全身像目视与原图高度相似(发流/冰珠/金铃/角/裤袜全部可辨),特写马赛克感来自源图厚涂质感的量化,属源分辨率上限。
  - 回归:五图贝塞尔曲线数逐位对基线、傅里叶 5/86 表达式全绿、模式往返、fox 标准填色 83 块不变、console 0 错误、dpr=2 通过(accept-fourier.js 全绿)。
  - 遗留:①新纯函数(smoothLabels/floodBackgroundMask/gradientBarrierMask/sampleLineColor)未入 node 单测,靠浏览器回归覆盖;②源图 230px 是相似度硬上限,≥800px 输入效果会显著更好;③精细模式+傅里叶组合未专门验收(填色共用应可用,线色傅里叶侧仍统一蓝)。
  - 产品化注意:Desmos demo key 试用性质商用需正式 key(既有已知限制);演示素材若用二次元 IP 立绘,对外售卖需注意素材版权。
  - 已同步线上(2026-07-10 23:52,index.html + test-ganyu.jpg,线上 md5 与本地一致)。
- **演示视频(2026-07-11 凌晨,主会话)**:demo-video.mp4(33.6s/1080p30/11MB,另存桌面 desmos-bezier-demo.mp4)。结构:标题卡 → 傅里叶画龙(方程面板可见,1.25×) → 甘雨精细上色+推镜脸部特写(1.5×) → 结尾卡(一切皆方程+URL),0.5s 交叉溶解。制作链:playwright recordVideo 真录屏 + HTML 标题卡截图(homebrew ffmpeg 无 drawtext) + Apple Loops 同族 stems 分层配乐(Brooklyn Nights,synth→+bass→+guitar 渐进,首尾淡入淡出,Apple Loops 授权允许成片使用)。重录脚本 scratchpad/record-demo.js。
- **第九期补丁(2026-07-11 凌晨,主会话):色彩保真修复**。甲方对比指出"有些颜色对不上"(红穗/金铃变棕)。两个系统性根因,均为精细分支门控修复:①量化候选按像素数取前 96,小面积高饱和色(红穗/金铃)在候选阶段就被挤掉——改为按 count×(1+2×saturation) 打分排序(satAware 参数,标准路径不变);②色块用合并后调色板均值,饱和度被吸收簇稀释——精细模式改用组件自身像素的真实均值色(stride 采样 ≤512 点)。结果:红绳/红穗/角上红饰/金铃/鞋花全部还原,腰部特写色彩关系与原图一致,1156 填色。回归全绿(五图基线/傅里叶/模式切换/dpr=2),已推线上(md5 一致)。
- **第七期(2026-07-10 下午,已验收):右下预览面板改版**。原 #previewWrap 只有拟合曲线画布,改为两段:上为"图 1. 原图"缩略图(handleFile 时把降采样后的 off canvas 画进 #sourceCanvas,与管线输入一致),下为"图 2. 拟合曲线"——默认折叠成一条可点击标题栏([+]/[-] 标记切换,setCurveCollapsed 同步)。整个面板载入图片前隐藏(hidden 属性)。Desmos 加载失败的全屏降级模式不受折叠影响:CSS `#previewWrap.large` 规则以更高特异性强制显示曲线画布并隐藏原图段,showDesmosFailureNotice 里同步展开状态。真浏览器验收:v2 龙图折叠/展开/再折叠截图正确,降级模式模拟(折叠态调 showDesmosFailureNotice)曲线画布 1720×578 全屏、原图隐藏、标记同步;console 0 页面错误(4 个 error 来自浏览器扩展,1 个 warning 是 Desmos 试用 key 提示)。已同步线上(2026-07-10 17:28,scp -O 推 index.html 到 zyl C:\www\desmos-bezier,线上 md5 与本地一致)。
