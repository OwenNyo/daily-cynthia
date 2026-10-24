// Run with `npm run test:worker` (applies the local D1 migration first).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { seedFor } from '../src/game/daily';
import worker from '../worker/index';

let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let env: any;

beforeAll(async () => {
  proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc' });
  env = proxy.env;
});

afterAll(async () => {
  await proxy?.dispose();
});

// Not shared with tests/helpers.ts: that file needs the simulator and DOM types, and this test is typechecked with worker/tsconfig.json.
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const utcToday = () => new Date().toISOString().slice(0, 10);

function body(over: Record<string, unknown> = {}) {
  const date = (over.date as string) ?? utcToday();
  return {
    date,
    playerId: crypto.randomUUID(),
    name: 'Ash',
    won: true,
    fainted: 2,
    turns: 30,
    seed: seedFor(date, 1),
    lead: 0,
    choices: ['move 1', 'switch 2', 'move 3'],
    ...over,
  };
}

function post(b: unknown): Promise<Response> {
  const raw = typeof b === 'string' ? b : JSON.stringify(b);
  return worker.fetch(new Request('http://x/api/result', { method: 'POST', body: raw }), env);
}

function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`http://x${path}`), env);
}

const row = (date: string, playerId: string) =>
  env.DB.prepare('SELECT * FROM results WHERE date = ? AND player_id = ?').bind(date, playerId).first();

describe('POST /api/result', () => {
  it('valid result stored', async () => {
    const b = body();
    expect((await post(b)).status).toBe(204);
    const r = await row(b.date, b.playerId);
    expect({ won: r.won, fainted: r.fainted, turns: r.turns, name: r.name }).toEqual({ won: 1, fainted: 2, turns: 30, name: 'Ash' });
    expect(JSON.parse(r.log)).toEqual({ seed: b.seed, lead: b.lead, choices: b.choices });
  });

  it('empty name is accepted', async () => {
    expect((await post(body({ name: '' }))).status).toBe(204);
  });

  it('bad name', async () => {
    const { BLOCKLIST } = await import('../src/game/name');
    expect((await post(body({ name: BLOCKLIST[0].padEnd(3, 'x') }))).status).toBe(400);
  });

  it.each([
    ['won true with 6 fainted', { won: true, fainted: 6 }],
    ['won false with 2 fainted', { won: false, fainted: 2 }],
    ['fainted 7', { won: false, fainted: 7 }],
    ['turns 0', { turns: 0 }],
    ['turns 1001', { turns: 1001 }],
  ])('inconsistent result: %s gives 400', async (_, over) => {
    expect((await post(body(over))).status).toBe(400);
  });

  it('wrong seed', async () => {
    const date = utcToday();
    expect((await post(body({ seed: seedFor(date, 0) }))).status).toBe(400);
  });

  it.each([
    ['choice move 9', { choices: ['move 9'] }],
    ['lead 6', { lead: 6 }],
    ['1001 choices', { choices: Array(1001).fill('move 1') }],
    ['playerId not a UUID', { playerId: 'abc' }],
    ['won not a boolean', { won: 1 }],
  ])('malformed: %s gives 400', async (_, over) => {
    expect((await post(body(over))).status).toBe(400);
  });

  it('malformed: non-JSON body gives 400', async () => {
    expect((await post('{not json')).status).toBe(400);
  });

  it.each([-1, 1])('date window: UTC today %+d is accepted', async n => {
    expect((await post(body({ date: addDays(utcToday(), n) }))).status).toBe(204);
  });

  it.each([-2, 2])('date window: UTC today %+d is rejected', async n => {
    expect((await post(body({ date: addDays(utcToday(), n) }))).status).toBe(400);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-01-32', '2026-00-10'])('date window: impossible date %s is rejected', async date => {
    expect((await post(body({ date }))).status).toBe(400);
  });

  it('second submission ignored', async () => {
    const first = body();
    expect((await post(first)).status).toBe(204);
    const second = { ...first, fainted: 0, turns: 12, name: 'Brock', choices: ['move 2'] };
    expect((await post(second)).status).toBe(204);
    const r = await row(first.date, first.playerId);
    expect({ fainted: r.fainted, turns: r.turns, name: r.name }).toEqual({ fainted: 2, turns: 30, name: 'Ash' });
  });
});

async function seedRows(date: string, rows: { name?: string; won: number; fainted: number; turns: number }[]) {
  await env.DB.prepare('DELETE FROM results WHERE date = ?').bind(date).run();
  for (const r of rows) {
    await env.DB.prepare('INSERT INTO results (date, player_id, name, won, fainted, turns, log) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(date, crypto.randomUUID(), r.name ?? 'Ash', r.won, r.fainted, r.turns, '{}').run();
  }
}

describe('GET /api/stats/:date', () => {
  it('counts played and wins', async () => {
    await seedRows('2000-01-01', [{ won: 1, fainted: 0, turns: 10 }, { won: 1, fainted: 1, turns: 10 }, { won: 0, fainted: 6, turns: 10 }]);
    expect(await (await get('/api/stats/2000-01-01')).json()).toEqual({ played: 3, wins: 2 });
  });

  it.each(['2000-1-1', '2026-13-01'])('bad date %s gives 400', async date => {
    expect((await get(`/api/stats/${date}`)).status).toBe(400);
  });

  it('a date with no rows gives zeros', async () => {
    await seedRows('2000-01-02', []);
    expect(await (await get('/api/stats/2000-01-02')).json()).toEqual({ played: 0, wins: 0 });
  });
});

describe('GET /api/leaderboard/:date', () => {
  it('orders by fainted then turns', async () => {
    await seedRows('2000-02-01', [
      { won: 1, fainted: 2, turns: 30 }, { won: 1, fainted: 0, turns: 40 },
      { won: 1, fainted: 0, turns: 25 }, { won: 1, fainted: 5, turns: 10 },
    ]);
    const rows = await (await get('/api/leaderboard/2000-02-01')).json() as { turns: number }[];
    expect(rows.map(r => r.turns)).toEqual([25, 40, 30, 10]);
  });

  it('returns name, fainted and turns only', async () => {
    await seedRows('2000-02-02', [{ name: 'Ash', won: 1, fainted: 1, turns: 20 }]);
    expect(await (await get('/api/leaderboard/2000-02-02')).json()).toEqual([{ name: 'Ash', fainted: 1, turns: 20 }]);
  });

  it('winners only (D19)', async () => {
    await seedRows('2000-02-03', [{ won: 0, fainted: 6, turns: 5 }, { won: 1, fainted: 3, turns: 50 }]);
    const rows = await (await get('/api/leaderboard/2000-02-03')).json() as { turns: number }[];
    expect(rows.map(r => r.turns)).toEqual([50]);
  });

  it('empty name shows as Anonymous', async () => {
    await seedRows('2000-02-04', [{ name: '', won: 1, fainted: 0, turns: 10 }]);
    const rows = await (await get('/api/leaderboard/2000-02-04')).json() as { name: string }[];
    expect(rows[0].name).toBe('Anonymous');
  });

  it('limit 50', async () => {
    await seedRows('2000-02-05', Array.from({ length: 60 }, (_, i) => ({ won: 1, fainted: 0, turns: i + 1 })));
    expect(await (await get('/api/leaderboard/2000-02-05')).json()).toHaveLength(50);
  });
});
