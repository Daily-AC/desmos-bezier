# Desmos 贝塞尔渲染器

把任意图片变成一页真实可运行的 Desmos 数学方程——贝塞尔曲线勾线、傅里叶级数转着圆圈作画、上千个多边形方程上色，全过程动画演示。

- **在线体验**：<https://desmos-bezier.lab.qmledmq.cn:8443>
- **演示视频**：<https://desmos-bezier.lab.qmledmq.cn:8443/demo-video.mp4>

## 用法

打开页面拖入一张图片即可。单文件零依赖（仅 Desmos 官方 script tag），本地跑：

```sh
python3 -m http.server 8742
# 访问 http://127.0.0.1:8742/index.html
```

工具栏：

| 控件 | 作用 |
|---|---|
| 阈值 / 容差 | Canny 边缘阈值 / 贝塞尔拟合误差 |
| `[*] 填色` | 颜色量化 → 连通域 → polygon() 方程上色 |
| `[#] 精细` | 动漫立绘高保真模式：32 色、组件级抠背景、逐路径墨色、真实均值色 |
| `[~] 傅里叶` | 每条轮廓一条 list+total() 傅里叶级数参数方程，本轮系动画作画 |
| `[>] 绘制` | 重播绘制动画，速度滑杆 0.25×–4× 实时变速 |

## 管线

```
图片 → 灰度 → 高斯 → Canny(亚像素 NMS) → Guo-Hall 细化 → 轮廓追踪 + 间隙桥接
  ├─ 贝塞尔:RDP → Schneider fitCurve → 参数方程
  ├─ 傅里叶:均匀弧长重采样 → 镜像闭合 → 复数 DFT → 前 N 谐波 → total() 级数
  └─ 填色:直方图量化(饱和度加权) → 梯度屏障背景泛洪 → Moore 边界 → polygon()
```

绘制动画在透明覆盖层 canvas 上以 rAF 完成（Desmos setExpressions 有 ~8-34ms/条的硬成本，无法逐条动画），收尾一次 setState 无感换手为真实方程。

## 测试

```sh
node test_fourier.js   # 傅里叶纯函数 22 项断言(直接从 index.html 抽取,无副本漂移)
```

浏览器端回归（五图基线曲线数、傅里叶表达式、dpr=2、降级模式）见 `progress.md` 记录的验收方法。

## 已知限制

- Desmos API key 为文档试用 key，商用需向 Desmos 申请正式 key。
- 截断傅里叶级数天然圆化尖角；谐波数滑杆可调精度。
- 输入分辨率是相似度上限，建议 ≥800px。

## 项目史

完整的排障史、每期验收数字与架构决策见 [progress.md](progress.md)。
