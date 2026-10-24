import { Battle as ClientBattle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Protocol } from '@pkmn/protocol';
import { Dex, extractChannelMessages, type Battle } from '@pkmn/sim';
import { LogFormatter } from '@pkmn/view';

const gens = new Generations(Dex as any); // @pkmn/sim's Dex differs from @pkmn/dex only in types

// The p1 view of the protocol log.
export const p1Lines = (battle: Battle): string[] => extractChannelMessages(battle.log.join('\n'), [1])[1];

// A client-side battle built from protocol lines, for what the player has seen so far.
export function clientBattle(lines: string[]): ClientBattle {
  const b = new ClientBattle(gens);
  for (const line of lines) {
    const { args, kwArgs } = Protocol.parseBattleLine(line);
    b.add(args, kwArgs);
  }
  return b;
}

// One step per English line: `end` is how many protocol lines it takes to reach that line, so turn playback
// can show the battle as it was at each message. Lines after the last message belong to the last step.
// `||title||text||` is LogFormatter's tooltip markup; keep the text. Ability announcements like
// `[The opposing Spiritomb's Pressure]` are dropped, and percents are rounded to whole numbers.
export function logSteps(lines: string[]): { end: number; text: string }[] {
  const tracker = new ClientBattle(gens);
  const formatter = new LogFormatter('p1', tracker);
  const steps: { end: number; text: string }[] = [];
  lines.forEach((line, i) => {
    const { args, kwArgs } = Protocol.parseBattleLine(line);
    const text = formatter.formatText(args, kwArgs).replace(/\*\*/g, '').replace(/\|\|[^|]*\|\|([^|]*)\|\|/g, '$1')
      .replace(/(\d+\.\d+)%/g, (_, n) => `${Math.round(Number(n))}%`);
    for (const t of text.split('\n')) if (t.trim() && !/^\[.*\]$/.test(t.trim())) steps.push({ end: i + 1, text: t });
    tracker.add(args, kwArgs);
  });
  if (steps.length) steps[steps.length - 1].end = lines.length;
  return steps;
}

export const formatLog = (battle: Battle): string[] => logSteps(p1Lines(battle)).map(s => s.text);

export const TURN = /^== (Turn \d+) ==$/;

export type LogGroup = { turn: string; lines: string[] };

// Groups formatLog lines under "Start", "Turn 1", ... and drops the `== Turn N ==` lines.
// `[X's Ability]` and `(X lost N% of its health!)` lose their brackets.
export function groupLog(lines: string[]): LogGroup[] {
  const groups: LogGroup[] = [{ turn: 'Start', lines: [] }];
  for (const raw of lines) {
    const turn = raw.match(TURN);
    if (turn) groups.push({ turn: turn[1], lines: [] });
    else groups[groups.length - 1].lines.push(raw.trim().replace(/^[[(](.*)[\])]$/, '$1'));
  }
  return groups;
}
