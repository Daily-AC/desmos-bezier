'use strict';
// Node unit tests for the Fourier-mode pure functions (resample / mirror-
// close / DFT / harmonic truncation / reconstruction / the pixel<->math
// coefficient flip / epicycle chain). Extracts the functions DIRECTLY from
// index.html's <script> block (between the two marker comments below)
// rather than maintaining a separate copy, so these tests can never drift
// from what the app actually ships -- same principle as the project's
// other test_*.js files. All functions in this block are pure math with no
// DOM dependency, so they can be eval'd standalone with no stubbing.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const startMarker = '* Fourier mode (傅里叶模式) pure functions:';
const endMarker = '* Color fill extraction (填色):';
const startIdx = html.indexOf(startMarker);
const endIdx = html.indexOf(endMarker);
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  console.error('FAIL: could not locate the Fourier pure-function block in index.html (markers moved/removed?)');
  process.exit(1);
}
// Back up to the start of that block's opening comment delimiter, and cut
// before the next block's opening delimiter, so we get complete function
// bodies only (no dangling comment fragments to break parsing).
const blockStart = html.lastIndexOf('/* ====', startIdx);
const blockEnd = html.lastIndexOf('/* ====', endIdx);
const fourierSrc = html.slice(blockStart, blockEnd);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fourierSrc, sandbox);

const {
  pathArcLength, resamplePathUniform, isPathClosed, chooseResampleCount,
  mirrorClosePath, complexDFT, topHarmonics, reconstructPoint, reconstructPath,
  flipHarmonicsY, epicycleChain,
} = sandbox;

