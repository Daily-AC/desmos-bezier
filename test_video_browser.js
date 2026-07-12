'use strict';

const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { chromium } = require('/Users/e0_7/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');

const ROOT = __dirname;
const URL = 'http://127.0.0.1:8742/index.html';
const CHROME = '/Users/e0_7/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ASSETS = path.join(ROOT, 'test-assets');
let server;

function waitForServer(timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const request = http.get(URL, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else retry();
      });
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error('local server did not start'));
      else setTimeout(poll, 100);
    };
    poll();
  });
}

function assert(condition, message, detail) {
  if (!condition) throw new Error(message + (detail === undefined ? '' : ': ' + JSON.stringify(detail)));
  console.log('PASS', message);
}

async function waitForVideo(page) {
  await page.waitForFunction(() => videoFrames.length > 2 && !statsEl.textContent.includes('矢量化视频'), null, { timeout: 180000 });
}

async function overlayCentroid(page) {
  return page.evaluate(() => {
    const { width, height } = drawOverlay;
    const data = overlayCtx.getImageData(0, 0, width, height).data;
    let sx = 0, sy = 0, count = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (data[(y * width + x) * 4 + 3] > 16) { sx += x; sy += y; count++; }
      }
    }
    return { x: sx / count, y: sy / count, count };
  });
}

async function setToggle(page, selector, pressed) {
  const current = await page.getAttribute(selector, 'aria-pressed');
  if ((current === 'true') !== pressed) await page.click(selector);
}

async function verifyStaticBaselines(page) {
  await setToggle(page, '#fillToggleBtn', false);
  const curves = [
    ['test-shapes.png', 33],
    ['reference.png', 1217],
    ['test-bunny.png', 890],
    ['demo-dragon.png', 3116],
    ['demo-dragon-v2.png', 1049],
  ];
  for (const [filename, expected] of curves) {
    await page.setInputFiles('#fileInput', path.join(ROOT, filename));
    await page.waitForFunction((count) => statsEl.textContent.includes(count + ' 曲线'), expected, { timeout: 180000 });
    assert((await page.locator('#stats').textContent()).includes(expected + ' 曲线'), filename + ' has ' + expected + ' curves');
  }

  await setToggle(page, '#fillToggleBtn', true);
  await page.setInputFiles('#fileInput', path.join(ROOT, 'demo-fox-color.png'));
  await page.waitForFunction(() => statsEl.textContent.includes('83 填色'), null, { timeout: 180000 });
  assert(true, 'demo-fox-color.png has 83 standard fills');

  await setToggle(page, '#fineFillBtn', true);
  await page.setInputFiles('#fileInput', path.join(ROOT, 'test-ganyu.jpg'));
  await page.waitForFunction(() => statsEl.textContent.includes('559 曲线') && statsEl.textContent.includes('1156 填色'), null, { timeout: 180000 });
  assert(true, 'test-ganyu.jpg has 559 curves and 1156 fine fills');

  await setToggle(page, '#fineFillBtn', false);
  await setToggle(page, '#fillToggleBtn', false);
  await setToggle(page, '#fourierToggleBtn', true);
  await page.setInputFiles('#fileInput', path.join(ROOT, 'demo-dragon-v2.png'));
  await page.waitForFunction(() => statsEl.textContent.includes('86 路径'), null, { timeout: 180000 });
  const fourier = await page.evaluate(() => ({
    expressions: calculator.getExpressions().length,
    errors: Object.values(calculator.expressionAnalysis || {}).filter((x) => x && x.isError).length,
  }));
  assert(fourier.expressions === 86 && fourier.errors === 0, 'dragon-v2 Fourier has 86 green expressions', fourier);

  await setToggle(page, '#fourierToggleBtn', false);
  await setToggle(page, '#fillToggleBtn', true);
}

