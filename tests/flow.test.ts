// Task 12: the official-battle save and resume flow the UI relies on, built from the planned modules.
import { describe, expect, it } from 'vitest';
import { createBattle, replay, submit } from '../src/game/battle';
import { seedFor } from '../src/game/daily';
import { dailyTeam } from '../src/game/teams';
import { load, save } from '../src/ui/storage';
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
});