for (const [name, fn] of Object.entries({
  pathArcLength, resamplePathUniform, isPathClosed, chooseResampleCount,
  mirrorClosePath, complexDFT, topHarmonics, reconstructPoint, reconstructPath,
  flipHarmonicsY, epicycleChain,
})) {
  if (typeof fn !== 'function') {
    console.error(`FAIL: ${name} was not extracted as a function (extraction markers may have drifted from index.html's actual structure)`);
    process.exit(1);
  }
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS', name); }
  else { console.log('FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); failures++; }
}

function rmsReconstructionError(dc, harmonics, originalPoints) {
  let sumSq = 0;
  for (const p of originalPoints) {
    let best = Infinity;
    const fine = 400;
    for (let i = 0; i <= fine; i++) {
      const q = reconstructPoint(dc, harmonics, i / fine);
      const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d2 < best) best = d2;
    }
    sumSq += best;
  }
  return Math.sqrt(sumSq / originalPoints.length);
}

// --- 1. Closed circle: near-perfect reconstruction from just 1 harmonic ---
{
  const N = 128, R = 50, cx = 100, cy = 100;
  const circle = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 2 * Math.PI;
    circle.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  check('circle detected as closed', isPathClosed(circle, 3));
  const M = chooseResampleCount(pathArcLength(circle.concat([circle[0]])));
  const resampled = resamplePathUniform(circle.concat([circle[0]]), M);
  const { dc, harmonics } = topHarmonics(complexDFT(resampled), 1);
  check('circle DC is near the true center', Math.hypot(dc[0] - cx, dc[1] - cy) < 1, dc);
  check('circle top harmonic has |n|=1', Math.abs(harmonics[0].n) === 1, harmonics[0].n);
  const rms1 = rmsReconstructionError(dc, harmonics, resampled);
  check('circle RMS error with N=1 harmonic is tiny (<1px)', rms1 < 1.0, rms1);
}

// --- 2. Closed square: RMS error must shrink (or hold) monotonically as harmonics increase ---
{
  const side = 100, perSide = 40;
  const pts = [];
  const corners = [[0, 0], [side, 0], [side, side], [0, side]];
  for (let c = 0; c < 4; c++) {
    const a = corners[c], b = corners[(c + 1) % 4];
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  pts.push(pts[0].slice());
  const M = chooseResampleCount(pathArcLength(pts));
  const resampled = resamplePathUniform(pts, M);
  const dft = complexDFT(resampled);
  let prevRms = Infinity;
  for (const N of [4, 10, 30, 60]) {
    const { dc, harmonics } = topHarmonics(dft, N);
    const rms = rmsReconstructionError(dc, harmonics, resampled);
    check(`square RMS error is non-increasing at N=${N} (${rms.toFixed(3)} <= ${prevRms.toFixed(3)})`, rms <= prevRms + 1e-6, rms);
    prevRms = rms;
  }
  check('square RMS error bounded at N=60 (<3px)', prevRms < 3, prevRms);
}

// --- 3. Open path: mirror-close avoids a jump discontinuity, and the
//        animation's "first half" trace matches the real forward path ---
{
  const zigzag = [];
  for (let i = 0; i <= 20; i++) zigzag.push([i * 5, (i % 2) * 20]);
  check('zigzag detected as open (not closed)', !isPathClosed(zigzag, 3));
  const M = chooseResampleCount(pathArcLength(zigzag));
  const resampled = resamplePathUniform(zigzag, M);
  const mirrored = mirrorClosePath(resampled);
  check('mirrored path length is 2M-2', mirrored.length === 2 * M - 2, mirrored.length);
  const wrapGap = Math.hypot(mirrored[0][0] - mirrored[mirrored.length - 1][0], mirrored[0][1] - mirrored[mirrored.length - 1][1]);
  const stepSize = pathArcLength(resampled) / (M - 1);
  check('mirrored path wraps without a jump discontinuity', wrapGap < stepSize * 2, { wrapGap, stepSize });

  const { dc, harmonics } = topHarmonics(complexDFT(mirrored), 40);
  const rms = rmsReconstructionError(dc, harmonics, mirrored);
  check('open/mirrored zigzag RMS error is bounded with N=40 (<5px)', rms < 5, rms);

  const L = mirrored.length;
  const tMax = M / L;
  const half = reconstructPath(dc, harmonics, 200, tMax);
  check('half-trace (t in [0,tMax]) starts near the real path start',
    Math.hypot(half[0][0] - zigzag[0][0], half[0][1] - zigzag[0][1]) < 5);
  check('half-trace ends near the real path end',
    Math.hypot(half[half.length - 1][0] - zigzag[zigzag.length - 1][0], half[half.length - 1][1] - zigzag[zigzag.length - 1][1]) < 5);
}

// --- 4. DC (path centroid) is always retained even when N=0 harmonics are requested ---
{
  const line = [[0, 0], [10, 0], [20, 0]];
  const M = chooseResampleCount(pathArcLength(line));
  const resampled = resamplePathUniform(line, M);
  const { dc, harmonics } = topHarmonics(complexDFT(resampled), 0);
  check('N=0 still returns a non-trivial DC and zero harmonics', dc[0] > 0 && harmonics.length === 0, { dc, harmonics });
}

// --- 5. epicycleChain's final tip must exactly equal reconstructPoint (the
//        animation's rotating circles must terminate exactly on the curve) ---
{
  const dc = [10, 5];
  const harmonics = [
    { n: 1, mag: 8, phase: 0 },
    { n: 2, mag: 3, phase: 0.5 },
    { n: -3, mag: 1.5, phase: -1.2 },
  ];
  for (const t of [0, 0.13, 0.5, 0.77, 1]) {
    const { tip } = epicycleChain(dc, harmonics, t);
    const expected = reconstructPoint(dc, harmonics, t);
    const d = Math.hypot(tip[0] - expected[0], tip[1] - expected[1]);
    check(`epicycle chain tip matches reconstruction at t=${t}`, d < 1e-9, d);
  }
}

// --- 6. flipHarmonicsY: the coefficient-space y-flip used to convert a
//        pixel-space DFT result to Desmos's y-up math space must be
//        mathematically identical to flipping the points BEFORE the DFT ---
{
  const pxPath = [[0, 0], [5, 12], [9, 3], [14, 20], [22, 8], [30, 25], [40, 5]];
  const height = 200;
  const M = chooseResampleCount(pathArcLength(pxPath));
  const resampled = resamplePathUniform(pxPath, M);
  const mirrored = mirrorClosePath(resampled);

  const flippedPoints = mirrored.map(([x, y]) => [x, height - y]);
  const { dc: dcA, harmonics: hA } = topHarmonics(complexDFT(flippedPoints), 20);

  const { dc: dcB0, harmonics: hB0 } = topHarmonics(complexDFT(mirrored), 20);
  const { dc: dcB, harmonics: hB } = flipHarmonicsY(dcB0, hB0, height);

  let maxDiff = 0;
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const pa = reconstructPoint(dcA, hA, t);
    const pb = reconstructPoint(dcB, hB, t);
    maxDiff = Math.max(maxDiff, Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
  }
  check('flipHarmonicsY matches flip-then-DFT to float precision (<1e-6px)', maxDiff < 1e-6, maxDiff);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
