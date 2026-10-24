import type { Summary } from './battle';
import { dayNumber } from './daily';

export function shareText(date: string, s: Summary, url: string): string {
  return [
    `Daily Cynthia #${dayNumber(date)} ${s.won ? '✅' : '❌'} ${s.turns} turns`,
    s.p1Fainted.map(f => (f ? '🟥' : '🟩')).join(''),
    s.p2Fainted.map(f => (f ? '⬛' : '⬜')).join(''),
    url,
  ].join('\n');
}
