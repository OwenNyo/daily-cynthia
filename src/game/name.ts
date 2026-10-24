// ponytail: short substring blocklist; a moderation service if abuse appears. Words chosen to avoid hitting common names (no "ass", "cock", "rape").
export const BLOCKLIST: readonly string[] = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'pussy',
  'bastard', 'wanker', 'twat', 'rapist', 'nazi', 'hitler', 'kike', 'chink', 'tranny', 'dyke', 'porn',
];

export function validName(name: string): boolean {
  const n = name.trim();
  if (n.length < 3 || n.length > 16 || !/^[A-Za-z0-9 _-]+$/.test(n)) return false;
  const squashed = n.toLowerCase().replace(/[ _-]/g, '');
  return !BLOCKLIST.some(w => squashed.includes(w));
}
