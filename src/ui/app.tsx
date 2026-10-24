import { Dex, PRNG, type Battle, type Pokemon as SimPokemon, type PokemonSet } from '@pkmn/sim';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createBattle, p1Pending, replay, submit, summary, type Summary } from '../game/battle';
import { damagePct, fromSim, slotMoveId, toCalc } from '../game/calc';
import { CYNTHIA } from '../game/cynthia';
import { dayNumber, localDate, seedFor } from '../game/daily';
import { validName } from '../game/name';
import { shareText } from '../game/share';
import { computeStats } from '../game/stats';
import { dailyTeam } from '../game/teams';
import { getLeaderboard, getStats, postResult, type LeaderRow, type Stats } from './api';
import { formatLog, groupLog, type LogGroup } from './log';
import { spritePath } from './sprites';
import { finishOfficial, load, save, withName, type Save } from './storage';

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

const liveMoves = (p: SimPokemon) => p.moveSlots.map(s => slotMoveId(p, s.id));

// Gen 4 type colours: background and text. From the mockup's table, plus the five types it did not use.
const TYPE: Record<string, [string, string]> = {
  Normal: ['#A8A878', '#1D1B2B'], Fire: ['#F08030', '#1D1B2B'], Water: ['#6890F0', '#1D1B2B'], Electric: ['#F8D030', '#1D1B2B'],
  Grass: ['#78C850', '#1D1B2B'], Ice: ['#98D8D8', '#1D1B2B'], Fighting: ['#C03028', '#FFFFFF'], Poison: ['#A040A0', '#FFFFFF'],
  Ground: ['#E0C068', '#1D1B2B'], Flying: ['#A890F0', '#1D1B2B'], Psychic: ['#F85888', '#1D1B2B'], Bug: ['#A8B820', '#1D1B2B'],
  Rock: ['#B8A038', '#1D1B2B'], Ghost: ['#705898', '#FFFFFF'], Dragon: ['#7038F8', '#FFFFFF'], Dark: ['#705848', '#FFFFFF'],
  Steel: ['#B8B8D0', '#1D1B2B'], '???': ['#68A090', '#1D1B2B'],
};
const typeStyle = (t: string) => `--t:${TYPE[t][0]};--tf:${TYPE[t][1]}`;

const STATUS: Record<string, string> = {
  brn: 'Burned', par: 'Paralyzed', slp: 'Asleep', frz: 'Frozen', psn: 'Poisoned', tox: 'Badly poisoned',
};

const hpColor = (pct: number) => (pct < 20 ? 'var(--hp-red)' : pct < 50 ? 'var(--hp-yellow)' : 'var(--hp-green)');

type Live = { battle: Battle; official: boolean; done?: Summary };

// An official battle in progress is rebuilt from its saved choices. If that fails, it counts as a loss (spec A9).
// A battle from an earlier day also resumes: the page keeps that day until it ends, then "Back to home" reloads today.
function resume(s: Save): { s: Save; live: Live | null } {
  if (!s.current) return { s, live: null };
  const { date, lead, choices } = s.current;
  try {
    return { s, live: { battle: replay(seedFor(date, 1), dailyTeam(date), lead, choices), official: true } };
  } catch (e) {
    console.error('resume failed, recording a loss', e);
    const lost = finishOfficial(s, false);
    save(lost);
    return { s: lost, live: null };
  }
}

const isToday = (date: string) => localDate(new Date()) === date;

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

