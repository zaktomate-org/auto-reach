import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import creds from './account.json';
import config from './config.json';
import { writeFile } from 'fs/promises';
import { readBuffer, isBufferExpired, getBufferLastUpdated, refreshBuffer, appendToBuffer } from './buffer';
import type { BufferData } from './buffer';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';

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
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
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

function formatDateTimeForSheet(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function parseSentIn(sentIn: string | undefined): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  if (!sentIn) return formatDateTimeForSheet();

  const trimmed = sentIn.trim();
  if (/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(trimmed)) {
    return `${today} ${trimmed}`;
  }
  return formatDateTimeForSheet();
}

async function addEntry(data: Record<string, string>) {
  const doc = await getDoc();
  const sheet = doc.sheetsByIndex[0];
  const addedIn = parseSentIn(data.sentIn);
  await sheet.addRow({
    'Company Name': data.company,
    'WhatsApp': data.whatsapp,
    'Type': data.type,
    'Website URL': data.website,
    'Facebook Page URL': data.facebook,
    'Sent by': data.sentBy,
    'Added in': addedIn,
    'Message Sent': data.messageSent,
    'Response': '',
    'Follow Up': '0',
    'Video Sent': 'no',
  });
}

async function addBatchEntries(entries: Record<string, string>[]) {
  const doc = await getDoc();
  const sheet = doc.sheetsByIndex[0];
  const rows = entries.map(entry => ({
    'Company Name': entry.company,
    'WhatsApp': entry.whatsapp,
    'Type': entry.type,
    'Website URL': entry.website || '',
    'Facebook Page URL': entry.facebook || '',
    'Sent by': entry.sentBy,
    'Added in': parseSentIn(entry.sentIn),
    'Message Sent': entry.messageSent,
    'Response': '',
    'Follow Up': '0',
    'Video Sent': 'no',
  }));
  await sheet.addRows(rows);
}

async function findPendingLead(): Promise<GoogleSpreadsheetRow | null> {
  const doc = await getDoc();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  return rows.find((row) => {
    const messageSent = row.get('Message Sent')?.trim().toLowerCase();
    if (messageSent !== 'no') return false;

    const whatsapp = row.get('WhatsApp')?.trim();
    if (!whatsapp) return false;

    if (config.autoSender.ignoreSentByFilter) return true;
    const sentBy = row.get('Sent by')?.trim();
    return sentBy === config.autoSender.sentBy;
  }) || null;
}

async function markMessageSent(row: GoogleSpreadsheetRow) {
  row.set('Message Sent', 'yes');
  row.set('Sent in', formatDateTimeForSheet());
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
  dailyMessageCount: 0,
  lastResetDate: new Date().toDateString(),
};

function resetDailyCount() {
  autoSenderState.dailyMessageCount = 0;
  autoSenderState.lastResetDate = new Date().toDateString();
}

function checkMidnightReset() {
  const today = new Date().toDateString();
  if (autoSenderState.lastResetDate !== today) {
    resetDailyCount();
    pushLog('Daily message count reset at midnight.');
    console.log('Daily message count reset at midnight.');
  }
}

function getRandomInterval(): number {
  const as = config.autoSender;
  const minMs = (as.intervalMinMs ?? 8) * 60 * 1000;
  const maxMs = (as.intervalMaxMs ?? 12) * 60 * 1000;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function isWithinSchedule(schedules: { start: string; end: string }[]): boolean {
  if (schedules.length === 0) return true;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const schedule of schedules) {
    const [sh, sm] = schedule.start.split(':').map(Number);
    const [eh, em] = schedule.end.split(':').map(Number);
    const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
    const endMinutes = (eh ?? 0) * 60 + (em ?? 0);

    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return true;
    }
  }
  return false;
}

