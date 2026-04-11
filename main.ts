import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { chromium } from 'playwright';
import creds from './account.json';
import config from './config.json';

const auth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// ── Helpers ──────────────────────────────────────────────
function cleanNumber(raw: string): string {
  let num = raw.replace(/[\s\-]/g, '');
  const oneIndex = num.indexOf('1');
  if (oneIndex !== -1) num = num.slice(oneIndex);
  return num;
}

function buildMessage(template: string, row: GoogleSpreadsheetRow): string {
  const sentBy = row.get('Sent by')?.trim() || config.autoSender.sentBy;
  const companyName = row.get('Company Name')?.trim() || 'Unknown Company';
  const isFCommerce = row.get('Type')?.trim() === 'F-Commerce';

  const yourName = isFCommerce
    ? (config.banglaNames as Record<string, string>)[sentBy] || sentBy
    : sentBy;

  let msg = template;
  while (msg.includes('{{Company_Name}}')) msg = msg.replace('{{Company_Name}}', companyName);
  while (msg.includes('{{Your_Name}}')) msg = msg.replace('{{Your_Name}}', yourName);
  while (msg.includes('{{Facebook_Page_Name}}')) msg = msg.replace('{{Facebook_Page_Name}}', companyName);
  return msg;
}

// ── Sheet operations ─────────────────────────────────────
async function getDoc() {
  const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
  await doc.loadInfo();
  return doc;
}

async function loadNumbers(): Promise<string[]> {
  const doc = await getDoc();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();
  const numbers: string[] = [];
  rows.forEach((row) => {
    const whatsapp = row.get('WhatsApp')?.trim();
    if (whatsapp) numbers.push(cleanNumber(whatsapp));
  });
  return numbers;
}

async function addEntry(data: Record<string, string>) {
  const doc = await getDoc();
  const sheet = doc.sheetsByIndex[0];
  await sheet.addRow({
    'Company Name': data.company,
    'WhatsApp': data.whatsapp,
    'Type': data.type,
    'Website URL': data.website,
    'Facebook Page URL': data.facebook,
    'Sent by': data.sentBy,
    'Sent in': data.sentIn,
    'Message Sent': data.messageSent,
    'Response': '',
    'Follow Up': '0',
    'Date': '',
  });
}

async function findPendingLead(): Promise<GoogleSpreadsheetRow | null> {
  const doc = await getDoc();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  return rows.find((row) => {
    const messageSent = row.get('Message Sent')?.trim().toLowerCase();
    const sentBy = row.get('Sent by')?.trim();
    return messageSent === 'no' && sentBy === config.autoSender.sentBy;
  }) || null;
}

async function markMessageSent(row: GoogleSpreadsheetRow) {
  const today = new Date().toLocaleDateString('en-GB');
  row.set('Message Sent', 'yes');
  row.set('Date', today);
  await row.save();
}

