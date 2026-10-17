import { loadTestModule, startPreview } from './browser-utils.mjs';

const { chromium } = await loadTestModule('playwright');
const preview = await startPreview();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await page.goto(preview.url);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: `
    .site-header { border: 0; padding: 32px 48px; }
    .brand { font-size: 26px; gap: 14px; } .brand-mark { width: 34px; height: 34px; }
    .header-actions, .environment, .site-footer, .scene-heading, .scene-bottom, .action-area, .view-controls, .map-caption { display: none; }
    .workspace { padding: 0 48px 40px; min-height: 0; height: 500px; grid-template-columns: 320px minmax(0,1fr); column-gap: 0; }
    .intro { align-self: center; padding: 0 0 32px; }
    h1 { font-size: 64px; letter-spacing: -0.055em; }
    .intro p { font-size: 20px; margin-top: 24px; line-height: 1.6; }
    .scene { min-height: 0; } .canvas-wrap { min-height: 0; }
  ` });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'public/social.png' });
  console.log('Created public/social.png (1200 × 630), rendered from the actual canvas and local font. Rebuild to copy it into dist/.');
} finally {
  await browser?.close();
  await preview.close();
}
