// ponytail: placeholder until the first public day is known (spec A8, D30).
export const LAUNCH_DATE = '2026-10-25';

export function localDate(now: Date): string {
  return now.toLocaleDateString('en-CA');
}

const parts = (date: string) => date.split('-').map(Number);

export function seedFor(date: string, salt: 0 | 1): string {
  return [...parts(date), salt].join(',');
}

const utcDays = (date: string) => {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export function dayNumber(date: string): number {
  return utcDays(date) - utcDays(LAUNCH_DATE) + 1;
}
