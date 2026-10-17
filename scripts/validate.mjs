import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createNetwork, signalDistances, densityOptions } from '../src/network.ts';
import { loadTestModule, startPreview } from './browser-utils.mjs';

const results = { checks: [], browsers: {}, accessibility: [], limitations: [], measurements: {} };
const check = async (name, task) => {
  try { await task(); results.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.checks.push({ name, passed: false, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); throw error; }
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const canvasImage = (page) => page.locator('canvas').evaluate((canvas) => canvas.toDataURL());
const content = (page, id) => page.locator(`#${id}`).textContent();

await mkdir('artifacts/screenshots', { recursive: true });
await check('Generated graphs are connected, deterministic, and internally consistent', () => {
  for (const { count } of densityOptions) for (const seed of [1, 82419, 90338, 999999]) {
    const graph = createNetwork(count, seed);
    assert.equal(graph.nodes.length, count);
    assert.deepEqual(graph, createNetwork(count, seed));
    assert.equal(new Set(graph.edges.map(({ a, b }) => [a, b].sort((a, b) => a - b).join(':'))).size, graph.edges.length);
    assert.ok(signalDistances(graph, count - 1).every(Number.isFinite));
    assert.ok(graph.edges.every((edge) => edge.a !== edge.b && edge.length > 0));
    for (const node of graph.nodes) assert.equal(node.degree, graph.edges.filter(({ a, b }) => a === node.id || b === node.id).length);
  }
});

const { chromium, webkit } = await loadTestModule('playwright');
const { default: AxeBuilder } = await loadTestModule('@axe-core/playwright', 'dist/index.mjs');
const preview = await startPreview();
let browser;
try {
  browser = await chromium.launch();
  results.browsers.chromium = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.__renderedFrames = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => request((time) => { window.__renderedFrames++; callback(time); });
  });
  const page = await context.newPage();
  const failures = [];
  const responses = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  page.on('response', (response) => { responses.push({ path: new URL(response.url()).pathname, status: response.status() }); if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(preview.url).origin ? route.continue() : route.abort());
  await page.goto(preview.url);
  await page.evaluate(() => document.fonts.ready);

  await check('Production export loads at /preview/ with local assets and working canvas', async () => {
    assert.equal(await content(page, 'node-count'), '72');
    assert.equal(await page.locator('#node-select option').count(), 72);
    assert.ok(Number(await content(page, 'link-count')) > 71);
    assert.equal(await page.locator('#canvas-error').isVisible(), false);
    assert.equal(await page.evaluate(() => document.fonts.check('14px Manrope')), true);
    const frames = await page.evaluate(() => window.__renderedFrames);
    await wait(180);
    assert.ok(await page.evaluate(() => window.__renderedFrames) > frames);
    assert.deepEqual(failures, []);
  });

  await check('Pause freezes canvas and resume restarts animation', async () => {
    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
    const still = await canvasImage(page);
    const frames = await page.evaluate(() => window.__renderedFrames);
    await wait(250);
    assert.equal(await canvasImage(page), still);
    assert.equal(await page.evaluate(() => window.__renderedFrames), frames);
    await page.getByRole('button', { name: 'Resume simulation', exact: true }).click();
    await wait(100);
    assert.notEqual(await canvasImage(page), still);
  });

  await check('Pulses update real state; paused pulses provide a still visual response', async () => {
    await page.locator('#pulse-button').click();
    assert.equal(await content(page, 'pulse-count'), '1');
    assert.equal(await content(page, 'pulse-label'), 'pulse sent');
    await page.locator('#pause-button').click();
    const before = await canvasImage(page);
    await page.locator('#pulse-button').click();
    assert.equal(await content(page, 'pulse-count'), '2');
    assert.notEqual(await canvasImage(page), before);
    const after = await canvasImage(page);
    await wait(100);
    assert.equal(await canvasImage(page), after);
  });

  await check('Node selection works by pointer and the native keyboard menu', async () => {
    const graph = createNetwork(72, 82419);
    const bounds = await page.locator('canvas').boundingBox();
    const node = graph.nodes[12];
    await page.mouse.click(bounds.x + bounds.width / 2 + node.x * bounds.width * 0.45, bounds.y + bounds.height * 0.46 + node.y * bounds.height * 0.46);
    assert.equal(await page.locator('#node-select').inputValue(), '12');
    await page.locator('#node-select').selectOption('23');
    assert.equal(await content(page, 'node-detail'), `${graph.nodes[23].degree} connections`);
    await page.locator('#node-select').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#node-select').inputValue(), '24');
  });

  await check('Zoom bounds, wheel zoom, drag, keyboard pan, and reset view work', async () => {
    await page.locator('#zoom-in').click();
    assert.equal(await content(page, 'zoom-value'), '120%');
    await page.locator('#zoom-out').click();
    assert.equal(await content(page, 'zoom-value'), '100%');
    for (let i = 0; i < 7; i++) await page.locator('#zoom-in').click();
    assert.equal(await page.locator('#zoom-in').isDisabled(), true);
    await page.locator('#reset-view').click();
    for (let i = 0; i < 2; i++) await page.locator('#zoom-out').click();
    assert.equal(await page.locator('#zoom-out').isDisabled(), true);
    await page.locator('#reset-view').click();
    const bounds = await page.locator('canvas').boundingBox();
    await page.mouse.move(bounds.x + 50, bounds.y + 60);
    await page.mouse.wheel(0, -50);
    await wait(60);
    assert.equal(await content(page, 'zoom-value'), '110%');
    await page.locator('#reset-view').click();
    const before = await canvasImage(page);
    await page.mouse.move(bounds.x + 50, bounds.y + 60);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 120, bounds.y + 120, { steps: 5 });
    await page.mouse.up();
    assert.notEqual(await canvasImage(page), before);
    await page.locator('#reset-view').click();
    assert.equal(await canvasImage(page), before);
    await page.locator('canvas').focus();
    await page.keyboard.press('ArrowLeft');
    assert.notEqual(await canvasImage(page), before);
    await page.locator('#reset-view').click();
    assert.equal(await canvasImage(page), before);
  });

  await check('All atmospheres, speed, density, and regeneration update the simulation', async () => {
    const before = await canvasImage(page);
    await page.getByRole('radio', { name: 'Ion', exact: true }).check();
    assert.notEqual(await canvasImage(page), before);
    const ion = await canvasImage(page);
    await page.getByRole('radio', { name: 'Ember', exact: true }).check();
    assert.notEqual(await canvasImage(page), ion);
    await page.locator('#speed').fill('1.75');
    assert.equal(await content(page, 'speed-value'), '1.75×');
    await page.locator('#density').fill('2');
    assert.equal(await content(page, 'node-count'), '108');
    assert.equal(await page.locator('#node-select option').count(), 108);
    assert.equal(await content(page, 'density-value'), 'Dense');
    assert.equal(await page.locator('#node-select').inputValue(), '0');
    await page.locator('#density').fill('0');
    assert.equal(await content(page, 'node-count'), '40');
    const old = await canvasImage(page);
    await page.locator('#regenerate-button').click();
    assert.notEqual(await canvasImage(page), old);
    assert.equal(await page.getByRole('radio', { name: 'Ember', exact: true }).isChecked(), true);
    assert.equal(await content(page, 'speed-value'), '1.75×');
    assert.equal(await content(page, 'motion-status'), 'Simulation paused');
  });

  await check('Help dialog traps focus, closes with Escape, and restores its trigger', async () => {
    await page.locator('#help-button').click();
    assert.equal(await page.locator('#help-dialog').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'close-help');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'explore-button');
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    results.accessibility.push({ state: 'Desktop help dialog', violations: audit.violations });
    assert.deepEqual(audit.violations, []);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'help-button');
    assert.equal(await page.locator('#help-dialog').isVisible(), false);
  });

  await check('Global Enter and Space shortcuts do not hijack native controls', async () => {
    await page.locator('canvas').focus();
    await page.keyboard.press('Enter');
    assert.equal(await content(page, 'pulse-count'), '3');
    await page.keyboard.press('Space');
    assert.equal(await content(page, 'motion-status'), 'Network active');
    await page.locator('#pulse-button').focus();
    await page.keyboard.press('Space');
    assert.equal(await content(page, 'pulse-count'), '4');
    assert.equal(await content(page, 'motion-status'), 'Network active');
  });

  await check('Responsive export has no horizontal overflow at 320, 390, 760, 1024, 1440', async () => {
    results.measurements.viewports = [];
    for (const width of [320, 390, 760, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
      await page.goto(preview.url);
      await page.evaluate(() => document.fonts.ready);
      const measure = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, canvas: document.querySelector('canvas').getBoundingClientRect().toJSON(), action: document.querySelector('#pulse-button').getBoundingClientRect().toJSON() }));
      assert.ok(measure.scrollWidth <= width);
      if (width === 320 || width === 390) assert.ok(measure.action.bottom < 844);
      results.measurements.viewports.push(measure);
      if (width === 390 || width === 1440) {
        await page.screenshot({ path: `artifacts/screenshots/${width === 390 ? 'mobile' : 'desktop'}.webp`, type: 'webp', quality: 85 });
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        results.accessibility.push({ state: `Default ${width}px`, violations: audit.violations });
        assert.deepEqual(audit.violations, []);
      }
    }
  });

  await check('Mobile disclosure, touch selection, pulse, and keyboard focus work', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mobilePage = await phone.newPage();
    await mobilePage.goto(preview.url);
    assert.equal(await mobilePage.locator('#environment').evaluate((details) => details.open), false);
    await mobilePage.locator('#pulse-button').tap();
    assert.equal(await content(mobilePage, 'pulse-count'), '1');
    const bounds = await mobilePage.locator('canvas').boundingBox();
    const graph = createNetwork(72, 82419);
    const node = graph.nodes[9];
    await mobilePage.touchscreen.tap(bounds.x + bounds.width / 2 + node.x * bounds.width * 0.44, bounds.y + bounds.height * 0.46 + node.y * bounds.height * 0.46);
    assert.equal(await mobilePage.locator('#node-select').inputValue(), '9');
    await mobilePage.locator('#environment summary').tap();
    assert.equal(await mobilePage.locator('#environment').evaluate((details) => details.open), true);
    await mobilePage.getByRole('radio', { name: 'Ion', exact: true }).check();
    await mobilePage.screenshot({ path: 'artifacts/screenshots/mobile-settings.webp', type: 'webp', quality: 80, fullPage: true });
    const audit = await new AxeBuilder({ page: mobilePage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    results.accessibility.push({ state: 'Mobile expanded settings', violations: audit.violations });
    assert.deepEqual(audit.violations, []);
    await mobilePage.locator('#pulse-button').focus();
    await mobilePage.keyboard.press('Tab');
    await mobilePage.keyboard.press('Shift+Tab');
    assert.equal(await mobilePage.locator('#pulse-button').evaluate((el) => el.matches(':focus-visible')), true);
    await mobilePage.screenshot({ path: 'artifacts/screenshots/keyboard-focus.webp', type: 'webp', quality: 85 });
    await mobilePage.locator('#help-button').click();
    await mobilePage.screenshot({ path: 'artifacts/screenshots/mobile-help.webp', type: 'webp', quality: 80 });
    await phone.close();
  });

  await check('Reduced motion starts with zero animation frames; still pulse remains usable', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(preview.url);
    assert.equal(await content(page, 'motion-status'), 'Reduced motion');
    const before = await canvasImage(page);
    const frames = await page.evaluate(() => window.__renderedFrames);
    await wait(200);
    assert.equal(await page.evaluate(() => window.__renderedFrames), frames);
    assert.equal(await canvasImage(page), before);
    await page.locator('#pulse-button').click();
    assert.notEqual(await canvasImage(page), before);
    const after = await canvasImage(page);
    await wait(150);
    assert.equal(await canvasImage(page), after);
    await page.locator('#pause-button').click();
    await wait(100);
    assert.ok(await page.evaluate(() => window.__renderedFrames) > frames);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#motion-status').textContent === 'Reduced motion');
    assert.equal(await content(page, 'motion-status'), 'Reduced motion');
  });

  await check('200% text size retains controls and has no horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(preview.url);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#pulse-button').click();
    assert.equal(await content(page, 'pulse-count'), '1');
    await page.screenshot({ path: 'artifacts/screenshots/text-200.webp', type: 'webp', quality: 75, fullPage: true });
  });

  await check('Canvas failure provides a visible recovery message and disables simulation actions', async () => {
    const fallback = await browser.newContext();
    await fallback.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const fallbackPage = await fallback.newPage();
    await fallbackPage.goto(preview.url);
    assert.equal(await fallbackPage.locator('#canvas-error').isVisible(), true);
    assert.equal(await fallbackPage.locator('#pulse-button').isDisabled(), true);
    await fallbackPage.locator('#help-button').click();
    assert.equal(await fallbackPage.locator('#help-dialog').isVisible(), true);
    await fallback.close();
  });

  await check('Share metadata resolves to complete local assets', async () => {
    await page.goto(preview.url);
    const metadata = await page.evaluate(() => ({ title: document.title, description: document.querySelector('meta[name="description"]').content, ogTitle: document.querySelector('meta[property="og:title"]').content, image: document.querySelector('meta[property="og:image"]').content, icon: document.querySelector('link[rel="icon"]').getAttribute('href') }));
    assert.ok(metadata.title && metadata.description && metadata.ogTitle);
    for (const asset of [metadata.image, metadata.icon]) {
      const response = await page.request.get(new URL(asset, preview.url).href);
      assert.equal(response.status(), 200);
      assert.ok((await response.body()).length > 100);
    }
    assert.deepEqual(failures, []);
    results.measurements.resources = [...new Map(responses.map((response) => [response.path, response])).values()];
  });

  let safari;
  try { safari = await webkit.launch(); }
  catch (error) { results.limitations.push(`WebKit could not launch: ${error.message}`); console.warn('WebKit unavailable; exact launch error recorded.'); }
  if (safari) {
    try {
      results.browsers.webkit = safari.version();
      await check('WebKit mobile primary interactions, pause, settings, and dialog', async () => {
        const safariPage = await safari.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errors = [];
        safariPage.on('pageerror', (error) => errors.push(error.message));
        await safariPage.goto(preview.url);
        await safariPage.locator('#pulse-button').tap();
        assert.equal(await content(safariPage, 'pulse-count'), '1');
        await safariPage.locator('#pause-button').tap();
        assert.equal(await content(safariPage, 'motion-status'), 'Simulation paused');
        const still = await canvasImage(safariPage);
        await wait(120);
        assert.equal(await canvasImage(safariPage), still);
        await safariPage.locator('#environment summary').tap();
        await safariPage.getByRole('radio', { name: 'Ion', exact: true }).check();
        await safariPage.locator('#density').fill('2');
        assert.equal(await content(safariPage, 'node-count'), '108');
        await safariPage.locator('#help-button').tap();
        assert.equal(await safariPage.locator('#help-dialog').isVisible(), true);
        await safariPage.keyboard.press('Escape');
        assert.equal(await safariPage.evaluate(() => document.activeElement.id), 'help-button');
        assert.ok(await safariPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        await safariPage.screenshot({ path: 'artifacts/screenshots/webkit-mobile.webp', type: 'webp', quality: 80 });
      });
    } finally { await safari.close(); }
  }
  results.limitations.push('No physical phone, screen-reader session, or browser-native zoom test. 200% text scaling is tested separately. Automated accessibility scans are not a full WCAG audit.');
} finally {
  await browser?.close();
  await preview.close();
  await writeFile('artifacts/interaction-results.json', JSON.stringify(results, null, 2) + '\n');
}
if (results.checks.some((check) => !check.passed)) process.exitCode = 1;
console.log(`${results.checks.filter((check) => check.passed).length} checks passed. Results: artifacts/interaction-results.json`);
