import type { Battle as ClientBattle, Pokemon as ClientPokemon } from '@pkmn/client';
import { Dex, PRNG, type Battle, type PokemonSet } from '@pkmn/sim';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createBattle, p1Pending, replay, submit, summary, type Summary } from '../game/battle';
import { damagePct, fromSim, slotMoveId, toCalc } from '../game/calc';
import { CYNTHIA } from '../game/cynthia';
import { dayNumber, localDate, seedFor } from '../game/daily';
import { validName } from '../game/name';
import { shareText, SITE_URL } from '../game/share';
import { computeStats } from '../game/stats';
import { dailyTeam } from '../game/teams';
import { getLeaderboard, getStats, postResult, type LeaderRow, type ResultBody, type Stats } from './api';
import { clientBattle, groupLog, logSteps, p1Lines, TURN, type LogGroup } from './log';
import { spritePath } from './sprites';
import { finishOfficial, KEY, load, save, update, withName, type Save } from './storage';

const dex = Dex.forGen(4);
type CalcMon = ReturnType<typeof toCalc>;

const moveName = (id: string) => {
  const m = dex.moves.get(id);
  return m.id.startsWith('hiddenpower') ? `Hidden Power ${m.type}` : m.name;
};

// Damage label for a move: status moves say "Status", immune hits say "No effect", others a whole-number range.
function dmgLabel(id: string, [min, max]: [number, number]): string {
  if (dex.moves.get(id).category === 'Status') return 'Status';
  if (max === 0) return 'No effect';
  return `${Math.round(min)}-${Math.round(max)}%`;
}

// Highest max % among the attacker's moves. ai.ts has its own pick (expected damage with accuracy and recharge);
// this one shows the hardest possible hit, which is what the damage previews describe.
function bestHit(attacker: CalcMon, defender: CalcMon, moves: string[]): { move: string; range: [number, number] } {
  let best = { move: moves[0], range: [0, 0] as [number, number] };
  for (const m of moves) {
    const r = damagePct(attacker, defender, m);
    if (r[1] > best.range[1]) best = { move: m, range: r };
  }
  return best;
}

// Gen 4 type colours: background and text. From the mockup's table, plus the five types it did not use.
const TYPE: Record<string, [string, string]> = {
  Normal: ['#A8A878', '#1D1B2B'], Fire: ['#F08030', '#1D1B2B'], Water: ['#6890F0', '#1D1B2B'], Electric: ['#F8D030', '#1D1B2B'],
  Grass: ['#78C850', '#1D1B2B'], Ice: ['#98D8D8', '#1D1B2B'], Fighting: ['#C03028', '#FFFFFF'], Poison: ['#A040A0', '#FFFFFF'],
  Ground: ['#E0C068', '#1D1B2B'], Flying: ['#A890F0', '#1D1B2B'], Psychic: ['#F85888', '#1D1B2B'], Bug: ['#A8B820', '#1D1B2B'],
  Rock: ['#B8A038', '#1D1B2B'], Ghost: ['#705898', '#FFFFFF'], Dragon: ['#7038F8', '#FFFFFF'], Dark: ['#705848', '#FFFFFF'],
  Steel: ['#B8B8D0', '#1D1B2B'], '???': ['#68A090', '#1D1B2B'],
};
// The recharge turn's pseudo-move "recharge" has no type; it gets the '???' colours.
export const typeStyle = (t: string) => {
  const [bg, fg] = TYPE[t] ?? TYPE['???'];
  return `--t:${bg};--tf:${fg}`;
};

const STATUS: Record<string, string> = {
  brn: 'Burned', par: 'Paralyzed', slp: 'Asleep', frz: 'Frozen', psn: 'Poisoned', tox: 'Badly poisoned',
};

// Battle state shown as chips on the DS, in this order. Keys are @pkmn/client ids.
const BOOSTS: Record<string, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
const VOLATILES: Record<string, string> = { confusion: 'Confused', substitute: 'Substitute', leechseed: 'Leech Seed', taunt: 'Taunt', encore: 'Encore' };
const SIDE: Record<string, string> = {
  stealthrock: 'Stealth Rock', spikes: 'Spikes', toxicspikes: 'Toxic Spikes', reflect: 'Reflect', lightscreen: 'Light Screen',
  safeguard: 'Safeguard', tailwind: 'Tailwind', mist: 'Mist', luckychant: 'Lucky Chant',
};
const WEATHER: Record<string, string> = { Sand: 'Sandstorm', Sun: 'Sun', Rain: 'Rain', Hail: 'Hail' };
const PSEUDO: Record<string, string> = { trickroom: 'Trick Room', gravity: 'Gravity' };

// What the DS shows of the battle state. `p1`/`p2`: the active Pokemon's stat changes, then its volatile states, as
// chips in its HP box. `field`: one line for the strip above the top screen, e.g.
// "Rain. Her side: Spikes x1, Toxic Spikes x1. Your side: Reflect", or '' when there is nothing.
export function chipLabels(view: ClientBattle): { field: string; p1: string[]; p2: string[] } {
  const mon = (s: ClientBattle['p1']) => {
    const p = onField(s);
    const out: string[] = [];
    for (const [k, label] of Object.entries(BOOSTS)) {
      const n = (p?.boosts as Record<string, number> | undefined)?.[k];
      if (n) out.push(`${label} ${n > 0 ? '+' : ''}${n}`);
    }
    for (const [k, label] of Object.entries(VOLATILES)) if (p?.volatiles[k]) out.push(label);
    return out;
  };
  const side = (s: ClientBattle['p1']) => Object.entries(SIDE).filter(([k]) => s.sideConditions[k])
    .map(([k, label]) => (k === 'spikes' || k === 'toxicspikes' ? `${label} x${s.sideConditions[k].level}` : label)).join(', ');
  const global = [
    ...(view.field.weather && WEATHER[view.field.weather] ? [WEATHER[view.field.weather]] : []),
    ...Object.entries(PSEUDO).filter(([k]) => view.field.pseudoWeather[k]).map(([, label]) => label),
  ].join(', ');
  const [her, mine] = [side(view.p2), side(view.p1)];
  const field = [global, her && `Her side: ${her}`, mine && `Your side: ${mine}`].filter(Boolean).join('. ');
  return { field, p1: mon(view.p1), p2: mon(view.p2) };
}

// What a click, Enter or Space on a move card does. Unusable moves stay focusable so info mode can show them.
export const moveAction = (infoMode: boolean, unusable: boolean): 'info' | 'use' | null =>
  infoMode ? 'info' : unusable ? null : 'use';

