import { describe, expect, it } from 'vitest';
import { createBattle, replay, submit } from '../src/game/battle';
import { seedFor } from '../src/game/daily';
import { dailyTeam } from '../src/game/teams';
import { formatLog, groupLog } from '../src/ui/log';
import { autoPlay } from './helpers';

const SEED = seedFor('2026-10-25', 1);
const TEAM = dailyTeam('2026-10-25');

function firstTurn(): string[] {
  const b = createBattle(SEED, TEAM, 0);
  submit(b, 'move 1');
  return formatLog(b);
}

describe('formatLog', () => {
  it('has a line saying a move was used', () => {
    expect(firstTurn().some(l => l.includes('used'))).toBe(true);
  });

  it('has a Turn 1 header', () => {
    expect(firstTurn().some(l => l.includes('Turn 1'))).toBe(true);
  });

  it('strips bold and hidden markup', () => {
    expect(firstTurn().filter(l => l.includes('**') || l.includes('||'))).toEqual([]);
  });

  it('drops blank lines', () => {
    expect(firstTurn().filter(l => l.trim() === '')).toEqual([]);
  });

  it('a finished battle ends with who won', () => {
    const lines = formatLog(replay(SEED, TEAM, 0, autoPlay(SEED, TEAM, 0)));
    expect(lines.slice(-3).some(l => l.includes('won the battle'))).toBe(true);
  });
});

describe('groupLog', () => {
  it('splits on turn headers, with a Start group first', () => {
    expect(groupLog(['Go! Minun!', '== Turn 1 ==', 'Minun used Surf!', '== Turn 2 ==', 'Minun fainted!'])).toEqual([
      { turn: 'Start', lines: ['Go! Minun!'] },
      { turn: 'Turn 1', lines: ['Minun used Surf!'] },
      { turn: 'Turn 2', lines: ['Minun fainted!'] },
    ]);
  });

  it('turns ability brackets into plain text', () => {
    expect(groupLog(["[The opposing Spiritomb's Pressure]"])[0].lines).toEqual(["The opposing Spiritomb's Pressure"]);
  });

  it('trims leading spaces and wrapping parentheses', () => {
    expect(groupLog(['  A critical hit!', '  (Minun lost 90.8% of its health!)'])[0].lines)
      .toEqual(['A critical hit!', 'Minun lost 90.8% of its health!']);
  });

  it('an empty log has an empty Start group', () => {
    expect(groupLog([])).toEqual([{ turn: 'Start', lines: [] }]);
  });
});