function validateNoOverlap(schedules: { start: string; end: string }[]): string | null {
  const events: { start: number; end: number; index: number }[] = [];

  for (let i = 0; i < schedules.length; i++) {
    const partsS = schedules[i].start.split(':');
    const partsE = schedules[i].end.split(':');
    const sh = Number(partsS[0] ?? '0');
    const sm = Number(partsS[1] ?? '0');
    const eh = Number(partsE[0] ?? '0');
    const em = Number(partsE[1] ?? '0');
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    if (startMinutes >= endMinutes) {
      return `Schedule ${i + 1}: End time must be after start time`;
    }

    events.push({ start: startMinutes, end: endMinutes, index: i });
  }

  events.sort((a, b) => a.start - b.start);

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (prev && curr && curr.start < prev.end) {
      return `Schedules ${prev.index + 1} and ${curr.index + 1} overlap`;
    }
  }

  return null;
}

function canSendAuto(): { allowed: boolean; reason: string } {
  const as = config.autoSender;

  checkMidnightReset();

  if (as.maxMessagesPerDay !== null && as.maxMessagesPerDay > 0) {
    if (autoSenderState.dailyMessageCount >= as.maxMessagesPerDay) {
      return { allowed: false, reason: 'Daily message limit reached' };
    }
  }

  const schedules = as.schedules || [];
  if (schedules.length > 0) {
    if (!isWithinSchedule(schedules)) {
      return { allowed: false, reason: 'Outside scheduled hours' };
    }
  }

  return { allowed: true, reason: '' };
}

function pushLog(msg: string) {
  autoSenderState.logs.push(msg);
  if (autoSenderState.logs.length > 5) autoSenderState.logs.shift();
}

// ── Python Script Runner ───────────────────────────────────
const MAX_BUFFER_LINES = 1000;

let pythonProcess: ReturnType<typeof spawn> | null = null;
let pythonBuffer: { lines: string[]; startedAt: number; finishedAt: number | null } | null = null;
let pythonCleanupTimer: Timer | null = null;

function clearPythonBuffer() {
  pythonBuffer = null;
  if (pythonCleanupTimer) {
    clearTimeout(pythonCleanupTimer);
    pythonCleanupTimer = null;
  }
}

function pushPythonLine(line: string, isStderr = false) {
  const iso = new Date().toISOString();
  const prefix = iso.includes('T') ? iso.split('T')[1]?.slice(0, -1) ?? '00:00' : '00:00';
  const formatted = isStderr ? `[${prefix}] [stderr] ${line}` : `[${prefix}] ${line}`;

  if (!pythonBuffer) {
    pythonBuffer = { lines: [], startedAt: Date.now(), finishedAt: null };
  }

  pythonBuffer.lines.push(formatted);

  if (pythonBuffer.lines.length > MAX_BUFFER_LINES) {
    pythonBuffer.lines = pythonBuffer.lines.slice(-MAX_BUFFER_LINES);
  }
}

function startPythonScript(crmUrl: string) {
  if (pythonProcess || pythonBuffer?.finishedAt === null) {
    return { error: 'Process already running' };
  }

  const ps = config.pythonScript;
  const projectPath = ps.projectPath;
  const csvFolderPath = ps.csvFolderPath;
  const type = ps.type || 'lead';
  const sentBy = ps.sentBy || 'Shoyeb';

  const cmd = `uv run --directory "${projectPath}" python -u main.py --path "${csvFolderPath}" --crm --url "${crmUrl}" --type "${type}" --sentby "${sentBy}"`;

  clearPythonBuffer();
  pushPythonLine(`> ${cmd}`);

  pythonProcess = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

  if (!pythonBuffer) {
    pythonBuffer = { lines: [], startedAt: Date.now(), finishedAt: null };
  }

  pythonProcess.stdout?.on('data', (data: Buffer) => {
    const str = data.toString();
    const lines = str.split('\n');
    lines.forEach(line => {
      if (line.trim()) pushPythonLine(line);
    });
  });

  pythonProcess.stderr?.on('data', (data: Buffer) => {
    const str = data.toString();
    const lines = str.split('\n');
    lines.forEach(line => {
      if (line.trim()) pushPythonLine(line, true);
    });
  });

  pythonProcess.on('close', (code) => {
    const exitMsg = code === 0 ? 'Completed (exit code: 0)' : `Failed (exit code: ${code})`;
    pushPythonLine(exitMsg);
    if (pythonBuffer) {
      pythonBuffer.finishedAt = Date.now();
    }
    pythonProcess = null;

    pythonCleanupTimer = setTimeout(() => {
      clearPythonBuffer();
    }, 60000);
  });

  pythonProcess.on('error', (err) => {
    pushPythonLine(`Error: ${err.message}`, true);
    if (pythonBuffer) {
      pythonBuffer.finishedAt = Date.now();
    }
    pythonProcess = null;
  });

  return { ok: true };
}