// A move's category, power and accuracy, for the info line and Cynthia's move list.
export function moveStats(id: string): string {
  const m = dex.moves.get(id);
  // Moves like Grass Knot or Mirror Coat work out their damage in battle, so the dex gives them 0 power.
  const power = m.category === 'Status' ? '-' : m.basePower ? m.basePower : 'varies';
  return [m.category, `Power ${power}`, m.accuracy === true ? 'Always hits' : `Accuracy ${m.accuracy}%`].join(' · ');
}
// "Ability: what it does. Item: what it does." for titles and screen readers.
const abilityInfo = (a: string) => `${a}: ${dex.abilities.get(a).shortDesc}`;
const itemInfo = (i: string) => `${i}: ${dex.items.get(i).shortDesc}`;
const heldInfo = (ability: string, item: string) => [abilityInfo(ability), ...(item ? [itemInfo(item)] : [])].join(' ');

// Hidden Power's typed variants have no short description.
export const moveInfo = (id: string) => [moveStats(id), dex.moves.get(id).shortDesc].filter(Boolean).join(' · ');

const hpColor = (pct: number) => (pct < 20 ? 'var(--hp-red)' : pct < 50 ? 'var(--hp-yellow)' : 'var(--hp-green)');

type Live = { battle: Battle; official: boolean; done?: Summary };

const resultBody = (s: Save, done: Summary): ResultBody => {
  const { date, lead, choices } = s.current!;
  return {
    date, playerId: s.playerId, name: s.name, won: done.won, fainted: done.p1Fainted.filter(Boolean).length,
    turns: done.turns, seed: seedFor(date, 1), lead, choices,
  };
};

// An official battle in progress is rebuilt from its saved choices. If that fails, it counts as a loss (spec A9).
// If the rebuilt battle has already ended (the tab closed before the result was saved), the result is recorded now
// and `post` is the body to send. A battle from an earlier day also resumes: the page keeps that day until it ends,
// then "Back to home" reloads today.
export function resume(s: Save): { s: Save; live: Live | null; post?: ResultBody } {
  if (!s.current) return { s, live: null };
  const { date, lead, choices } = s.current;
  let battle: Battle;
  try {
    battle = replay(seedFor(date, 1), dailyTeam(date), lead, choices);
  } catch (e) {
    console.error('resume failed, recording a loss', e);
    return { s: finishOfficial(s), live: null };
  }
  if (!battle.ended) return { s, live: { battle, official: true } };
  const done = summary(battle);
  return { s: finishOfficial(s, done), live: { battle, official: true, done }, post: resultBody(s, done) };
}

// Another tab has played or finished this official battle since this tab last saved it.
export const staleOfficial = (mine: Save, latest: Save) => JSON.stringify(mine.current) !== JSON.stringify(latest.current);

const isToday = (date: string) => localDate(new Date()) === date;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Own component so the per-second tick does not re-render the battle.
function Countdown({ date, busy }: { date: string; busy: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const stale = localDate(now) !== date;
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const secs = Math.floor((next.getTime() - now.getTime()) / 1000);
  const hms = [secs / 3600, (secs % 3600) / 60, secs % 60].map(n => String(Math.floor(n)).padStart(2, '0')).join(':');
  return (
    <div class="poketch countdown">
      <p class="lcd">
        <span class="no">No. {dayNumber(date)}</span>
        {stale
          ? <span class="small">{busy ? "Finish this battle to get today's team." : 'A new team is ready. Reload the page.'}</span>
          : <><time class="hms">{hms}</time><span class="small">to next team</span></>}
      </p>
    </div>
  );
}

function MusicToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" class="music" aria-pressed={on} onClick={onToggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {on
          ? <path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          : <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />}
      </svg>
      Music
    </button>
  );
}

// What the bottom screen offers. Kept from before a choice so it stays on screen, locked, while the turn plays.
type MoveItem = { id: string; pp?: string; label?: string; disabled: boolean };
type Menu = { kind: 'moves'; moves: MoveItem[]; trapped: boolean } | { kind: 'switch'; forced: boolean } | { kind: 'wait' };

// A Choice item disables every move but the locked one; say so, or the screen looks stuck.
export function movesPrompt(name: string, moves: { id: string; disabled: boolean }[], item?: string): string {
  const open = moves.filter(m => !m.disabled);
  if (item?.startsWith('choice') && open.length === 1 && moves.length > 1) {
    return `${name} is locked into ${Dex.forGen(4).moves.get(open[0].id).name}.`;
  }
  return `What will ${name} do?`;
}

function menuOf(battle: Battle, switching: boolean): Menu {
  const pending = p1Pending(battle);
  if (pending === 'switch' || (pending === 'move' && switching)) return { kind: 'switch', forced: pending === 'switch' };
  if (pending !== 'move') return { kind: 'wait' };
  const mine = battle.p1.active[0];
  const foe = battle.p2.active[0];
  const req = battle.p1.activeRequest as any;
  const moves = (req.active[0].moves as { id: string; pp?: number; maxpp?: number; disabled?: boolean }[]).map(m => {
    const id = slotMoveId(mine, m.id);
    return {
      id, disabled: !!m.disabled,
      pp: m.maxpp !== undefined ? `${m.pp}/${m.maxpp}` : undefined,
      label: id === 'recharge' ? undefined : dmgLabel(id, damagePct(fromSim(mine), fromSim(foe), id)),
    };
  });
  return { kind: 'moves', moves, trapped: !!req.active[0].trapped };
}

type Hit = { foe: boolean; mine: boolean; step: number };

// Turn playback: `shown` is how many log steps are on screen; `menu` is the bottom screen from before the choice.
type Playback = { shown: number; menu: Menu };

// One more message; a turn header comes along with the message after it. null means the whole log is shown.
function advance(steps: { text: string }[], shown: number): number | null {
  let n = shown + 1;
  while (n < steps.length && TURN.test(steps[n - 1].text)) n++;
  return n >= steps.length ? null : n;
}

