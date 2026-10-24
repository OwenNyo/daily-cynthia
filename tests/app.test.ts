import { Dex, type PokemonSet } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { createBattle, submit } from '../src/game/battle';
import { seedFor } from '../src/game/daily';
import { dailyTeam } from '../src/game/teams';
import { movesPrompt, party, typeStyle } from '../src/ui/app';
import { clientBattle, p1Lines } from '../src/ui/log';

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

// The client stores an item it learns from `[from] item: X` as the condition id `item:x`.
it('a party tile names an item the client learned from a heal line', () => {
  const date = '2026-10-29';
  const team = dailyTeam(date);
  const lead = team.findIndex(s => s.species === 'Gallade');
  const b = createBattle(seedFor(date, 1), team, lead);
  submit(b, `move ${team[lead].moves.indexOf('trick') + 1}`); // takes Spiritomb's Leftovers, then heals with it
  const gallade = party(clientBattle(p1Lines(b)), b, team)[lead];
  expect(gallade).toMatchObject({ item: 'Leftovers', itemGone: false });
});

describe('movesPrompt', () => {
  const moves = [{ id: 'surf', disabled: false }, { id: 'icebeam', disabled: true }, { id: 'energyball', disabled: true }];
  it('names the locked move under a Choice item', () => {
    expect(movesPrompt('Ludicolo', moves, 'choicespecs')).toBe('Ludicolo is locked into Surf.');
  });
  it('asks as usual otherwise', () => {
    expect(movesPrompt('Ludicolo', moves, 'leftovers')).toBe('What will Ludicolo do?');
    expect(movesPrompt('Ludicolo', moves.map(m => ({ ...m, disabled: false })), 'choicespecs')).toBe('What will Ludicolo do?');
  });
});
