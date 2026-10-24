import { Battle as ClientBattle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Protocol } from '@pkmn/protocol';
import { Dex, extractChannelMessages, type Battle } from '@pkmn/sim';
import { LogFormatter } from '@pkmn/view';

const gens = new Generations(Dex as any); // @pkmn/sim's Dex differs from @pkmn/dex only in types

// The p1 view of the protocol log as English lines. `||title||text||` is LogFormatter's tooltip markup; keep the text.
export function formatLog(battle: Battle): string[] {
  const tracker = new ClientBattle(gens);
  const formatter = new LogFormatter('p1', tracker);
  const out: string[] = [];
  for (const line of extractChannelMessages(battle.log.join('\n'), [1])[1]) {
    const { args, kwArgs } = Protocol.parseBattleLine(line);
    const text = formatter.formatText(args, kwArgs).replace(/\*\*/g, '').replace(/\|\|[^|]*\|\|([^|]*)\|\|/g, '$1');
    out.push(...text.split('\n').filter(l => l.trim()));
    tracker.add(args, kwArgs);
  }
  return out;
}

export type LogGroup = { turn: string; lines: string[] };

// Groups formatLog lines under "Start", "Turn 1", ... and drops the `== Turn N ==` lines.
// `[X's Ability]` and `(X lost N% of its health!)` lose their brackets.
export function groupLog(lines: string[]): LogGroup[] {
  const groups: LogGroup[] = [{ turn: 'Start', lines: [] }];
  for (const raw of lines) {
    const turn = raw.match(/^== (Turn \d+) ==$/);
    if (turn) groups.push({ turn: turn[1], lines: [] });
    else groups[groups.length - 1].lines.push(raw.trim().replace(/^[[(](.*)[\])]$/, '$1'));
  }
  return groups;
}
