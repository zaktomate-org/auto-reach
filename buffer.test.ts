import { describe, test, expect, beforeEach, afterEach, jest } from 'bun:test';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

const BUFFER_FILE = './number-buffer.json';

interface BufferData {
  numbers: string[];
  lastUpdated: string;
}

function isBufferExpired(lastUpdated: string): boolean {
  const updated = new Date(lastUpdated);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  return diffMs >= twelveHoursMs;
}

async function readBuffer(): Promise<string[]> {
  if (!existsSync(BUFFER_FILE)) return [];
  const content = await readFile(BUFFER_FILE, 'utf-8');
  const data: BufferData = JSON.parse(content);
  return data.numbers;
}

async function writeBuffer(numbers: string[]): Promise<void> {
  const data: BufferData = {
    numbers,
    lastUpdated: new Date().toISOString(),
  };
  await writeFile(BUFFER_FILE, JSON.stringify(data, null, 2));
}

async function refreshBuffer(): Promise<string[]> {
  const doc = await getDoc();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();
  const numbers: string[] = [];
  rows.forEach((row) => {
    const whatsapp = row.get('WhatsApp')?.trim();
    if (whatsapp) numbers.push(cleanNumber(whatsapp));
  });
  await writeBuffer(numbers);
  return numbers;
}

function cleanNumber(raw: string): string {
  let num = raw.replace(/[\s\-]/g, '');
  const oneIndex = num.indexOf('1');
  if (oneIndex !== -1) num = num.slice(oneIndex);
  return num;
}

async function getDoc() {
  const { GoogleSpreadsheet } = await import('google-spreadsheet');
  const { JWT } = await import('google-auth-library');
  const creds = await import('./account.json');
  const auth = new JWT({
    email: creds.default.client_email,
    key: creds.default.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
  await doc.loadInfo();
  return doc;
}

describe('Buffer Module', () => {
  afterEach(async () => {
    if (existsSync(BUFFER_FILE)) {
      await unlink(BUFFER_FILE);
    }
  });

  test('readBuffer returns empty array when file does not exist', async () => {
    const numbers = await readBuffer();
    expect(numbers).toEqual([]);
  });

  test('readBuffer returns numbers from buffer file', async () => {
    const testData: BufferData = {
      numbers: ['8801234567890', '8809876543210'],
      lastUpdated: new Date().toISOString(),
    };
    await writeFile(BUFFER_FILE, JSON.stringify(testData));
    const numbers = await readBuffer();
    expect(numbers).toEqual(['8801234567890', '8809876543210']);
  });

  test('writeBuffer creates buffer file with numbers', async () => {
    const numbers = ['8801234567890', '8809876543210'];
    await writeBuffer(numbers);
    const content = await readFile(BUFFER_FILE, 'utf-8');
    const data: BufferData = JSON.parse(content);
    expect(data.numbers).toEqual(numbers);
    expect(data.lastUpdated).toBeDefined();
  });

  test('isBufferExpired returns false for fresh buffer', () => {
    const now = new Date().toISOString();
    expect(isBufferExpired(now)).toBe(false);
  });

  test('isBufferExpired returns true for buffer older than 12 hours', () => {
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - 13);
    expect(isBufferExpired(oldDate.toISOString())).toBe(true);
  });

  test('isBufferExpired returns true for buffer exactly at 12 hours', () => {
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);
    expect(isBufferExpired(twelveHoursAgo.toISOString())).toBe(true);
  });
});