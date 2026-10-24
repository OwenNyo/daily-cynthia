import type { PokemonSet } from '@pkmn/sim';

// Platinum Champion Cynthia: in-game moves (pret/pokeplatinum), level 100, held items per spec D31.
const IV31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ev = (e: Partial<typeof IV31>) => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...e });

const mon = (species: string, item: string, ability: string, nature: string, evs: Partial<typeof IV31>, moves: string[]): PokemonSet => ({
  name: species, species, item, ability, nature, moves, gender: '', evs: ev(evs), ivs: { ...IV31 }, level: 100,
});

export const CYNTHIA: PokemonSet[] = [
  mon('Spiritomb', 'Leftovers', 'Pressure', 'Modest', { hp: 252, spa: 252, spd: 4 }, ['darkpulse', 'psychic', 'silverwind', 'shadowball']),
  mon('Roserade', 'Black Sludge', 'Natural Cure', 'Timid', { hp: 4, spa: 252, spe: 252 }, ['energyball', 'sludgebomb', 'toxic', 'extrasensory']),
  mon('Togekiss', 'Expert Belt', 'Serene Grace', 'Modest', { hp: 252, spa: 252, spe: 4 }, ['airslash', 'aurasphere', 'waterpulse', 'shockwave']),
  mon('Lucario', 'Life Orb', 'Inner Focus', 'Naive', { atk: 252, spa: 4, spe: 252 }, ['aurasphere', 'extremespeed', 'shadowball', 'stoneedge']),
  mon('Milotic', 'Wise Glasses', 'Marvel Scale', 'Modest', { hp: 252, spa: 252, def: 4 }, ['surf', 'icebeam', 'mirrorcoat', 'dragonpulse']),
  mon('Garchomp', 'Sitrus Berry', 'Sand Veil', 'Naive', { atk: 252, spa: 4, spe: 252 }, ['dragonrush', 'earthquake', 'flamethrower', 'gigaimpact']),
];
