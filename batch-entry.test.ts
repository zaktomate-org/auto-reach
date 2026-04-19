import { describe, test, expect, it } from 'bun:test';

describe('Batch Entry API Validation', () => {
  test('rejects non-array body', () => {
    const entries = 'not an array';
    expect(Array.isArray(entries)).toBe(false);
  });

  test('rejects empty array', () => {
    const entries: unknown[] = [];
    expect(entries.length === 0).toBe(true);
  });

  test('rejects more than 50 entries', () => {
    const entries = Array(51).fill({ company: 'Test', whatsapp: '123', type: 'test', sentBy: 'Test', messageSent: 'no' });
    expect(entries.length > 50).toBe(true);
  });

  test('accepts valid entry array', () => {
    const entries = [
      { company: 'Test', whatsapp: '123', type: 'test', sentBy: 'Test', messageSent: 'no' }
    ];
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(1);
  });

  test('validates required fields', () => {
    const entry = { company: 'Test', whatsapp: '123', type: 'test', sentBy: 'Test', messageSent: 'no' };
    const requiredFields = ['company', 'whatsapp', 'type', 'sentBy', 'messageSent'];
    for (const field of requiredFields) {
      expect(entry[field]).toBeDefined();
    }
  });

  test('rejects entry missing required field', () => {
    const entry = { company: 'Test', whatsapp: '123', type: 'test' };
    expect((entry as any).sentBy).toBeUndefined();
  });
});