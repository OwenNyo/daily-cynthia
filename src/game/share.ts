import type { Summary } from './battle';
import { dayNumber } from './daily';

// The live site. index.html repeats it in the link preview tags, which cannot import it.
export const SITE_URL = 'https://daily-cynthia.owennyo.com';

export function shareText(date: string, s: Summary, url: string): string {
  return [
    `Daily Cynthia #${dayNumber(date)} ${s.won ? '✅' : '❌'} ${s.turns} turns`,
    s.p1Fainted.map(f => (f ? '🟥' : '🟩')).join(''),
    s.p2Fainted.map(f => (f ? '⬛' : '⬜')).join(''),
    url,
  ].join('\n');
}
