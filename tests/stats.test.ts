import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/game/stats';

const TODAY = '2026-10-25';

describe('computeStats', () => {
  it('empty history is all zero', () => {
    expect(computeStats({}, TODAY)).toEqual({ played: 0, winPct: 0, winStreak: 0, dayStreak: 0 });
  });

  it('three wins up to today', () => {
    const h = { '2026-10-23': 'W', '2026-10-24': 'W', '2026-10-25': 'W' } as const;
    expect(computeStats(h, TODAY)).toEqual({ played: 3, winPct: 100, winStreak: 3, dayStreak: 3 });
  });

  it('today not played yet counts back from yesterday', () => {
    const h = { '2026-10-23': 'W', '2026-10-24': 'W' } as const;
    expect(computeStats(h, TODAY)).toMatchObject({ winStreak: 2, dayStreak: 2 });
  });

  it('a gap breaks both streaks', () => {
    const h = { '2026-10-22': 'W', '2026-10-24': 'W' } as const;
    expect(computeStats(h, TODAY)).toMatchObject({ winStreak: 1, dayStreak: 1 });
  });

  it('a loss breaks the win streak only', () => {
    const h = { '2026-10-23': 'W', '2026-10-24': 'L', '2026-10-25': 'W' } as const;
    expect(computeStats(h, TODAY)).toMatchObject({ played: 3, winPct: 67, winStreak: 1, dayStreak: 3 });
  });

  it('crosses a month boundary', () => {
    const h = { '2026-09-30': 'W', '2026-10-01': 'W' } as const;
    expect(computeStats(h, '2026-10-01')).toMatchObject({ dayStreak: 2 });
  });

  it('no entry today or yesterday gives zero streaks', () => {
    const h = { '2026-10-20': 'W' } as const;
    expect(computeStats(h, TODAY)).toMatchObject({ played: 1, winStreak: 0, dayStreak: 0 });
  });
});
