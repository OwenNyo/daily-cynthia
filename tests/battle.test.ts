import { describe, expect, it } from 'vitest';
import { createBattle, FORMAT, p1Pending, replay, submit, summary } from '../src/game/battle';
import { CYNTHIA } from '../src/game/cynthia';
import { seedFor } from '../src/game/daily';
import { dailyTeam, ITEMS_FROM } from '../src/game/teams';
import { addDays, autoPlay, withoutTimes } from './helpers';

const DATE = '2026-10-25';
const SEED = seedFor(DATE, 1);
const TEAM = dailyTeam(DATE);

describe('battle driver', () => {
  it('FORMAT is gen4customgame with Sleep Clause Mod', () => {
    expect(FORMAT).toBe('gen4customgame@@@Sleep Clause Mod');
  });

  it('lead goes first', () => {
    expect(createBattle(SEED, TEAM, 3).p1.pokemon[0].species.name).toBe(TEAM[3].species);
  });

  it('names the players You and Cynthia', () => {
    const b = createBattle(SEED, TEAM, 0);
    expect([b.p1.name, b.p2.name]).toEqual(['You', 'Cynthia']);
  });

  it('Cynthia gets her team with Spiritomb leading', () => {
    const b = createBattle(SEED, TEAM, 0);
    expect(b.p2.pokemon.map(p => p.set.species)).toEqual(CYNTHIA.map(s => s.species));
  });

  it('sleep clause on', () => {
    expect(createBattle(SEED, TEAM, 0).ruleTable.has('sleepclausemod')).toBe(true);
  });

  it('a fresh battle waits for the player move', () => {
    expect(p1Pending(createBattle(SEED, TEAM, 0))).toBe('move');
  });

  it('submit applies the player choice and the AI answer', () => {
    const b = createBattle(SEED, TEAM, 0);
    submit(b, 'move 1');
    // The turn resolved: either turn 2 started or the player's lead fainted and owes a switch.
    expect(b.log.join('\n')).toMatch(/\|turn\|2|\|faint\|p1a/);
  });

  it('submit rejects invalid choice and leaves the battle unchanged', () => {
    const b = createBattle(SEED, TEAM, 0);
    const turn = b.turn;
    const logLength = b.log.length;
    expect(() => submit(b, 'switch 1')).toThrow('invalid choice');
    expect([b.turn, b.log.length]).toEqual([turn, logLength]);
  });

  it('plays to the end', () => {
    const b = replay(SEED, TEAM, 0, autoPlay(SEED, TEAM, 0));
    const s = summary(b);
    expect(b.ended).toBe(true);
    expect(p1Pending(b)).toBe('ended');
    expect(s.turns).toBeGreaterThan(0);
    expect([s.p1Fainted.every(Boolean), s.p2Fainted.every(Boolean)].filter(Boolean)).toHaveLength(1);
    expect(s.won).toBe(s.p2Fainted.every(Boolean));
  });

  it('replay deterministic', () => {
    const choices = autoPlay(SEED, TEAM, 0);
    const a = withoutTimes(replay(SEED, TEAM, 0, choices).log).join('\n');
    const b = withoutTimes(replay(SEED, TEAM, 0, choices).log).join('\n');
    expect(a).toBe(b);
  });

  it('replay throws on a choice the sim rejects', () => {
    expect(() => replay(SEED, TEAM, 0, ['switch 1'])).toThrow();
  });

  it('replay ends at forced switch', () => {
    const choices = autoPlay(SEED, TEAM, 0);
    const i = choices.findIndex(c => c.startsWith('switch'));
    expect(i).toBeGreaterThan(0);
    expect(p1Pending(replay(SEED, TEAM, 0, choices.slice(0, i)))).toBe('switch');
  });

  it('summary order follows the team as sent out, not the in-battle slot order', () => {
    const lead = 3;
    const sentOut = createBattle(SEED, TEAM, lead).p1.pokemon.map(p => p.set.species);
    const b = replay(SEED, TEAM, lead, autoPlay(SEED, TEAM, lead));
    const s = summary(b);
    const fainted = (side: typeof b.p1, species: string) => side.pokemon.find(p => p.set.species === species)!.fainted;
    expect(s.p1Fainted).toHaveLength(6);
    expect(s.p2Fainted).toHaveLength(6);
    expect(s.p1Fainted).toEqual(sentOut.map(sp => fainted(b.p1, sp)));
    expect(s.p2Fainted).toEqual(CYNTHIA.map(c => fainted(b.p2, c.species)));
  });

  it('a Choice item locks the move: the request disables the other moves', () => {
    for (let i = 0; i < 60; i++) {
      const date = addDays(ITEMS_FROM, i);
      const team = dailyTeam(date);
      const lead = team.findIndex(s => s.item.startsWith('Choice'));
      if (lead < 0) continue;
      const b = createBattle(seedFor(date, 1), team, lead);
      submit(b, 'move 1');
      if (p1Pending(b) !== 'move' || b.p1.active[0].set.species !== team[lead].species) continue;
      const moves = (b.p1.activeRequest as any).active[0].moves as { disabled?: boolean }[];
      expect(moves.map(m => !!m.disabled), date).toEqual([false, true, true, true]);
      return;
    }
    throw new Error('no date with a Choice lead that survives turn 1');
  });
});
