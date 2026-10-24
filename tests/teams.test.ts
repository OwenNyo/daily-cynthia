import { Dex, PRNG, type PokemonSet, type Species } from '@pkmn/sim';
import { TeamGenerators } from '@pkmn/randoms';
import { describe, expect, it } from 'vitest';
import { seedFor } from '../src/game/daily';
import { dailyTeam, itemClause, ITEMS_FROM } from '../src/game/teams';
import { addDays } from './helpers';

const BANNED_TAGS = ['Restricted Legendary', 'Sub-Legendary', 'Mythical'];

// dailyTeam as it was before items (commit 78f3de2), to prove items change nothing else.
function oldDailyTeam(date: string): PokemonSet[] {
  const prng = new PRNG(seedFor(date, 0) as any);
  const gen = TeamGenerators.getTeamGenerator('gen4randombattle', prng) as any;
  const pool = Dex.forGen(4).species.all().filter(s =>
    s.num >= 1 && s.num <= 493 && !s.nfe && gen.randomSets[s.id] &&
    !(s.tags as string[]).some(t => BANNED_TAGS.includes(t)));
  const shuffled = [...pool];
  prng.shuffle(shuffled);
  const picked: Species[] = [];
  for (const s of shuffled) {
    if (picked.length === 6) break;
    if (!picked.some(p => p.baseSpecies === s.baseSpecies)) picked.push(s);
  }
  return picked.map(s => ({ ...gen.randomSet(s.name, {}), level: 100, item: '' }));
}

const noItem = (team: PokemonSet[]) => team.map(s => ({ ...s, item: '' }));

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
        expect(sp.num, `${date} ${set.species}`).toBeGreaterThanOrEqual(1);
        expect(sp.num, `${date} ${set.species}`).toBeLessThanOrEqual(493);
        expect(sp.nfe, `${date} ${set.species}`).toBe(false);
        expect(BANNED_TAGS.filter(t => (sp.tags as string[]).includes(t)), `${date} ${set.species}`).toEqual([]);
        bases.add(sp.baseSpecies);
      }
      expect(bases.size, date).toBe(6);
    }
  }, 60_000);

  it('a day before ITEMS_FROM is exactly the old team, with no items', () => {
    for (const date of ['2026-10-24', '2026-10-01', '2025-01-01']) {
      expect(dailyTeam(date), date).toEqual(oldDailyTeam(date));
      expect(dailyTeam(date).map(s => s.item), date).toEqual(['', '', '', '', '', '']);
    }
  });

  it('365 days from ITEMS_FROM: six different valid Gen 4 items, everything else as before', () => {
    const dex = Dex.forGen(4);
    for (let i = 0; i < 365; i++) {
      const date = addDays(ITEMS_FROM, i);
      const team = dailyTeam(date);
      const items = team.map(s => s.item);
      expect(new Set(items).size, date).toBe(6);
      for (const item of items) {
        const it = dex.items.get(item);
        expect(item, date).not.toBe('');
        expect(it.exists && it.gen <= 4 && !it.isNonstandard, `${date} ${item}`).toBe(true);
      }
      expect(noItem(team), date).toEqual(oldDailyTeam(date));
    }
  }, 60_000);

  it('same date gives the same items', () => {
    expect(dailyTeam('2026-11-03').map(s => s.item)).toEqual(dailyTeam('2026-11-03').map(s => s.item));
  });
});

describe('itemClause', () => {
  const PHYS = ['earthquake', 'stoneedge', 'flamethrower'];
  const SPEC = ['surf', 'icebeam', 'earthquake'];
  const TIE = ['earthquake', 'surf', 'toxic', 'protect'];
  const sets = (items: string[], last = TIE) => items.map((item, i) => ({ item, moves: i === items.length - 1 ? last : TIE }));
  const six = (item: string) => Array(6).fill(item);

  it('keeps six different items as they are', () => {
    const items = ['Choice Band', 'Leftovers', 'Life Orb', 'Focus Sash', 'Black Sludge', 'Choice Scarf'];
    expect(itemClause(sets(items))).toEqual(items);
  });

  it('a repeat gets the first fallback not on the team, in team order', () => {
    expect(itemClause(sets(['Leftovers', 'Life Orb', 'Leftovers', 'Choice Band', 'Life Orb', 'Leftovers'])))
      .toEqual(['Leftovers', 'Life Orb', 'Expert Belt', 'Choice Band', 'Lum Berry', 'Sitrus Berry']);
  });

  it('skips a fallback that a later Pokemon holds', () => {
    expect(itemClause(sets(['Leftovers', 'Leftovers', 'Life Orb', 'Expert Belt', 'Lum Berry', 'Choice Band'])))
      .toEqual(['Leftovers', 'Sitrus Berry', 'Life Orb', 'Expert Belt', 'Lum Berry', 'Choice Band']);
  });

  it('Muscle Band only for a mostly physical set', () => {
    expect(itemClause(sets(six('Leftovers'), PHYS)).at(-1)).toBe('Muscle Band');
  });

  it('Wise Glasses only for a mostly special set', () => {
    expect(itemClause(sets(six('Leftovers'), SPEC)).at(-1)).toBe('Wise Glasses');
  });

  it('a tie skips both: Quick Claw', () => {
    expect(itemClause(sets(six('Leftovers'), TIE)).at(-1)).toBe('Quick Claw');
  });
});
