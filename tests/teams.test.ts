import { Dex } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { dailyTeam } from '../src/game/teams';
import { addDays } from './helpers';

const BANNED_TAGS = ['Restricted Legendary', 'Sub-Legendary', 'Mythical'];

describe('dailyTeam', () => {
  it('golden 2026-10-25', () => {
    expect(dailyTeam('2026-10-25').map(s => s.species)).toEqual([
      'Minun', 'Victreebel', 'Flareon', 'Weavile', 'Ninjask', 'Ludicolo',
    ]);
  });

  it('deterministic', () => {
    expect(dailyTeam('2026-10-26')).toEqual(dailyTeam('2026-10-26'));
  });

  it('differs by day', () => {
    const a = dailyTeam('2026-10-25').map(s => s.species);
    const b = dailyTeam('2026-10-26').map(s => s.species);
    expect(a).not.toEqual(b);
  });

  it('pool rules over 365 days', () => {
    const dex = Dex.forGen(4);
    for (let i = 0; i < 365; i++) {
      const date = addDays('2026-10-25', i);
      const team = dailyTeam(date);
      expect(team, date).toHaveLength(6);
      const bases = new Set<string>();
      for (const set of team) {
        const sp = dex.species.get(set.species);
        expect(set.level, `${date} ${set.species}`).toBe(100);
        expect(set.item, `${date} ${set.species}`).toBe('');
        expect(sp.num, `${date} ${set.species}`).toBeGreaterThanOrEqual(1);
        expect(sp.num, `${date} ${set.species}`).toBeLessThanOrEqual(493);
        expect(sp.nfe, `${date} ${set.species}`).toBe(false);
        expect(BANNED_TAGS.filter(t => (sp.tags as string[]).includes(t)), `${date} ${set.species}`).toEqual([]);
        bases.add(sp.baseSpecies);
      }
      expect(bases.size, date).toBe(6);
    }
  }, 60_000);
});
