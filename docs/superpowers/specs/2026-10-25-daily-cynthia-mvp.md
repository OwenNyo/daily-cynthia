# Daily Cynthia MVP - Design Spec

Date: 2026-10-25. Branch: `feat/mvp`. Repo state at time of writing: one empty commit, no code.

## Goal

A daily Pokemon puzzle in the style of https://daily-red.com. Every day at local midnight a new team of six level 100 Pokemon unlocks. Every player gets the same six. The player fights Champion Cynthia (Pokemon Platinum team, Gen 4 rules) in a 6v6 singles battle. One official attempt per day, unlimited practice. Stats in localStorage. A small Cloudflare backend stores official results as the client reports them, together with the input log, shows "X% beat Cynthia today", and shows a daily leaderboard.

## Non-goals (MVP)

- Player-chosen held items. Daily items are fixed per day (see "Player items").
- Accounts or sign-in.
- All-time leaderboard (daily only, D19).
- Battle animations or sound. Text log, HP bars and static sprites only.
- AI lookahead, setup or healing logic.
- Server-side replay verification of results (D29). The input log is stored so it can be added later.
- Doubles, other champions, other generations.

## Decisions (confirmed by the user)

| # | Decision |
|---|---|
| D1 | Platinum Cynthia, Gen 4 rules (`gen4customgame`). |
| D2 | Greedy AI: best expected damage, plus switch on a bad matchup. |
| D3 | Player sets: Gen 4 Random Battle sets from `@pkmn/randoms`. The daily seed picks species and set. |
| D4 | Pool: fully evolved Gen 1-4, uniform random. Exclude legendaries and mythicals. Keep Shedinja, Wobbuffet, Smeargle, Ditto, Unown. |
| D5 | Fixed sets for everyone. Player items are also fixed per day, assigned like the team, never player-chosen (see "Player items"). |
| D6 | Daily reset at local midnight. |
| D7 | Official run uses a fixed per-day battle seed shared by everyone. Practice uses a fresh random seed each time. |
| D8 | Cynthia: her Platinum in-game moves, level 100, full EVs and good natures. Held items changed by D31. |
| D9 | Replaced by D29: the client runs the battle and submits its result plus the input log (seed, lead, player choices). The Worker validates the input and stores both; it does not replay. No per-turn server state. |
| D10 | Leaderboard rank: fewest of the player's Pokemon fainted, tiebreak fewest turns. |
| D11 | Identity: anonymous random ID in localStorage plus a display name the player picks, checked against a short blocklist. No sign-in. |
| D12 | Share text: `Daily Cynthia #N ✅/❌ T turns`, a row of 🟩 (standing) / 🟥 (fainted) for the player's six, a row of ⬜ (standing) / ⬛ (downed) for Cynthia's six. |
| D13 | Hosting: Cloudflare. Public fan site with a non-affiliation disclaimer. |
| D14 | Sprites are self-hosted in the repo under `public/sprites/{front,back}/`, no hotlinking. All 493 Gen 1-4 Pokemon plus alternate forms, downloaded once from the PokeAPI sprites repo by a script and committed. |
| D15 | Backend: Cloudflare Worker + D1 in the same repo. It imports only `src/game/name.ts` and `src/game/daily.ts`, never the simulator. One `results` table that also stores the name and the input log. Endpoints `POST /api/result`, `GET /api/stats/:date`, `GET /api/leaderboard/:date`. |
| D16 | Removed with D29: no Worker replay spike and no Node server fallback. |

### Decisions settled from the open questions (2026-10-25)

Checked against D1-D16 and the user's preference for simple, robust designs with no speculative features.