async function verifyMedia(page, filename, label) {
  await page.setInputFiles('#fileInput', path.join(ASSETS, filename));
  await waitForVideo(page);
  const meta = await page.evaluate(() => ({ count: videoFrames.length, playing: videoPlaying, stats: statsEl.textContent }));
  assert(meta.count === 36, label + ' preprocesses 36 frames', meta);
  assert(meta.playing, label + ' starts overlay playback', meta);

  const signatures = [];
  for (const index of [0, 12, 24]) {
    await page.evaluate((i) => {
      videoFrameIndex = i;
      drawVideoFrame(videoFrames[i]);
    }, index);
    signatures.push(await page.evaluate((i) => JSON.stringify(videoFrames[i].beziers.slice(0, 2)), index));
    await page.screenshot({ path: path.join(ASSETS, label + '-frame-' + index + '.png') });
  }
  assert(new Set(signatures).size === 3, label + ' has three distinct vector frames');

  await page.click('#videoPlayBtn');
  await page.waitForTimeout(500);
  const paused = await page.evaluate(() => ({
    playing: videoPlaying,
    expressions: calculator.getExpressions().length,
    expected: videoFrames[videoFrameIndex].beziers.length + videoFrames[videoFrameIndex].fillPolygons.length,
    errors: Object.values(calculator.expressionAnalysis || {}).filter((x) => x && x.isError).length,
  }));
  assert(!paused.playing && paused.expressions === paused.expected, label + ' pause commits current frame equations', paused);
  assert(paused.errors === 0, label + ' expressionAnalysis is all green', paused);

  await page.click('#videoPlayBtn');
  const hidden = await page.evaluate(() => calculator.getExpressions().every((expression) => expression.hidden));
  assert(hidden, label + ' resume hides all Desmos expressions once');

  const beforePan = await overlayCentroid(page);
  await page.evaluate(() => {
    const b = calculator.graphpaperBounds.mathCoordinates;
    calculator.setMathBounds({ left: b.left + 80, right: b.right + 80, bottom: b.bottom, top: b.top });
  });
  await page.waitForTimeout(150);
  const afterPan = await overlayCentroid(page);
  assert(afterPan.count > 0 && Math.abs(afterPan.x - beforePan.x) > 20, label + ' overlay follows setMathBounds pan', { beforePan, afterPan });

  await page.evaluate(() => { videoFrameIndex = 0; speedSlider.value = '1'; speedSlider.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(300);
  const at1x = await page.evaluate(() => videoFrameIndex);
  await page.evaluate(() => { videoFrameIndex = 0; speedSlider.value = '4'; speedSlider.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(300);
  const at4x = await page.evaluate(() => videoFrameIndex);
  assert(at4x > at1x + 4, label + ' speed slider changes playback rate', { at1x, at4x });

  await page.locator('#frameSlider').evaluate((slider) => {
    slider.value = '20';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const sought = await page.evaluate(() => ({ index: videoFrameIndex, playing: videoPlaying, stats: statsEl.textContent }));
  assert(sought.index === 20 && !sought.playing && sought.stats.includes('帧 21/36'), label + ' frame slider seeks and pauses', sought);
}

(async () => {
  server = spawn('python3', ['-m', 'http.server', '8742', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await waitForServer(5000);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const consoleErrors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__desmosLoaded && calculator);
  await verifyStaticBaselines(page);
  await verifyMedia(page, 'moving-shapes.mp4', 'mp4');

  await page.setInputFiles('#fileInput', path.join(ROOT, 'test-shapes.png'));
  await page.waitForFunction(() => statsEl.textContent.includes('33 曲线'));
  const switched = await page.evaluate(() => ({ kind: activeMediaKind, frames: videoFrames.length, controlsHidden: videoControls.hidden }));
  assert(switched.kind === 'image' && switched.frames === 0 && switched.controlsHidden, 'switching to a static image cleans video state', switched);

  await verifyMedia(page, 'moving-shapes.gif', 'gif');
  assert(consoleErrors.length === 0, 'desktop flow has zero console errors', consoleErrors);
  await context.close();

  const retina = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
  const retinaPage = await retina.newPage();
  await retinaPage.goto(URL);
  await retinaPage.waitForFunction(() => window.__desmosLoaded && calculator);
  await retinaPage.setInputFiles('#fileInput', path.join(ASSETS, 'moving-shapes.mp4'));
  await waitForVideo(retinaPage);
  const playingCentroid = await overlayCentroid(retinaPage);
  assert(playingCentroid.count > 0, 'dpr=2 playback overlay is nonblank', playingCentroid);
  await retinaPage.click('#videoPlayBtn');
  const retinaAnalysis = await retinaPage.evaluate(() => Object.values(calculator.expressionAnalysis || {}).filter((x) => x && x.isError).length);
  assert(retinaAnalysis === 0, 'dpr=2 paused equations analyze cleanly', retinaAnalysis);
  await retinaPage.screenshot({ path: path.join(ASSETS, 'dpr2-paused.png') });
  await retina.close();
  await browser.close();
  console.log('\nALL BROWSER ACCEPTANCE CHECKS PASS');
})().catch((error) => {
  console.error('FAIL', error.stack || error);
  process.exitCode = 1;
}).finally(() => {
  if (server) server.kill();
});
