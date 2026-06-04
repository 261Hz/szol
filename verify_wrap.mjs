import { chromium } from 'playwright';
const URL = 'https://szol.vercel.app';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0, { timeout: 15000 });
await page.waitForSelector('span.font-medium', { timeout: 20000 });

// Load a story
const storyCards = page.locator('main').getByRole('button').filter({ has: page.locator('span.font-medium') });
await storyCards.first().click();
await page.waitForTimeout(400);
await page.locator('main').getByRole('button', { name: 'Read →' }).first().click();
await page.waitForTimeout(800);

// Retype tab
await page.screenshot({ path: 'vw_retype.png' });

// Speak tab  
await page.locator('nav').getByRole('button', { name: /Hablar/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'vw_speak.png' });

// Check the sentence box for overflow
const sentenceBox = await page.locator('.rounded-xl.bg-gray-50').boundingBox();
const sentenceRight = sentenceBox ? sentenceBox.x + sentenceBox.width : null;
console.log(`Speak sentence box: x=${sentenceBox?.x} right=${Math.round(sentenceRight)} viewport=390`);
console.log(`Sentence box within viewport: ${sentenceRight <= 390}`);

// Check individual word span bounding boxes
const wordSpans = page.locator('.rounded-xl.bg-gray-50 span.inline-block');
const count = await wordSpans.count();
console.log(`Word spans in sentence: ${count}`);

// Check for any span overflowing the sentence box
let anyOverflow = false;
for (let i = 0; i < Math.min(count, 10); i++) {
  const b = await wordSpans.nth(i).boundingBox();
  if (b && sentenceBox && b.right > sentenceBox.x + sentenceBox.width + 2) {
    console.log(`  Span ${i} overflows: right=${Math.round(b.right)} > box right=${Math.round(sentenceBox.x + sentenceBox.width)}`);
    anyOverflow = true;
  }
}
if (!anyOverflow) console.log('No word spans overflow the sentence box ✓');

await browser.close();
