import { Dex, type PokemonSet } from '@pkmn/sim';
import { expect, it } from 'vitest';
import { createBattle, submit } from '../src/game/battle';
import { typeStyle } from '../src/ui/app';

const IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const mon = (name: string): PokemonSet => ({
  name, species: 'Typhlosion', ability: 'Blaze', moves: ['blastburn'], nature: 'Modest', item: '', gender: '', level: 100,
  evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 }, ivs: IVS,
});

// After a recharge move the sim offers the pseudo-move "recharge", which has no type in the dex.
it('the move buttons render on a recharge turn', () => {
  const b = createBattle('1,2,3,4', [1, 2, 3, 4, 5, 6].map(i => mon(`T${i}`)), 0);
  submit(b, 'move 1');
  const { id } = (b.p1.activeRequest as any).active[0].moves[0];
  expect(id).toBe('recharge');
  expect(() => typeStyle(Dex.forGen(4).moves.get(id).type)).not.toThrow();
});
