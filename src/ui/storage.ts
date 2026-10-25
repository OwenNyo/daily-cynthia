import type { Summary } from '../game/battle';
import { validName } from '../game/name';
import type { History } from '../game/stats';

export type Result = Summary & { lead?: number; choices?: string[] }; // lead and choices are absent for days played before Watch again

export type Save = {
  playerId: string;
  name: string;
  history: History;
  results?: Record<string, Result>; // official summaries by date, so the result screen survives a reload
  current?: { date: string; lead: number; choices: string[] };
  music?: boolean;
};

export const KEY = 'daily-cynthia:v1';

export function load(store: Storage = localStorage): Save {
  const raw = store.getItem(KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (isSave(s)) return withValidResults(s);
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

const isFaints = (v: unknown) => Array.isArray(v) && v.length === 6 && v.every(f => typeof f === 'boolean');
const isSummary = (v: unknown): v is Summary =>
  isObject(v) && typeof v.won === 'boolean' && Number.isInteger(v.turns) && isFaints(v.p1Fainted) && isFaints(v.p2Fainted);

// Drops `results` entries the result screen could not show, and `results` itself when it is not an object.
function withValidResults(s: Save): Save {
  const { results, ...rest } = s;
  if (!isObject(results)) return rest;
  return { ...rest, results: Object.fromEntries(Object.entries(results).filter(([, r]) => isSummary(r))) };
}

export function save(s: Save, store: Storage = localStorage): void {
  store.setItem(KEY, JSON.stringify(s));
}

// Read-modify-write: another tab may have saved since this one loaded, so apply the change to the latest save.
export function update(change: (s: Save) => Save, store: Storage = localStorage): Save {
  const next = change(load(store));
  save(next, store);
  return next;
}

// `done` is absent when a resume fails and the attempt is recorded as a loss.
export function finishOfficial(s: Save, done?: Summary): Save {
  const { current, ...rest } = s;
  const date = current!.date;
  return {
    ...rest,
    history: { ...s.history, [date]: (done?.won ?? false) ? 'W' : 'L' },
    ...(done && { results: { ...s.results, [date]: { ...done, lead: current!.lead, choices: current!.choices } } }),
  };
}

// An empty input clears the name (Anonymous on the leaderboard). An invalid one keeps the saved name.
export function withName(s: Save, input: string): Save {
  const name = input.trim();
  return name === '' || validName(name) ? { ...s, name } : s;
}
