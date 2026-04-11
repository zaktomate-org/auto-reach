import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: 'auth.json' });
const page = await context.newPage();

await page.goto('https://www.facebook.com/business/tools/meta-business-suite');
console.log('Browser opened. Close the browser window to stop and save auth.json.');

// Save auth before browser closes
browser.on('disconnected', async () => {
  console.log('Browser disconnected.');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nStopping...');
  await context.storageState({ path: 'auth.json' });
  console.log('auth.json saved.');
  await browser.close();
  process.exit(0);
});

// Keep process alive
await new Promise(() => {});
