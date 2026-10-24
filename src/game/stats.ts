export type History = Record<string, 'W' | 'L'>;

function prevDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export function computeStats(history: History, today: string): { played: number; winPct: number; winStreak: number; dayStreak: number } {
  const results = Object.values(history);
  const played = results.length;
  const wins = results.filter(r => r === 'W').length;
  let day = history[today] ? today : prevDay(today);
  let dayStreak = 0;
  let winStreak = 0;
  let winning = true;
  for (; history[day]; day = prevDay(day)) {
    dayStreak++;
    winning &&= history[day] === 'W';
    if (winning) winStreak++;
  }
  return { played, winPct: played ? Math.round(wins / played * 100) : 0, winStreak, dayStreak };
}
