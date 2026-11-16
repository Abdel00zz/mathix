import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Run against an already started dev/production server using a fresh, anonymous profile.
const origin = process.env.APP_URL || 'http://localhost:3100';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.BROWSER_EXECUTABLE || (process.platform === 'win32' && fs.existsSync(edge) ? edge : undefined);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 60000 });
  for (const [action, dialog] of [['orientation', '#orient-dlg'], ['settings', '#set'], ['help', '#help-dlg']]) {
    await page.locator(`[data-sb-action="${action}"]`).click();
    await page.locator(`${dialog}[open]`).waitFor();
    await page.keyboard.press('Escape');
    await page.locator(`${dialog}[open]`).waitFor({ state: 'hidden' });
  }
  await page.locator('[data-sb-action="settings"]').click();
  await page.locator('#set[open] input[name="fn"]').fill('Élève test');
  await page.locator('#set[open] button[type="submit"]').click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ap-p')).fn), 'Élève test');

  await page.goto(`${origin}/lecon/mise-a-niveau`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.v === 'les');
  await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.6));
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('ap-resume') || '{}').lessons || {}).some(value => value.pct >= 30));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ap')).l['mise-a-niveau'] || 0), 0);
  const blankCount = await page.locator('#les .blank').count();
  const revealCount = Math.max(2, Math.ceil(blankCount * 0.15));
  for (let index = 0; index < revealCount; index++) {
    const blank = page.locator('#les .blank').nth(index);
    await blank.scrollIntoViewIfNeeded();
    await blank.click();
  }
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ap') || '{}').l?.['mise-a-niveau'] || 0) >= 10);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ap')).l['mise-a-niveau']);
  assert.equal(saved, Math.round(revealCount * 100 / blankCount));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#les .blank.revealed').length >= 2);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('ap')).l['mise-a-niveau']) >= saved);

  await page.goto(`${origin}/quiz/mise-a-niveau`, { waitUntil: 'networkidle' });
  await page.locator('#quiz .opt').first().click();
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await page.getByRole('button', { name: 'Suivant', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#quiz .top .cnt')?.textContent?.startsWith('2 /'));
  assert.ok(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ap')).q).some(value => (value.answers || value).some(answer => answer === 0 || answer === 1))));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ origin, sidebar: 'OK', profile: 'OK', lessonPct: saved, lessonRestored: true, quizRestoredAtQuestion: 2, errors }));
  await context.close();
} finally {
  await browser.close();
}