export function App() {
  const [init] = useState(() => resume(load()));
  const [store, setStore] = useState<Save>(init.s);
  const [live, setLive] = useState<Live | null>(init.live);
  // The page keeps the date it loaded with, or the start date of a resumed official battle.
  const [date] = useState(() => init.s.current?.date ?? localDate(new Date()));
  const [team] = useState(() => dailyTeam(date));
  const [lead, setLead] = useState(init.s.current?.lead ?? 0);
  const [, setTick] = useState(0);
  const [nameInput, setNameInput] = useState(init.s.name);
  const [global, setGlobal] = useState<Stats | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [switching, setSwitching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audio] = useState(() => {
    const a = new Audio();
    a.preload = 'none'; // nothing downloads until the player turns music on
    a.loop = true;
    a.src = '/audio/battle-champion.mp3';
    return a;
  });

  const persist = (s: Save) => { save(s); setStore(s); };

  const refreshApi = () => {
    getStats(date).then(setGlobal, e => { console.error(e); setGlobal(null); });
    getLeaderboard(date).then(setBoard, e => { console.error(e); setBoard(null); });
  };
  useEffect(refreshApi, [date]);

  const inBattle = live !== null && !live.done;
  const musicOn = store.music === true;
  useEffect(() => {
    if (musicOn && inBattle) audio.play().catch(e => console.error('music did not start', e));
    else audio.pause();
  }, [musicOn, inBattle]);

  const start = (official: boolean) => {
    // A page left open past midnight must not start yesterday's official battle.
    if (official && !isToday(date)) { location.reload(); return; }
    if (official) persist({ ...store, current: { date, lead, choices: [] } });
    const seed = official ? seedFor(date, 1) : PRNG.generateSeed();
    setSwitching(false);
    setCopied(false);
    setLive({ battle: createBattle(seed, team, lead), official });
  };

  const home = () => {
    if (!isToday(date)) { location.reload(); return; }
    setLive(null);
  };

  const choose = (choice: string) => {
    if (!live) return;
    submit(live.battle, choice);
    setSwitching(false);
    let s = store;
    if (live.official) {
      s = { ...s, current: { ...s.current!, choices: [...s.current!.choices, choice] } };
      persist(s);
    }
    if (live.battle.ended) {
      const done = summary(live.battle);
      if (live.official) {
        const { date: d, lead: l, choices } = s.current!;
        persist(finishOfficial(s, done.won, done));
        postResult({
          date: d, playerId: s.playerId, name: s.name, won: done.won, fainted: done.p1Fainted.filter(Boolean).length,
          turns: done.turns, seed: seedFor(d, 1), lead: l, choices,
        }).then(refreshApi, console.error);
      }
      setLive({ ...live, done });
    }
    setTick(t => t + 1);
  };

  const onName = (v: string) => {
    setNameInput(v);
    const next = withName(store, v);
    if (next !== store) persist(next);
  };

  const stats = computeStats(store.history, date);
  const playedToday = store.history[date] !== undefined;
  const todayResult = store.results?.[date];
  const groups = live ? groupLog(formatLog(live.battle)) : [];
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => setCopied(true), console.error);
  const nameOk = nameInput.trim() === '' || validName(nameInput);

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
            <span class="turn">Turn {live.battle.turn}</span>
          </p>
        )}
        <nav class="links">
          <a href="#how">How to play</a>
          <a href="#faq">FAQ</a>
        </nav>
        <MusicToggle on={musicOn} onToggle={() => persist({ ...store, music: !musicOn })} />
        <Countdown date={date} busy={inBattle && live!.official} />
      </header>

      <main>
        <div class="row">
          <section class="centre" aria-label="Battle">
            {live ? (
              <BattleView live={live} team={team} switching={switching} onSwitching={setSwitching} onChoose={choose}
                share={live.done && live.official ? shareText(date, live.done, location.origin) : null}
                copied={copied} onCopy={copy} onPractice={() => start(false)} onHome={home} groups={groups} />
            ) : (
              <>
                <Ds
                  foe={fromSet(CYNTHIA[0], false)} mine={fromSet(team[lead], true)}
                  herFainted={CYNTHIA.map(() => false)}
                  msg={playedToday ? "Today's battle is done. Come back tomorrow." : 'Cynthia sent out Spiritomb! Pick your lead, then battle.'}
                  bottom={todayResult
                    ? <Result s={todayResult} share={shareText(date, todayResult, location.origin)} copied={copied} onCopy={copy} />
                    : playedToday
                      ? <p class="screen-note">Today's official battle is done: you {store.history[date] === 'W' ? 'won' : 'lost'}.</p>
                      : <MovePreview set={team[lead]} />}
                />
                <div class="actions">
                  {!playedToday && <button type="button" class="primary" onClick={() => start(true)}>Battle Cynthia</button>}
                  <button type="button" class="secondary" onClick={() => start(false)}>Practice</button>
                </div>
                <p class="hint">
                  {playedToday ? "Today's official battle is done. A new team unlocks at midnight." : 'Your official battle is still open today.'}
                  {' '}Practice battles don't count and don't resume after reload.
                </p>
              </>
            )}
          </section>

          <div class="side right">
            {live ? <BattleLog groups={groups} /> : <CynthiaPanel />}
          </div>

          <div class="side left">
            {live
              ? <BattleParty battle={live.battle} team={team} canSwitch={!live.done && p1Pending(live.battle) !== 'wait' && !(live.battle.p1.activeRequest as any)?.active?.[0]?.trapped} onChoose={choose} />
              : <PartyPanel team={team} lead={lead} onLead={setLead} />}
          </div>
        </div>

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
        <p>Daily Cynthia is an unofficial fan project and is not affiliated with, endorsed by, or connected to Nintendo, Game Freak, Creatures Inc. or The Pokemon Company. Pokemon names and sprites are trademarks of their respective owners. Battle engine: Pokemon Showdown (MIT). Sprites: PokeAPI.</p>
        <p>Music: Pokémon Diamond/Pearl/Platinum (Game Freak), game rip by DMoore721, ViviVGM and kirbyhammer766 via KHInsider. Battle background: Pokémon Platinum, extracted from the pret/pokeplatinum decompilation.</p>
      </footer>
    </>
  );
}