| # | Decision | Reason |
|---|---|---|
| D17 (Q1) | Format `gen4customgame@@@Sleep Clause Mod`. No other clauses. | Stops Smeargle's Spore from sleeping all six. OHKO Clause and Evasion Moves Clause only run in the team validator, which `new Battle` never calls, and no Gen 4 random set or Cynthia set has those moves (probed). |
| D18 (Q3) | Leaderboard is daily only. | Matches a daily puzzle; an all-time board can be built from the same table later. |
| D19 | The leaderboard lists winners only (`WHERE won = 1`). | With losses included, all losers tie at 6 fainted and the tiebreak ranks the fastest loss highest. |
| D20 (Q4) | Display names are not unique. Each result stores the name used at submit time. | Duplicates are harmless on a daily board; uniqueness needs a claim flow and accounts. |
| D21 (Q5) | The AI sees the player's full set. | The player also sees Cynthia's full set and damage ranges; revealed-only needs per-turn tracking with no clear gain. |
| D22 (Q6) | The AI scores status moves (Toxic, Mirror Coat) as 0. A move that forces a recharge turn (Giga Impact) counts at half its expected damage. | "Best expected damage" means damage per turn. Without the halving, Garchomp prefers Giga Impact over Dragon Rush on any target immune to Earthquake and gives the player a free turn. Status logic waits for playtesting. |
| D23 (Q7) | Practice battles do not resume after reload. | Practice has no stakes; resume is only needed for the one official attempt. |
| D24 (Q9) | Accept the 1.37 MB gzip client bundle. | No measured problem yet; lazy loading is added only if first load is slow. |
| D25 (Q10) | No rate limiting in code. | The unique key allows one row per player ID per day, and a write is one cheap D1 insert; a Cloudflare dashboard rate-limit rule on `/api/result` needs no code if abuse appears. |
| D26 (Q11) | One Worker serves the static files (including sprites) and `/api/*`. | Same origin, one deploy, no CORS; Cloudflare recommends Workers static assets for new projects. |
| D27 (Q12) | Accept the sprite copyright risk under the non-affiliation disclaimer. | Follows from D13 and D14 (public site, self-hosted sprites); see R8. |
| D28 | `POST /api/result` accepts a `date` only if it is a real calendar date and within 1 calendar day of the server's UTC date. | Basic input validation. Every local date on Earth is UTC date -1, 0 or +1, so older dates are rejected and old days cannot be filled in later. |
| D29 | No server-side replay verification in the MVP. The Worker stores the client-reported `won`, `fainted`, `turns` and the input log (`seed`, `lead`, `choices`) in D1. | The Worker no longer bundles `@pkmn/sim`, so the free Workers plan is enough (Q2 is moot) and the spike is not needed. Accepted risk R1: the leaderboard can be faked until verification is added. |
| D30 (Q8) | Working name "Daily Cynthia". Share `#1` is the first public day; `LAUNCH_DATE` stays a placeholder constant until then. Deploy as a Worker named `daily-cynthia` on the user's workers.dev subdomain: https://daily-cynthia.owennyowy.workers.dev, later moved to the custom domain https://daily-cynthia.owennyo.com (set up in the Cloudflare dashboard). `workers_dev` and `preview_urls` are false in `wrangler.jsonc`, so the workers.dev address no longer serves. | Owner's choice. |
| D31 (Q13) | Cynthia keeps her in-game moves and gets one held item on each of her six (table in "Cynthia"). No Full Restores. | A level 100 team with full EVs but almost no items is weaker than intended; Full Restores need healing outside the simulator's rules. |
| D32 | Item Clause: no two Pokemon on a team hold the same item. Enforced by a data test on `CYNTHIA`, not the format string. | Showdown's Item Clause only runs in the team validator, which `new Battle` never calls (probed). Daily player items follow the same rule through `itemClause` (see "Player items"). |

## Verified facts (checked today in a scratch install, not in the repo)

| Package | Version | Notes |
|---|---|---|
| `@pkmn/sim` | 0.10.11 | Showdown simulator, ESM. Only `sim/tools/runner.mjs` imports `fs` (not reached). Direct `eval` only in `battle-stream.mjs` (not used). `Battle` runs synchronously in Node and browser. |
| `@pkmn/randoms` | 0.10.11 | `TeamGenerators.getTeamGenerator('gen4randombattle', prng)`. The generator has `randomSets` (per-species data) and `randomSet(name, teamDetails)`. Both are missing from the `.d.ts`; needs a cast. |
| `@pkmn/client` 0.7.3, `@pkmn/view` 0.7.3, `@pkmn/protocol` 0.7.3, `@pkmn/data` 0.10.11 | | `LogFormatter('p1', clientBattle)` turns protocol lines into English. It needs a `@pkmn/client` `Battle` as tracker. Output has `**bold**` and `\|\|hidden\|\|` markup to strip. |
| `@smogon/calc` | 0.12.0 | `calculate(Generations.get(4), attacker, defender, move)`, `result.range()`. Move names from `Dex.moves.get(id).name`; Hidden Power works by its typed name (`Hidden Power Fire`). |
| `preact` | 11.0.2 | Works with `tsconfig` `jsxImportSource: "preact"`, no Vite plugin. |
| `vite` 8.3.5, `vitest` 5.0.5, `typescript` 7.0.2 | | `vite build` and `tsc --noEmit` worked on a probe app. |
| `wrangler` | 4.152.0 | Local D1. `getPlatformProxy()` gives a real local D1 binding in plain Node tests. |
| `@cloudflare/vitest-pool-workers` | 0.23.0 | Requires vitest 4. Not used. |

