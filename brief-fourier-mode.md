# Brief: 傅里叶模式(fourier-impl)

## 目标

在 `index.html`(单文件,零依赖)现有"贝塞尔渲染器"基础上新增**拟合模式开关:贝塞尔(默认)/ 傅里叶**。傅里叶模式把轮廓路径做复数 DFT,以参数方程(傅里叶级数)送入 Desmos,动画用本轮系(epicycles,3Blue1Brown 风格)在覆盖层 canvas 上转圈绘制。

**硬约束:默认贝塞尔模式的行为、数字、UI 必须与现状完全一致(零回归)。** 站点已收官部署,这是随时要演示的 demo。

## 管线分叉点

现有管线:grayscale → Gaussian → Canny(亚像素 NMS) → Guo-Hall 细化 → 轮廓追踪 + 间隙桥接 → (贝塞尔: RDP → Schneider fitCurve)。

傅里叶模式在**追踪+桥接完成后的像素级路径**上分叉(不要用 RDP 后的稀疏点,均匀重采样需要密集原始点):

1. 每条路径均匀弧长重采样 M 点(M 取 2 的幂,如 256/512,按路径长度自适应)。
2. 开路径镜像闭合(forth-and-back);闭合路径(首尾距 < 阈值)直接用。镜像闭合的路径笔迹动画只扫前半周期,避免来回描两遍。
3. 复数 DFT:z(t) = x(t) + i·y(t),取模最大的前 N 个谐波(N 由新滑杆控制,默认建议 30–60,自己调到五图效果好)。DC 分量(路径质心)始终保留。
4. minLength 过滤沿用现有阈值,过短路径不进傅里叶。

## Desmos 侧

每条路径一个参数表达式。**优先尝试 list + `total()` 紧凑写法**:

```
(a_0 + total(A cos(2π n t + P)), b_0 + total(B cos(2π n t + Q)))  , 0 ≤ t ≤ 1
```

A/B/P/Q/n 为 list 字面量内联(避免命名冲突)或带路径序号的变量名。**先做 spike 验证 Desmos 接受这种参数方程 latex**(用 node + playwright 真跑,不要凭记忆写 latex);不行就回退为展开求和式(latex 长但确定可行)。注意 setState 对表达式格式严格(参考现有 polygon fillOpacity 必须字符串的先例)。

## 动画(覆盖层,复用第五期架构)

- 曲线 hidden 载入 Desmos → 覆盖层 canvas rAF 动画 → 收尾一次 setState 显形(自适应宽限撤覆盖层,复用现有逻辑)。
- 每条路径画:谐波圆圈链(半径=|c_n|,转速=n×基频)+ 已画出的笔迹轨迹。圆圈链只在"当前正在画"的路径上显示,已完成路径只留笔迹。
- 多路径调度:按弧长降序,最长 K 条(建议 3–5)慢速完整展示本轮系,其余路径加速批量画(可多条并行,只画笔迹不画圆圈,或画简化圆圈)。总时长与贝塞尔绘制相当(~8s @1×)。
- 速度滑杆 0.25×–4× 即时变速;[>] 重播;坐标映射必须用 `graphpaperBounds.pixelCoordinates`(现成函数);performance.now() 计时;首帧 dt 钳制——这些坑第五期都踩过,直接抄现有 drawOverlay 代码路径。

## UI

- 工具栏加模式开关(样式与 [*] 填色按钮一致的 opencode.ai DNA):`[~] 傅里叶` toggle,默认关(=贝塞尔)。
- 傅里叶模式下显示"谐波数"滑杆,隐藏"容差"滑杆(只影响贝塞尔);切模式后需重新渲染才生效(和现有滑杆行为一致即可)。
- stats 行傅里叶模式显示:路径数、谐波总数、耗时。
- 填色功能两模式共用(填色管线独立于线稿拟合,不动)。
- 右下预览面板:傅里叶模式下"图 2. 拟合曲线"画布画重建曲线(用截断级数逐 t 采样),行为(默认折叠/降级模式)不变。

## 验收判据(暗题,主会话按此终验)

1. **零回归**:贝塞尔模式(默认)五图(test-shapes / reference / test-bunny / demo-dragon / demo-dragon-v2)路径数、曲线数与 progress.md 第四期基线完全一致;绘制动画、填色、折叠面板行为不变。
2. 傅里叶模式 test-shapes:圆近乎完美(低谐波即可);矩形允许角部圆化但四边形清晰可辨,无 Gibbs 大幅抖边。
3. 傅里叶模式 demo-dragon-v2:龙轮廓目视连续可辨;表达式数 ≈ 路径数(约 86);变换耗时 <2s。
4. 动画:本轮系转圈绘制目视正确(圆圈链末端笔尖轨迹与浮现笔迹重合);中途平移/缩放不漂;重播干净;变速即时生效;完成后 Desmos 真曲线与笔迹无感换手。
5. 0 console error(Desmos 试用 key warning 除外);dpr=2 下动画与终态无偏移(用 playwright deviceScaleFactor:2 验,历史教训)。
6. Desmos 加载失败降级模式:傅里叶模式下离线预览画布仍显示重建曲线。

## 环境事实

- 本地服务:`python3 -m http.server 8742 --bind 127.0.0.1`(项目目录);**访问 localhost 必须绕开本机代理**(curl 加 `--noproxy '*'`,playwright 正常)。
- 验证用 node + playwright 脚本真跑真截图,不要"代码像对的"就报完成。
- 测试图五张都在项目根目录。
- Node 测试套件 test.js / test_thinning.js / test_rectangle_regression.js 必须保持全绿;傅里叶纯函数(重采样/DFT/截断重建)新增 node 单测(误差判据:重建曲线对原始重采样点的 RMS 偏差有界)。
- 完成后写 report-fourier-mode.md(改了什么、spike 结论、参数取值依据、自测结果、遗留)。
