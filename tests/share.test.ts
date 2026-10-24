import { describe, expect, it } from 'vitest';
import { CYNTHIA } from '../src/game/cynthia';
import { shareText } from '../src/game/share';
import { dailyTeam } from '../src/game/teams';

const WIN = { won: true, turns: 23, p1Fainted: [false, false, true, false, true, true], p2Fainted: [true, true, true, true, true, true] };
const LOSS = { won: false, turns: 23, p1Fainted: [true, true, true, true, true, true], p2Fainted: [true, true, false, false, false, false] };

describe('shareText', () => {
  it('win', () => {
    expect(shareText('2026-10-25', WIN, 'https://x.test')).toBe(
      'Daily Cynthia #1 ✅ 23 turns\n🟩🟩🟥🟩🟥🟥\n⬛⬛⬛⬛⬛⬛\nhttps://x.test',
    );
  });

  it('loss header uses the cross', () => {
    expect(shareText('2026-10-25', LOSS, 'https://x.test').startsWith('Daily Cynthia #1 ❌ 23 turns')).toBe(true);
  });

  it('loss shows Cynthia standing as white squares', () => {
    expect(shareText('2026-10-25', LOSS, 'https://x.test').split('\n')).toContain('⬛⬛⬜⬜⬜⬜');
  });

  it('day number follows the date', () => {
    expect(shareText('2026-11-01', WIN, 'https://x.test').startsWith('Daily Cynthia #8 ')).toBe(true);
  });

  it('spoiler free', () => {
    const text = shareText('2026-10-25', WIN, 'https://x.test');
    for (const name of [...dailyTeam('2026-10-25'), ...CYNTHIA].map(s => s.species)) {
      expect(text).not.toContain(name);
    }
  });
});