Probe results:

- `gen4customgame` has no clauses and no team preview. The lead is the first Pokemon in the team.
- `gen4customgame@@@Sleep Clause Mod,OHKO Clause,Evasion Moves Clause` parses. In a raw `Battle`, Sleep Clause Mod blocks a second sleep (`onSetStatus`). OHKO Clause has only `onValidateSet` and Evasion Moves Clause only bans moves at validation, so neither does anything without `TeamValidator`. No `gen4randombattle` set contains Fissure, Sheer Cold, Guillotine, Horn Drill, Double Team or Minimize.
- `PRNG` accepts `"a,b,c,d"` seeds (Gen 5 RNG). `"2026,10,25,0"` works with no hashing; consecutive dates give unrelated teams.
- Same seed plus same choices gives an identical battle log.
- Probe client bundle: 8.2 MB minified, 1.37 MB gzip.
- Timing in Node 26 (cold): importing sim + randoms 1.26 s, team generation 51 ms, a 28-turn battle 101 ms. This matters for the Worker (see R1).
- Pool filter (below) gives about 236 species. Shedinja, Wobbuffet, Smeargle, Ditto, Unown all pass and have sets.
- Golden check: date `2026-10-25` with the algorithm below gives Minun, Victreebel, Flareon, Weavile, Ninjask, Ludicolo.
- PokeAPI sprites folder `sprites/pokemon/versions/generation-iv/platinum/` has 563 front files and 564 back files (`back/`), about 1 KB each: `1.png` to `493.png`, suffix forms (`201-a` to `201-z`, `201-exclamation`, `201-question`, `412-plant/sandy/trash`, `421-overcast/sunshine`, `422-east/west`, `423-east/west`, `493-<type>` for 17 types plus `493-unknown`), and `10001.png` to `10015.png`. Names like `479-wash.png` return 404.
- Worker-style bundle of sim + randoms + calc (esbuild, minified, ESM): 8.1 MB, 1.35 MB gzip. Under the 3 MB Free compressed limit.

## Architecture

```
src/game/  (pure, shared by browser and Worker)       src/ui/ (browser only)
  daily.ts    date -> seeds, day number                  app.tsx    screens
                                                         sprites.ts species -> sprite path
  teams.ts    seed -> player team                        log.ts     protocol -> text
  cynthia.ts  fixed opponent team                        storage.ts localStorage
  calc.ts     damage % via @smogon/calc                  api.ts     fetch wrappers
  ai.ts       opponent choice                            main.tsx   entry
  battle.ts   create / submit / replay / summary
  stats.ts    stats + streaks from history
  share.ts    share text
  name.ts     display name validation

worker/index.ts  (Cloudflare Worker, same origin)
  POST /api/result             validate + store (no replay, D29)
  GET  /api/stats/:date        played / wins
  GET  /api/leaderboard/:date  top 50
  else -> static assets (dist/, includes public/sprites/)
D1: table results

scripts/fetch-sprites.ts  one-off download into public/sprites/
```

`src/game` imports nothing from the browser or Workers runtime. The Worker imports only `name.ts` and `daily.ts`, so `@pkmn/sim` stays out of its bundle. `replay` in `battle.ts` is used by the client to resume an official battle after reload.

### UI choice: Preact

Four screens re-render after every turn. Plain TS would need manual DOM updates or `innerHTML` rebuilds. Preact gives JSX and hooks at about 4 KB with no router or state library. `tsconfig` `jsx: "react-jsx"`, `jsxImportSource: "preact"`; no `@preact/preset-vite` (it pulls Babel).

## Data and interfaces

### Dates and seeds (`src/game/daily.ts`)

