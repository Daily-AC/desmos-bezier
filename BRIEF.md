# Desmos Bézier Renderer — Task Brief

Goal: a single-file web app (`index.html`, vanilla JS, no build step) that converts any user-provided image into cubic Bézier parametric equations and renders them inside an embedded Desmos graphing calculator — like kevinjycui/DesmosBezierRenderer, but fully client-side (no Python/Flask backend).

## UI

- Full-window embedded Desmos calculator (API v1.9, demo key):
  `<script src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=dGhlIGJhc2ljIGRlbW8ga2V5IQ=="></script>`
- Top toolbar: file input + drag-and-drop anywhere; sliders for edge threshold (Canny high threshold), Bézier fit tolerance (maxError, default ~2.0), max curve count (default 3000); a "Render" button; live stats line (edge pixels / paths / Bézier segments / render ms).
- A small canvas preview (offline fallback) drawing the fitted Béziers, so the pipeline is verifiable even if Desmos fails to load. If the Desmos script fails, show the canvas preview large with a notice instead of crashing.

## Pipeline (all in-browser, plain JS + canvas ImageData)

1. Downscale input so max dimension ≤ 1000 px. Grayscale.
2. Gaussian blur (5×5), Sobel gradients, non-maximum suppression, double-threshold + hysteresis (Canny). Low threshold = 0.4 × high.
3. Contour tracing: for each unvisited edge pixel, greedily walk 8-connected neighbors in both directions to build a polyline path; mark visited; discard paths shorter than 8 px.
4. Simplify each path with Ramer–Douglas–Peucker (epsilon ≈ 0.8 px) — keep enough points for curve fitting.
5. Fit each path with piecewise cubic Béziers using Philip J. Schneider's "Algorithm for Automatically Fitting Digitized Curves" (Graphics Gems) — fitCurve with the tolerance slider as maxError. Implement it inline (no npm deps).
6. Flip y (image coords → math coords: y' = imageHeight − y) so the drawing appears upright in Desmos.
7. Emit one Desmos expression per cubic segment as a parametric point with De Casteljau-form latex, matching the classic DesmosBezierRenderer style:
   `\left(\left(1-t\right)\left(\left(1-t\right)\left(\left(1-t\right)x_0+tx_1\right)+t\left(\left(1-t\right)x_1+tx_2\right)\right)+t\left(...\right), <same for y>\right)`
   with parametric domain 0 ≤ t ≤ 1. Round coordinates to ~4 decimals to keep latex compact.
8. Load ALL expressions in one shot via `calculator.setState(...)` (build the state JSON with an `expressions.list` array) — per-expression `setExpression` is far too slow for thousands of curves. Preserve default graph settings; set the viewport to fit the image bounds with some margin. Hide the expressions panel scroll cost by setting `expressionsCollapsed: true` in calculator options if helpful, but keep the expression list accessible.
9. Cap segments at the max-curve slider; if capped, say so in the stats line.

## Acceptance criteria (enumerable)

1. `open index.html`, load `test-shapes.png` (circle + rectangle + line on white): Desmos shows a recognizable circle, rectangle and diagonal line; stats show >0 segments; zero console errors.
2. Same page with a complex anime line-art PNG (~1800×1000): renders in < 15 s end-to-end, capped at max curves without freezing the tab (chunk heavy loops with `await` yields or run pipeline in a Worker-less async chunked fashion — either is fine as long as UI doesn't lock > 2 s).
3. With network blocked (Desmos script unreachable), page still shows canvas-preview rendering of the same image and a clear notice — no uncaught exceptions.
4. Re-rendering with a different image replaces the previous expressions (no accumulation).

Deliverable: `/Users/e0_7/projects/hackthon/desmos-bezier/index.html` only. Keep code readable, single file, no external deps besides the Desmos script tag.
