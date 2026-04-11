import { chromium } from 'playwright';

const number = process.argv[2];
const message = process.argv[3];

if (!number || !message) {
  console.log('Usage: bun run automate.ts <number> <message>');
  process.exit(1);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay() {
  return delay(1000 + Math.random() * 2000);
}

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({ storageState: 'auth.json' });
context.setDefaultTimeout(90000);
context.setDefaultNavigationTimeout(90000);
const page = await context.newPage();

console.log('Step 1: Opening Meta Business Suite...');
await page.goto('https://www.facebook.com/business/tools/meta-business-suite');
await randomDelay();

console.log('Step 2: Clicking "Get started"...');
const [newPage] = await Promise.all([
  context.waitForEvent('page'),
  page.getByRole('button', { name: 'Get started' }).first().click(),
]);
await newPage.waitForLoadState('domcontentloaded');
await randomDelay();

console.log('Step 3: Clicking "Inbox"...');
await newPage.locator('a[aria-label="Inbox"]').click();
await newPage.waitForLoadState('domcontentloaded');
await randomDelay();

console.log('Step 4: Clicking "WhatsApp" in sidebar...');
await newPage.waitForTimeout(3000);
await newPage.locator('a[role="link"]').filter({ hasText: 'WhatsApp' }).click();
await newPage.waitForLoadState('domcontentloaded');
await randomDelay();

console.log('Step 5: Clicking "Send a Message on WhatsApp"...');
await newPage.waitForTimeout(5000);
await newPage.locator('div[data-sscoverage-ignore="true"]', { hasText: 'Send a Message on WhatsApp' }).click({ force: true, timeout: 90000 });
await randomDelay();

console.log('Step 6: Clicking "New WhatsApp number"...');
await newPage.locator('div[role="button"]', { hasText: 'New WhatsApp number' }).click();
await randomDelay();

console.log('Step 7: Opening country code dropdown...');
await newPage.getByText(/\+\d+$/).first().click();
await randomDelay();

console.log('Step 8: Typing "bd" in search...');
await newPage.getByTestId('ContextualLayerRoot').getByRole('combobox', { name: 'WhatsApp phone number Country' }).fill('bd');
await randomDelay();

console.log('Step 9: Selecting Bangladesh +880...');
await newPage.getByTestId('ContextualLayerRoot').getByText('Bangladesh').click();
await randomDelay();

console.log('Step 10: Typing phone number...');
await newPage.locator('input[type="tel"]').fill(number);
await randomDelay();

console.log('Step 11: Pasting message...');
const dialog = newPage.getByRole('dialog', { name: 'Send a message on WhatsApp' });
await dialog.getByRole('textbox', { name: 'Message' }).fill(message);
await randomDelay();

console.log('Step 12: Clicking "Send Message"...');
await newPage.getByText('Send Message').click();

console.log('Waiting 60 seconds before saving auth...');
await delay(60_000);

await newPage.context().storageState({ path: 'auth.json' });
console.log('auth.json saved. Done.');
await browser.close();
