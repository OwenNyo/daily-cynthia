import { Battle, Dex, type PokemonSet } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { damagePct, fromSim, toCalc } from '../src/game/calc';
import { CYNTHIA } from '../src/game/cynthia';

const ZERO = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const IV31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const dex = Dex.forGen(4);

function set(species: string, moves: string[], extra: Partial<PokemonSet> = {}): PokemonSet {
  return {
    name: '', species, item: '', ability: dex.species.get(species).abilities[0], moves,
    nature: 'Hardy', gender: '', evs: { ...ZERO }, ivs: { ...IV31 }, level: 100, ...extra,
  };
}

const cyn = (species: string) => CYNTHIA.find(s => s.species === species)!;

describe('CYNTHIA', () => {
  it('matches the spec table in order', () => {
    expect(CYNTHIA.map(s => [s.species, s.item, s.ability, s.nature, s.moves.map(m => dex.moves.get(m).id)])).toEqual([
      ['Spiritomb', 'Leftovers', 'Pressure', 'Modest', ['darkpulse', 'psychic', 'silverwind', 'shadowball']],
      ['Roserade', 'Black Sludge', 'Natural Cure', 'Timid', ['energyball', 'sludgebomb', 'toxic', 'extrasensory']],
      ['Togekiss', 'Expert Belt', 'Serene Grace', 'Modest', ['airslash', 'aurasphere', 'waterpulse', 'shockwave']],
      ['Lucario', 'Life Orb', 'Inner Focus', 'Naive', ['aurasphere', 'extremespeed', 'shadowball', 'stoneedge']],
      ['Milotic', 'Wise Glasses', 'Marvel Scale', 'Modest', ['surf', 'icebeam', 'mirrorcoat', 'dragonpulse']],
      ['Garchomp', 'Sitrus Berry', 'Sand Veil', 'Naive', ['dragonrush', 'earthquake', 'flamethrower', 'gigaimpact']],
    ]);
  });

  it('has the EVs from the spec table', () => {
    expect(CYNTHIA.map(s => ({ ...ZERO, ...s.evs }))).toEqual([
      { ...ZERO, hp: 252, spa: 252, spd: 4 },
      { ...ZERO, hp: 4, spa: 252, spe: 252 },
      { ...ZERO, hp: 252, spa: 252, spe: 4 },
      { ...ZERO, atk: 252, spa: 4, spe: 252 },
      { ...ZERO, hp: 252, spa: 252, def: 4 },
      { ...ZERO, atk: 252, spa: 4, spe: 252 },
    ]);
  });

  it('is level 100 with IVs 31 in every stat', () => {
    for (const s of CYNTHIA) {
      expect(s.level, s.species).toBe(100);
      expect(s.ivs, s.species).toEqual(IV31);
    }
  });

  it('every item, move and ability exists in Gen 4', () => {
    for (const s of CYNTHIA) {
      expect(dex.items.get(s.item).exists, s.item).toBe(true);
      for (const m of s.moves) expect(dex.moves.get(m).exists, m).toBe(true);
      const sp = dex.species.get(s.species);
      const abilities = Object.entries(sp.abilities).filter(([k]) => k !== 'H').map(([, v]) => v);
      expect(abilities, s.species).toContain(s.ability);
    }
  });

  it('item clause: the six items are all different', () => {
    expect(new Set(CYNTHIA.map(s => s.item)).size).toBe(6);
  });
});

describe('damagePct', () => {
  it('known calc: Garchomp Earthquake vs plain Milotic is in a sane band', () => {
    const [min, max] = damagePct(toCalc(cyn('Garchomp')), toCalc(set('Milotic', ['surf'])), 'earthquake');
    expect(min).toBeGreaterThanOrEqual(60);
    expect(max).toBeLessThanOrEqual(90);
    expect(min).toBeLessThan(max);
  });

  it('applies the held item (Life Orb)', () => {
    const target = toCalc(set('Snorlax', ['bodyslam']));
    const withItem = damagePct(toCalc(cyn('Lucario')), target, 'aurasphere');
    const noItem = damagePct(toCalc({ ...cyn('Lucario'), item: '' }), target, 'aurasphere');
    expect(withItem[1]).toBeGreaterThan(noItem[1]);
  });

  it('applies a player held item (Choice Band)', () => {
    const target = toCalc(cyn('Garchomp'));
    const band = damagePct(toCalc(set('Ursaring', ['facade'], { item: 'Choice Band' })), target, 'facade');
    const plain = damagePct(toCalc(set('Ursaring', ['facade'])), target, 'facade');
    expect(band[1]).toBeGreaterThan(plain[1]);
  });

  it('status move gives [0, 0]', () => {
    expect(damagePct(toCalc(cyn('Spiritomb')), toCalc(set('Snorlax', ['bodyslam'])), 'toxic')).toEqual([0, 0]);
  });

  it('rounds to 1 decimal', () => {
    const r = damagePct(toCalc(cyn('Garchomp')), toCalc(set('Milotic', ['surf'])), 'earthquake');
    for (const x of r) expect(Math.round(x * 10) / 10).toBe(x);
  });

  it('hidden power works by its typed name', () => {
    const hp = set('Starmie', ['hiddenpowerfire'], { ivs: { ...IV31, atk: 30, spa: 30, spe: 30 } });
    const [, max] = damagePct(toCalc(hp), toCalc(cyn('Roserade')), 'hiddenpowerfire');
    expect(max).toBeGreaterThan(0);
  });
});

describe('toCalc / fromSim', () => {
  it('cosmetic formes from random sets use the base species (the calc does not know them)', () => {
    for (const species of ['Unown-T', 'Unown-Question', 'Gastrodon-East']) {
      expect(toCalc(set(species, ['hiddenpower'])).name, species).toBe(dex.species.get(species).baseSpecies);
    }
  });

  it('live hp sets current HP', () => {
    expect(toCalc(set('Snorlax', ['bodyslam']), { hp: 1, status: '', boosts: {} }).curHP()).toBe(1);
  });

  it('fromSim carries the sim pokemon HP', () => {
    const b = new Battle({ formatid: 'gen4customgame@@@Sleep Clause Mod' as any, seed: '1,2,3,4' as any });
    b.setPlayer('p1', { name: 'You', team: [set('Snorlax', ['bodyslam'])] });
    b.setPlayer('p2', { name: 'Cynthia', team: [cyn('Spiritomb')] });
    b.p1.active[0].hp = 100;
    expect(fromSim(b.p1.active[0]).curHP()).toBe(100);
  });
});

describe('fromSim held item', () => {
  it('uses the item held now, not the starting one', () => {
    const b = new Battle({ formatid: 'gen4customgame' as any, seed: [1, 2, 3, 4] as any });
    b.setPlayer('p1', { name: 'a', team: [CYNTHIA[0]] });
    b.setPlayer('p2', { name: 'b', team: [CYNTHIA[1]] });
    const mon = b.p1.active[0];
    expect(fromSim(mon).item).toBe('Leftovers');
    mon.item = '' as any; // knocked off or Tricked away
    expect(fromSim(mon).item).toBeUndefined();
    mon.item = 'choicescarf' as any;
    expect(fromSim(mon).item).toBe('Choice Scarf');
  });
});
