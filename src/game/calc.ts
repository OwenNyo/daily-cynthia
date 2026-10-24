import { calculate, Generations, Move, Pokemon } from '@smogon/calc';
import { Dex, type BoostsTable, type Pokemon as SimPokemon, type PokemonSet } from '@pkmn/sim';

const GEN = Generations.get(4);
const dex = Dex.forGen(4);

export function toCalc(set: PokemonSet, live?: { hp: number; status: string; boosts: Partial<BoostsTable> }): Pokemon {
  // Random sets can pick cosmetic formes (Unown-T, Gastrodon-East), which the calc does not know; stats are the base's.
  const species = dex.species.get(set.species);
  return new Pokemon(GEN, species.isCosmeticForme ? species.baseSpecies : set.species, {
    level: set.level, ability: set.ability as any, item: (set.item || undefined) as any, nature: set.nature as any,
    gender: (set.gender || undefined) as any, evs: set.evs, ivs: set.ivs,
    ...(live && { curHP: live.hp, status: live.status as any, boosts: live.boosts }),
  });
}

export function fromSim(p: SimPokemon): Pokemon {
  // The item held now: Trick, Knock Off or a used berry change it from the set's.
  return toCalc({ ...p.set, item: p.item ? dex.items.get(p.item).name : '' }, { hp: p.hp, status: p.status, boosts: p.boosts });
}

export function damagePct(attacker: Pokemon, defender: Pokemon, moveId: string): [number, number] {
  const m = dex.moves.get(moveId);
  if (m.category === 'Status') return [0, 0];
  const name = m.id.startsWith('hiddenpower') ? `Hidden Power ${m.type}` : m.name;
  const range = calculate(GEN, attacker, defender, new Move(GEN, name)).range();
  const pct = (d: number) => Math.round(d / defender.maxHP() * 1000) / 10;
  return [pct(range[0]), pct(range[1])];
}

// The sim stores every Hidden Power as 'hiddenpower' and keeps the type in hpType.
export function slotMoveId(p: SimPokemon, id: string): string {
  return id === 'hiddenpower' ? `hiddenpower${p.hpType.toLowerCase()}` : id;
}
