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
  if (oneIndex !== -1) {
    num = num.slice(oneIndex);
  }
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

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/check' && req.method === 'GET') {
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

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);
console.log(`  GET /check?number=<number>`);
