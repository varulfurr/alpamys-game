import { chromium, webkit } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { INITIAL, MIN_MOVES, matches, legalMoves } from '../src/engine.js';

const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
let server;
let url = process.env.TEST_URL;
if (!url) {
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    const file = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/`;
}
const label = process.env.TEST_URL ? 'published' : 'production';
await mkdir('test-results', { recursive: true });
const errors = [];
const ready = page => page.waitForSelector('#board[data-images="loaded"][data-busy="false"]');
const types = page => page.locator('.piece').evaluateAll(els => els.map(el => el.dataset.type));
const tile = (page, index) => page.locator(`.piece[data-index="${index}"]`);

function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => errors.push(`${request.failure()?.errorText} ${request.url()}`));
}

async function verifyImages(page, screenshotPath) {
  const board = await page.locator('#board').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(Math.abs(board.width - board.height) < 1, 'board must be square');
  assert.ok(board.x >= 0 && board.y >= 0 && board.x + board.width <= viewport.width + 1 && board.y + board.height <= viewport.height + 1);
  assert.ok(Math.abs(board.x + board.width / 2 - viewport.width / 2) < 1);
  assert.ok(Math.abs(board.y + board.height / 2 - viewport.height / 2) < 1);
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  const images = await page.locator('.piece img').evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect();
    return { complete: el.complete, width: el.naturalWidth, height: el.naturalHeight, src: el.currentSrc, opacity: getComputedStyle(el).opacity, x: r.x, y: r.y, w: r.width, h: r.height };
  }));
  assert.equal(images.length, 16);
  assert.equal(new Set(images.map(i => i.src)).size, 4);
  for (const image of images) {
    assert.ok(image.complete && image.width === 512 && image.height === 512);
    assert.ok(image.src.startsWith('http') && !image.src.includes('data:'));
    assert.equal(image.opacity, '1');
    assert.ok(image.x >= board.x - 1 && image.y >= board.y - 1 && image.x + image.w <= board.x + board.width + 1 && image.y + image.h <= board.y + board.height + 1);
  }
  // Verify visible colored pixels in EACH cell, not just successful requests or DOM nodes.
  const screenshot = await page.screenshot({ path: screenshotPath, scale: 'css' });
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const size = board.width / 4;
    const { data, info } = await sharp(screenshot).extract({ left: Math.ceil(board.x + (col + .1) * size), top: Math.ceil(board.y + (row + .1) * size), width: Math.floor(size * .8), height: Math.floor(size * .8) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let colored = 0;
    for (let n = 0; n < data.length; n += info.channels) if (Math.max(data[n], data[n+1], data[n+2]) - Math.min(data[n], data[n+1], data[n+2]) > 25) colored++;
    assert.ok(colored / (info.width * info.height) > .18, `dessert ${row},${col} must be visibly painted`);
  }
}

async function checkMatch(page, mobile) {
  await page.evaluate(() => {
    window.gamePhases = [];
    new MutationObserver(records => {
      for (const record of records) for (const phase of ['matched','vanishing']) {
        if (record.target.classList?.contains(phase)) window.gamePhases.push(phase);
      }
    }).observe(document.querySelector('#pieces'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  for (const index of [2,6]) {
    if (mobile) await tile(page, index).tap(); else await tile(page, index).click();
  }
  await ready(page);
  assert.match(await page.locator('#status').textContent(), /Собрано|Новые/);
  const phases = await page.evaluate(() => window.gamePhases);
  assert.ok(phases.includes('matched') && phases.includes('vanishing'));
  const result = await types(page);
  assert.equal(result.length, 16);
  assert.equal(matches(result).length, 0);
  assert.ok(legalMoves(result).length >= MIN_MOVES);
}

try {
  for (const engine of [webkit, chromium]) {
    const executablePath = engine === webkit
      ? process.env.WEBKIT_EXECUTABLE_PATH
      : process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    const browser = await engine.launch({ executablePath, ...(engine === chromium ? { args: ['--no-sandbox'] } : {}) });
    try {
      for (const [width,height] of [[375,812],[390,844],[430,932],[768,1024],[1440,1000]]) {
        const mobile = width < 1000;
        const context = await browser.newContext({ viewport: { width,height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
        const page = await context.newPage(); watch(page);
        await page.goto(url);
        await ready(page);
        assert.deepEqual(await types(page), [...INITIAL]);
        await verifyImages(page, `test-results/${label}-${engine.name()}-${width}x${height}.png`);
        await checkMatch(page, mobile);
        console.log(`PASS ${label} ${engine.name()} ${width}x${height}: 16 visible images, square centered board, ${mobile ? 'touch' : 'mouse'} match/glow/removal/refill`);

        if (width === 390) {
          // An actual touch swipe through Chromium's input protocol, without DOM event mocks.
          await page.reload(); await ready(page);
          const a = await tile(page,8).boundingBox(), b = await tile(page,9).boundingBox();
          const x = a.x+a.width/2, y = a.y+a.height/2, end = b.x+b.width/2;
          if (engine === chromium) {
            const cdp = await context.newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y}] });
            for(let step=1;step<=6;step++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:x+(end-x)*step/6,y}] });
            await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
          } else {
            await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(end,y,{steps:8}); await page.mouse.up();
          }
          await ready(page);
          assert.match(await page.locator('#status').textContent(), /Собрано|Новые/);
          console.log(`PASS ${engine.name()} ${engine === chromium ? 'native touch swipe' : 'pointer drag'} and refilling`);
          await page.setViewportSize({width:844,height:390});
          await verifyImages(page, `test-results/${label}-${engine.name()}-landscape.png`);
        }
        await context.close();
      }
      const noJs = await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
      watch(noJs); await noJs.goto(url);
      await verifyImages(noJs, `test-results/${label}-${engine.name()}-no-js.png`);
      assert.ok(await noJs.locator('noscript .load-error').isVisible());
      await noJs.close();
      console.log(`PASS ${engine.name()} images still visible with JavaScript disabled; explicit browser guidance`);
      const fallback = await browser.newPage(); watch(fallback);
      await fallback.goto(url); await ready(fallback);
      await fallback.locator('picture source').evaluateAll(sources => sources.forEach(source => source.remove()));
      await fallback.waitForFunction(() => [...document.querySelectorAll('.dessert')].every(img => img.complete && img.naturalWidth === 512 && img.currentSrc.endsWith('.png')));
      await fallback.close();
      console.log(`PASS ${engine.name()} all 16 PNG fallbacks load`);
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, [], 'No JS, CSP, console or resource-loading errors');
  console.log(`PASS no errors; tested URL: ${url}`);
} finally { server?.close(); }