- `localDate(now: Date): string` - `YYYY-MM-DD` in the local timezone (`now.toLocaleDateString('en-CA')`).
- `seedFor(date: string, salt: 0 | 1): string` - `"Y,M,D,salt"` with no leading zeros, for example `"2026,10,25,0"`. Salt 0 = team, salt 1 = official battle RNG.
- `dayNumber(date: string): number` - days since `LAUNCH_DATE` plus 1. `LAUNCH_DATE = '2026-10-25'` until the user sets the real one (open question).
- Practice battle seed: `PRNG.generateSeed()`.

### Player team (`src/game/teams.ts`)

`dailyTeam(date: string): PokemonSet[]`, exact algorithm (order matters for the golden test):

1. `prng = new PRNG(seedFor(date, 0))`.
2. `gen = TeamGenerators.getTeamGenerator('gen4randombattle', prng)`.
3. `pool = Dex.forGen(4).species.all()` filtered by `num` 1-493, `!nfe`, `gen.randomSets[id]` exists, no tag in {Restricted Legendary, Sub-Legendary, Mythical}. Copy to a new array.
4. `prng.shuffle(pool)` (mutates in place).
5. Walk the shuffled pool, take a species only if its `baseSpecies` is not taken yet, stop at 6.
6. For each in order: `gen.randomSet(species.name, {})`, then set `level: 100`.
7. Before `ITEMS_FROM` set `item: ''` on all six. From `ITEMS_FROM` on, apply `itemClause` (see "Player items").

Step 3's `randomSets` check drops only cosmetic forms (Gastrodon-East, Pichu-Spiky-eared).

#### Player items

From `ITEMS_FROM = '2026-10-25'` (moved from 10-26 on launch day; no official results existed yet) each Pokemon holds the item its random-battle set already picked. Earlier dates keep `item: ''`, so official battles and stored choice logs from those days replay the same. No extra PRNG calls, so species, moves, abilities and EVs are unchanged for every date.

Item Clause (D32), `itemClause`: walk the six in team order. A Pokemon whose item an earlier one already holds gets the first item from `Leftovers`, `Life Orb`, `Expert Belt`, `Lum Berry`, `Sitrus Berry`, `Muscle Band`, `Wise Glasses`, `Quick Claw` that no one on the team holds. Fit rule: Muscle Band only if the set has more physical than special damaging moves, Wise Glasses only if it has more special than physical; a tie skips both. Over 365 days from `ITEMS_FROM` the fallback runs on 361 days, for 885 of 2190 Pokemon.

UI: the lead card and bench rows show the item. Battle party tiles show the item from the client view; an item that is used up or knocked off shows struck through with "gone". The DS shows nothing new.

### Cynthia (`src/game/cynthia.ts`)

