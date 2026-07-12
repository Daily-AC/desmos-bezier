'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const start = html.lastIndexOf('/* ====', html.indexOf('* PURE PIPELINE'));
const end = html.lastIndexOf('/* ====', html.indexOf('* Pixel-grid wordmark'));
if (start < 0 || end < 0) throw new Error('pure pipeline markers not found');
const sandbox = { performance };
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end), sandbox);

const width = 480, height = 320;
function decodeAt(asset, seconds) {
  const result = spawnSync('/opt/homebrew/bin/ffmpeg', [
    '-v', 'error', '-ss', String(seconds), '-i', asset,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
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
  return values.map((n) => Math.round(n * 100) / 100).join(',');
}

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
  const signatures = frames.map(signature);
  check(extension + ' 0s/1s/2s vectors are pairwise different', new Set(signatures).size === 3, signatures);
  check(extension + ' frames stay within the 600px budget', frames.every((frame) => Math.max(frame.width, frame.height) <= 600));
  console.log(extension + ' curve counts:', frames.map((frame) => frame.mathBeziers.length).join(' / '));
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
