'use strict';

// Unit tests for automatic render-parameter selection. The implementation is
// extracted from index.html's DOM-free pipeline so this test covers what ships.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const startMarker = '* PURE PIPELINE';
const endMarker = '* Pixel-grid wordmark';
const startIdx = html.indexOf(startMarker);
const endIdx = html.indexOf(endMarker);
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  console.error('FAIL: could not locate the pure-function block in index.html');
  process.exit(1);
}
const blockStart = html.lastIndexOf('/* ====', startIdx);
const blockEnd = html.lastIndexOf('/* ====', endIdx);
const sandbox = { performance };
vm.createContext(sandbox);
vm.runInContext(html.slice(blockStart, blockEnd), sandbox);

const { autoRenderParams, lockAutoRenderParams } = sandbox;
let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log('PASS', name);
  else {
    console.log('FAIL', name, detail === undefined ? '' : JSON.stringify(detail));
    failures++;
  }
}

check('autoRenderParams is exported from the pure pipeline', typeof autoRenderParams === 'function');
check('lockAutoRenderParams is exported from the pure pipeline', typeof lockAutoRenderParams === 'function');

function solidImageData(width, height, r, g, b) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
  }
  return { data, width, height };
}

function splitImageData(width, height, low, high) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = x < width / 2 ? low : high;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

if (typeof autoRenderParams === 'function') {
  const strongEdge = autoRenderParams(splitImageData(48, 32, 0, 255));
  const lowContrast = autoRenderParams(splitImageData(48, 32, 120, 121));
  check('strong black/white edge clamps p70 high to 120', strongEdge.high === 120, strongEdge);
  check('near-flat low-contrast edge clamps p70 high to 30', lowContrast.high === 30, lowContrast);
  check('automatic fidelity constants are maxError=1.0 and maxCurves=8000',
    strongEdge.maxError === 1.0 && strongEdge.maxCurves === 8000, strongEdge);
  check('autoRenderParams returns only the public parameter fields',
    JSON.stringify(Object.keys(strongEdge).sort()) === JSON.stringify(['fineFill', 'high', 'maxCurves', 'maxError']),
    Object.keys(strongEdge));

  const gray = autoRenderParams(solidImageData(16, 16, 128, 128, 128));
  const saturated = autoRenderParams(solidImageData(16, 16, 255, 0, 0));
  check('pure gray selects standard fill', gray.fineFill === false, gray);
  check('high saturation selects fine fill', saturated.fineFill === true, saturated);

  // Per-pixel colored gate: saturation >= 0.2 and not near-black (max channel >= 30).
  const justBelowSat = autoRenderParams(solidImageData(16, 16, 100, 81, 81)); // s ~= 0.19
  const justAboveSat = autoRenderParams(solidImageData(16, 16, 100, 79, 79)); // s = 0.21
  const darkSaturated = autoRenderParams(solidImageData(16, 16, 25, 0, 0)); // saturated but near-black
  check('pixel saturation below 0.2 does not count as colored', justBelowSat.fineFill === false, justBelowSat);
  check('pixel saturation above 0.2 counts as colored', justAboveSat.fineFill === true, justAboveSat);
  check('near-black saturated pixels are excluded', darkSaturated.fineFill === false, darkSaturated);

  // Fraction gate at 0.05: a mostly-white illustration with a small colored
  // subject must still enable fine fill (the fox-demo regression case).
  function mixedImageData(width, height, coloredFraction) {
    const img = solidImageData(width, height, 255, 255, 255);
    const coloredPixels = Math.round(width * height * coloredFraction);
    for (let i = 0; i < coloredPixels; i++) {
      const offset = i * 4;
      img.data[offset] = 255; img.data[offset + 1] = 0; img.data[offset + 2] = 0;
    }
    return img;
  }
  const sparseColor = autoRenderParams(mixedImageData(40, 40, 0.03));
  const smallSubject = autoRenderParams(mixedImageData(40, 40, 0.08));
  check('colored fraction below 0.05 selects standard fill', sparseColor.fineFill === false, sparseColor);
  check('white background with a small colored subject selects fine fill', smallSubject.fineFill === true, smallSubject);
}

if (typeof autoRenderParams === 'function' && typeof lockAutoRenderParams === 'function') {
  const frames = [
    splitImageData(48, 32, 120, 121),
    splitImageData(48, 32, 80, 100),
    splitImageData(48, 32, 0, 255),
  ];
  const frameHighs = frames.map((frame) => autoRenderParams(frame).high);
  const expectedMedian = frameHighs.slice().sort((a, b) => a - b)[1];
  const locked = lockAutoRenderParams(frames);
  check('video auto high locks to the median sampled-frame high', locked.high === expectedMedian,
    { frameHighs, expectedMedian, locked });

  const colorFrames = [
    solidImageData(16, 16, 255, 255, 255), // fraction 0
    solidImageData(16, 16, 255, 0, 0),     // fraction 1 (median)
    solidImageData(16, 16, 255, 0, 0),     // fraction 1
  ];
  check('video fineFill locks from the median sampled-frame colored fraction',
    lockAutoRenderParams(colorFrames).fineFill === true);
  const monoFrames = [
    solidImageData(16, 16, 255, 255, 255),
    solidImageData(16, 16, 128, 128, 128), // fraction 0 (median)
    solidImageData(16, 16, 255, 0, 0),
  ];
  check('video fineFill stays off when the median frame is uncolored',
    lockAutoRenderParams(monoFrames).fineFill === false);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