Moves source: pret/pokeplatinum decompilation, `res/trainers/data/champion_cynthia.json` (https://raw.githubusercontent.com/pret/pokeplatinum/main/res/trainers/data/champion_cynthia.json, fetched 2026-10-25). In-game: levels 58-62, `iv_scale` 250, no EVs, only Garchomp holds an item (Sitrus Berry), 4 Full Restores (not modelled; Showdown has no trainer items). Natures and abilities come from the personality value in-game, so they are picked here. Bulbapedia blocked automated fetch and was not used.

Level 100, IVs 31 in every stat, team order as in-game, Spiritomb leads. Held items are chosen here (D31), one per Pokemon, all different (D32). No Choice items: they lock moves and the AI does not plan for that.

| Slot | Species | Item | Ability | Nature | EVs | Moves (in-game, verbatim) |
|---|---|---|---|---|---|---|
| 1 | Spiritomb | Leftovers | Pressure | Modest | 252 HP / 252 SpA / 4 SpD | Dark Pulse, Psychic, Silver Wind, Shadow Ball |
| 2 | Roserade | Black Sludge | Natural Cure | Timid | 4 HP / 252 SpA / 252 Spe | Energy Ball, Sludge Bomb, Toxic, Extrasensory |
| 3 | Togekiss | Expert Belt | Serene Grace | Modest | 252 HP / 252 SpA / 4 Spe | Air Slash, Aura Sphere, Water Pulse, Shock Wave |
| 4 | Lucario | Life Orb | Inner Focus | Naive | 252 Atk / 4 SpA / 252 Spe | Aura Sphere, Extreme Speed, Shadow Ball, Stone Edge |
| 5 | Milotic | Wise Glasses | Marvel Scale | Modest | 252 HP / 252 SpA / 4 Def | Surf, Ice Beam, Mirror Coat, Dragon Pulse |
| 6 | Garchomp | Sitrus Berry | Sand Veil | Naive | 252 Atk / 4 SpA / 252 Spe | Dragon Rush, Earthquake, Flamethrower, Giga Impact |

Item reasons:

- Spiritomb, Leftovers: bulky lead with no weaknesses in Gen 4; steady recovery suits it.
- Roserade, Black Sludge: same recovery as Leftovers for a Poison type, and keeps Leftovers free for Spiritomb.
- Togekiss, Expert Belt: four moves of four different types, so it often hits super effectively; no drawback.
- Lucario, Life Orb: mixed attacker with no recovery; the standard item for it.
- Milotic, Wise Glasses: special attacker; a small boost with no drawback, since Leftovers is taken.
- Garchomp, Sitrus Berry: its in-game item, kept.

All abilities, items (all exist in Gen 4) and move IDs were checked against `Dex.forGen(4)`. `@smogon/calc` models Expert Belt, Life Orb and Wise Glasses in the damage numbers. The AI ignores Life Orb recoil and Leftovers or Black Sludge recovery.

### Damage helper (`src/game/calc.ts`)

Shared by the preview and the AI.

- `toCalc(set: PokemonSet, live?: { hp: number; status: string; boosts: Partial<BoostsTable> }): Pokemon` - calc `Pokemon`, gen 4.
- `fromSim(p: SimPokemon): Pokemon` - `toCalc(p.set, { hp: p.hp, status: p.status, boosts: p.boosts })`.
- `damagePct(attacker: Pokemon, defender: Pokemon, moveId: string): [number, number]` - min and max as percent of the defender's max HP, 1 decimal. Status moves give `[0, 0]`.

### Opponent AI (`src/game/ai.ts`)

`chooseOpponent(battle: Battle): string` returns a `p2` choice (`move N`, `switch N` or `default`) from `battle.p2.activeRequest`. Deterministic, no randomness. Perfect information: it sees the player's active, HP and moves. It must be deterministic because the Worker re-derives every Cynthia choice during verification.

Definitions: expected damage of a move = midpoint of `damagePct` times accuracy / 100 (`accuracy === true` = 100), capped at the target's current HP %, then halved if the move forces a recharge turn (`move.self?.volatileStatus === 'mustrecharge'`, Giga Impact) (D22). "Best move" = highest expected damage.

1. `forceSwitch`: switch to the bench Pokemon (alive, not active) whose best move has the highest expected damage on the player's active. Ties: lower slot.
2. Bad matchup switch, when all hold: the active has `activeMoveActions > 0`, i.e. it has used a move since switching in (no ping-pong; `activeTurns` is already 1 on its first turn in @pkmn/sim, so it cannot be used), the request is not `trapped`, the player's best move can KO it (max % >= its HP %), its best move cannot KO the player (min % < the player's HP %), and the player's active has a higher `getStat('spe')`. Target: the bench Pokemon with the lowest max % taken from the player's best move, only if that is below 50. Otherwise stay in.
3. Otherwise the move with the highest expected damage. Ties: higher priority, then lower slot. Skip disabled moves. All zero: first enabled move. None enabled: `default`.

Known ceiling: ignores crits, secondary effects, status moves (Toxic, Mirror Coat score 0, D22), the player's status and counter moves (Counter, Mirror Coat, Destiny Bond, Encore), and future turns.

### Battle driver (`src/game/battle.ts`)

- Format `gen4customgame@@@Sleep Clause Mod` (D17). p1 name `You`, p2 name `Cynthia`.
- `createBattle(seed: string, team: PokemonSet[], lead: number): Battle` - puts `team[lead]` first, sets both players, then lets the AI answer if `p2` has a pending request.
- `submit(battle: Battle, choice: string): void` - `battle.choose('p1', choice)`, then answer every pending `p2` request with `chooseOpponent` (including a lone forced switch after the turn).
- `replay(seed: string, team: PokemonSet[], lead: number, choices: string[]): Battle` - `createBattle` then `submit` each choice. Throws if the sim rejects a choice (`battle.choose` returns false).
- `p1Pending(battle): 'move' | 'switch' | 'wait' | 'ended'`.
- `summary(battle): { won: boolean; turns: number; p1Fainted: boolean[]; p2Fainted: boolean[] }` - in team order as sent out (lead first).

