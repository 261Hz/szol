import { chromium } from 'playwright';
const URL = 'https://szol.vercel.app';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0, { timeout: 15000 });
await page.waitForSelector('span.font-medium', { timeout: 20000 });

// Load a story
const storyCards = page.locator('main').getByRole('button').filter({ has: page.locator('span.font-medium') });
await storyCards.first().click();
await page.waitForTimeout(400);
await page.locator('main').getByRole('button', { name: 'Read →' }).first().click();
await page.waitForTimeout(800);

// Retype tab — check overflow
const retypeOverflow = await page.evaluate(() => {
  const vw = window.innerWidth;
  const overflowing = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2) overflowing.push(`${el.tagName}.${el.className.slice(0,40)} right=${Math.round(r.right)} vw=${vw}`);
  });
  return overflowing.slice(0, 10);
});
console.log('Retype overflow elements:', retypeOverflow.length ? retypeOverflow : 'none');
await page.screenshot({ path: 'vm_retype.png', fullPage: false });

// Speak tab
await page.locator('nav').getByRole('button', { name: /Hablar/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'vm_speak.png', fullPage: false });

// Write tab — check canvas bounding box
await page.locator('nav').getByRole('button', { name: /Escribir/ }).click();
await page.waitForTimeout(1500);
const canvasBox = await page.locator('canvas').boundingBox();
const vw = await page.evaluate(() => window.innerWidth);
console.log(`Write tab: viewport=${vw}px, canvas bounding box:`, canvasBox);
console.log(`Canvas in viewport: ${canvasBox ? canvasBox.x >= 0 && canvasBox.x + canvasBox.width <= vw + 2 : 'no canvas'}`);
await page.screenshot({ path: 'vm_write.png', fullPage: false });

// Check canvas DPR info
const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  return { width: c.width, height: c.height, styleWidth: c.style.width, dpr: window.devicePixelRatio };
});
console.log('Canvas element:', canvasInfo);

// Vocab test — tap a word in completed sentence area (after typing a sentence on retype)
// Navigate back to Retype and check words are tappable  
await page.locator('nav').getByRole('button', { name: /Reescribir/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'vm_retype_focus.png', fullPage: false });

console.log('Errors:', errors.length ? errors : 'none');
await browser.close();
