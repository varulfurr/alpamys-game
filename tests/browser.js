import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { INITIAL, MIN_MOVES, matches, legalMoves } from '../src/engine.js';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const failures = [];
const url = process.env.TEST_URL || 'http://127.0.0.1:5173';
await mkdir('test-results', { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', e => failures.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') failures.push(msg.text()); });
const tile = (i, p = page) => p.locator(`.piece[data-index="${i}"]`);
const ready = (p = page) => p.waitForFunction(() => document.querySelector('#board')?.dataset.busy === 'false');
const types = (p = page) => p.locator('.piece').evaluateAll(els => els.sort((a,b) => +a.dataset.index - +b.dataset.index).map(el => el.dataset.type));
async function reset() { await page.goto(url); await ready(); }
try {
  await reset();
  assert.deepEqual(await types(), [...INITIAL]);
  assert.equal(await page.locator('.piece').count(), 16);
  const bounds = await page.locator('#board').boundingBox();
  assert.equal(bounds.width, bounds.height);
  assert.equal(bounds.height, 800);
  assert.equal(bounds.x + bounds.width / 2, 720);
  assert.equal(bounds.y + bounds.height / 2, 500);
  assert.equal(await page.locator('.piece').allTextContents().then(texts => texts.join('')), '');
  assert.equal(await page.locator('#instructions').evaluate(el => getComputedStyle(el).clipPath), 'inset(50%)');
  await page.screenshot({ path: 'test-results/desktop.png' });
  console.log('PASS exact initial layout, square 80%-height board, centered composition');

  await tile(0).click();
  await tile(1).click();
  await ready();
  assert.deepEqual(await types(), [...INITIAL]);
  console.log('PASS invalid swap restores the board');

  await page.evaluate(() => {
    window.observedPhases = [];
    new MutationObserver(records => {
      for (const record of records) {
        if (record.target.classList?.contains('vanishing')) window.observedPhases.push('vanishing');
      }
    }).observe(document.querySelector('#pieces'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await tile(2).click();
  await tile(6).click();
  await page.waitForSelector('.matched');
  assert.equal(await page.locator('.matched').count(), 3);
  await page.screenshot({ path: 'test-results/match-glow.png' });
  await ready();
  assert.ok(await page.evaluate(() => window.observedPhases.includes('vanishing')));
  const after = await types();
  assert.equal(after.length, 16);
  assert.equal(matches(after).length, 0);
  assert.ok(legalMoves(after).length >= MIN_MOVES);
  assert.match(await page.locator('#status').textContent(), /Собрано|Новые/);
  console.log('PASS successful match glows, disappears, refills and settles into playable board');

  await reset();
  await tile(2).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.matched');
  await ready();
  assert.equal(matches(await types()).length, 0);
  console.log('PASS keyboard selection and swap');

  await reset();
  const from = await tile(8).boundingBox();
  const to = await tile(9).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('.matched');
  await ready();
  console.log('PASS drag-to-swap');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const phone = await mobile.newPage();
  await phone.goto(url);
  await ready(phone);
  const mobileBounds = await phone.locator('#board').boundingBox();
  assert.ok(Math.abs(mobileBounds.width - mobileBounds.height) < 1);
  assert.ok(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 390);
  await phone.screenshot({ path: 'test-results/mobile.png' });
  await tile(2, phone).tap();
  await tile(6, phone).tap();
  await phone.waitForSelector('.matched');
  await ready(phone);
  assert.equal(matches(await types(phone)).length, 0);
  console.log('PASS mobile layout and touch interaction');
  await mobile.close();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reset();
  await tile(2).click();
  await tile(6).click();
  await ready();
  assert.match(await page.locator('#status').textContent(), /Собрано|Новые/);
  assert.equal(matches(await types()).length, 0);
  console.log('PASS reduced-motion gameplay');
  for (let i = 0; i < 12; i++) {
    const [a, b] = legalMoves(await types())[0];
    await tile(a).click();
    await tile(b).click();
    await ready();
    assert.equal((await types()).length, 16);
    assert.equal(matches(await types()).length, 0);
    assert.ok(legalMoves(await types()).length >= MIN_MOVES);
  }
  console.log('PASS twelve consecutive moves leave a full, stable, playable board');
  assert.deepEqual(failures, []);
  console.log('PASS no browser errors');
} finally {
  await browser.close();
}