Only the player's choices are saved and submitted. Cynthia's choices are always recomputed by the AI, so a client cannot submit weak moves for her.

### Result submission (D29)

The client posts `{ date, playerId, name, won, fainted, turns, seed, lead, choices }` once when an official battle ends. `won`, `fainted` and `turns` come from `summary` on the client. The Worker:

1. Validates the shape and the date (D28): `date` matches `^\d{4}-\d{2}-\d{2}$`, is a real calendar date (`new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date`), and `Math.abs(dayNumber(date) - dayNumber(utcToday)) <= 1` where `utcToday = new Date().toISOString().slice(0, 10)`. Reuses `dayNumber`, no new date helper. Known edge: an official battle started just before local midnight in a far-west timezone and finished more than about 12 hours later is rejected (400). The result stays in local history and is not on the leaderboard.
2. Checks the result is internally consistent: `fainted` integer 0-6, `won === (fainted < 6)`, `turns` integer 1-1000, `seed === seedFor(date, 1)`. This is input validation, not verification.
3. Stores the result and the log. No replay.

#### Verification later

Accepted risk (R1): anyone can post a fake winning result, so the leaderboard can be faked until verification is added. Upgrade path, with no client change: replay the stored logs in the Worker (`replay(seed, dailyTeam(date), lead, choices)` and compare `summary` with the stored result), starting with re-checking the top leaderboard entries for a day and removing mismatches. That brings `@pkmn/sim` into the Worker; the earlier estimate was 1.35 MB gzip and about 100 ms CPU per replay, which needs Workers Paid ($5/month). Bulk deletes of fakes can also be done by hand with `wrangler d1 execute`.

### Log text (`src/ui/log.ts`)

`formatLog(lines: string[]): string[]` - feeds the p1 view of the log (`extractChannelMessages(battle.log.join('\n'), [1])[1]` from `@pkmn/sim`) through a `@pkmn/client` `Battle` and `@pkmn/view` `LogFormatter('p1', ...)`, strips `**` and `||...||`, drops blank lines.

Incidental complexity: three packages only for log text. The alternative is a hand-written formatter for about 15 message types. Reuse is chosen because it covers every message.

### Stats (`src/game/stats.ts`)

History is the source of truth; stats are derived.

- `type History = Record<string, 'W' | 'L'>`.
- `computeStats(history: History, today: string): { played: number; winPct: number; winStreak: number; dayStreak: number }`.
- `winPct` = round(wins / played * 100), 0 when empty.
- `dayStreak`: consecutive days with an entry, counting back from today, or from yesterday if today has none.
- `winStreak`: the same walk, stopping at the first `L` or missing day.

### Share text (`src/game/share.ts`)

`shareText(date: string, s: Summary, url: string): string`:

```
Daily Cynthia #1 ✅ 23 turns
🟩🟩🟥🟩🟥🟥
⬛⬛⬛⬛⬛⬛
https://example.com
```

Loss uses ❌. Player row: 🟩 standing, 🟥 fainted. Cynthia row: ⬜ standing, ⬛ downed. Order as sent out. No species names. Copied with `navigator.clipboard.writeText`, `url = location.origin`.

### Display name (`src/game/name.ts`)

`validName(name: string): boolean` - trimmed length 3-16, `^[A-Za-z0-9 _-]+$`, and no blocklist word as a case-insensitive substring after removing spaces, `_` and `-`. Blocklist: a short constant array in the same file (about 20 common slurs and profanity). Used by the UI and the Worker.

### Storage (`src/ui/storage.ts`)

Key `daily-cynthia:v1`:

```ts
type Save = {
  playerId: string;   // crypto.randomUUID() on first load
  name: string;       // '' until chosen
  history: History;   // official results only
  current?: { date: string; lead: number; choices: string[] }; // official battle in progress
};
```

- `load(): Save` returns a fresh save if missing or unparseable. `save(s: Save): void`.
- The official attempt is locked in when the player confirms the lead: `current` is written before turn 1. On reload, `replay` rebuilds the battle; if replay throws, the attempt is recorded as a loss and `current` is cleared.
- On battle end: write `history[date]`, delete `current`, post the result.
- A battle keeps its start `date`, so crossing midnight does not move it to the next day.
- Practice battles live in memory only and do not resume.

