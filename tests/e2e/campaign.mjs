#!/usr/bin/env node
// End-to-end playthrough in a real browser (Playwright + Chromium):
// plays EVERY mandatory mission in campaign order exactly like a player would
// (answers quizzes, orders steps, makes predictions, types the reference
// solution into the editor and presses Check), then verifies the
// "To be continued" ending, a page reload, and that progress persisted.
//
//   npm run build && npm start            (in one terminal)
//   node tests/e2e/campaign.mjs [--base http://127.0.0.1:8080/] [--all] [--only <prefix>] [--shots <dir>]

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = opt('--base', 'http://127.0.0.1:8080/');
const ALL = args.includes('--all');
const ONLY = opt('--only', null);
const SHOTS = opt('--shots', null);
const FROM = opt('--from', null); // seed earlier missions as completed and start here
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/generated/curriculum.json'), 'utf8'));
const optionalChapters = new Set(cur.chapters.filter((c) => c.optional).map((c) => c.id));
const missions = cur.missions.filter((m) => ALL || !(m.optional || optionalChapters.has(m.chapter)));

async function fail(msg) {
  console.error('E2E FAIL:', msg);
  if (errors.length) console.error('page errors:', errors.join(' | '));
  try {
    await page.screenshot({ path: path.join(SHOTS || '.', 'e2e-failure.png') });
  } catch {
    /* ignore */
  }
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
if (FROM) {
  const idx = cur.missions.findIndex((m) => m.id === FROM);
  const seeded = { schemaVersion: 2, missions: {} };
  for (const m of cur.missions.slice(0, idx)) seeded.missions[m.id] = { status: 'completed', mastered: true, independent: true, steps: {} };
  // Seed before the app's scripts run (the app flushes its own save on unload).
  await page.addInitScript((text) => {
    if (!sessionStorage.getItem('e2e-seeded')) {
      localStorage.setItem('isle-of-c.save', text);
      sessionStorage.setItem('e2e-seeded', '1');
    }
  }, JSON.stringify(seeded));
  await page.reload();
}
await page.waitForSelector('.toolchain-ready', { timeout: 240000 });
console.log('compiler ready');

async function setEditor(code) {
  await page.evaluate((text) => {
    const view = document.querySelector('#code-editor').cmView;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }, code);
}

async function doStep(m, s, i) {
  // Open the step.
  await page.locator('.step-pill').nth(i).click();
  if (s.type === 'quiz') {
    for (const c of [].concat(s.correct)) await page.locator('.step-card .choice input').nth(c).check();
    await page.locator('.step-card').getByRole('button', { name: /Check answer/ }).click();
    await page.waitForSelector('.step-card .ok-text');
  } else if (s.type === 'order') {
    for (let k = 0; k < s.lines.length; k++) {
      const texts = await page.locator('.order-item .order-text').allInnerTexts();
      let j = texts.indexOf(s.lines[k]);
      if (j < 0) await fail(`${m.id}: order line not found: ${s.lines[k]}`);
      while (j > k) {
        await page.locator('.order-item').nth(j).locator('button').first().click();
        j--;
      }
    }
    await page.locator('.step-card').getByRole('button', { name: /Check answer/ }).click();
    await page.waitForSelector('.step-card .ok-text');
  } else if (s.type === 'predict') {
    if (s.answer.kind === 'choice') await page.locator('.step-card .choice input').nth(s.answer.correct).check();
    else await page.locator('.step-card textarea').fill(s.answer.output.replace(/\n$/, ''));
    await page.locator('.step-card').getByRole('button', { name: /Lock in prediction/ }).click();
    await page.waitForSelector('.predict-outcome', { timeout: 60000 });
    const ok = await page.locator('.predict-outcome .ok-text').count();
    if (!ok) await fail(`${m.id} [${s.id}]: correct prediction was not accepted: ${await page.locator('.predict-outcome').innerText()}`);
  } else if (s.type === 'read') {
    await page.locator('.step-card').getByRole('button', { name: /Done/ }).click();
  } else if (s.type === 'code') {
    await setEditor(s.solution);
    await page.getByRole('button', { name: /^✔ Check/ }).click();
    await page.waitForFunction(() => document.querySelector('.result-modal') || document.querySelector('.tests > p.err-text') || document.querySelector('.diagnostics > p.err-text'), null, { timeout: 120000 });
    if (!(await page.locator('.result-modal').count())) {
      const detail = await page.locator('.console-body').innerText();
      await fail(`${m.id} [${s.id}]: reference solution did not pass in the browser:\n${detail.slice(0, 1500)}`);
    }
    if (SHOTS && i === m.steps.length - 1) await page.screenshot({ path: path.join(SHOTS, `${m.id.replace('/', '__')}.png`) });
    await page.getByRole('button', { name: /Stay here/ }).click();
  }
}

let n = 0;
const started = Date.now();
let reached = !FROM;
for (const m of missions) {
  if (m.id === FROM) reached = true;
  if (!reached) continue;
  if (ONLY && !m.id.startsWith(ONLY)) continue;
  await page.evaluate((id) => (location.hash = `#/mission/${id}`), m.id);
  await page.waitForSelector('.mission-screen, .locked-mission').catch(() => fail(`${m.id}: mission screen did not appear`));
  if (await page.locator('.locked-mission').count()) await fail(`${m.id} is locked although its prerequisites were completed`);
  for (let i = 0; i < m.steps.length; i++) await doStep(m, m.steps[i], i);
  const status = await page.evaluate((id) => JSON.parse(localStorage.getItem('isle-of-c.save') || '{}').missions?.[id]?.status, m.id);
  // The store writes after a short debounce.
  if (status !== 'completed') {
    await page.waitForTimeout(500);
    const again = await page.evaluate((id) => JSON.parse(localStorage.getItem('isle-of-c.save') || '{}').missions?.[id]?.status, m.id);
    if (again !== 'completed') await fail(`${m.id}: not recorded as completed (status ${again})`);
  }
  n++;
  console.log(`✔ ${m.id}`);
}

if (!ONLY) {
  // Completing the last mandatory mission must lead to the temporary ending.
  await page.waitForTimeout(800);
  await page.evaluate(() => (location.hash = '#/ending'));
  await page.waitForSelector('.ending-screen');
  const text = await page.locator('.ending-screen').innerText();
  if (!/Current expedition complete\./.test(text) || !/To be continued/.test(text)) await fail('ending screen text missing');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ending.png') });
  console.log('✔ ending screen shows "Current expedition complete. To be continued…"');

  // Progress survives a reload.
  await page.reload();
  await page.evaluate(() => (location.hash = '#/map'));
  await page.waitForSelector('.map-screen').catch(() => fail('map did not appear after reload'));
  const overall = await page.locator('.chapter-panel > p.small').first().innerText();
  const expected = `${cur.missions.filter((mm) => !(mm.optional || optionalChapters.has(mm.chapter))).length}/${cur.missions.filter((mm) => !(mm.optional || optionalChapters.has(mm.chapter))).length} missions`;
  if (!overall.includes(expected)) await fail(`after reload the map shows "${overall}", expected "${expected}"`);
  if (!(await page.getByRole('button', { name: /Expedition log/ }).count())) await fail('expedition log button missing after reload');
  console.log('✔ progress survived a reload:', overall);
}

if (errors.length) await fail('page errors: ' + errors.join(' | '));
console.log(`\nE2E OK: ${n} missions played in ${Math.round((Date.now() - started) / 1000)} s`);
await browser.close();
