import { describe, expect, it } from 'vitest';
import { createBattle, replay, submit } from '../src/game/battle';
import { seedFor } from '../src/game/daily';
import { dailyTeam } from '../src/game/teams';
import { formatLog, groupLog, logSteps, p1Lines } from '../src/ui/log';
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

describe('logSteps', () => {
  const full = replay(SEED, TEAM, 0, autoPlay(SEED, TEAM, 0));
  const lines = p1Lines(full);
  const steps = logSteps(lines);

  it('one step per formatted line, with the same text', () => {
    expect(steps.map(s => s.text)).toEqual(formatLog(full));
  });

  it('a turn has as many steps as formatted messages', () => {
    const b = createBattle(SEED, TEAM, 0);
    const before = logSteps(p1Lines(b)).length;
    const beforeLines = formatLog(b).length;
    submit(b, 'move 1');
    expect(logSteps(p1Lines(b)).length - before).toBe(formatLog(b).length - beforeLines);
  });

  it('steps cover a growing prefix and the last step is the full log', () => {
    for (let i = 1; i < steps.length; i++) expect(steps[i].end).toBeGreaterThanOrEqual(steps[i - 1].end);
    expect(steps.at(-1)!.end).toBe(lines.length);
  });

  it('a faint lands in the step of its message', () => {
    const i = steps.findIndex(s => s.text.endsWith('fainted!'));
    expect(i).toBeGreaterThan(0);
    const has = (end: number) => lines.slice(0, end).some(l => l.startsWith('|faint|'));
    expect(has(steps[i].end)).toBe(true);
    expect(has(steps[i - 1].end)).toBe(false);
  });

  it('a switch lands in the step of its message', () => {
    const i = steps.findIndex(s => s.text.startsWith('Go! '));
    const switches = (end: number) => lines.slice(0, end).filter(l => l.startsWith('|switch|p1a')).length;
    expect(switches(steps[i].end)).toBe(1);
    expect(i === 0 ? 0 : switches(steps[i - 1].end)).toBe(0);
  });

  it('drops ability announcements and rounds percents', () => {
    const texts = steps.map(s => s.text);
    expect(texts.filter(t => /^\[.*\]$/.test(t))).toEqual([]);
    expect(texts.filter(t => /\d\.\d+%/.test(t))).toEqual([]);
  });
});
