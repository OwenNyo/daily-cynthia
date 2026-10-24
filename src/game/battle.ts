import { Battle, type PokemonSet, type Side } from '@pkmn/sim';
import { chooseOpponent } from './ai';
import { CYNTHIA } from './cynthia';

export const FORMAT = 'gen4customgame@@@Sleep Clause Mod';

export type Summary = { won: boolean; turns: number; p1Fainted: boolean[]; p2Fainted: boolean[] };

// Answers every pending Cynthia request with the AI.
function answerOpponent(battle: Battle): void {
  while (battle.p2.activeRequest && !battle.p2.activeRequest.wait && !battle.p2.isChoiceDone()) {
    battle.choose('p2', chooseOpponent(battle));
  }
}

export function createBattle(seed: string, team: PokemonSet[], lead: number): Battle {
  const battle = new Battle({ formatid: FORMAT as any, seed: seed as any });
  battle.setPlayer('p1', { name: 'You', team: [team[lead], ...team.filter((_, i) => i !== lead)] });
  battle.setPlayer('p2', { name: 'Cynthia', team: CYNTHIA });
  answerOpponent(battle);
  return battle;
}

export function submit(battle: Battle, choice: string): void {
  if (!battle.choose('p1', choice)) throw new Error('invalid choice');
  answerOpponent(battle);
}

export function replay(seed: string, team: PokemonSet[], lead: number, choices: string[]): Battle {
  const battle = createBattle(seed, team, lead);
  for (const c of choices) submit(battle, c);
  return battle;
}

export function p1Pending(battle: Battle): 'move' | 'switch' | 'wait' | 'ended' {
  if (battle.ended) return 'ended';
  const req = battle.p1.activeRequest;
  if (!req || req.wait || battle.p1.isChoiceDone()) return 'wait';
  return req.forceSwitch ? 'switch' : 'move';
}

// side.team keeps the order the team was sent in; side.pokemon is reordered by switches.
const fainted = (side: Side) => side.team.map(set => side.pokemon.find(p => p.set === set)!.fainted);

export function summary(battle: Battle): Summary {
  return { won: battle.winner === 'You', turns: battle.turn, p1Fainted: fainted(battle.p1), p2Fainted: fainted(battle.p2) };
}
