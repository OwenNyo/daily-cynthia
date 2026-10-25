// Task 12: the official-battle save and resume flow the UI relies on, built from the planned modules.
import { describe, expect, it } from 'vitest';
import { createBattle, replay, submit, summary } from '../src/game/battle';
import { seedFor } from '../src/game/daily';
import { dailyTeam } from '../src/game/teams';
import { resume, staleOfficial, watchAgain } from '../src/ui/app';
import { finishOfficial, load, save, type Save } from '../src/ui/storage';
import { autoPlay, memoryStorage, withoutTimes } from './helpers';

const DATE = '2026-10-25';
const TEAM = dailyTeam(DATE);

describe('official flow', () => {
  it('reload mid-battle rebuilds the same battle from the saved choices', () => {
    const store = memoryStorage();
    const lead = 2;
    const choices = autoPlay(seedFor(DATE, 1), TEAM, lead).slice(0, 5);
    const live = createBattle(seedFor(DATE, 1), TEAM, lead);
    const s = load(store);
    s.current = { date: DATE, lead, choices: [] };
    save(s, store);
    for (const c of choices) {
      submit(live, c);
      s.current.choices.push(c);
      save(s, store);
    }

    const { current } = load(store);
    const resumed = replay(seedFor(current!.date, 1), dailyTeam(current!.date), current!.lead, current!.choices);
    expect(withoutTimes(resumed.log)).toEqual(withoutTimes(live.log));
  });

  it('a finished battle left in current is recorded on resume', () => {
    const choices = autoPlay(seedFor(DATE, 1), TEAM, 1);
    const done = summary(replay(seedFor(DATE, 1), TEAM, 1, choices));
    const r = resume({ playerId: 'p', name: 'Ash', history: {}, current: { date: DATE, lead: 1, choices } });
    expect(r.s.current).toBeUndefined();
    expect(r.s.history[DATE]).toBe(done.won ? 'W' : 'L');
    expect(r.s.results?.[DATE]).toEqual({ ...done, lead: 1, choices });
    expect(r.live?.done).toEqual(done);
    expect(r.post).toEqual({
      date: DATE, playerId: 'p', name: 'Ash', won: done.won, fainted: done.p1Fainted.filter(Boolean).length,
      turns: done.turns, seed: seedFor(DATE, 1), lead: 1, choices,
    });
  });

  it('a battle still running in current resumes without a post', () => {
    const choices = autoPlay(seedFor(DATE, 1), TEAM, 1).slice(0, 2);
    const r = resume({ playerId: 'p', name: '', history: {}, current: { date: DATE, lead: 1, choices } });
    expect(r.s.current?.choices).toEqual(choices);
    expect(r.post).toBeUndefined();
    expect(r.live?.done).toBeUndefined();
  });
});

describe('staleOfficial', () => {
  const mine: Save = { playerId: 'p', name: '', history: {}, current: { date: DATE, lead: 1, choices: ['move 1'] } };

  it('is false when another tab only changed other fields', () => {
    const store = memoryStorage();
    save(mine, store);
    save({ ...load(store), music: true, name: 'Ash' }, store);
    expect(staleOfficial(mine, load(store))).toBe(false);
  });

  it('is true when another tab played a move or finished the battle', () => {
    expect(staleOfficial(mine, { ...mine, current: { ...mine.current!, choices: ['move 1', 'move 2'] } })).toBe(true);
    expect(staleOfficial(mine, { ...mine, current: undefined, history: { [DATE]: 'W' } })).toBe(true);
  });
});

describe('watchAgain', () => {
  const lead = 1;
  const choices = autoPlay(seedFor(DATE, 1), TEAM, lead);
  const original = replay(seedFor(DATE, 1), TEAM, lead, choices);
  const done = summary(original);

  it('rebuilds the stored official battle as a finished, official battle', () => {
    const store = memoryStorage();
    save(finishOfficial({ playerId: 'p', name: '', history: {}, current: { date: DATE, lead, choices } }, done), store);
    const w = watchAgain(DATE, load(store).results?.[DATE]);
    expect(w?.official).toBe(true);
    expect(w?.done).toEqual(done);
    expect(withoutTimes(w!.battle.log)).toEqual(withoutTimes(original.log));
  });

  it('is null when there is no result', () => {
    expect(watchAgain(DATE, undefined)).toBeNull();
  });

  it('is null for an old result without lead and choices', () => {
    expect(watchAgain(DATE, done)).toBeNull();
  });

  it('is null, without throwing, for a rejected choice', () => {
    expect(watchAgain(DATE, { ...done, lead, choices: ['move 9'] })).toBeNull();
  });

  it('is null for choices that stop before the end', () => {
    expect(watchAgain(DATE, { ...done, lead, choices: choices.slice(0, 2) })).toBeNull();
  });
});
