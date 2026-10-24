import { dayNumber, seedFor } from '../src/game/daily';
import { validName } from '../src/game/name';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHOICE = /^(move [1-4]|switch [1-6])$/;

// Date.parse gives NaN for month 13 or day 32 (toISOString would throw); Feb 30 parses and fails the round trip.
const isDate = (d: unknown): d is string => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
};

const isInt = (n: unknown, min: number, max: number): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

// Input validation only; the result itself is client-reported and not replayed (spec D29, R1).
function validResult(b: any): boolean {
  const utcToday = new Date().toISOString().slice(0, 10);
  return typeof b === 'object' && b !== null &&
    isDate(b.date) && Math.abs(dayNumber(b.date) - dayNumber(utcToday)) <= 1 &&
    typeof b.playerId === 'string' && UUID.test(b.playerId) &&
    typeof b.name === 'string' && (b.name === '' || validName(b.name)) &&
    typeof b.won === 'boolean' && isInt(b.fainted, 0, 6) && b.won === (b.fainted < 6) &&
    isInt(b.turns, 1, 1000) && b.seed === seedFor(b.date, 1) && isInt(b.lead, 0, 5) &&
    Array.isArray(b.choices) && b.choices.length <= 1000 && b.choices.every((c: unknown) => typeof c === 'string' && CHOICE.test(c));
}

async function postResult(request: Request, env: Env): Promise<Response> {
  let b: any;
  try {
    b = await request.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  if (!validResult(b)) return new Response('bad result', { status: 400 });
  await env.DB.prepare('INSERT OR IGNORE INTO results (date, player_id, name, won, fainted, turns, log) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(b.date, b.playerId, b.name.trim(), b.won ? 1 : 0, b.fainted, b.turns, JSON.stringify({ seed: b.seed, lead: b.lead, choices: b.choices }))
    .run();
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/result' && request.method === 'POST') return postResult(request, env);

    const [, route, date] = pathname.match(/^\/api\/(stats|leaderboard)\/([^/]+)$/) ?? [];
    if (route && request.method === 'GET') {
      if (!isDate(date)) return new Response('bad date', { status: 400 });
      if (route === 'stats') {
        const row = await env.DB.prepare('SELECT COUNT(*) AS played, COALESCE(SUM(won), 0) AS wins FROM results WHERE date = ?')
          .bind(date).first<{ played: number; wins: number }>();
        return Response.json({ played: row!.played, wins: row!.wins });
      }
      const { results } = await env.DB.prepare(
        "SELECT COALESCE(NULLIF(name, ''), 'Anonymous') AS name, fainted, turns FROM results WHERE date = ? AND won = 1 ORDER BY fainted, turns, created_at LIMIT 50",
      ).bind(date).all();
      return Response.json(results);
    }
    return env.ASSETS.fetch(request);
  },
};
