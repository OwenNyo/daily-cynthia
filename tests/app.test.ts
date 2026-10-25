import { Dex, type PokemonSet } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { createBattle, submit } from '../src/game/battle';
import { seedFor } from '../src/game/daily';
import { dailyTeam } from '../src/game/teams';
import { chipLabels, fitChips, moveAction, moveInfo, moveStats, movesPrompt, party, typeStyle } from '../src/ui/app';
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

describe('chipLabels', () => {
  const lines = [
    '|gen|4', '|player|p1|You|', '|player|p2|Cynthia|',
    '|switch|p1a: Weavile|Weavile, L100, M|100/100', '|switch|p2a: Spiritomb|Spiritomb, L100, M|100/100',
  ];
  it('is empty at the start of a battle', () => {
    expect(chipLabels(clientBattle(lines))).toEqual({ field: '', p1: [], p2: [] });
  });
  it('names stat changes with sign and value, in stat order', () => {
    const b = clientBattle([...lines, '|-boost|p1a: Weavile|spe|1', '|-boost|p1a: Weavile|atk|2', '|-unboost|p2a: Spiritomb|accuracy|1',
      '|-boost|p2a: Spiritomb|evasion|1', '|-boost|p1a: Weavile|def|1', '|-unboost|p1a: Weavile|def|1']);
    expect(chipLabels(b)).toMatchObject({ p1: ['Atk +2', 'Spe +1'], p2: ['Acc -1', 'Eva +1'] });
  });
  it('names volatile states after stat changes', () => {
    const b = clientBattle([...lines, '|-start|p2a: Spiritomb|confusion', '|-start|p2a: Spiritomb|move: Taunt', '|-start|p1a: Weavile|Substitute',
      '|-start|p1a: Weavile|move: Leech Seed', '|-start|p2a: Spiritomb|Encore', '|-boost|p2a: Spiritomb|spa|1']);
    expect(chipLabels(b)).toMatchObject({ p1: ['Substitute', 'Leech Seed'], p2: ['SpA +1', 'Confused', 'Taunt', 'Encore'] });
  });
  it('puts each side\'s conditions in the field line, her side first, with layer counts', () => {
    const b = clientBattle([...lines, '|-sidestart|p1: You|move: Stealth Rock', '|-sidestart|p2: Cynthia|Spikes', '|-sidestart|p2: Cynthia|Spikes',
      '|-sidestart|p2: Cynthia|move: Toxic Spikes', '|-sidestart|p2: Cynthia|Reflect', '|-sidestart|p1: You|move: Light Screen',
      '|-sidestart|p1: You|Safeguard', '|-sidestart|p1: You|move: Tailwind', '|-sidestart|p2: Cynthia|Mist', '|-sidestart|p2: Cynthia|move: Lucky Chant']);
    expect(chipLabels(b)).toEqual({
      field: 'Her side: Spikes x2, Toxic Spikes x1, Reflect, Mist, Lucky Chant. Your side: Stealth Rock, Light Screen, Safeguard, Tailwind',
      p1: [], p2: [],
    });
  });
  it('names weather, Trick Room and Gravity first in the field line', () => {
    expect(chipLabels(clientBattle([...lines, '|-weather|Sandstorm', '|-fieldstart|move: Trick Room', '|-fieldstart|move: Gravity'])).field)
      .toBe('Sandstorm, Trick Room, Gravity');
    for (const [w, label] of [['RainDance', 'Rain'], ['SunnyDay', 'Sun'], ['Hail', 'Hail']]) {
      expect(chipLabels(clientBattle([...lines, `|-weather|${w}`])).field).toBe(label);
    }
    expect(chipLabels(clientBattle([...lines, '|-weather|RainDance', '|-sidestart|p1: You|Reflect'])).field).toBe('Rain. Your side: Reflect');
  });
  it('drops a condition when it ends', () => {
    const b = clientBattle([...lines, '|-weather|RainDance', '|-weather|none', '|-start|p1a: Weavile|confusion', '|-end|p1a: Weavile|confusion',
      '|-sidestart|p1: You|Reflect', '|-sideend|p1: You|Reflect']);
    expect(chipLabels(b)).toEqual({ field: '', p1: [], p2: [] });
  });
});

describe('moveInfo', () => {
  it('a physical move: category, power, accuracy, then the short description', () => {
    expect(moveInfo('nightslash')).toBe(`Physical · Power 70 · Accuracy 100% · ${Dex.forGen(4).moves.get('nightslash').shortDesc}`);
  });
  it('a status move has no power', () => {
    expect(moveStats('swordsdance')).toBe('Status · Power - · Always hits');
  });
  it('a move that never misses says so', () => {
    expect(moveStats('aerialace')).toBe('Physical · Power 60 · Always hits');
  });
  it('a damaging move with no fixed power says it varies', () => {
    expect(moveStats('grassknot')).toBe('Special · Power varies · Accuracy 100%');
    expect(moveStats('mirrorcoat')).toBe('Special · Power varies · Accuracy 100%');
  });
  it('a move with no short description ends after the accuracy', () => {
    expect(moveInfo('hiddenpowerice')).toBe('Special · Power 70 · Accuracy 100%');
  });
  it('a special move with lower accuracy', () => {
    expect(moveStats('hydropump')).toBe('Special · Power 120 · Accuracy 80%');
  });
});

describe('fitChips', () => {
  it('shows every chip that fits', () => {
    expect(fitChips(['Atk +2', 'Spe +1'], 105)).toEqual(['Atk +2', 'Spe +1']);
  });
  it('counts the chips that do not fit', () => {
    expect(fitChips(['Atk +2', 'Spe +1', 'Toxic Spikes x2', 'Reflect'], 105)).toEqual(['Atk +2', '+3 more']);
  });
  it('shows only the count when not even one chip and the rest fit', () => {
    expect(fitChips(['Atk +2', 'Spe +1'], 70)).toEqual(['2 effects']);
    expect(fitChips(['Toxic Spikes x2'], 70)).toEqual(['1 effect']);
  });
  it('nothing to show', () => {
    expect(fitChips([], 70)).toEqual([]);
  });
});

describe('moveAction', () => {
  it('a usable move is used', () => {
    expect(moveAction(false, false)).toBe('use');
  });
  it('an unusable move does nothing outside info mode', () => {
    expect(moveAction(false, true)).toBe(null);
  });
  it('info mode shows details for any move, usable or not', () => {
    expect(moveAction(true, false)).toBe('info');
    expect(moveAction(true, true)).toBe('info');
  });
});