const FAQ: [string, string][] = [
  ['When does the next team unlock?', 'At midnight in your own time zone. The watch at the top counts down.'],
  ['Can I play more than once a day?', 'You get one official battle a day. Practice battles are unlimited and do not change your record.'],
  ['Which rules does Daily Cynthia use?', "Pokemon Platinum (Generation 4) singles at level 100, with Sleep Clause: only one of Cynthia's Pokemon can be asleep at a time. Your Pokemon hold no items."],
  ['Does Cynthia play the same way every time?', 'Yes. She always picks the move with the best expected damage and switches out of bad matchups.'],
  ['What if I reload during the official battle?', 'The battle resumes where you left off. Practice battles do not resume.'],
  ['Do I need an account?', 'No. Your record stays in this browser, and clearing site data resets it. Pick a display name if you want to appear on the leaderboard.'],
];

// What the DS shows for one side's active Pokemon.
type Shown = { name: string; level: number; pct: number; hp?: string; status?: string; fainted?: boolean };

function fromSet(set: PokemonSet, mine: boolean): Shown {
  const max = toCalc(set).maxHP();
  return { name: set.species, level: set.level, pct: 100, hp: mine ? `${max}/${max}` : '100%' };
}

function fromLive(p: SimPokemon, mine: boolean): Shown {
  const pct = p.hp / p.maxhp * 100;
  return {
    name: p.species.name, level: p.level, pct, status: STATUS[p.status] ? p.status : undefined, fainted: p.fainted,
    hp: mine ? `${p.hp}/${p.maxhp}` : `${Math.round(pct)}%`,
  };
}

