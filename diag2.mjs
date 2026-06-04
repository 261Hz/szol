import { chromium, devices } from 'playwright';
const URL = 'https://szol.vercel.app';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ ...devices['Moto G Power'] });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0, { timeout: 15000 });

// Load a story
await page.waitForSelector('span.font-medium', { timeout: 20000 });
const storyCards = page.locator('main').getByRole('button').filter({ has: page.locator('span.font-medium') });
await storyCards.first().click();
await page.waitForTimeout(300);
await page.locator('main').getByRole('button', { name: 'Read →' }).first().click();
await page.waitForTimeout(800);

// Find overflowing elements
const overflowInfo = await page.evaluate(() => {
  const vw = window.innerWidth;
  const result = [];
  document.querySelectorAll('*').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.right > vw + 1) {
      result.push({
        tag: el.tagName,
        class: el.className.slice(0, 80),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        vw
      });
    }
  });
  return result.slice(0, 20);
});
console.log('Overflowing elements (viewport width:', await page.evaluate(() => window.innerWidth), '):');
overflowInfo.forEach(e => console.log(`  ${e.tag}.${e.class.slice(0,50)} right=${e.right} width=${e.width}`));

// Go to Write tab and check
await page.locator('nav').getByRole('button', { name: /Escribir/ }).click();
await page.waitForTimeout(1500);

const writeOverflow = await page.evaluate(() => {
  const vw = window.innerWidth;
  const result = [];
  document.querySelectorAll('*').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.right > vw + 1) {
      result.push({
        tag: el.tagName,
        class: el.className.slice(0, 80),
        right: Math.round(rect.right),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
      });
    }
  });
  return result.slice(0, 20);
});
console.log('\nWrite tab overflowing elements:');
writeOverflow.forEach(e => console.log(`  ${e.tag}.${e.class.slice(0,50)} left=${e.left} right=${e.right} width=${e.width}`));

await browser.close();