export function App() {
  const [init] = useState(() => {
    const loaded = load();
    const r = resume(loaded);
    if (r.s !== loaded) save(r.s);
    // The page keeps the date it loaded with, or the start date of a resumed official battle.
    return { ...r, date: r.live ? loaded.current!.date : localDate(new Date()), lead: r.live ? loaded.current!.lead : 0 };
  });
  const [store, setStore] = useState<Save>(init.s);
  const [live, setLive] = useState<Live | null>(init.live);
  const [date] = useState(init.date);
  const [team] = useState(() => dailyTeam(date));
  const [lead, setLead] = useState(init.lead);
  const [nameInput, setNameInput] = useState(init.s.name);
  const [global, setGlobal] = useState<Stats | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [switching, setSwitching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [play, setPlay] = useState<Playback | null>(null);
  const [audio] = useState(() => {
    const a = new Audio();
    a.preload = 'none'; // nothing downloads until the player turns music on
    a.loop = true;
    a.src = '/audio/battle-champion.mp3';
    return a;
  });

  // Every save is a read-modify-write on the latest stored save, so two open tabs do not overwrite each other.
  const persist = (change: (s: Save) => Save) => {
    const s = update(change);
    setStore(s);
    return s;
  };

  const refreshApi = () => {
    getStats(date).then(setGlobal, e => { console.error(e); setGlobal(null); });
    getLeaderboard(date).then(setBoard, e => { console.error(e); setBoard(null); });
  };
  useEffect(refreshApi, [date]);
  useEffect(() => { if (init.post) postResult(init.post).then(refreshApi, console.error); }, []);

  const inBattle = live !== null && !live.done;

  // Another tab saved: pick up its state unless a battle is running here.
  useEffect(() => {
    if (inBattle) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const s = load();
      setStore(s);
      setNameInput(s.name);
    };
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, [inBattle]);

  const musicOn = store.music === true;
  useEffect(() => {
    if (!musicOn || !inBattle) { audio.pause(); return; }
    // After a reload the browser blocks play() until the player interacts with the page, so retry on the first input.
    const retry = () => { audio.play().catch(e => console.error('music did not start', e)); };
    audio.play().catch(e => {
      console.error('music blocked until the first click or key press', e);
      addEventListener('click', retry, { once: true });
      addEventListener('keydown', retry, { once: true });
    });
    return () => { removeEventListener('click', retry); removeEventListener('keydown', retry); };
  }, [musicOn, inBattle]);

  const lines = useMemo(() => (live ? p1Lines(live.battle) : []), [live, live?.battle.log.length]);
  const steps = useMemo(() => logSteps(lines), [lines]);
  const shown = play?.shown ?? steps.length;
  const view = useMemo(() => clientBattle(lines.slice(0, play ? steps[play.shown - 1].end : lines.length)), [lines, play]);

  useEffect(() => {
    if (!play) return;
    const t = setTimeout(() => {
      const n = advance(steps, play.shown);
      setPlay(n === null ? null : { ...play, shown: n });
    }, 700);
    return () => clearTimeout(t);
  }, [play, steps]);

  const start = (official: boolean) => {
    // A page left open past midnight must not start yesterday's official battle.
    if (official && !isToday(date)) { location.reload(); return; }
    if (official) {
      // Another tab may have played or started today's battle since this one loaded.
      const latest = load();
      if (latest.history[date] !== undefined || latest.current?.date === date) { setStore(latest); return; }
      const s = { ...latest, current: { date, lead, choices: [] } };
      save(s);
      setStore(s);
    }
    const seed = official ? seedFor(date, 1) : PRNG.generateSeed();
    setSwitching(false);
    setCopied(false);
    setPlay(null);
    setLive({ battle: createBattle(seed, team, lead), official });
  };

  const home = () => {
    if (!isToday(date)) { location.reload(); return; }
    setStore(load());
    setPlay(null);
    setLive(null);
  };

  const choose = (choice: string) => {
    if (!live || play) return;
    // Reload to resume from the other tab's save instead of mixing two move lists.
    if (live.official && staleOfficial(store, load())) { location.reload(); return; }
    const menu = menuOf(live.battle, switching);
    const from = steps.length;
    submit(live.battle, choice);
    setSwitching(false);
    let s = store;
    if (live.official) s = persist(s => ({ ...s, current: { ...s.current!, choices: [...s.current!.choices, choice] } }));
    if (!reducedMotion()) {
      const n = advance(logSteps(p1Lines(live.battle)), from);
      setPlay(n === null ? null : { shown: n, menu });
    }
    if (live.battle.ended) {
      const done = summary(live.battle);
      if (live.official) {
        const body = resultBody(s, done);
        persist(s => finishOfficial(s, done));
        postResult(body).then(refreshApi, console.error);
      }
      setLive({ ...live, done });
    } else {
      setLive({ ...live });
    }
  };

  const onName = (v: string) => {
    setNameInput(v);
    if (withName(store, v) !== store) persist(s => withName(s, v));
  };

  const stats = computeStats(store.history, date);
  const playedToday = store.history[date] !== undefined;
  const openElsewhere = !live && store.current?.date === date;
  const todayResult = store.results?.[date];
  const groups = live ? groupLog(steps.slice(0, shown).map(s => s.text)) : [];
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => setCopied(true), console.error);
  const nameOk = nameInput.trim() === '' || validName(nameInput);
  const members = live ? party(view, live.battle, team) : [];
  // Which side took damage in the step on screen, for the flash.
  let hit: Hit | undefined;
  if (play) {
    const added = lines.slice(play.shown > 1 ? steps[play.shown - 2].end : 0, steps[play.shown - 1].end);
    hit = { foe: added.some(l => l.startsWith('|-damage|p2a')), mine: added.some(l => l.startsWith('|-damage|p1a')), step: play.shown };
  }

  return (
    <>
      <header class="site-header">
        <div class="brand">
          <span class="logo-mark" aria-hidden="true" />
          <div>
            <h1 class="logo">Daily Cynthia</h1>
            <p class="tagline">Today's six against the Sinnoh Champion. One official battle a day.</p>
          </div>
        </div>
        {live && (
          <p class="battle-meta">
            <span class={`badge ${live.official ? 'official' : 'practice'}`}>{live.official ? 'Official battle' : 'Practice'}</span>
            <span class="turn">Turn {view.turn}</span>
          </p>
        )}
        <nav class="links">
          <a href="#how">How to play</a>
          <a href="#faq">FAQ</a>
        </nav>
        <MusicToggle on={musicOn} onToggle={() => persist(s => ({ ...s, music: !musicOn }))} />
        <Countdown date={date} busy={inBattle && live!.official} />
      </header>

      <main>
        {/* Party first in the source so keyboard users reach "Set as lead" before "Battle Cynthia"; on phones CSS puts the DS first. */}
        <div class="top">
          <div class="col-left">
            {!live && !playedToday && (
              <div class="intro">
                <h2>Six Pokemon you didn't choose. One Champion who never changes.</h2>
                <p>Everyone gets this same team today. Pick a lead, read her team, and take your one official shot before midnight.</p>
              </div>
            )}
            {live ? (
              <>
                <BattleParty members={members} canSwitch={!play && !live.done && p1Pending(live.battle) !== 'wait' && !(live.battle.p1.activeRequest as any)?.active?.[0]?.trapped} onChoose={choose} />
                <BattleLog groups={groups} waiting={!play && !live.done && p1Pending(live.battle) === 'move' ? `What will ${onField(view.p1).species.name} do?` : null} />
              </>
            ) : <PartyPanel team={team} lead={lead} onLead={setLead} />}
          </div>

          <section class="col-right" aria-label="Battle">
            {live ? (
              <BattleView live={live} view={view} hit={hit} play={play} members={members} switching={switching}
                onSwitching={setSwitching} onChoose={choose} onSkip={() => setPlay(null)}
                share={live.done && live.official ? shareText(date, live.done, SITE_URL) : null}
                copied={copied} onCopy={copy} onPractice={() => start(false)} onHome={home} groups={groups} />
            ) : (
              <>
                <Ds
                  foe={fromSet(CYNTHIA[0])} mine={fromSet(team[lead])}
                  herFainted={CYNTHIA.map(() => false)}
                  msg={playedToday ? "Today's battle is done. Come back tomorrow." : 'Cynthia sent out Spiritomb! Pick your lead, then battle.'}
                  bottom={todayResult
                    ? <Result s={todayResult} share={shareText(date, todayResult, SITE_URL)} copied={copied} onCopy={copy} />
                    : playedToday
                      ? <p class="screen-note">Today's official battle is done: you {store.history[date] === 'W' ? 'won' : 'lost'}.</p>
                      : <MovePreview set={team[lead]} />}
                />
                <div class="actions">
                  {!playedToday && !openElsewhere && <button type="button" class="primary" onClick={() => start(true)}>Battle Cynthia</button>}
                  <button type="button" class="secondary" onClick={() => start(false)}>Practice</button>
                </div>
                <p class="hint">
                  {playedToday
                    ? "Today's official battle is done. A new team unlocks at midnight."
                    : openElsewhere
                      ? 'Your official battle is open in another tab. Reload this page to continue it here.'
                      : 'Your official battle is still open today.'}
                  {' '}Practice battles don't count and don't resume after reload.
                </p>
              </>
            )}
          </section>
        </div>

        <CynthiaRow view={live ? view : null} />

        <div class="poketch-row">
          <section class="poketch" aria-label="Your record">
            <div class="lcd">
              <h2>Your record</h2>
              <dl class="record">
                <div><dt>Played</dt><dd>{stats.played}</dd></div>
                <div><dt>Win %</dt><dd>{stats.winPct}</dd></div>
                <div><dt>Win streak</dt><dd>{stats.winStreak}</dd></div>
                <div><dt>Day streak</dt><dd>{stats.dayStreak}</dd></div>
              </dl>
              <label class="name">
                Display name
                <input name="name" value={nameInput} maxLength={16} aria-describedby="name-hint" aria-invalid={!nameOk}
                  onInput={e => onName((e.target as HTMLInputElement).value)} />
              </label>
              <p id="name-hint" class="small">
                {nameOk ? '3-16 letters, digits, spaces, _ or -. Leave empty to show as Anonymous.' : 'Not saved: use 3-16 letters, digits, spaces, _ or -.'}
              </p>
            </div>
          </section>

          {(global || board) && (
            <section class="poketch" aria-label="Today, all players">
              <div class="lcd">
                <h2>Today, all players</h2>
                {global && (global.played
                  ? <p><span class="big">{Math.round(global.wins / global.played * 100)}%</span> of {global.played} players beat Cynthia</p>
                  : <p>No results yet today.</p>)}
                {board && (board.length ? (
                  <>
                    <h3>Leaderboard</h3>
                    <ol class="board">{board.map(r => <li>{r.name}: {r.fainted} fainted, {r.turns} turns</li>)}</ol>
                  </>
                ) : <p>No winners yet.</p>)}
              </div>
            </section>
          )}

          <Matchups team={team} />
        </div>

        <section id="how" class="how" aria-labelledby="how-h">
          <h2 id="how-h">How to play</h2>
          <ol>
            <li><span class="num" aria-hidden="true">1</span><div><h3>Get today's team</h3><p>At midnight in your time zone a new six unlocks. Everyone gets the same six. Pick your lead with "Set as lead".</p></div></li>
            <li><span class="num" aria-hidden="true">2</span><div><h3>Battle on the touch screen</h3><p>Tap a move or switch each turn. Move buttons show the damage range against her current Pokemon. Leave mid-battle and it waits for you.</p></div></li>
            <li><span class="num" aria-hidden="true">3</span><div><h3>Share your result</h3><p>One official battle a day, practice as often as you like. Copy your grid. Winners go on today's leaderboard.</p></div></li>
          </ol>
        </section>

        <section id="faq" class="faq" aria-labelledby="faq-h">
          <h2 id="faq-h">FAQ</h2>
          <div class="faq-list">
            {FAQ.map(([q, a]) => <details><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </section>
      </main>

      <footer>
        <p>Daily Cynthia is an unofficial fan project and is not affiliated with, endorsed by, or connected to Nintendo, Game Freak, Creatures Inc. or The Pokemon Company. Pokemon names and sprites are trademarks of their respective owners.</p>
      </footer>
    </>
  );
}

const FAQ: [string, string][] = [
  ['When does the next team unlock?', 'At midnight in your own time zone. The watch at the top counts down.'],
  ['Can I play more than once a day?', 'You get one official battle a day. Practice battles are unlimited and do not change your record.'],
  ['Which rules does Daily Cynthia use?', "Pokemon Platinum (Generation 4) singles at level 100, with Sleep Clause: only one of Cynthia's Pokemon can be asleep at a time. Each of your Pokemon holds an item, and no two hold the same one. Every player gets the same items that day."],
  ['Does Cynthia play the same way every time?', 'Yes. She always picks the move with the best expected damage and switches out of bad matchups.'],
  ['What if I reload during the official battle?', 'The battle resumes where you left off. Practice battles do not resume.'],
  ['Do I need an account?', 'No. Your record stays in this browser, and clearing site data resets it. Pick a display name if you want to appear on the leaderboard.'],
  ['Who made the music, sprites and battle engine?', 'Battle engine: Pokemon Showdown (MIT). Sprites: PokeAPI. Music: Pokémon Diamond/Pearl/Platinum (Game Freak), game rip by DMoore721, ViviVGM and kirbyhammer766 via KHInsider. Battle background: Pokémon Platinum, extracted from the pret/pokeplatinum decompilation.'],
];

// What the DS shows for one side's active Pokemon.
type Shown = { name: string; level: number; hp: number; maxhp: number; status?: string; fainted?: boolean };

function fromSet(set: PokemonSet): Shown {
  const max = toCalc(set).maxHP();
  return { name: set.species, level: set.level, hp: max, maxhp: max };
}

// The client empties the active slot on a faint; the fainted Pokemon stays on screen until the next switch-in.
const onField = (side: ClientBattle['p1']) => side.active[0] ?? side.lastPokemon!;

function fromView(p: ClientPokemon): Shown {
  return {
    name: p.species.name, level: p.level, hp: p.hp, maxhp: p.maxhp,
    status: p.status && STATUS[p.status] ? p.status : undefined, fainted: p.fainted,
  };
}

// The player's six in daily-team order: HP as the player has seen it so far, and the sim's switch slot
// (side.pokemon is reordered by switches). A Pokemon not sent out yet is at full HP.
// The client only learns an item from the log: a new one (Trick) or one that is gone (eaten, knocked off).
type Member = { name: string; pct: number; fainted: boolean; active: boolean; slot: number; item: string; itemGone: boolean; ability: string };

export function party(view: ClientBattle, battle: Battle, team: PokemonSet[]): Member[] {
  return team.map(set => {
    const p = view.p1.team.find(q => q.name === set.name);
    return {
      name: set.species, pct: p ? p.hp / p.maxhp * 100 : 100, fainted: !!p?.fainted, active: !!p?.isActive(),
      slot: battle.p1.pokemon.findIndex(q => q.set.species === set.species) + 1,
      // An item learned from a `[from] item: X` line is stored as the sim's condition id `item:x`.
      item: p?.item ? dex.items.get(p.item.replace(/^item:/, '')).name : p?.lastItem ? dex.items.get(p.lastItem).name : set.item,
      itemGone: !!p && ((!p.item && !!p.lastItem) || p.itemEffect === 'knocked off'),
      ability: set.ability,
    };
  });
}

function HpBar({ name, pct, hidden }: { name: string; pct: number; hidden?: boolean }) {
  const n = Math.round(pct);
  return (
    <span class="hpbar" role="meter" aria-label={`${name} HP`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={n} aria-valuetext={`${n}%`}
      aria-hidden={hidden || undefined}>
      <span style={`width:${pct}%;background:${hpColor(pct)}`} />
    </span>
  );
}

function Balls({ fainted, who }: { fainted: boolean[]; who: 'Cynthia' | 'You' }) {
  const left = fainted.filter(f => !f).length;
  return (
    <span class="balls" role="img" aria-label={`${who} ${who === 'You' ? 'have' : 'has'} ${left} of ${fainted.length} left`}>
      {fainted.map(f => <span class={f ? 'down' : 'up'} />)}
    </span>
  );
}

// Counts to a new HP value over the bar's 400 ms drain, so the number moves with the bar.
function CountTo({ value }: { value: number }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    if (reducedMotion()) { setN(value); return; }
    const from = n;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 400);
      setN(Math.round(from + (value - from) * k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

// Chips that fit in `budget` px beside the HP number, in order, with "+N more" for the rest; when not even one
// fits with that, only the count. Width per chip is an upper bound for the 9-10px game font.
const chipWidth = (t: string) => 6 + 5 * t.length;
export function fitChips(labels: string[], budget: number): string[] {
  for (let n = labels.length; n > 0; n--) {
    const row = [...labels.slice(0, n), ...(n < labels.length ? [`+${labels.length - n} more`] : [])];
    if (row.reduce((w, t) => w + chipWidth(t) + 3, -3) <= budget) return row;
  }
  return labels.length ? [`${labels.length} ${labels.length > 1 ? 'effects' : 'effect'}`] : [];
}
// Room beside the HP number in the smaller HP box, measured: 69px on a 320px-wide page, 109px from a 400px-wide DS.
const CHIP_ROOM = { narrow: 66, wide: 105 };

function HpBox({ s, foe, chips = [], children }: { s: Shown; foe: boolean; chips?: string[]; children?: ComponentChildren }) {
  const pct = s.hp / s.maxhp * 100;
  return (
    <div class={`hpbox ${foe ? 'foe' : 'mine'}`}>
      <p class="hpname">
        <span>{s.name}{chips.length > 0 && <span class="sr-only">, {chips.join(', ')}</span>}</span>
        {s.status && <abbr class={`st-${s.status}`} title={STATUS[s.status]}>{s.status.toUpperCase()}</abbr>}
        <span class="lv">Lv{s.level}</span>
      </p>
      <p class="hprow"><span class="hplabel" aria-hidden="true">HP</span><HpBar name={s.name} pct={pct} /></p>
      <p class="hpnum">
        {chips.length > 0 && (
          <span class="chips" aria-hidden="true" title={chips.join(', ')}>
            {(['narrow', 'wide'] as const).map(size => fitChips(chips, CHIP_ROOM[size]).map(c => (
              <span class={`chip ${size} ${chips.includes(c) ? '' : 'more'}`}>{c}</span>
            )))}
          </span>
        )}
        <span class="hpval">{foe ? `${Math.round(pct)}%` : <><CountTo value={s.hp} />/{s.maxhp}</>}</span>
      </p>
      {children}
    </div>
  );
}

// The DS: top screen with the scene and the latest message, hinge, bottom screen with whatever `bottom` is.
// While a turn plays, `hit` flashes the side that took damage this step, and a click on the top screen skips.
function Ds({ foe, mine, herFainted, msg, bottom, bottomRef, playing, hit, onSkip, chips }: {
  foe: Shown; mine: Shown; herFainted: boolean[]; msg: string; bottom: ComponentChildren;
  bottomRef?: { current: HTMLDivElement | null }; playing?: boolean; hit?: Hit;
  onSkip?: () => void; chips?: ReturnType<typeof chipLabels>;
}) {
  const skipRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (playing && (document.activeElement === document.body || skipRef.current?.closest('.ds')?.contains(document.activeElement))) skipRef.current?.focus();
  }, [playing]);
  const cls = (side: 'foe' | 'mine', s: Shown) =>
    `sprite ${side} ${s.fainted && !hit?.[side] ? 'gone' : ''} ${hit?.[side] ? 'hit' : ''}`;
  return (
    <div class={`ds ${playing ? 'playing' : ''}`}>
      <div class="ds-half">
        {chips?.field && <p class="field-strip" title={chips.field}><span>{chips.field}</span></p>}
        <div class="bezel">
          <div class="screen top" onClick={playing ? onSkip : undefined}>
            <img class="bg" src="/bg/champion-room.png" alt="" />
            {/* A new key restarts the flash when the same Pokemon is hit on consecutive steps. */}
            <img key={`foe-${foe.name}-${hit?.foe ? hit.step : ''}`} class={cls('foe', foe)} src={spritePath(foe.name, false)} alt={foe.name} />
            <img key={`mine-${mine.name}-${hit?.mine ? hit.step : ''}`} class={cls('mine', mine)} src={spritePath(mine.name, true)} alt={`${mine.name}, seen from behind`} />
            <HpBox key={`foe-${foe.name}`} s={foe} foe chips={chips?.p2}><Balls fainted={herFainted} who="Cynthia" /></HpBox>
            <HpBox key={`mine-${mine.name}`} s={mine} foe={false} chips={chips?.p1} />
            <p class="textbox">{msg}</p>
            {playing && <button ref={skipRef} type="button" class="skip" onClick={e => { e.stopPropagation(); onSkip?.(); }}>Skip</button>}
          </div>
        </div>
      </div>
      <div class="hinge" aria-hidden="true"><span /></div>
      <div class="ds-half">
        <div class="bezel">
          <div class="screen bottom" ref={bottomRef}>{bottom}</div>
        </div>
      </div>
    </div>
  );
}

function MoveFace({ id, pp, label }: { id: string; pp?: string; label?: string }) {
  // The sim's "recharge" pseudo-move has no type, PP or damage.
  if (id === 'recharge') return <span class="move-name">Recharging</span>;
  const move = dex.moves.get(id);
  return (
    <>
      <span class="move-name">{moveName(id)}</span>
      <span class="move-foot">
        <span class="move-type">{move.type}{pp && ` ${pp}`}</span>
        {label && <span class="dmg">{label}</span>}
      </span>
    </>
  );
}

// Home screen bottom: the lead's moves against Spiritomb, not clickable.
function MovePreview({ set }: { set: PokemonSet }) {
  const me = toCalc(set);
  const her = toCalc(CYNTHIA[0]);
  return (
    <>
      <p class="screen-caption">Preview vs Spiritomb</p>
      <ul class="moves preview" aria-label={`${set.species}'s moves against Spiritomb`}>
        {set.moves.map(m => (
          <li class="move" style={typeStyle(dex.moves.get(m).type)}>
            <MoveFace id={m} label={dmgLabel(m, damagePct(me, her, m))} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Result({ s, share, copied, onCopy, autofocus }: {
  s: Summary; share: string | null; copied: boolean; onCopy: (t: string) => void; autofocus?: boolean;
}) {
  return (
    <div class="result">
      <h2 tabIndex={-1} data-autofocus={autofocus || undefined}>{s.won ? 'You beat Cynthia!' : 'Cynthia won.'}</h2>
      <p>{s.turns} turns, {s.p1Fainted.filter(Boolean).length} of your Pokemon fainted.</p>
      {share && (
        <>
          <pre class="grid">{share.split('\n').slice(1, 3).join('\n')}</pre>
          <p class="legend">Top: your party (🟩 standing, 🟥 fainted). Bottom: Cynthia's (⬜ standing, ⬛ downed).</p>
          <button type="button" class="pill" onClick={() => onCopy(share)}>{copied ? 'Copied' : 'Copy result'}</button>
        </>
      )}
    </div>
  );
}

function PartyPanel({ team, lead, onLead }: { team: PokemonSet[]; lead: number; onLead: (i: number) => void }) {
  const spiritomb = CYNTHIA[0];
  const her = toCalc(spiritomb);
  const card = (set: PokemonSet, i: number) => {
    const me = toCalc(set);
    const sp = dex.species.get(set.species);
    const hers = bestHit(her, me, spiritomb.moves);
    const threat = `Spiritomb's best: ${moveName(hers.move)} ${dmgLabel(hers.move, hers.range)}`;
    if (i !== lead) {
      return (
        <button type="button" class="tile bench" title={heldInfo(set.ability, set.item)} onClick={() => onLead(i)}>
          <img src={spritePath(set.species, false)} alt="" width={56} height={56} />
          <span class="tile-body">
            <span class="tile-top">
              <span class="mon">{set.species}</span>
              <span class="dots">{sp.types.map(t => <span class="dot" style={typeStyle(t)} title={t} />)}</span>
              {set.item && <span class="held">{set.item}</span>}
            </span>
            <span class="threat">{threat}</span>
            <span class="sr-only">{heldInfo(set.ability, set.item)}</span>
          </span>
          <span class="muted">Set as lead</span>
        </button>
      );
    }
    const mine = bestHit(me, her, set.moves);
    return (
      <div class="tile lead">
        <div class="lead-top">
          <img src={spritePath(set.species, false)} alt="" width={80} height={80} />
          <div class="lead-name">
            <h3>{set.species}</h3>
            <p>{sp.types.join(' / ')}, {set.ability}{set.item && `, ${set.item}`}</p>
          </div>
          <span class="pill-label">Leads</span>
        </div>
        <p class="lead-desc">{abilityInfo(set.ability)}{set.item && <><br />{itemInfo(set.item)}</>}</p>
        <dl class="stats">
          {Object.entries(me.stats).map(([k, v]) => <div><dt>{STAT[k]}</dt><dd>{v}</dd></div>)}
        </dl>
        <ul class="move-pills">{set.moves.map(m => <li style={typeStyle(dex.moves.get(m).type)}>{moveName(m)}</li>)}</ul>
        <p class="best">Best on Spiritomb: {moveName(mine.move)} {dmgLabel(mine.move, mine.range)}<br /><span class="threat">{threat}</span></p>
      </div>
    );
  };
  return (
    <section class="party" aria-labelledby="party-h">
      <div class="panel-head"><h2 id="party-h">Your party</h2><span>Tap one to lead</span></div>
      {card(team[lead], lead)}
      <div class="bench-list">{team.map((set, i) => i !== lead && card(set, i))}</div>
    </section>
  );
}

const STAT: Record<string, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

function MemberButtons({ members, canSwitch, onChoose }: { members: Member[]; canSwitch: boolean; onChoose: (c: string) => void }) {
  return (
    <>
      {members.map(m => (
        <button type="button" class={`tile member ${m.active ? 'active' : ''} ${m.fainted ? 'fainted' : ''}`} title={heldInfo(m.ability, m.item)}
          disabled={!canSwitch || m.fainted || m.active} onClick={() => onChoose(`switch ${m.slot}`)}>
          <img src={spritePath(m.name, false)} alt="" width={48} height={48} />
          <span class="tile-body">
            <span class="tile-top">
              <span class="mon">{m.name}</span>
              {m.item && <span class="held">{m.itemGone ? <><s>{m.item}</s> gone</> : m.item}</span>}
              <span class="state">{m.fainted ? 'Fainted' : m.active ? 'In battle' : `${Math.round(m.pct)}%`}</span>
            </span>
            {/* The state text already says the HP; the bar is visual only so the button name does not repeat it. */}
            <HpBar name={m.name} pct={m.pct} hidden />
            <span class="sr-only">{heldInfo(m.ability, m.item)}</span>
          </span>
        </button>
      ))}
    </>
  );
}

function BattleParty(props: { members: Member[]; canSwitch: boolean; onChoose: (c: string) => void }) {
  return (
    <section class="party" aria-labelledby="party-h">
      <div class="panel-head"><h2 id="party-h">Your party</h2><span>{props.canSwitch ? 'Tap to switch' : ''}</span></div>
      <MemberButtons {...props} />
    </section>
  );
}

// Her six in a full-width row. During a battle each card shows what the player has seen of that Pokemon.
function CynthiaRow({ view }: { view: ClientBattle | null }) {
  const cards = CYNTHIA.map(set => {
    const p = view?.p2.team.find(q => q.name === set.name);
    const pct = p ? Math.round(p.hp / p.maxhp * 100) : 100;
    const state = !view ? null : !p ? 'Not seen yet' : p.fainted ? 'Fainted' : p.isActive() ? `In battle, ${pct}%` : `Switched out, ${pct}%`;
    return { set, state, cls: p?.fainted ? 'fainted' : p?.isActive() ? 'active' : '' };
  });
  const left = cards.filter(c => c.cls !== 'fainted').length;
  return (
    <section class="cynthia" aria-labelledby="cynthia-h">
      <div class="cynthia-info">
        <div class="cynthia-head">
          <span class="bar" aria-hidden="true" />
          <div><p class="small">{view ? `Cynthia has ${left} of 6 left` : 'Pokemon League Champion'}</p><h2 id="cynthia-h">Cynthia</h2></div>
        </div>
        {!view && <p class="cynthia-desc">Same team every day: her Platinum moves at level 100, each with a held item. She always opens with Spiritomb.</p>}
        <details>
          <summary>Show her moves</summary>
          <dl>
            {CYNTHIA.map(set => (
              <div>
                <dt>{set.species} ({set.ability}, {set.nature})</dt>
                <dd>
                  {set.moves.map(m => <p>{moveName(m)}: {moveStats(m)}</p>)}
                  <p class="her-item">{itemInfo(set.item)}</p>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
      <ul>
        {cards.map(({ set, state, cls }) => (
          <li class={cls}>
            <img src={spritePath(set.species, false)} alt="" width={64} height={64} />
            <span class="mon">{set.species}</span>
            <span class="item">{state ?? set.item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const cell = (max: number) => (max >= 100 ? 'OHKO' : `${Math.round(max)}%`);

// The table opens in its own full-width panel below the three, so it does not stretch the other two.
function Matchups({ team }: { team: PokemonSet[] }) {
  const [open, setOpen] = useState(false);
  const cells = useMemo(() => team.map(set => CYNTHIA.map(c => {
    const [a, b] = [toCalc(set), toCalc(c)];
    return { you: bestHit(a, b, set.moves).range[1], her: bestHit(b, a, c.moves).range[1] };
  })), [team]);
  return (
    <>
      <section class="poketch matchups" aria-label="Matchups">
        <div class="lcd">
          <h2>Matchups</h2>
          <p>Your best hit on each of her Pokemon, and her best hit on you, as max damage.</p>
          <button type="button" class="lcd-button" aria-expanded={open} aria-controls="matchups-table" onClick={() => setOpen(!open)}>
            {open ? 'Hide matchups' : 'Show matchups'}
          </button>
        </div>
      </section>
      {open && (
        <section id="matchups-table" class="poketch matchups-table" aria-label="Matchups table">
          <div class="lcd">
            <p class="mx-legend">In each box: <span class="you-key">your best hit on her</span> on the left, her best hit on you on the right. Max damage. <span class="ko">KO</span> means one hit knocks it out.</p>
            <div class="table-wrap">
              <table class="mx">
                <thead><tr><th></th>{CYNTHIA.map(c => <th scope="col"><img src={spritePath(c.species, false)} alt="" />{c.species}</th>)}</tr></thead>
                <tbody>
                  {team.map((set, i) => (
                    <tr>
                      <th scope="row"><img src={spritePath(set.species, false)} alt="" />{set.species}</th>
                      {cells[i].map((c, j) => (
                        <td aria-label={`${set.species} hits ${CYNTHIA[j].species} for ${cell(c.you)}, ${CYNTHIA[j].species} hits ${set.species} for ${cell(c.her)}`}>
                          <span class="you">{c.you >= 100 ? <span class="ko">KO</span> : cell(c.you)}</span>
                          <span class="her">{c.her >= 100 ? <span class="ko">KO</span> : cell(c.her)}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function BattleLog({ groups, waiting }: { groups: LogGroup[]; waiting: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const count = groups.reduce((n, g) => n + g.lines.length + 1, 0);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [count, waiting]);
  return (
    <section class="poketch log" aria-label="Battle log">
      <div class="lcd">
        <div class="panel-head"><h2>Battle log</h2><span class="small">newest at the bottom</span></div>
        <div class="log-body" role="log" aria-live="polite" tabIndex={0} ref={ref}>
          {groups.map((g, i) => (
            <div class="log-group">
              <h3>{g.turn}</h3>
              {g.lines.map(l => <p>{l}</p>)}
              {waiting && i === groups.length - 1 && <p class="waiting">{waiting}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type BattleProps = {
  live: Live; view: ClientBattle; hit?: Hit; play: Playback | null; members: Member[];
  switching: boolean; onSwitching: (b: boolean) => void; onChoose: (c: string) => void; onSkip: () => void;
  share: string | null; copied: boolean; onCopy: (t: string) => void; onPractice: () => void; onHome: () => void;
  groups: LogGroup[];
};

function BattleView(props: BattleProps) {
  const { live, view, hit, play, members, switching, onSwitching, onChoose, onSkip, share, copied, onCopy, onPractice, onHome, groups } = props;
  const { battle, done } = live;
  const playing = play !== null;
  const mine = fromView(onField(view.p1));
  const foe = fromView(onField(view.p2));
  const menu = play ? play.menu : menuOf(battle, switching);
  const latest = [...groups].reverse().find(g => g.lines.length)?.lines.at(-1) ?? '';
  const msg = playing || done ? latest
    : menu.kind === 'moves' ? movesPrompt(mine.name, menu.moves, battle.p1.active[0]?.item)
    : menu.kind === 'switch' && menu.forced ? (mine.fainted ? `${mine.name} fainted!` : 'Choose your next Pokemon')
    : menu.kind === 'switch' ? `Switch ${mine.name} out for?`
    : latest;

  const sim = { mine: battle.p1.active[0], foe: battle.p2.active[0] };
  const herBest = !done && !sim.mine.fainted && !sim.foe.fainted
    ? bestHit(fromSim(sim.foe), fromSim(sim.mine), sim.foe.moveSlots.map(s => slotMoveId(sim.foe, s.id)))
    : null;

  // The bottom screen's buttons are replaced after every choice; once the turn has played, move focus to the
  // same move as last time when it is still usable, else to the first usable button, so it does not drop to <body>.
  const bottom = useRef<HTMLDivElement>(null);
  const lastMove = useRef<number | null>(null);
  // The info line shows the hovered move, else the one tapped in info mode, else the one the player focused.
  // In info mode a tap on a move shows its details instead of using it.
  const [hovered, setHovered] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [infoMode, setInfoMode] = useState(false);
  const info = hovered ?? picked ?? focused;
  useEffect(() => { setHovered(null); setPicked(null); setFocused(null); setInfoMode(false); }, [battle.log.length]);
  // Focus the effect below moves is not the player's, so it does not fill the info line.
  const autoFocused = useRef<EventTarget | null>(null);
  useEffect(() => {
    const el = bottom.current;
    if (playing || !el) return;
    const usable = (b: HTMLButtonElement | null | undefined) => b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null;
    const same = lastMove.current === null ? null : el.querySelectorAll<HTMLButtonElement>('button.move')[lastMove.current];
    const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? usable(same) ??
      el.querySelector<HTMLElement>('button:not(:disabled):not([aria-disabled="true"])');
    if (!target || target === document.activeElement) return;
    autoFocused.current = target;
    target.focus();
    autoFocused.current = null;
  }, [battle.log.length, switching, !!done, playing]);

  let screen: ComponentChildren;
  if (done && !playing) {
    screen = (
      <>
        <Result s={done} share={share} copied={copied} onCopy={onCopy} autofocus />
        <div class="screen-actions">
          <button type="button" class="pill" onClick={onPractice}>Practice</button>
          <button type="button" class="pill" onClick={onHome}>Back to home</button>
        </div>
      </>
    );
  } else if (menu.kind === 'switch') {
    const { forced } = menu;
    screen = (
      <div class="switch-menu" onKeyDown={e => { if (e.key === 'Escape' && !forced && !playing) onSwitching(false); }}>
        <div class="screen-title-row">
          <h2 class="screen-title" tabIndex={-1} data-autofocus={(forced && !playing) || undefined}>{forced ? 'Choose your next Pokemon' : 'Switch to'}</h2>
          {!forced && <button type="button" class="pill" disabled={playing} onClick={() => onSwitching(false)}>Back</button>}
        </div>
        <div class="switches">
          <MemberButtons members={members} canSwitch={!playing} onChoose={c => { lastMove.current = null; onChoose(c); }} />
        </div>
      </div>
    );
  } else if (menu.kind === 'moves') {
    screen = (
      <>
        <div class={`moves ${infoMode ? 'info-mode' : ''}`}>
          {menu.moves.map((m, i) => {
            // The sim's "recharge" pseudo-move has no details.
            const id = m.id === 'recharge' ? null : m.id;
            return (
              <button type="button" class="move" style={typeStyle(dex.moves.get(m.id).type)} disabled={playing}
                aria-disabled={m.disabled || undefined}
                aria-pressed={infoMode ? info === m.id : undefined} aria-describedby={id ? `move-info-${i}` : undefined}
                onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)}
                onFocus={e => { if (autoFocused.current !== e.currentTarget) setFocused(id); }} onBlur={() => setFocused(null)}
                onClick={() => {
                  const act = moveAction(infoMode, m.disabled);
                  if (act === 'info') setPicked(id);
                  if (act === 'use') { lastMove.current = i; onChoose(`move ${i + 1}`); }
                }}>
                <MoveFace id={m.id} pp={m.pp} label={m.label} />
                {m.id !== 'recharge' && <span id={`move-info-${i}`} hidden>{moveInfo(m.id)}</span>}
              </button>
            );
          })}
        </div>
        <p class="info-line" title={info ? moveInfo(info) : undefined}>
          {info ? moveInfo(info) : infoMode ? 'Tap a move for details' : 'Hover or focus a move for details'}
        </p>
        <div class="switch-row">
          <button type="button" class="switch" disabled={playing || menu.trapped} onClick={() => onSwitching(true)}>
            <span>Switch</span>
            <Balls fainted={members.map(m => m.fainted)} who="You" />
          </button>
          <button type="button" class="pill info-toggle" aria-label="Move info mode" aria-pressed={infoMode} disabled={playing}
            onClick={() => { setInfoMode(!infoMode); setPicked(null); }}>Info</button>
        </div>
      </>
    );
  } else {
    screen = <p class="screen-note">Waiting...</p>;
  }

  return (
    <>
      <Ds foe={foe} mine={mine} herFainted={herFainted(view)} msg={msg} bottom={screen} bottomRef={bottom}
        playing={playing} hit={hit} onSkip={onSkip} chips={chipLabels(view)} />
      {herBest && (
        <p class={`strip ${playing ? 'hold' : ''}`}>
          <img src={spritePath(sim.foe.species.name, false)} alt="" width={40} height={40} />
          <span class="strip-text">{sim.foe.species.name}'s best hit on {sim.mine.species.name}</span>
          <span class="strip-dmg">{moveName(herBest.move)} {dmgLabel(herBest.move, herBest.range)}</span>
        </p>
      )}
    </>
  );
}

const herFainted = (view: ClientBattle) => CYNTHIA.map(set => !!view.p2.team.find(q => q.name === set.name)?.fainted);
