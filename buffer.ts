import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

export const BUFFER_FILE = './number-buffer.json';
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export interface BufferData {
  numbers: string[];
  lastUpdated: string;
}

export async function readBuffer(): Promise<string[]> {
  try {
    if (!existsSync(BUFFER_FILE)) return [];
    const content = await readFile(BUFFER_FILE, 'utf-8');
    const data: BufferData = JSON.parse(content);
    return data.numbers;
  } catch {
    return [];
  }
}

export async function writeBuffer(numbers: string[]): Promise<void> {
  const data: BufferData = {
    numbers,
    lastUpdated: new Date().toISOString(),
  };
  await writeFile(BUFFER_FILE, JSON.stringify(data, null, 2));
}

export function isBufferExpired(lastUpdated: string): boolean {
  const updated = new Date(lastUpdated);
  const now = new Date();
  return now.getTime() - updated.getTime() >= TWELVE_HOURS_MS;
}

export async function getBufferLastUpdated(): Promise<string | null> {
  try {
    if (!existsSync(BUFFER_FILE)) return null;
    const content = await readFile(BUFFER_FILE, 'utf-8');
    const data: BufferData = JSON.parse(content);
    return data.lastUpdated;
  } catch {
    return null;
  }
}

export async function appendToBuffer(newNumbers: string[]): Promise<void> {
  const existing = await readBuffer();
  const uniqueNew = newNumbers.filter(n => !existing.includes(n));
  if (uniqueNew.length > 0) {
    await writeBuffer([...existing, ...uniqueNew]);
  }
}

export async function refreshBuffer(): Promise<string[]> {
  const numbers = await loadNumbers();
  await writeBuffer(numbers);
  return numbers;
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
  const config = await import('./config.json');
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
  await doc.loadInfo();
  return doc;
}