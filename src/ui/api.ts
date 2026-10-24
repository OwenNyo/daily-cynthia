export type ResultBody = {
  date: string; playerId: string; name: string; won: boolean; fainted: number; turns: number;
  seed: string; lead: number; choices: string[];
};
export type Stats = { played: number; wins: number };
export type LeaderRow = { name: string; fainted: number; turns: number };

async function ok(res: Promise<Response>): Promise<Response> {
  const r = await res;
  if (!r.ok) throw new Error(`${r.url} ${r.status}`);
  return r;
}

export async function postResult(body: ResultBody): Promise<void> {
  await ok(fetch('/api/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}

export async function getStats(date: string): Promise<Stats> {
  return (await ok(fetch(`/api/stats/${date}`))).json();
}

export async function getLeaderboard(date: string): Promise<LeaderRow[]> {
  return (await ok(fetch(`/api/leaderboard/${date}`))).json();
}
