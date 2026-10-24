import { Dex, PRNG, type PokemonSet, type Species } from '@pkmn/sim';
import { TeamGenerators } from '@pkmn/randoms';
import { seedFor } from './daily';

// randomSets and randomSet are untyped internals of the generator (spec R2).
type Gen4Generator = { randomSets: Record<string, unknown>; randomSet(name: string, details: object): PokemonSet };

const BANNED_TAGS = ['Restricted Legendary', 'Sub-Legendary', 'Mythical'];

// Players hold items from this date on. Earlier dates keep no items, so an official battle started before it
// replays the same after a reload, and stored choice logs from those days still replay later.
export const ITEMS_FROM = '2026-10-25';

const FALLBACK_ITEMS = ['Leftovers', 'Life Orb', 'Expert Belt', 'Lum Berry', 'Sitrus Berry', 'Muscle Band', 'Wise Glasses', 'Quick Claw'];

// More physical than special damaging moves: 1. More special: -1. Tie: 0.
function lean(moves: string[]): number {
  const cats = moves.map(m => Dex.forGen(4).moves.get(m).category);
  return Math.sign(cats.filter(c => c === 'Physical').length - cats.filter(c => c === 'Special').length);
}

// Item Clause (spec D32): in team order, a repeated item becomes the first fallback no one on the team holds.
// Muscle Band only fits a mostly physical set, Wise Glasses a mostly special one.
export function itemClause(sets: { item: string; moves: string[] }[]): string[] {
  const out = sets.map(s => s.item);
  out.forEach((item, i) => {
    if (out.indexOf(item) === i) return;
    const l = lean(sets[i].moves);
    out[i] = FALLBACK_ITEMS.find(f => !out.includes(f) &&
      !(f === 'Muscle Band' && l !== 1) && !(f === 'Wise Glasses' && l !== -1))!;
  });
  return out;
}

export function dailyTeam(date: string): PokemonSet[] {
  const prng = new PRNG(seedFor(date, 0) as any);
  const gen = TeamGenerators.getTeamGenerator('gen4randombattle', prng) as unknown as Gen4Generator;
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
  const sets = picked.map(s => ({ ...gen.randomSet(s.name, {}), level: 100 }));
  if (date < ITEMS_FROM) return sets.map(s => ({ ...s, item: '' }));
  const items = itemClause(sets);
  return sets.map((s, i) => ({ ...s, item: items[i] }));
}
