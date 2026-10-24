import { describe, expect, it } from 'vitest';
import { BLOCKLIST, validName } from '../src/game/name';

const mixedCase = (w: string) => [...w].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join('');
const split = (w: string, sep: string) => `${w.slice(0, 1)}${sep}${w.slice(1)}`;

describe('validName', () => {
  it('accepts a plain name', () => {
    expect(validName('Ash')).toBe(true);
  });

  it('trims before checking', () => {
    expect(validName('  Red_99 ')).toBe(true);
  });

  it('accepts 16 characters', () => {
    expect(validName('a'.repeat(16))).toBe(true);
  });

  it('rejects under 3 characters', () => {
    expect(validName('ab')).toBe(false);
  });

  it('rejects over 16 characters', () => {
    expect(validName('a'.repeat(17))).toBe(false);
  });

  it('rejects characters outside letters, digits, space, _ and -', () => {
    expect(validName('bad<script>')).toBe(false);
  });

  it('has about 20 lowercase blocklist words', () => {
    expect(BLOCKLIST.length).toBeGreaterThanOrEqual(15);
    for (const w of BLOCKLIST) expect(w).toBe(w.toLowerCase());
  });

  it('rejects each blocklist word', () => {
    for (const w of BLOCKLIST) expect(validName(w.padEnd(3, 'x')), w).toBe(false);
  });

  it('rejects a blocklist word inside a longer name', () => {
    for (const w of BLOCKLIST) expect(validName(`x${w}x`), w).toBe(false);
  });

  it('rejects a blocklist word split with space, _ or -', () => {
    for (const w of BLOCKLIST) {
      for (const sep of [' ', '_', '-']) expect(validName(split(w, sep).padEnd(3, 'x')), `${w} ${sep}`).toBe(false);
    }
  });

  it('rejects a blocklist word in mixed case', () => {
    for (const w of BLOCKLIST) expect(validName(mixedCase(w).padEnd(3, 'x')), w).toBe(false);
  });
});
