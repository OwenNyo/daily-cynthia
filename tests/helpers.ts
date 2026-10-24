import type { PokemonSet } from '@pkmn/sim';
import { createBattle, p1Pending, submit } from '../src/game/battle';

// Plays a battle to the end: first enabled move when moving, first alive bench slot when switching.
export function autoPlay(seed: string, team: PokemonSet[], lead: number, maxChoices = 1000): string[] {
  const b = createBattle(seed, team, lead);
  const choices: string[] = [];
  while (!b.ended) {
    if (choices.length >= maxChoices) throw new Error(`autoPlay: over ${maxChoices} choices`);
    const pending = p1Pending(b);
    const req = b.p1.activeRequest as any;
    let choice: string;
    if (pending === 'move') {
      const i = req.active[0].moves.findIndex((m: any) => !m.disabled);
      choice = `move ${i + 1}`;
    } else if (pending === 'switch') {
      const i = req.side.pokemon.findIndex((p: any) => !p.active && !p.condition.endsWith(' fnt'));
      choice = `switch ${i + 1}`;
    } else {
      throw new Error(`autoPlay: unexpected pending state ${pending}`);
    }
    submit(b, choice);
    choices.push(choice);
  }
  return choices;
}

// The sim writes `|t:|<unix seconds>` lines, so two runs of the same battle differ when they straddle a second.
export const withoutTimes = (log: string[]) => log.filter(l => !l.startsWith('|t:|'));

// In-memory localStorage stand-in.
export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: k => void m.delete(k),
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