function stopPythonScript() {
  if (!pythonProcess) {
    return { error: 'No process running' };
  }
  pythonProcess.kill('SIGTERM');
  pushPythonLine('Killed by user', true);
  if (pythonBuffer) {
    pythonBuffer.finishedAt = Date.now();
  }
  pythonProcess = null;
  return { ok: true };
}

function getPythonStatus() {
  const isRunning = pythonProcess !== null;
  const hasBuffer = pythonBuffer !== null;
  const isFinished = pythonBuffer?.finishedAt !== null;
  return {
    running: isRunning,
    hasBuffer: hasBuffer && !isFinished,
    persisted: hasBuffer && isFinished,
    output: pythonBuffer?.lines || [],
  };
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
      const canSend = canSendAuto();
      const lead = await findPendingLead();

      if (!lead) {
        const intervalMin = getRandomInterval();
        console.log(`[${new Date().toISOString()}] No pending leads. Waiting ${intervalMin / 60000} min...`);
      } else if (!canSend.allowed) {
        const intervalMin = getRandomInterval();
        console.log(`[${new Date().toISOString()}] Skipping: ${canSend.reason}. Waiting ${intervalMin / 60000} min...`);
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

                autoSenderState.dailyMessageCount++;

                const okMsg = `[${new Date().toISOString()}] CRM updated: Message Sent = yes, Date set for ${companyName} (${autoSenderState.dailyMessageCount} today)`;
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
      const intervalMs = getRandomInterval();
      const timer = setTimeout(() => {
        autoSenderState.waitUntil = null;
        resolve();
      }, intervalMs);

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
  idleTimeout: 255,
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

      let numbers = await readBuffer();
      const lastUpdated = await getBufferLastUpdated();

      if (!lastUpdated || isBufferExpired(lastUpdated)) {
        numbers = await refreshBuffer();
      }

      const cleaned = cleanNumber(input);
      const found = numbers.includes(cleaned);
      return new Response(JSON.stringify(found ? 'match' : 'not match'), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/buffer-refresh
    if (url.pathname === '/api/buffer-refresh' && req.method === 'POST') {
      try {
        await refreshBuffer();
        return new Response(JSON.stringify({ ok: true, message: 'Buffer refreshed' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /api/entry
    if (url.pathname === '/api/entry' && req.method === 'POST') {
      const body = await req.json();
      try {
        await addEntry(body);
        const newNumber = cleanNumber(body.whatsapp);
        await appendToBuffer([newNumber]);
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

    // POST /api/batch-entry
    if (url.pathname === '/api/batch-entry' && req.method === 'POST') {
      const entries = await req.json();
      if (!Array.isArray(entries)) {
        return new Response(JSON.stringify({ error: 'Request body must be an array' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (entries.length === 0) {
        return new Response(JSON.stringify({ error: 'No entries provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (entries.length > 50) {
        return new Response(JSON.stringify({ error: 'Maximum 50 entries per batch' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const requiredFields = ['company', 'type', 'sentBy', 'messageSent'];
      for (const entry of entries) {
        for (const field of requiredFields) {
          if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
            return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      }

      try {
        const validEntries = entries
          .filter(entry => entry.company && entry.type && entry.sentBy && entry.messageSent)
          .map(entry => ({
            company: entry.company,
            whatsapp: entry.whatsapp || '',
            type: entry.type,
            website: entry.website || '',
            facebook: entry.facebook || '',
            sentBy: entry.sentBy,
            sentIn: entry.sentIn,
            messageSent: entry.messageSent,
          }));

        if (validEntries.length === 0) {
          return new Response(JSON.stringify({ error: 'No valid entries to add' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        await addBatchEntries(validEntries);

        const newNumbers = validEntries
          .filter(e => e.whatsapp)
          .map(e => cleanNumber(e.whatsapp));
        await appendToBuffer(newNumbers);
        return new Response(JSON.stringify({ ok: true, count: validEntries.length }), {
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

    // POST /api/run-csv-importer/start
    if (url.pathname === '/api/run-csv-importer/start' && req.method === 'POST') {
      if (!config.pythonScript?.enabled) {
        return new Response(JSON.stringify({ error: 'Python script is disabled' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const port = config.port || 3000;
      const crmUrl = `http://localhost:${port}`;
      const result = startPythonScript(crmUrl);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/run-csv-importer/stop
    if (url.pathname === '/api/run-csv-importer/stop' && req.method === 'POST') {
      const result = stopPythonScript();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/run-csv-importer/status
    if (url.pathname === '/api/run-csv-importer/status' && req.method === 'GET') {
      return new Response(JSON.stringify(getPythonStatus()), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/run-csv-importer/stream (SSE)
    if (url.pathname === '/api/run-csv-importer/stream' && req.method === 'GET') {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const send = (data: string) => {
            try {
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            } catch (e) {
              // Controller closed
            }
          };

          const status = getPythonStatus();

          if (status.persisted && status.output.length > 0) {
            send(JSON.stringify({ type: 'persisted', lines: status.output }));
            controller.close();
            return;
          } else if (status.hasBuffer && status.output.length > 0) {
            send(JSON.stringify({ type: 'buffer', lines: status.output }));
          }

          if (status.running) {
            const sendLines = new Set<string>(status.output);
            
            const checkInterval = setInterval(() => {
              const currentStatus = getPythonStatus();
              
              if (!currentStatus.running) {
                clearInterval(checkInterval);
                send(JSON.stringify({ type: 'done', exitCode: 0 }));
                controller.close();
                return;
              }
              
              const newLines = currentStatus.output.filter(l => !sendLines.has(l));
              newLines.forEach(l => {
                sendLines.add(l);
                send(JSON.stringify({ type: 'line', line: l }));
              });
            }, 500);

            // Heartbeat to keep connection alive
            const heartbeat = setInterval(() => {
              send(JSON.stringify({ type: 'heartbeat' }));
            }, 25000);

            req.signal.addEventListener('abort', () => {
              clearInterval(checkInterval);
              clearInterval(heartbeat);
              controller.close();
            });
          } else {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // GET /api/schedules
    if (url.pathname === '/api/schedules' && req.method === 'GET') {
      return new Response(JSON.stringify(config.autoSender.schedules || []), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/schedules
    if (url.pathname === '/api/schedules' && req.method === 'POST') {
      const body = await req.json() as { start: string; end: string }[];
      if (!Array.isArray(body)) {
        return new Response(JSON.stringify({ error: 'Schedules must be an array' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const error = validateNoOverlap(body);
      if (error) {
        return new Response(JSON.stringify({ error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      config.autoSender.schedules = body;
      await writeFile('./config.json', JSON.stringify(config, null, 2));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/daily-stats
    if (url.pathname === '/api/daily-stats' && req.method === 'GET') {
      checkMidnightReset();
      return new Response(JSON.stringify({
        sent: autoSenderState.dailyMessageCount,
        max: config.autoSender.maxMessagesPerDay,
        date: autoSenderState.lastResetDate,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/daily-stats/reset
    if (url.pathname === '/api/daily-stats/reset' && req.method === 'POST') {
      resetDailyCount();
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/auto-status
    if (url.pathname === '/api/auto-status' && req.method === 'GET') {
      const canSend = canSendAuto();
      return new Response(JSON.stringify({
        allowed: canSend.allowed,
        reason: canSend.reason,
        dailySent: autoSenderState.dailyMessageCount,
        dailyMax: config.autoSender.maxMessagesPerDay,
        schedules: config.autoSender.schedules || [],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);

// Start auto-sender
autoSenderLoop();