function HpBar({ name, pct }: { name: string; pct: number }) {
  const n = Math.round(pct);
  return (
    <span class="hpbar" role="meter" aria-label={`${name} HP`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={n} aria-valuetext={`${n}%`}>
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

function HpBox({ s, foe, children }: { s: Shown; foe: boolean; children?: ComponentChildren }) {
  return (
    <div class={`hpbox ${foe ? 'foe' : 'mine'}`}>
      <p class="hpname">
        <span>{s.name}</span>
        {s.status && <abbr title={STATUS[s.status]}>{s.status.toUpperCase()}</abbr>}
        <span class="lv">Lv{s.level}</span>
      </p>
      <p class="hprow"><span class="hplabel" aria-hidden="true">HP</span><HpBar name={s.name} pct={s.pct} /></p>
      <p class="hpnum">{s.hp}</p>
      {children}
    </div>
  );
}

// The DS: top screen with the scene and the latest message, hinge, bottom screen with whatever `bottom` is.
function Ds({ foe, mine, herFainted, msg, bottom, bottomRef }: {
  foe: Shown; mine: Shown; herFainted: boolean[]; msg: string; bottom: ComponentChildren;
  bottomRef?: { current: HTMLDivElement | null };
}) {
  return (
    <div class="ds">
      <div class="ds-half">
        <div class="bezel">
          <div class="screen top">
            <img class="bg" src="/bg/champion-room.png" alt="" />
            <img class={`sprite foe ${foe.fainted ? 'gone' : ''}`} src={spritePath(foe.name, false)} alt={foe.name} />
            <img class={`sprite mine ${mine.fainted ? 'gone' : ''}`} src={spritePath(mine.name, true)} alt={`${mine.name}, seen from behind`} />
            <HpBox s={foe} foe><Balls fainted={herFainted} who="Cynthia" /></HpBox>
            <HpBox s={mine} foe={false} />
            <p class="textbox">{msg}</p>
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

function MoveFace({ id, pp, label }: { id: string; pp?: string; label: string }) {
  const move = dex.moves.get(id);
  return (
    <>
      <span class="move-name">{moveName(id)}</span>
      <span class="move-foot">
        <span>{move.type}{pp && ` PP ${pp}`}</span>
        <span class="dmg">{label}</span>
      </span>
    </>
  );
}

// Home screen bottom: the lead's moves against Spiritomb, not clickable.
function MovePreview({ set }: { set: PokemonSet }) {
  const me = toCalc(set);
  const her = toCalc(CYNTHIA[0]);
  return (
    <ul class="moves" aria-label={`${set.species}'s moves against Spiritomb`}>
      {set.moves.map(m => (
        <li class="move" style={typeStyle(dex.moves.get(m).type)}>
          <MoveFace id={m} label={dmgLabel(m, damagePct(me, her, m))} />
        </li>
      ))}
    </ul>
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
  return (
    <section class="party" aria-labelledby="party-h">
      <div class="panel-head"><h2 id="party-h">Your party</h2><span>Tap one to lead</span></div>
      {team.map((set, i) => {
        const me = toCalc(set);
        const sp = dex.species.get(set.species);
        const hers = bestHit(her, me, spiritomb.moves);
        const threat = <span class="threat">Spiritomb's best: {moveName(hers.move)} {dmgLabel(hers.move, hers.range)}</span>;
        if (i !== lead) {
          return (
            <button type="button" class="tile bench" onClick={() => onLead(i)}>
              <img src={spritePath(set.species, false)} alt="" width={48} height={48} />
              <span class="tile-body">
                <span class="tile-top">
                  <span class="mon">{set.species}</span>
                  <span class="dots">{sp.types.map(t => <span class="dot" style={typeStyle(t)} title={t} />)}</span>
                  <span class="muted">Set as lead</span>
                </span>
                {threat}
              </span>
            </button>
          );
        }
        const mine = bestHit(me, her, set.moves);
        return (
          <div class="tile lead">
            <div class="lead-top">
              <img src={spritePath(set.species, false)} alt="" width={64} height={64} />
              <div class="lead-name">
                <h3>{set.species}</h3>
                <p>{sp.types.join(' / ')}, {set.ability}</p>
              </div>
              <span class="pill-label">Leads</span>
            </div>
            <dl class="stats">
              {Object.entries(me.stats).map(([k, v]) => <div><dt>{STAT[k]}</dt><dd>{v}</dd></div>)}
            </dl>
            <ul class="move-pills">{set.moves.map(m => <li style={typeStyle(dex.moves.get(m).type)}>{moveName(m)}</li>)}</ul>
            <p class="best">Best on Spiritomb: {moveName(mine.move)} {dmgLabel(mine.move, mine.range)}</p>
            <p class="best">{threat}</p>
          </div>
        );
      })}
    </section>
  );
}

const STAT: Record<string, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

// The player's six in daily-team order, each with its current switch slot (side.pokemon is reordered by switches).
function members(battle: Battle, team: PokemonSet[]): { p: SimPokemon; slot: number }[] {
  const order = (p: SimPokemon) => team.findIndex(s => s.species === p.set.species);
  return battle.p1.pokemon.map((p, i) => ({ p, slot: i + 1 })).sort((a, b) => order(a.p) - order(b.p));
}

function MemberButtons({ battle, team, canSwitch, onChoose }: {
  battle: Battle; team: PokemonSet[]; canSwitch: boolean; onChoose: (c: string) => void;
}) {
  return (
    <>
      {members(battle, team).map(({ p, slot }) => {
        const pct = p.hp / p.maxhp * 100;
        return (
          <button type="button" class={`tile member ${p.isActive ? 'active' : ''} ${p.fainted ? 'fainted' : ''}`}
            disabled={!canSwitch || p.fainted || p.isActive} onClick={() => onChoose(`switch ${slot}`)}>
            <img src={spritePath(p.species.name, false)} alt="" width={48} height={48} />
            <span class="tile-body">
              <span class="tile-top">
                <span class="mon">{p.species.name}</span>
                <span class="state">{p.fainted ? 'Fainted' : p.isActive ? 'In battle' : `${Math.round(pct)}%`}</span>
              </span>
              <HpBar name={p.species.name} pct={pct} />
            </span>
          </button>
        );
      })}
    </>
  );
}

function BattleParty(props: { battle: Battle; team: PokemonSet[]; canSwitch: boolean; onChoose: (c: string) => void }) {
  return (
    <section class="party" aria-labelledby="party-h">
      <div class="panel-head"><h2 id="party-h">Your party</h2><span>{props.canSwitch ? 'Tap to switch' : ''}</span></div>
      <MemberButtons {...props} />
    </section>
  );
}

function CynthiaPanel() {
  return (
    <aside class="cynthia" aria-labelledby="cynthia-h">
      <div class="cynthia-head">
        <span class="bar" aria-hidden="true" />
        <div><p class="small">Pokemon League Champion</p><h2 id="cynthia-h">Cynthia</h2></div>
      </div>
      <p class="intro">Same team every day: her Platinum moves at level 100, each with a held item. She always opens with Spiritomb.</p>
      <ul>
        {CYNTHIA.map(set => (
          <li>
            <img src={spritePath(set.species, false)} alt="" width={44} height={44} />
            <span class="mon">{set.species}</span>
            <span class="item">{set.item}</span>
          </li>
        ))}
      </ul>
      <details>
        <summary>Show her moves</summary>
        <dl>
          {CYNTHIA.map(set => <div><dt>{set.species} ({set.ability}, {set.nature})</dt><dd>{set.moves.map(moveName).join(', ')}</dd></div>)}
        </dl>
      </details>
    </aside>
  );
}

const cell = (max: number) => (max >= 100 ? 'OHKO' : `${Math.round(max)}%`);

function Matchups({ team }: { team: PokemonSet[] }) {
  const cells = useMemo(() => team.map(set => CYNTHIA.map(c => {
    const [a, b] = [toCalc(set), toCalc(c)];
    return `${cell(bestHit(a, b, set.moves).range[1])} / ${cell(bestHit(b, a, c.moves).range[1])}`;
  })), [team]);
  return (
    <section class="poketch matchups" aria-label="Matchups">
      <div class="lcd">
        <h2>Matchups</h2>
        <p>Your best hit on each of her Pokemon / her best hit on you, as max damage.</p>
        <details>
          <summary>Show matchups</summary>
          <div class="table-wrap">
            <table>
              <thead><tr><th></th>{CYNTHIA.map(c => <th scope="col">{c.species}</th>)}</tr></thead>
              <tbody>
                {team.map((set, i) => (
                  <tr>
                    <th scope="row">{set.species}</th>
                    {cells[i].map(c => <td>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

function BattleLog({ groups }: { groups: LogGroup[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const count = groups.reduce((n, g) => n + g.lines.length + 1, 0);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [count]);
  return (
    <section class="poketch log" aria-label="Battle log">
      <div class="lcd">
        <div class="panel-head"><h2>Battle log</h2><span class="small">newest at the bottom</span></div>
        <div class="log-body" role="log" aria-live="polite" tabIndex={0} ref={ref}>
          {groups.map(g => (
            <div class="log-group">
              <h3>{g.turn}</h3>
              {g.lines.map(l => <p>{l}</p>)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type BattleProps = {
  live: Live; team: PokemonSet[]; switching: boolean; onSwitching: (b: boolean) => void; onChoose: (c: string) => void;
  share: string | null; copied: boolean; onCopy: (t: string) => void; onPractice: () => void; onHome: () => void;
  groups: LogGroup[];
};

function BattleView({ live, team, switching, onSwitching, onChoose, share, copied, onCopy, onPractice, onHome, groups }: BattleProps) {
  const { battle, done } = live;
  const mine = battle.p1.active[0];
  const foe = battle.p2.active[0];
  const pending = p1Pending(battle);
  const req = battle.p1.activeRequest as any;
  const herBest = !done && !mine.fainted && !foe.fainted ? bestHit(fromSim(foe), fromSim(mine), liveMoves(foe)) : null;
  const latest = [...groups].reverse().find(g => g.lines.length)?.lines.at(-1) ?? '';
  const msg = !done && pending === 'move' ? `What will ${mine.species.name} do?` : latest;

  // The bottom screen's buttons are replaced after every choice; move focus to a stable target so it does not drop to <body>.
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bottom.current;
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
  }, [battle.log.length, switching, !!done]);

  let screen: ComponentChildren;
  if (done) {
    screen = (
      <>
        <Result s={done} share={share} copied={copied} onCopy={onCopy} autofocus />
        <div class="screen-actions">
          <button type="button" class="pill" onClick={onPractice}>Practice</button>
          <button type="button" class="pill" onClick={onHome}>Back to home</button>
        </div>
      </>
    );
  } else if (pending === 'switch' || switching) {
    const forced = pending === 'switch';
    screen = (
      <>
        <h2 class="screen-title" tabIndex={-1} data-autofocus={forced || undefined}>{forced ? 'Choose your next Pokemon' : 'Switch to'}</h2>
        <div class="switches"><MemberButtons battle={battle} team={team} canSwitch onChoose={onChoose} /></div>
        {!forced && <button type="button" class="pill" onClick={() => onSwitching(false)}>Back</button>}
      </>
    );
  } else if (pending === 'move') {
    screen = (
      <>
        <div class="moves">
          {(req.active[0].moves as { id: string; pp: number; maxpp: number; disabled?: boolean }[]).map((m, i) => {
            const id = slotMoveId(mine, m.id);
            return (
              <button type="button" class="move" style={typeStyle(dex.moves.get(id).type)} disabled={!!m.disabled}
                onClick={() => onChoose(`move ${i + 1}`)}>
                <MoveFace id={id} pp={m.maxpp !== undefined ? `${m.pp}/${m.maxpp}` : undefined} label={dmgLabel(id, damagePct(fromSim(mine), fromSim(foe), id))} />
              </button>
            );
          })}
        </div>
        <button type="button" class="switch" disabled={!!req.active[0].trapped} onClick={() => onSwitching(true)}>
          <span>Switch</span>
          <Balls fainted={summary(battle).p1Fainted} who="You" />
        </button>
      </>
    );
  } else {
    screen = <p class="screen-note">Waiting...</p>;
  }

  return (
    <>
      <Ds foe={fromLive(foe, false)} mine={fromLive(mine, true)} herFainted={summary(battle).p2Fainted} msg={msg}
        bottom={screen} bottomRef={bottom} />
      {herBest && (
        <p class="strip">
          <img src={spritePath(foe.species.name, false)} alt="" width={40} height={40} />
          <span class="strip-text">{foe.species.name}'s best hit on {mine.species.name}</span>
          <span class="strip-dmg">{moveName(herBest.move)} {dmgLabel(herBest.move, herBest.range)}</span>
        </p>
      )}
    </>
  );
}
