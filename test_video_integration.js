'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const start = html.lastIndexOf('/* ====', html.indexOf('* PURE PIPELINE'));
const end = html.lastIndexOf('/* ====', html.indexOf('* Pixel-grid wordmark'));
if (start < 0 || end < 0) throw new Error('pure pipeline markers not found');
const sandbox = { performance };
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end), sandbox);

const sourceWidth = 480, sourceHeight = 320;
const target = sandbox.scaledMediaSize(sourceWidth, sourceHeight);
const width = target.width, height = target.height;
const baselines = {
  mp4: {
    curves: [8, 8, 9],
    signatures: ['2382f63785984e7f', 'b740179c5e5e9344', 'cdaeaff38671308c'],
  },
  webm: {
    curves: [8, 8, 8],
    signatures: ['cec249cc7e348f08', '9d19f38c0beb925d', '67682b99c96e587e'],
  },
  gif: {
    curves: [5, 5, 5],
    signatures: ['985e541c41c3e500', '3cf797ac2863b230', 'd02e4d925b066715'],
  },
};

function decodeAt(asset, seconds) {
  const result = spawnSync('/opt/homebrew/bin/ffmpeg', [
    '-v', 'error', '-ss', String(seconds), '-i', asset,
    '-frames:v', '1', '-vf', `scale=${width}:${height}:flags=lanczos`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { maxBuffer: width * height * 4 + 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  if (result.stdout.length !== width * height * 4) throw new Error('unexpected decoded frame size');
  return new Uint8ClampedArray(result.stdout.buffer, result.stdout.byteOffset, result.stdout.byteLength);
}

let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log('PASS', name);
  else { console.log('FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); failures++; }
}

function signature(frame) {
  const values = frame.mathBeziers.slice(0, 12).flat(2);
  const rounded = values.map((n) => Math.round(n * 100) / 100).join(',');
  return crypto.createHash('sha256').update(rounded).digest('hex').slice(0, 16);
}

check('480x320 assets use the shared 900x600 upscale rule', width === 900 && height === 600 && target.upscaled, target);

for (const extension of ['mp4', 'webm', 'gif']) {
  const asset = path.join(__dirname, 'test-assets', 'moving-shapes.' + extension);
  const dataFrames = [0, 1, 2].map((seconds) => decodeAt(asset, seconds));
  const palette = sandbox.buildSharedPalette(dataFrames, 14, false);
  const frames = dataFrames.map((data) => sandbox.vectorizeFrame(
    { data, width, height },
    { high: 60, maxError: 2, maxCurves: 4000, fillEnabled: true, sharedPalette: palette },
  ));
  check(extension + ' shared palette produced', palette.length >= 2, palette);
  check(extension + ' sampled frames produce Bezier vectors', frames.every((frame) => frame.mathBeziers.length > 0), frames.map((f) => f.mathBeziers.length));
  const curveCounts = frames.map((frame) => frame.mathBeziers.length);
  check(extension + ' curve-count baseline matches', JSON.stringify(curveCounts) === JSON.stringify(baselines[extension].curves), curveCounts);
  const signatures = frames.map(signature);
  check(extension + ' vector-signature baseline matches', JSON.stringify(signatures) === JSON.stringify(baselines[extension].signatures), signatures);
  check(extension + ' 0s/1s/2s vectors are pairwise different', new Set(signatures).size === 3, signatures);
  check(extension + ' frames are exactly 900x600', frames.every((frame) => frame.width === 900 && frame.height === 600), frames.map((frame) => [frame.width, frame.height]));
  console.log(extension + ' curve counts:', curveCounts.join(' / '));
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
