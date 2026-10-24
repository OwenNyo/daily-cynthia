import { describe, expect, it } from 'vitest';
import { dayNumber, LAUNCH_DATE, localDate, seedFor } from '../src/game/daily';

describe('localDate', () => {
  it('uses the local calendar date just before midnight', () => {
    expect(localDate(new Date(2026, 9, 25, 23, 59))).toBe('2026-10-25');
  });

  it('rolls over at local midnight', () => {
    expect(localDate(new Date(2026, 9, 26, 0, 0))).toBe('2026-10-26');
  });
});

describe('seedFor', () => {
  it('builds the team seed with no leading zeros', () => {
    expect(seedFor('2026-10-05', 0)).toBe('2026,10,5,0');
  });

  it('builds the official battle seed with salt 1', () => {
    expect(seedFor('2026-10-05', 1)).toBe('2026,10,5,1');
  });
});

describe('dayNumber', () => {
  it('LAUNCH_DATE is the placeholder 2026-10-25', () => {
    expect(LAUNCH_DATE).toBe('2026-10-25');
  });

  it('launch day is day 1', () => {
    expect(dayNumber('2026-10-25')).toBe(1);
  });

  it('counts calendar days', () => {
    expect(dayNumber('2026-11-01')).toBe(8);
  });

  it('is not shifted by a DST change', () => {
    expect(dayNumber('2027-03-29')).toBe(156);
  });
});
