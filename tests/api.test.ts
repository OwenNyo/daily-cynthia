import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLeaderboard, getStats, postResult } from '../src/ui/api';

const BODY = {
  date: '2026-10-25', playerId: '11111111-2222-4333-8444-555555555555', name: 'Ash',
  won: true, fainted: 2, turns: 30, seed: '2026,10,25,1', lead: 0, choices: ['move 1'],
};

function stubFetch(status: number, json?: unknown) {
  const fetch = vi.fn(async () => new Response(json === undefined ? null : JSON.stringify(json), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('postResult posts the body as JSON to /api/result', async () => {
    const fetch = stubFetch(204);
    await postResult(BODY);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toMatch(/\/api\/result$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(BODY);
  });

  it('postResult throws on non-2xx', async () => {
    stubFetch(400);
    await expect(postResult(BODY)).rejects.toThrow();
  });

  it('getStats returns the parsed stats', async () => {
    const fetch = stubFetch(200, { played: 10, wins: 4 });
    expect(await getStats('2026-10-25')).toEqual({ played: 10, wins: 4 });
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/stats\/2026-10-25$/);
  });

  it('getStats throws on non-2xx', async () => {
    stubFetch(500);
    await expect(getStats('2026-10-25')).rejects.toThrow();
  });

  it('getLeaderboard returns the parsed rows', async () => {
    const rows = [{ name: 'Ash', fainted: 0, turns: 20 }];
    const fetch = stubFetch(200, rows);
    expect(await getLeaderboard('2026-10-25')).toEqual(rows);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/leaderboard\/2026-10-25$/);
  });

  it('getLeaderboard throws on non-2xx', async () => {
    stubFetch(503);
    await expect(getLeaderboard('2026-10-25')).rejects.toThrow();
  });
});
