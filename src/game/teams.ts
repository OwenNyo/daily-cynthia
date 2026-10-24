import { Dex, PRNG, type PokemonSet, type Species } from '@pkmn/sim';
import { TeamGenerators } from '@pkmn/randoms';
import { seedFor } from './daily';

// randomSets and randomSet are untyped internals of the generator (spec R2).
type Gen4Generator = { randomSets: Record<string, unknown>; randomSet(name: string, details: object): PokemonSet };

const BANNED_TAGS = ['Restricted Legendary', 'Sub-Legendary', 'Mythical'];

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
  return picked.map(s => ({ ...gen.randomSet(s.name, {}), level: 100, item: '' }));
}