### UI (`src/ui/app.tsx`)

1. Home: date and `#N`, stats (played, win %, win streak, day streak), display name field (validated with `validName`), "Play today's battle" (replaced by "Come back tomorrow" when `history[today]` exists), "Practice", today's leaderboard.
2. Lead pick: six sprites with types and moves; for each, best-move damage range vs Spiritomb and Spiritomb's best-move range vs it. Confirm.
3. Battle: both actives (player back sprite, Cynthia front sprite), name, HP bar and %. Four move buttons labelled with damage range vs the current opponent. Cynthia's best-move range vs your active. Bench switch buttons. Scrolling text log. Practice badge in practice.
4. Result: won or lost, turns, Copy share button, "X% of N players beat Cynthia today", today's leaderboard. API parts hidden on fetch failure.

Footer on every screen: "Daily Cynthia is an unofficial fan project and is not affiliated with, endorsed by, or connected to Nintendo, Game Freak, Creatures Inc. or The Pokemon Company. Pokemon names and sprites are trademarks of their respective owners. Battle engine: Pokemon Showdown (MIT). Sprites: PokeAPI."

Sprite `src` comes from `spritePath` (below).

### Sprites (`scripts/fetch-sprites.ts`, `src/ui/sprites.ts`, `public/sprites/`)

Files: `public/sprites/front/<file>.png` and `public/sprites/back/<file>.png`, using PokeAPI's file names unchanged. Vite copies `public/` into `dist/`, so they are served as static assets on the same origin. About 1,130 files, about 1.2 MB, committed to git.

`scripts/fetch-sprites.ts` (run once with `node scripts/fetch-sprites.ts`; Node 26 runs TypeScript directly): lists both folders through the GitHub contents API (`https://api.github.com/repos/PokeAPI/sprites/contents/sprites/pokemon/versions/generation-iv/platinum` and `.../platinum/back`), downloads every `.png` from its `download_url`, writes it, and prints the counts. Skips files that already exist. Not part of the build.

`spritePath(species: string, back: boolean): string` in `src/ui/sprites.ts`, `species` is a Showdown species name (`pokemon.species.name` in the sim, so transformed and battle-only formes also resolve):

1. If the name is in `POKEAPI_IDS`, use that id.
2. Else if the species has a forme, use `${num}-${toID(forme)}` when that file is in `FORME_FILES`.
3. Else `${num}`.

Returns `/sprites/front/<file>.png` or `/sprites/back/<file>.png`.

