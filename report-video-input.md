# GIF / MP4 / WebM 视频输入实现报告

日期：2026-07-13

## 架构取舍

- `vectorizeFrame(imageData, options)` 承接原 `render()` 的 Canny、细化、追踪、贝塞尔/傅里叶和填色计算；`render()` 只保留 UI、预览、Desmos 表达式和动画编排。
- MP4/WebM 通过隐藏 `<video>` 按时间点 seek 后 `drawImage`；GIF 通过 Chromium `ImageDecoder` 第一遍读取逐帧 duration 建立采样计划，第二遍只绘制选中帧。GIF 不支持时显示“请转为 MP4”的中文错误，不引入依赖。
- 采样上限为 12fps、120 帧、最长边 600px。超过预算只取前 120 帧，并在 stats 标记截断。
- 填色调色板从最多 12 个分布均匀的采样帧、最多 120000 个像素建立；每帧只做固定调色板 label 指派。精细视频填色直接使用调色板色，不使用组件像素均值。
- 播放只重绘覆盖层 canvas。每个 rAF 重新读取 `calculator.graphpaperBounds`；Desmos 只在开始播放时批量隐藏，以及暂停/拖帧结束时批量提交当前帧。
- `mediaGeneration` 同时守卫解码、预处理、延迟 viewport 修正、暂停换手和 rAF。换文件会关闭 `ImageDecoder`、撤销 object URL 并取消所有动画。
- 视频与傅里叶组合明确作为 v1 边界：toggle 在视频态不改变状态，stats 给出提示。

## 合成素材

素材位于 `test-assets/`：

- `moving-shapes.mp4`：H.264，480x320，24fps，72 帧，3.000 秒。
- `moving-shapes.webm`：VP9，480x320，24fps，3.000 秒。
- `moving-shapes.gif`：GIF，480x320，12fps，36 帧，3.000 秒。

生成命令：

```bash
mkdir -p test-assets
/opt/homebrew/bin/ffmpeg -y -v error \
  -f lavfi -i color=c=white:s=480x320:r=24:d=3 \
  -vf "geq=r='if(lte((X-(80+N*3))*(X-(80+N*3))+(Y-160)*(Y-160),1600),0,255)':g='if(lte((X-(80+N*3))*(X-(80+N*3))+(Y-160)*(Y-160),1600),0,255)':b='if(lte((X-(80+N*3))*(X-(80+N*3))+(Y-160)*(Y-160),1600),0,255)',drawbox=x='350-50*t':y='110+20*sin(t*3)':w=70:h=70:color=black:t=fill" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  test-assets/moving-shapes.mp4

/opt/homebrew/bin/ffmpeg -y -v error \
  -i test-assets/moving-shapes.mp4 \
  -c:v libvpx-vp9 -crf 28 -b:v 0 -pix_fmt yuv420p \
  test-assets/moving-shapes.webm

/opt/homebrew/bin/ffmpeg -y -v error \
  -i test-assets/moving-shapes.mp4 \
  -filter_complex "fps=12,split[s0][s1];[s0]palettegen=max_colors=32[p];[s1][p]paletteuse=dither=none" \
  -loop 0 test-assets/moving-shapes.gif
```

## 自测结果

当前 Codex 托管沙箱禁止进程监听本地端口：运行指定的 `python3 -m http.server 8742 --bind 127.0.0.1` 返回 `PermissionError: [Errno 1] Operation not permitted`，指定 Chromium 也以 `SIGABRT`/exit 134 退出。主会话随后在真实浏览器运行了 `test_video_browser.js`：静态基线和 MP4 全流程通过；首次 GIF 复跑暴露 36 帧只采到 24 帧的真 bug。该 bug 已改为基于 `ImageDecoder.duration` 的两阶段采样并增加 Node 回归，修复后的 GIF/dpr/console 浏览器尾段待主会话再次复跑。

| # | 判据 | 本次结果 |
|---|---|---|
| 1 | 静态零回归 | **真实浏览器通过**：33/1217/890/3116/1049；fox 83；ganyu 559/1156；dragon-v2 傅里叶 86 表达式且 analysis 全绿。 |
| 2 | MP4 播放/暂停方程 | **真实浏览器通过**：36 帧预处理、自动播放、三帧矢量不同、暂停提交、恢复隐藏。Node 0/1/2 秒均为 2 条曲线且签名不同。 |
| 3 | GIF ImageDecoder | **首次浏览器复跑失败并已修复，待复跑确认**。旧逻辑得到 24/36；新纯函数对 36 x 80,000us duration 表保留 36/36，目标间隔按 GIF 10ms 时基量化为 80,000us。 |
| 4 | 播放中平移视口 | **真实浏览器通过**。 |
| 5 | 中途切静态图 | **真实浏览器通过**：视频状态清空，静态 shapes 回到 33。 |
| 6 | 变速与拖帧 | **真实浏览器通过**；纯时钟也验证 10fps/100ms 下 1x 前进 1 帧、2x 前进 2 帧。 |
| 7 | dpr=2 | **待复跑**：首次套件在 GIF 断言处中止，尚未进入 dpr=2 尾段。 |
| 8 | console 0 错误 | **待复跑**：首次套件在 GIF 断言处中止，最终 console 汇总未执行。 |
| 9 | Node 单测 | **通过**。`test_video.js` 28 项、`test_video_integration.js` 12 项、`test_fourier.js` 22 项，共 62 项通过；全部脚本语法和 `git diff --check` 通过。 |

### 中间重构门禁

`vectorizeFrame` 抽取后、视频层实现前已运行：

- `node test_video.js`：当时 7/7 通过。
- `node test_fourier.js`：22/22 通过。
- `test-shapes.png` 无缩放纯管线：33 曲线，精确命中。
- 真实五图 Chrome canvas 基线因上述沙箱限制未能运行。ffmpeg/CoreGraphics 的缩放像素与 Chrome 不同，已拒绝将其近似计数当作回归结论。

## 最终命令

```bash
node test_video.js
node test_video_integration.js
node test_fourier.js
node --check test_video_browser.js
git diff --check
```

正常本机环境的完整浏览器验收：

```bash
node test_video_browser.js
```

该脚本会启动 `127.0.0.1:8742`，使用任务指定的 Playwright 和 Chromium，执行静态数字、MP4/GIF、三帧截图、暂停/恢复、平移、速度、拖帧、中途换文件、dpr=2 和 console 检查。成功时截图写入 `test-assets/`。

## 遗留问题

1. GIF 修复后的 36 帧结果、dpr=2 和最终 console 汇总仍需主会话再次运行 `node test_video_browser.js` 后关闭。
2. GIF 动画输入按产品边界依赖 Chromium `ImageDecoder`；不支持时只能提示转 MP4。
3. 为建立共享调色板，解码后的降采样帧会在预处理期间短暂驻留内存；矢量化完成后只保留矢量帧。最坏预算约为 120 x 600 x 600 x 4 字节（宽高同时达到 600 时约 165 MiB，实际按画面纵横比通常更低）。
