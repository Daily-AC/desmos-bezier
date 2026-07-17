'use strict';

// Unit tests for video-input pure functions. Like test_fourier.js, this file
// extracts the shipped implementation directly from index.html so tests and
// the single-file app cannot drift apart.

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

let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log('PASS', name);
  else {
    console.log('FAIL', name, detail === undefined ? '' : JSON.stringify(detail));
    failures++;
  }
}

function makeCircleImageData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2, cy = height / 2, radius = Math.min(width, height) * 0.28;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const ink = Math.abs(Math.hypot(x - cx, y - cy) - radius) <= 2;
      const value = ink ? 0 : 255;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

const {
  vectorizeFrame, scaledMediaSize, planVideoSamples, planGifSamples, advanceVideoPlayback, buildSharedPalette,
  assignPaletteLabels, extractFillPolygons,
} = sandbox;
check('vectorizeFrame is exported from the pure pipeline', typeof vectorizeFrame === 'function');

const preprocessStart = html.indexOf('async function preprocessVideoFrames(');
const preprocessEnd = html.indexOf('async function handleVideoFile(', preprocessStart);
const preprocessSource = html.slice(preprocessStart, preprocessEnd);
check('video palette pass is capped at 12 decoded frames', preprocessSource.includes('Math.min(12, frameCount)'));
check('video processing pass decodes one current frame without a decoded-frame accumulator',
  preprocessSource.includes('const frameImageData = await media.decodeFrame(i)') &&
  !/\bdecoded\s*(?:=|\.push|\[)/.test(preprocessSource));
check('streaming progress reports both palette and per-frame processing',
  preprocessSource.includes('[+] 分析色板…') && preprocessSource.includes('[+] 处理视频…'));

check('scaledMediaSize is exported', typeof scaledMediaSize === 'function');
if (typeof scaledMediaSize === 'function') {
  check('499px media upscales to 900px', JSON.stringify(scaledMediaSize(499, 300)) === JSON.stringify({ width: 900, height: 541, upscaled: true }), scaledMediaSize(499, 300));
  check('500px media stays at source size', JSON.stringify(scaledMediaSize(500, 300)) === JSON.stringify({ width: 500, height: 300, upscaled: false }), scaledMediaSize(500, 300));
  check('1000px media stays at source size', JSON.stringify(scaledMediaSize(1000, 600)) === JSON.stringify({ width: 1000, height: 600, upscaled: false }), scaledMediaSize(1000, 600));
  check('1001px media downscales to 1000px', JSON.stringify(scaledMediaSize(1001, 501)) === JSON.stringify({ width: 1000, height: 500, upscaled: false }), scaledMediaSize(1001, 501));
  check('720p media targets 1000px', JSON.stringify(scaledMediaSize(1280, 720)) === JSON.stringify({ width: 1000, height: 563, upscaled: false }), scaledMediaSize(1280, 720));
  check('480x320 media targets 900px', JSON.stringify(scaledMediaSize(480, 320)) === JSON.stringify({ width: 900, height: 600, upscaled: true }), scaledMediaSize(480, 320));
  check('600x338 media stays at source size', JSON.stringify(scaledMediaSize(600, 338)) === JSON.stringify({ width: 600, height: 338, upscaled: false }), scaledMediaSize(600, 338));

  function legacyStaticImageSize(width, height) {
    const maxDim = Math.max(width, height);
    let w = width, h = height, upscaled = false;
    if (maxDim > 1000) {
      const scale = 1000 / maxDim;
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    } else if (maxDim < 500) {
      upscaled = true;
      const scale = 900 / maxDim;
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    return { width: w, height: h, upscaled };
  }
  let seed = 0x5eed1234;
  let equivalent = true;
  for (let i = 0; i < 10000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const width = seed % 10000 + 1;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const height = seed % 10000 + 1;
    if (JSON.stringify(scaledMediaSize(width, height)) !== JSON.stringify(legacyStaticImageSize(width, height))) {
      equivalent = false;
      break;
    }
  }
  check('shared sizing matches the legacy image calculation across 10000 dimensions', equivalent);
}

if (typeof vectorizeFrame === 'function') {
  const imageData = makeCircleImageData(96, 72);
  const result = vectorizeFrame(imageData, {
    high: 60,
    maxError: 2,
    maxCurves: 4000,
    fillEnabled: false,
    fineFillEnabled: false,
  });
  check('vectorizeFrame preserves source dimensions', result.width === 96 && result.height === 72, result);
  check('vectorizeFrame finds Bezier curves', result.beziers.length > 0, result.beziers.length);
  check('math Beziers parallel pixel Beziers', result.mathBeziers.length === result.beziers.length);
  check('standard mode does not publish per-curve colors', result.bezColors.length === 0, result.bezColors);
  check('fill-disabled frame has no polygons', result.fillPolygons.length === 0, result.fillPolygons);
  check('frame reports edge and path counts', result.edgeCount > 0 && result.pathCount > 0, result);
}

check('planVideoSamples is exported', typeof planVideoSamples === 'function');
if (typeof planVideoSamples === 'function') {
  const short = planVideoSamples(3, 12, 120);
  check('3 second video samples 36 frames at 12fps', short.times.length === 36, short);
  check('short video is not marked truncated', short.truncated === false, short);
  check('sample timestamps are monotonic and stay inside duration',
    short.times.every((t, i) => t >= 0 && t < 3 && (i === 0 || t > short.times[i - 1])), short.times);

  const long = planVideoSamples(20, 12, 120);
  check('long video is capped at 120 frames', long.times.length === 120, long);
  check('long video reports truncation', long.truncated === true, long);
  check('long video samples only the leading budget', long.times[long.times.length - 1] < 10, long.times.at(-1));
}

check('planGifSamples is exported', typeof planGifSamples === 'function');
if (typeof planGifSamples === 'function') {
  const gifPlan = planGifSamples(new Array(36).fill(80000), 12, 120);
  check('36 GIF frames at 80ms retain all 36 frames', gifPlan.indices.length === 36, gifPlan);
  check('GIF target interval is quantized to the 10ms timebase', gifPlan.intervalUs === 80000, gifPlan);
  check('80ms GIF plan preserves source frame order', gifPlan.indices.every((index, i) => index === i), gifPlan.indices);
}

check('advanceVideoPlayback is exported', typeof advanceVideoPlayback === 'function');
if (typeof advanceVideoPlayback === 'function') {
  const normal = advanceVideoPlayback(0, 0, 100, 1, 10, 12);
  const fast = advanceVideoPlayback(0, 0, 100, 2, 10, 12);
  check('1x advances one frame over one 10fps interval', normal.index === 1 && normal.accumulatorMs === 0, normal);
  check('2x advances two frames over the same wall time', fast.index === 2 && fast.accumulatorMs === 0, fast);
  const looped = advanceVideoPlayback(11, 0, 100, 1, 10, 12);
  check('frame advancement loops by default', looped.index === 0, looped);
}

check('buildSharedPalette is exported', typeof buildSharedPalette === 'function');
check('assignPaletteLabels is exported', typeof assignPaletteLabels === 'function');
if (typeof buildSharedPalette === 'function' && typeof assignPaletteLabels === 'function') {
  const frameA = new Uint8ClampedArray([
    250, 10, 10, 255, 245, 15, 15, 255,
    10, 10, 250, 255, 15, 15, 245, 255,
  ]);
  const frameB = new Uint8ClampedArray([
    240, 20, 20, 255, 235, 25, 25, 255,
    20, 20, 240, 255, 25, 25, 235, 255,
  ]);
  const palette = buildSharedPalette([frameA, frameB], 2, false);
  check('shared palette has requested color count', palette.length === 2, palette);
  const labelsA = assignPaletteLabels(frameA, palette);
  const labelsB = assignPaletteLabels(frameB, palette);
  check('near-red pixels keep one label across frames', labelsA[0] === labelsA[1] && labelsA[0] === labelsB[0], { labelsA, labelsB });
  check('near-blue pixels keep another label across frames', labelsA[2] === labelsA[3] && labelsA[2] === labelsB[2], { labelsA, labelsB });
  check('red and blue remain distinct', labelsA[0] !== labelsA[2], labelsA);

  const width = 24, height = 24;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const red = x >= 7 && x <= 16 && y >= 7 && y <= 16;
      data[o] = red ? 220 : 255;
      data[o + 1] = red ? 20 : 255;
      data[o + 2] = red ? 20 : 255;
      data[o + 3] = 255;
    }
  }
  const fixedPalette = [
    { r: 255, g: 255, b: 255, count: 476 },
    { r: 255, g: 0, b: 0, count: 100 },
  ];
  const fills = extractFillPolygons(data, width, height, {
    fine: true,
    numColors: 2,
    minAreaPx: 4,
    whiteThreshold: 256,
    blackThreshold: 8,
    rdpEpsilon: 1,
    fixedPalette,
    usePaletteColors: true,
  }).polygons;
  check('fine video fill uses shared palette color instead of component mean', fills.some((polygon) => polygon.color === '#ff0000'), fills);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