// ── Automation (inlined from automate.ts) ────────────────
async function sendWhatsApp(number: string, message: string) {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ storageState: 'auth.json' });
  context.setDefaultTimeout(90000);
  context.setDefaultNavigationTimeout(90000);
  const page = await context.newPage();

  try {
    console.log('  Step 1: Opening Meta Business Suite...');
    await page.goto('https://www.facebook.com/business/tools/meta-business-suite');
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 2: Clicking "Get started"...');
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Get started' }).first().click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded');
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 3: Clicking "Inbox"...');
    await newPage.locator('a[aria-label="Inbox"]').click();
    await newPage.waitForLoadState('domcontentloaded');
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 4: Clicking "WhatsApp"...');
    await newPage.waitForTimeout(3000);
    await newPage.locator('a[role="link"]').filter({ hasText: 'WhatsApp' }).click();
    await newPage.waitForLoadState('domcontentloaded');
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 5: Clicking "Send a Message on WhatsApp"...');
    await newPage.waitForTimeout(5000);
    await newPage.locator('div[data-sscoverage-ignore="true"]', { hasText: 'Send a Message on WhatsApp' }).click({ force: true, timeout: 90000 });
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 6: Clicking "New WhatsApp number"...');
    await newPage.locator('div[role="button"]', { hasText: 'New WhatsApp number' }).click();
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 7: Opening country code dropdown...');
    await newPage.getByText(/\+\d+$/).first().click();
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 8: Typing "bd"...');
    await newPage.getByTestId('ContextualLayerRoot').getByRole('combobox', { name: 'WhatsApp phone number Country' }).fill('bd');
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 9: Selecting Bangladesh +880...');
    await newPage.getByTestId('ContextualLayerRoot').getByText('Bangladesh').click();
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 10: Typing phone number...');
    await newPage.locator('input[type="tel"]').fill(number);
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 11: Pasting message...');
    const dialog = newPage.getByRole('dialog', { name: 'Send a message on WhatsApp' });
    const msgInput = dialog.getByRole('textbox', { name: 'Message' });
    await msgInput.click();
    await newPage.keyboard.insertText(message);
    await delay(1000 + Math.random() * 2000);

    console.log('  Step 12: Clicking "Send Message"...');
    await newPage.getByText('Send Message').click();

    console.log('  Waiting 60 seconds before saving auth...');
    await delay(60_000);

    await context.storageState({ path: 'auth.json' });
    console.log('auth.json saved.');
  } finally {
    await browser.close();
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Auto-sender loop ─────────────────────────────────────
async function autoSenderLoop() {
  if (!config.autoSender.enabled) {
    console.log('Auto-sender is disabled.');
    return;
  }

  console.log(`Auto-sender enabled. Watching for leads assigned to "${config.autoSender.sentBy}".`);

  while (true) {
    try {
      const lead = await findPendingLead();

      if (!lead) {
        console.log(`[${new Date().toISOString()}] No pending leads. Checking again in ${config.autoSender.intervalMs / 60000} min...`);
        await delay(config.autoSender.intervalMs);
        continue;
      }

      const type = lead.get('Type')?.trim();
      const template = (config.templates as Record<string, string>)[type || ''];

      if (!template) {
        console.log(`Unknown type "${type}" for ${lead.get('Company Name')}. Skipping.`);
        await delay(config.autoSender.intervalMs);
        continue;
      }

      const whatsapp = lead.get('WhatsApp')?.trim();
      const companyName = lead.get('Company Name')?.trim() || 'Unknown';

      if (!whatsapp) {
        console.log(`[${new Date().toISOString()}] No WhatsApp number for ${companyName}. Skipping.`);
        await delay(config.autoSender.intervalMs);
        continue;
      }

      const message = buildMessage(template, lead);
      let sent = false;

      while (!sent) {
        try {
          console.log(`[${new Date().toISOString()}] Sending to ${companyName} (${whatsapp}) [${type}]...`);
          await sendWhatsApp(whatsapp, message);
          await markMessageSent(lead);
          console.log(`[${new Date().toISOString()}] CRM updated: Message Sent = yes, Date set for ${companyName}`);
          sent = true;
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Send failed for ${companyName}. Retrying in 60s...`, err.message);
          await delay(60000);
        }
      }
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Auto-sender error:`, err.message);
    }

    console.log(`[${new Date().toISOString()}] Waiting ${config.autoSender.intervalMs / 60000} min before next check...`);
    await delay(config.autoSender.intervalMs);
  }
}

// ── HTTP Server (CRM Frontend + API) ─────────────────────
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/') {
      const file = Bun.file('./public/index.html');
      return new Response(file, { headers: { 'Content-Type': 'text/html' } });
    }

    if (url.pathname === '/api/config' && req.method === 'GET') {
      return new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/check' && req.method === 'GET') {
      const input = url.searchParams.get('number');
      if (!input) {
        return new Response(JSON.stringify({ error: 'Missing ?number= param' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const numbers = await loadNumbers();
      const cleaned = cleanNumber(input);
      const found = numbers.includes(cleaned);
      return new Response(JSON.stringify(found ? 'match' : 'not match'), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/entry' && req.method === 'POST') {
      const body = await req.json();
      try {
        await addEntry(body);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);

// Start auto-sender
autoSenderLoop();
