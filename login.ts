import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://www.facebook.com/business/tools/meta-business-suite');

console.log('Browser opened. Login to Facebook/Meta Business Suite.');
console.log('When done, press Enter here to save auth.json and exit.');

// Wait for user to press Enter
await new Promise<void>((resolve) => {
  process.stdin.once('data', async () => {
    await context.storageState({ path: 'auth.json' });
    console.log('auth.json saved!');
    await browser.close();
    resolve();
  });
});
