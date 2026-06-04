import { chromium, devices } from 'playwright';
const URL = 'https://szol.vercel.app';
const mobile = devices['Moto G Power'];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ ...mobile });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0, { timeout: 15000 });

// Load a story first
await page.waitForSelector('span.font-medium', { timeout: 20000 });
const storyCards = page.locator('main').getByRole('button').filter({ has: page.locator('span.font-medium') });
await storyCards.first().click();
await page.waitForTimeout(400);
await page.locator('main').getByRole('button', { name: 'Read →' }).first().click();
await page.waitForTimeout(1000);

// Retype tab (default after loading story)
await page.screenshot({ path: 'diag_retype.png', fullPage: false });

// Speak tab
await page.locator('nav').getByRole('button', { name: /Hablar/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'diag_speak.png', fullPage: false });

// Write tab
await page.locator('nav').getByRole('button', { name: /Escribir/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'diag_write.png', fullPage: false });

// Simulate drawing on the canvas
const canvas = page.locator('canvas');
const box = await canvas.boundingBox();
console.log('Canvas bounding box:', box);

if (box) {
  // Draw a line on the canvas (touchstart → touchmove → touchend)
  await page.touchscreen.tap(box.x + 50, box.y + 50);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'diag_write_after_touch.png', fullPage: false });
}

// Check if Library ClickableText words fire tap events on mobile
await page.locator('nav').getByRole('button', { name: /Biblioteca/ }).click();
await page.waitForTimeout(2000);
// Find a sentence with words in the Today section by expanding it
await page.screenshot({ path: 'diag_library.png', fullPage: false });

await browser.close();
console.log('Done. Screenshots saved.');
