import { Battle, Dex, type PokemonSet } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { chooseOpponent } from '../src/game/ai';
import { CYNTHIA } from '../src/game/cynthia';

const FORMAT = 'gen4customgame@@@Sleep Clause Mod';
const ZERO = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const IV31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

function set(species: string, moves: string[], extra: Partial<PokemonSet> = {}): PokemonSet {
  return {
    name: '', species, item: '', ability: Dex.forGen(4).species.get(species).abilities[0], moves,
    nature: 'Hardy', gender: '', evs: { ...ZERO }, ivs: { ...IV31 }, level: 100, ...extra,
  };
}

const cyn = (species: string) => CYNTHIA.find(s => s.species === species)!;

function battle(p1: PokemonSet[], p2: PokemonSet[]): Battle {
  const b = new Battle({ formatid: FORMAT as any, seed: '1,2,3,4' as any });
  b.setPlayer('p1', { name: 'You', team: p1 });
  b.setPlayer('p2', { name: 'Cynthia', team: p2 });
  return b;
}

const infernape = () => set('Infernape', ['flareblitz', 'closecombat', 'uturn', 'machpunch'], {
  nature: 'Jolly', evs: { ...ZERO, atk: 252, spe: 252 },
});

describe('chooseOpponent', () => {
  it('picks highest expected damage', () => {
    const b = battle([set('Tyranitar', ['crunch', 'stoneedge', 'earthquake', 'pursuit'])], [cyn('Lucario')]);
    expect(chooseOpponent(b)).toBe('move 1');
  });

  it('type matchup: avoids immune and resisted moves', () => {
    const b = battle([set('Skarmory', ['spikes', 'roost', 'whirlwind', 'bravebird'])], [cyn('Garchomp')]);
    expect(chooseOpponent(b)).toBe('move 3');
  });

  it('prefers priority on equal KO', () => {
    const b = battle([set('Alakazam', ['psychic', 'focusblast', 'shadowball', 'calmmind'])], [cyn('Lucario')]);
    b.p1.active[0].hp = 1;
    expect(chooseOpponent(b)).toBe('move 2');
  });

  it('all-zero picks first enabled move', () => {
    const b = battle([set('Shedinja', ['shadowsneak', 'xscissor', 'swordsdance', 'protect'])], [cyn('Roserade')]);
    expect(chooseOpponent(b)).toBe('move 1');
  });

  it('recharge move counts at half (D22)', () => {
    const b = battle([set('Togekiss', ['airslash', 'aurasphere', 'roost', 'thunderwave'])], [cyn('Garchomp')]);
    expect(chooseOpponent(b)).toBe('move 1');
  });

  it('bad matchup switch: to the bench member taking the least from the player best move', () => {
    const b = battle([infernape()], CYNTHIA);
    // One turn so the active has been in for a while. Mach Punch cannot hit Spiritomb, Silver Wind only touches Infernape.
    expect(b.choose('p1', 'move 4')).toBe(true);
    expect(b.choose('p2', 'move 3')).toBe(true);
    b.p1.active[0].hp = b.p1.active[0].maxhp;
    b.p2.active[0].hp = Math.floor(b.p2.active[0].maxhp * 0.1);
    // Flare Blitz max: Garchomp 28.9% < Milotic 30.5% (calc probe), so Garchomp in slot 6.
    expect(chooseOpponent(b)).toBe('switch 6');
  });

  it('no switch on first active turn', () => {
    const b = battle([infernape()], CYNTHIA);
    b.p2.active[0].hp = Math.floor(b.p2.active[0].maxhp * 0.1);
    b.p2.active[0].activeTurns = 0;
    expect(chooseOpponent(b)).toMatch(/^move [1-4]$/);
  });

  it('no switch when trapped', () => {
    const b = battle([infernape()], CYNTHIA);
    expect(b.choose('p1', 'move 4')).toBe(true);
    expect(b.choose('p2', 'move 3')).toBe(true);
    b.p1.active[0].hp = b.p1.active[0].maxhp;
    b.p2.active[0].hp = Math.floor(b.p2.active[0].maxhp * 0.1);
    (b.p2.activeRequest as any).active[0].trapped = true;
    expect(chooseOpponent(b)).toMatch(/^move [1-4]$/);
  });

  it('forced switch: bench member with the best expected damage on the player', () => {
    const b = battle([set('Snorlax', ['crunch', 'bodyslam', 'earthquake', 'rest'])], CYNTHIA);
    b.p2.active[0].hp = 1;
    expect(b.choose('p1', 'move 1')).toBe(true);
    expect(b.choose('p2', 'move 3')).toBe(true);
    expect((b.p2.activeRequest as any)?.forceSwitch).toBeTruthy();
    b.p1.active[0].hp = b.p1.active[0].maxhp;
    // Best expected damage on Snorlax: Lucario 62.5, Garchomp 54.9, Togekiss 53.3 (calc probe).
    expect(chooseOpponent(b)).toBe('switch 4');
  });
});
