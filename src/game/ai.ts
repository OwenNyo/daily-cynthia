import { Dex, type Battle, type Pokemon as SimPokemon } from '@pkmn/sim';
import { damagePct, fromSim, slotMoveId } from './calc';

const dex = Dex.forGen(4);
const hpPct = (p: SimPokemon) => p.hp / p.maxhp * 100;

// Expected damage per turn as % of the target's max HP (spec "Opponent AI", D22).
function expected(attacker: SimPokemon, target: SimPokemon, moveId: string): number {
  const move = dex.moves.get(moveId);
  const [min, max] = damagePct(fromSim(attacker), fromSim(target), moveId);
  const acc = move.accuracy === true ? 100 : move.accuracy;
  const dmg = Math.min((min + max) / 2 * acc / 100, hpPct(target));
  return move.self?.volatileStatus === 'mustrecharge' ? dmg / 2 : dmg;
}

// Highest expected damage; ties go to the lower slot.
function bestMove(attacker: SimPokemon, target: SimPokemon): { id: string; dmg: number } {
  let best = { id: '', dmg: -1 };
  for (const slot of attacker.moveSlots) {
    const id = slotMoveId(attacker, slot.id);
    const dmg = expected(attacker, target, id);
    if (dmg > best.dmg) best = { id, dmg };
  }
  return best;
}

export function chooseOpponent(battle: Battle): string {
  const req = battle.p2.activeRequest as any;
  const me = battle.p2.active[0];
  const foe = battle.p1.active[0];
  const bench = battle.p2.pokemon.map((p, i) => ({ p, slot: i + 1 })).filter(({ p }) => !p.fainted && !p.isActive);

  if (req?.forceSwitch) {
    let pick = bench[0];
    for (const b of bench) if (bestMove(b.p, foe).dmg > bestMove(pick.p, foe).dmg) pick = b;
    return `switch ${pick.slot}`;
  }
  if (!req?.active) return 'default';

  const theirs = bestMove(foe, me);
  const ours = bestMove(me, foe);
  if (me.activeMoveActions > 0 && !req.active[0].trapped && bench.length &&
      damagePct(fromSim(foe), fromSim(me), theirs.id)[1] >= hpPct(me) &&
      damagePct(fromSim(me), fromSim(foe), ours.id)[0] < hpPct(foe) &&
      foe.getStat('spe') > me.getStat('spe')) {
    const taken = bench.map(b => ({ ...b, max: damagePct(fromSim(foe), fromSim(b.p), theirs.id)[1] }));
    let pick = taken[0];
    for (const t of taken) if (t.max < pick.max) pick = t;
    if (pick.max < 50) return `switch ${pick.slot}`;
  }

  let choice = '';
  let first = '';
  let best = { dmg: -1, priority: 0 };
  (req.active[0].moves as { id: string; disabled?: boolean }[]).forEach((m, i) => {
    if (m.disabled) return;
    first ||= `move ${i + 1}`;
    const id = slotMoveId(me, m.id);
    const dmg = expected(me, foe, id);
    const priority = dex.moves.get(id).priority;
    if (dmg > best.dmg || (dmg === best.dmg && priority > best.priority)) {
      best = { dmg, priority };
      choice = `move ${i + 1}`;
    }
  });
  // All zero: first enabled move. None enabled: default.
  return best.dmg > 0 ? choice : first || 'default';
}