`POKEAPI_IDS` (PokeAPI 10000+ ids, from https://pokeapi.co/api/v2/pokemon/<id>): Deoxys-Attack 10001, Deoxys-Defense 10002, Deoxys-Speed 10003, Wormadam-Sandy 10004, Wormadam-Trash 10005, Shaymin-Sky 10006, Giratina-Origin 10007, Rotom-Heat 10008, Rotom-Wash 10009, Rotom-Frost 10010, Rotom-Fan 10011, Rotom-Mow 10012, Castform-Sunny 10013, Castform-Rainy 10014, Castform-Snowy 10015. Spot-checked against the PokeAPI endpoint on 2026-10-25 (10001, 10004, 10006-10009, 10012, 10013, 10015).

`FORME_FILES`: the suffix file names from the verified listing (`201-*`, `412-*`, `421-*`, `422-*`, `423-*`, `493-*`). Showdown names covered: Arceus-<Type>, Gastrodon-East, Shellos-East, Burmy-Sandy, Burmy-Trash, Cherrim-Sunshine. Formes with no file (for example Pichu-Spiky-eared) fall back to the base number.

### Backend (Cloudflare)

One Worker with static assets serves `dist/` (including the sprites) and `/api/*` on the same origin. Cloudflare recommends Workers static assets over Pages for new projects, and it keeps one deploy unit; Pages plus Pages Functions also works with the same handler (D26). D1, not KV: the stats and leaderboard need a unique key, `COUNT` and `ORDER BY`; KV has none of these.

`migrations/0001_init.sql`:

```sql
CREATE TABLE results (
  date TEXT NOT NULL,          -- player's local date, YYYY-MM-DD
  player_id TEXT NOT NULL,     -- anonymous UUID from localStorage
  name TEXT NOT NULL,          -- display name at submit time, '' if none
  won INTEGER NOT NULL,        -- 0 or 1, client-reported (D29)
  fainted INTEGER NOT NULL,    -- player Pokemon fainted, client-reported
  turns INTEGER NOT NULL,      -- client-reported
  log TEXT NOT NULL,           -- JSON {"seed":"...","lead":n,"choices":[...]} as submitted, for later verification
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (date, player_id)
);
```

Endpoints (`worker/index.ts`):

- `POST /api/result` body `{ date, playerId, name, won, fainted, turns, seed, lead, choices }`. Validate: steps 1 and 2 of "Result submission"; `playerId` UUID; `name` passes `validName` or is `''`; `won` boolean; `lead` integer 0-5; `choices` array of at most 1000 strings matching `^(move [1-4]|switch [1-6])$`. `INSERT OR IGNORE` (the first result per player per day stands). 204 on success or ignore, 400 on bad input.
- `GET /api/stats/:date` returns `{ played, wins }`. 400 on bad date.
- `GET /api/leaderboard/:date` returns up to 50 `{ name, fainted, turns }` from winning results only (`WHERE won = 1`, D19) ordered by `fainted ASC, turns ASC, created_at ASC`. Empty name shows as `Anonymous`.
- Anything else: `env.ASSETS.fetch(request)`.

`wrangler.jsonc`: `name: "daily-cynthia"`, `main: "worker/index.ts"`, `assets: { directory: "./dist", run_worker_first: ["/api/*"] }`, D1 binding `DB`, `migrations_dir: "migrations"`. Deployed to https://daily-cynthia.owennyo.com on the free Workers plan (D30). Free plan limits that matter: 3 MB compressed bundle, 10 ms CPU per request; a JSON parse plus one D1 insert fits both.

## Assumptions

- A1-A4 became D17, D21, D18 and D20.
- A5. Stats count official attempts only. Win streak and day streak both break on a missed day.
- A6. `@pkmn/*` and `@smogon/calc` are pinned to exact versions. A data change changes everybody's team and breaks replays of in-progress days.
- A7. Plain styling; `frontend-design` skill can do a styled pass later.
- A8. `LAUNCH_DATE` is `2026-10-25` until the first public day is known (D30).
- A9. An official battle whose resume replay fails on the client (after a package upgrade) is recorded locally as a loss and is not posted.
- A10 became D26.

## Open questions

None. Q1-Q13 are settled as D17-D32 (Q2 is moot under D29).

## Risks

- R1. Results are client-reported (D29), so anyone can post a fake winning result and the leaderboard can be faked. Accepted for the MVP. Upgrade path in "Verification later".
- R2. `randomSet` and `randomSets` are internal and untyped. Pinning (A6) and the golden team test catch changes.
- R3. A deploy that changes game code during a day can make an in-progress official battle fail its resume replay on the client (A9). Pinning (A6) keeps this rare. It returns as a server-side issue when verification is added.
- R4. Greedy AI ceiling: never sets up, heals or predicts. Upgrade path: short lookahead using the sim.
- R5. Anonymous IDs: clearing localStorage resets stats and allows a second official attempt under a new ID. Accepted for MVP.
- R6. Players in earlier timezones can share the team before others play. Same as Daily Red.
- R7. Random battle sets assume items (Trick, Fling). Days before `ITEMS_FROM` have no player items, so some moves are weak or fail there. From `ITEMS_FROM` a fallback item (Item Clause) can also miss what a set's moves expect.
- R8. Pokemon IP on a public site, now including self-hosted sprites. The disclaimer reduces, not removes, takedown risk.
- R9. The 40-60% player win rate is not checked before launch. Pushing it up: the AI is deterministic and the player sees both sides' damage ranges, so practice teaches her exact replies; the AI attacks into Wobbuffet (Shadow Tag, Counter, Mirror Coat, Destiny Bond) and similar sets; Toxic and Mirror Coat are dead moves for her; no Full Restores; results are client-reported (R1), so a faked win also counts in `wins / played`. Pushing it down: Cynthia has 252 EVs, good natures and six held items (D31) against random-battle EVs, and the player's items are random-battle picks, often replaced by a fallback (R7). Teams from a uniform pool vary a lot by day. Measure: the daily `wins / played` from `GET /api/stats/:date` over the first two weeks. Levers if off target: AI status-move rules, Cynthia's item choices, the player's fallback items.
