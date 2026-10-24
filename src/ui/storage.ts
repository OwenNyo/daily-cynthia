import type { Summary } from '../game/battle';
import { validName } from '../game/name';
import type { History } from '../game/stats';

export type Save = {
  playerId: string;
  name: string;
  history: History;
  results?: Record<string, Summary>; // official summaries by date, so the result screen survives a reload
  current?: { date: string; lead: number; choices: string[] };
  music?: boolean;
};

export const KEY = 'daily-cynthia:v1';

export function load(store: Storage = localStorage): Save {
  const raw = store.getItem(KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (isSave(s)) return s;
    } catch {
      // Unparseable save: start fresh (spec "Storage").
    }
  }
  const fresh: Save = { playerId: crypto.randomUUID(), name: '', history: {} };
  save(fresh, store);
  return fresh;
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Only the fields the app reads without further checks. A save with the wrong shape starts fresh, like an unparseable one.
function isSave(v: unknown): v is Save {
  if (!isObject(v) || typeof v.playerId !== 'string' || typeof v.name !== 'string' || !isObject(v.history)) return false;
  const c = v.current;
  return c === undefined || (isObject(c) && typeof c.date === 'string' && Number.isInteger(c.lead) && Array.isArray(c.choices));
}

export function save(s: Save, store: Storage = localStorage): void {
  store.setItem(KEY, JSON.stringify(s));
}

// `done` is absent when a resume fails and the attempt is recorded as a loss.
export function finishOfficial(s: Save, won: boolean, done?: Summary): Save {
  const { current, ...rest } = s;
  const date = current!.date;
  return {
    ...rest,
    history: { ...s.history, [date]: won ? 'W' : 'L' },
    ...(done && { results: { ...s.results, [date]: done } }),
  };
}

// An empty input clears the name (Anonymous on the leaderboard). An invalid one keeps the saved name.
export function withName(s: Save, input: string): Save {
  const name = input.trim();
  return name === '' || validName(name) ? { ...s, name } : s;
}
