import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import creds from './account.json';
import config from './config.json';

const auth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

function cleanNumber(raw: string): string {
  let num = raw.replace(/[\s\-]/g, '');
  const oneIndex = num.indexOf('1');
  if (oneIndex !== -1) num = num.slice(oneIndex);
  return num;
}

async function loadNumbers(): Promise<string[]> {
  const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
  await doc.loadInfo();
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
  const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
  await doc.loadInfo();
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

const server = Bun.serve({
  port: 3000,
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

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);
