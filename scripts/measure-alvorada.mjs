import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:4180';
const output = process.argv[3] || 'artifacts/alvorada/baseline';
await fs.mkdir(output, { recursive: true });
const capture = process.argv.includes('--capture');
for (const [name, viewport, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__qa = { start: performance.now(), frames: [], longTasks: [], samples: [], firstReady: null, graphReady: null };
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__qa.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
    let last = performance.now();
    function frame(now) {
      const q = window.__qa;
      q.frames.push({ time: now, duration: now - last }); last = now;
      const scene = document.querySelector('[data-testid="alvorada-experience"]');
      if (scene?.getAttribute('data-renderer-state') === 'webgl' && q.firstReady === null) q.firstReady = now;
      if (scene?.getAttribute('data-stage') === 'org-ready' && q.graphReady === null) q.graphReady = now;
      if (now < 25000) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    setInterval(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) window.__qa.samples.push({ time: performance.now(), ...canvas.dataset });
    }, 500);
  });
  await page.goto(`${base}/scripts/alvorada-qa.html`, { waitUntil: 'load' });
  await page.waitForSelector('[data-renderer-state="webgl"]', { timeout: 60000 });
  if (capture) await page.screenshot({ path: path.join(output, `${name}-earth.png`) });
  await page.waitForSelector('[data-stage="territory"]', { timeout: 20000 });
  await page.waitForTimeout(1100);
  if (capture) await page.screenshot({ path: path.join(output, `${name}-approach.png`) });
  await page.waitForSelector('[data-stage="brand-hold"]', { timeout: 20000 });
  await page.waitForTimeout(400);
  if (capture) await page.screenshot({ path: path.join(output, `${name}-brand.png`) });
  await page.waitForSelector('[data-stage="org-ready"]', { timeout: 20000 });
  await page.waitForTimeout(1800);
  if (capture) await page.screenshot({ path: path.join(output, `${name}-overview.png`) });
  const measurement = await page.evaluate(() => {
    const q = window.__qa;
    const frames = q.frames.filter(f => f.time >= q.firstReady && f.time <= q.graphReady).map(f => f.duration).sort((a,b) => a-b);
    return { ...q, navigation: performance.getEntriesByType('navigation')[0].toJSON(), resources: performance.getEntriesByType('resource').map(e => ({ name: e.name, duration: e.duration, transferSize: e.transferSize, decodedBodySize: e.decodedBodySize })), summary: { firstReadyMs: q.firstReady, graphReadyMs: q.graphReady, meanFps: 1000 / (frames.reduce((a,b) => a+b, 0) / frames.length), p95FrameMs: frames[Math.floor(frames.length*.95)], framesOver50ms: frames.filter(x => x>50).length, maxFrameMs: Math.max(...frames), longTaskCount: q.longTasks.length, longTaskMs: q.longTasks.reduce((a,b) => a+b.duration,0) } };
  });
  const environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory, canvasReleased: !document.querySelector('canvas'), nodes: document.querySelectorAll('.org-node').length, paints: performance.getEntriesByType('paint').map(p => p.toJSON()) }));
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify({ ...measurement, errors, environment, conditions: { viewport, mobileEmulation: mobile, dpr: 1, headless: true, screenshotsDuringMeasurement: capture, cache: 'fresh Chrome process and context; no network or CPU throttling', fixture: 'representative reference names; no authenticated API timing' } }, null, 2));
  console.log(name, JSON.stringify(measurement.summary), errors);
  await context.close();
  await browser.close();
}
