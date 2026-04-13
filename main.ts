import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { chromium } from 'playwright';
import creds from './account.json';
import config from './config.json';
import { writeFile } from 'fs/promises';

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
    if (messageSent !== 'no') return false;
    if (config.autoSender.ignoreSentByFilter) return true;
    const sentBy = row.get('Sent by')?.trim();
    return sentBy === config.autoSender.sentBy;
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
    console.log('  auth.json saved.');
  } finally {
    await browser.close();
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Auto-sender state ────────────────────────────────────
const autoSenderState = {
  logs: [] as string[],
  forceCheck: false,
  waitUntil: null as Promise<void> | null,
};

function pushLog(msg: string) {
  autoSenderState.logs.push(msg);
  if (autoSenderState.logs.length > 5) autoSenderState.logs.shift();
}

// ── Auto-sender loop ─────────────────────────────────────
async function autoSenderLoop() {
  if (!config.autoSender.enabled) {
    console.log('Auto-sender is disabled.');
    return;
  }

  if (config.autoSender.ignoreSentByFilter) {
    pushLog('Auto-sender enabled. Watching for all leads with Message Sent = "no".');
    console.log('Auto-sender enabled. Watching for all leads with Message Sent = "no".');
  } else {
    const msg = `Auto-sender enabled. Watching for leads assigned to "${config.autoSender.sentBy}".`;
    pushLog(msg);
    console.log(msg);
  }

  while (true) {
    try {
      const lead = await findPendingLead();

      if (!lead) {
        console.log(`[${new Date().toISOString()}] No pending leads. Waiting ${config.autoSender.intervalMs / 60000} min...`);
      } else {
        const type = lead.get('Type')?.trim();
        const template = (config.templates as Record<string, string>)[type || ''];

        if (!template) {
          const msg = `Unknown type "${type}" for ${lead.get('Company Name')}. Skipping.`;
          pushLog(msg);
          console.log(msg);
        } else {
          const whatsapp = lead.get('WhatsApp')?.trim();
          const companyName = lead.get('Company Name')?.trim() || 'Unknown';

          if (!whatsapp) {
            const msg = `[${new Date().toISOString()}] No WhatsApp number for ${companyName}. Skipping.`;
            pushLog(msg);
            console.log(msg);
          } else {
            const message = buildMessage(template, lead);
            let sent = false;

            while (!sent) {
              try {
                const msg = `[${new Date().toISOString()}] Sending to ${companyName} (${whatsapp}) [${type}]...`;
                pushLog(msg);
                console.log(msg);

                await sendWhatsApp(whatsapp, message);
                await markMessageSent(lead);

                const okMsg = `[${new Date().toISOString()}] CRM updated: Message Sent = yes, Date set for ${companyName}`;
                pushLog(okMsg);
                console.log(okMsg);
                sent = true;
              } catch (err: any) {
                const errMsg = `[${new Date().toISOString()}] Send failed for ${companyName}. Retrying in 60s...`;
                pushLog(errMsg);
                console.error(errMsg, err.message);
                await delay(60000);
              }
            }
          }
        }
      }
    } catch (err: any) {
      const msg = `[${new Date().toISOString()}] Auto-sender error: ${err.message}`;
      pushLog(msg);
      console.error(msg);
    }

    // Wait for interval or force check signal
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        autoSenderState.waitUntil = null;
        resolve();
      }, config.autoSender.intervalMs);

      autoSenderState.waitUntil = new Promise<void>((res) => {
        const check = setInterval(() => {
          if (autoSenderState.forceCheck) {
            autoSenderState.forceCheck = false;
            clearTimeout(timer);
            clearInterval(check);
            res();
            resolve();
          }
        }, 500);
      });
    });
  }
}

// ── HTTP Server (CRM Frontend + API) ─────────────────────
const server = Bun.serve({
  port: config.port || 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve frontend
    if (url.pathname === '/') {
      const file = Bun.file('./public/index.html');
      return new Response(file, { headers: { 'Content-Type': 'text/html' } });
    }

    // GET /api/config
    if (url.pathname === '/api/config' && req.method === 'GET') {
      return new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/check?number=<number>
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

    // POST /api/entry
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

    // GET /api/auto-logs
    if (url.pathname === '/api/auto-logs' && req.method === 'GET') {
      return new Response(JSON.stringify(autoSenderState.logs), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/force-check
    if (url.pathname === '/api/force-check' && req.method === 'POST') {
      autoSenderState.forceCheck = true;
      return new Response(JSON.stringify({ ok: true, message: 'Force check triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/templates
    if (url.pathname === '/api/templates' && req.method === 'GET') {
      return new Response(JSON.stringify(config.templates), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/templates
    if (url.pathname === '/api/templates' && req.method === 'POST') {
      const body = await req.json();
      if (body && typeof body === 'object') {
        config.templates = body as Record<string, string>;
        await writeFile('./config.json', JSON.stringify(config, null, 2));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Invalid templates' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);

// Start auto-sender
autoSenderLoop();
