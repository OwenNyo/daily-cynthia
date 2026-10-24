# Daily Cynthia MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily 6v6 Gen 4 battle against Champion Cynthia with a shared seeded team, local stats, share text, and a Cloudflare Worker that stores client-reported results with their input log and serves global stats and a daily leaderboard.

**Architecture:** Pure game logic in `src/game/` (seeds, team, Cynthia, damage calc, AI, battle driver, stats, share, names) is used by a Preact client in `src/ui/`. The browser runs the battle with `@pkmn/sim`. A Cloudflare Worker in `worker/` imports only `src/game/name.ts` and `src/game/daily.ts`, validates the client-reported result and stores it with the input log in D1 (no replay, spec D29).

**Tech Stack:** Node 26, npm 11, TypeScript 7, Vite 8, Vitest 5, Preact 11, `@pkmn/sim` / `@pkmn/randoms` / `@pkmn/data` 0.10.11, `@pkmn/client` / `@pkmn/view` / `@pkmn/protocol` 0.7.3, `@smogon/calc` 0.12.0, Wrangler 4, Cloudflare D1.

**Spec:** `docs/superpowers/specs/2026-10-25-daily-cynthia-mvp.md`

## Global Constraints

- Pin `@pkmn/*` and `@smogon/calc` to exact versions (no `^`): sim/randoms/data 0.10.11, client/view/protocol 0.7.3, calc 0.12.0.
- Battle format string: `gen4customgame@@@Sleep Clause Mod` (spec D17; one constant `FORMAT` in `src/game/battle.ts`).
- `src/game/` must not touch `window`, `document`, `localStorage`, `fetch` or Workers APIs.
- Seeds: `seedFor(date, 0)` for the team, `seedFor(date, 1)` for the official battle, `PRNG.generateSeed()` for practice.
- Player sets: level 100, `item: ''`.
- No `@preact/preset-vite`, no `@cloudflare/vitest-pool-workers` (needs vitest 4).
- Tests run in Node (`environment: 'node'`). Test files live in `tests/`.
- One-line commit messages, stage files by name, branch `feat/mvp`.
- `worker/` must not import `src/game/battle.ts`, `teams.ts`, `ai.ts`, `calc.ts` or `cynthia.ts` (keeps `@pkmn/sim` out of the Worker, spec D29).
- Do not use the em dash character in code comments or UI copy.

## Review Focus

1. Reload while the player owes a forced switch (after a faint or U-turn): the battle must resume at the switch prompt. Test in Task 5 (`replay ends at forced switch`).
2. A battle started before midnight and finished after: the result belongs to the start date. Test in Task 9 (`finishOfficial uses current.date`).
3. Cynthia facing a target her moves cannot damage (Wonder Guard Shedinja): she must still pick a legal move. Test in Task 4 (`all-zero picks first enabled move`).
4. A rejected or stale player choice (double click, switching to the active slot): no AI move is applied and the battle is unchanged. Test in Task 5 (`submit rejects invalid choice`).
5. A malformed or inconsistent submission (bad choices, `won` not matching `fainted`, wrong seed, date outside the window) gives 400, and a second submission for the same day is ignored. Tests in Task 13. A well-formed fake result is accepted by design (spec R1).

---

### Task 1: Project scaffold and daily seeds

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`
- Create: `src/game/daily.ts`
- Test: `tests/daily.test.ts`

**Interfaces:**
- Produces: `localDate(now: Date): string`, `seedFor(date: string, salt: 0 | 1): string`, `dayNumber(date: string): number`, `LAUNCH_DATE = '2026-10-25'`.

- [ ] **Step 1: Scaffold.** `npm init -y`, set `"type": "module"`, `"private": true`. Install exact versions listed in Global Constraints plus `preact`; dev: `vite`, `vitest`, `typescript`. Scripts: `"dev": "vite"`, `"build": "vite build"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`. `tsconfig.json`: `target ES2022`, `module ESNext`, `moduleResolution bundler`, `strict`, `skipLibCheck`, `noEmit`, `jsx react-jsx`, `jsxImportSource preact`, `lib ["ES2022","DOM"]`, `include ["src","tests"]`. `vite.config.ts` with `test: { environment: 'node' }`. `.gitignore`: `node_modules`, `dist`, `.wrangler`.

- [ ] **Step 2: Write the failing tests** in `tests/daily.test.ts`:

```ts
expect(localDate(new Date(2026, 9, 25, 23, 59))).toBe('2026-10-25');
expect(localDate(new Date(2026, 9, 26, 0, 0))).toBe('2026-10-26');
expect(seedFor('2026-10-05', 0)).toBe('2026,10,5,0');
expect(seedFor('2026-10-05', 1)).toBe('2026,10,5,1');
expect(dayNumber('2026-10-25')).toBe(1);
expect(dayNumber('2026-11-01')).toBe(8);
expect(dayNumber('2027-03-29')).toBe(156); // crosses a DST change in most zones
```

- [ ] **Step 3: Run** `npx vitest run tests/daily.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement** `src/game/daily.ts`. `dayNumber` must count calendar days with `Date.UTC` on the parsed parts so DST does not shift it.
- [ ] **Step 5: Run** `npx vitest run tests/daily.test.ts && npm run typecheck`. Expected: PASS, no type errors.
- [ ] **Step 6: Commit** `git add package.json package-lock.json tsconfig.json vite.config.ts .gitignore src/game/daily.ts tests/daily.test.ts && git commit -m "Scaffold project and daily seeds"`

### Task 2: Daily player team

**Files:**
- Create: `src/game/teams.ts`
- Test: `tests/teams.test.ts`

**Interfaces:**
- Consumes: `seedFor` (Task 1).
- Produces: `dailyTeam(date: string): PokemonSet[]` (`PokemonSet` from `@pkmn/sim`).

- [ ] **Step 1: Write the failing tests:**
  - `golden 2026-10-25`: `dailyTeam('2026-10-25').map(s => s.species)` equals `['Minun','Victreebel','Flareon','Weavile','Ninjask','Ludicolo']`.
  - `deterministic`: two calls for `'2026-10-26'` are `toEqual`.
  - `differs by day`: species lists for `'2026-10-25'` and `'2026-10-26'` differ.
  - `pool rules over 365 days` (loop from 2026-10-25): every set has `level === 100`, `item === ''`, 6 distinct `baseSpecies`, species `num` 1-493, `!nfe`, no tag in `Restricted Legendary`, `Sub-Legendary`, `Mythical`.
- [ ] **Step 2: Run** `npx vitest run tests/teams.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `dailyTeam` with the exact 6-step algorithm in the spec ("Player team"). Cast the generator to `{ randomSets: Record<string, unknown>; randomSet(name: string, details: object): PokemonSet }` with a one-line comment that these are untyped internals.
- [ ] **Step 4: Run** `npx vitest run tests/teams.test.ts && npm run typecheck`. Expected: PASS. If the golden list differs, stop and report; do not edit the expected list.
- [ ] **Step 5: Commit** `git add src/game/teams.ts tests/teams.test.ts && git commit -m "Add seeded daily player team"`

### Task 3: Cynthia's team and damage helper

**Files:**
- Create: `src/game/cynthia.ts`, `src/game/calc.ts`
- Test: `tests/calc.test.ts`

**Interfaces:**
- Produces: `CYNTHIA: PokemonSet[]` (6 sets, spec table, Spiritomb first). `toCalc(set: PokemonSet, live?: { hp: number; status: string; boosts: Partial<BoostsTable> }): Pokemon`, `fromSim(p: SimPokemon): Pokemon`, `damagePct(attacker: Pokemon, defender: Pokemon, moveId: string): [number, number]`. `Pokemon` here is `@smogon/calc`'s; `SimPokemon` is `Pokemon` from `@pkmn/sim`.

- [ ] **Step 1: Write the failing tests:**
  - `CYNTHIA valid`: 6 sets, all `level 100`, IVs 31, items exactly as in the spec table (Leftovers, Black Sludge, Expert Belt, Life Orb, Wise Glasses, Sitrus Berry), every item exists in `Dex.forGen(4).items`, every move id exists in `Dex.forGen(4).moves`, every ability is one of the species' Gen 4 abilities.
  - `item clause`: the six items are all different (spec D32).
  - `known calc`: Cynthia's Garchomp `earthquake` vs a level 100 Milotic set with 0 EVs, neutral nature: range is within `[60, 90]` and `min < max` (sanity band, not exact numbers).
  - `item in calc`: Cynthia's Lucario `aurasphere` vs a fixed target gives a higher max than the same set with `item: ''` (Life Orb is applied).
  - `status move`: `damagePct(spiritomb, x, 'toxic')` is `[0, 0]`.
  - `hidden power`: a set with move `hiddenpowerfire` and IVs `{atk:30, spa:30, spe:30}` vs Cynthia's Roserade returns a range with `max > 0`.
  - `live hp`: `toCalc(set, { hp: 1, status: '', boosts: {} })` gives `curHP() === 1`.
- [ ] **Step 2: Run** `npx vitest run tests/calc.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `cynthia.ts` is data only, copied from the spec table. `calc.ts` uses `Generations.get(4)`; move name via `Dex.moves.get(id).name`, and for Hidden Power use `Hidden Power <type>` from `Dex.moves.get(id).type`. Percent = damage / defender max HP * 100, rounded to 1 decimal.
- [ ] **Step 4: Run** `npx vitest run tests/calc.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/game/cynthia.ts src/game/calc.ts tests/calc.test.ts && git commit -m "Add Cynthia team and damage helper"`

### Task 4: Opponent AI

**Files:**
- Create: `src/game/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `fromSim`, `damagePct` (Task 3), `CYNTHIA`.
- Produces: `chooseOpponent(battle: Battle): string`.

Tests build a raw `new Battle({ formatid: FORMAT, seed: '1,2,3,4' })` (`FORMAT` as in Global Constraints; define it locally in the test until Task 5 exports it) with hand-picked teams (level 100, explicit moves) so each case is controlled. Add a small `set(species, moves, extra?)` helper inside the test file.

- [ ] **Step 1: Write the failing tests:**
  - `picks highest expected damage`: p2 Lucario (Cynthia set) vs p1 Tyranitar (moves `crunch`, `stoneedge`, `earthquake`, `pursuit`, healthy): returns `move 1` (Aura Sphere).
  - `type matchup`: p2 Garchomp vs p1 Skarmory (`spikes`, `roost`, `whirlwind`, `bravebird`): returns `move 3` (Flamethrower; Earthquake is immune, Dragon Rush and Giga Impact are resisted).
  - `prefers priority on equal KO`: p2 Lucario vs p1 Alakazam with `battle.p1.active[0].hp = 1`: Aura Sphere, Extreme Speed and Shadow Ball all KO; returns `move 2` (Extreme Speed, priority +1).
  - `all-zero picks first enabled move`: p2 Roserade (Cynthia set) vs p1 Shedinja: returns `move 1`.
  - `recharge move halved`: p2 Garchomp vs p1 Togekiss (0 EVs, neutral nature, `airslash`, `aurasphere`, `roost`, `thunderwave`, full HP): returns `move 1` (Dragon Rush). Earthquake is immune, and Giga Impact would win without the halving (spec D22).
  - `bad matchup switch`: p2 Spiritomb (Cynthia team order) after one turn (`activeMoveActions > 0`), HP set to 10%, vs p1 Infernape (Jolly, 252 Atk / 252 Spe, moves `flareblitz`, `closecombat`, `uturn`, `machpunch`) at full HP: returns `switch 6` (Garchomp takes the least from Flare Blitz: 28.9% vs Milotic 30.5%, checked with @smogon/calc). Make one turn of choices first.
  - `no switch on first active turn`: same setup with no move used since switching in (`activeMoveActions === 0`): returns a `move`.
  - `forced switch`: after p2 active faints, `p2.activeRequest.forceSwitch` is set; returns `switch N` for the bench member with the best expected damage on p1's active.
- [ ] **Step 2: Run** `npx vitest run tests/ai.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three rules exactly as in the spec ("Opponent AI"). Switch slot numbers are 1-based positions in `battle.p2.pokemon`, as the sim's `switch N` expects.
- [ ] **Step 4: Run** `npx vitest run tests/ai.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/game/ai.ts tests/ai.test.ts && git commit -m "Add greedy opponent AI"`

### Task 5: Battle driver, replay and summary

**Files:**
- Create: `src/game/battle.ts`
- Create: `tests/helpers.ts`
- Test: `tests/battle.test.ts`

**Interfaces:**
- Consumes: `CYNTHIA`, `chooseOpponent`.
- Produces: `FORMAT`, `createBattle(seed: string, team: PokemonSet[], lead: number): Battle`, `submit(battle: Battle, choice: string): void` (throws `Error('invalid choice')` when `battle.choose('p1', choice)` returns false), `replay(seed: string, team: PokemonSet[], lead: number, choices: string[]): Battle`, `p1Pending(battle: Battle): 'move' | 'switch' | 'wait' | 'ended'`, `type Summary = { won: boolean; turns: number; p1Fainted: boolean[]; p2Fainted: boolean[] }`, `summary(battle: Battle): Summary`.
- Test helper `autoPlay(seed: string, team: PokemonSet[], lead: number, maxChoices = 1000): string[]` in `tests/helpers.ts`: plays a battle to the end with `createBattle` + `submit`, choosing `move 1` (or the first non-disabled move) when moving and `switch N` for the first alive bench slot when switching, and returns the choices. Used again in Task 10.

- [ ] **Step 1: Write the failing tests:**
  - `lead goes first`: `createBattle(s, team, 3).p1.pokemon[0].species.name === team[3].species`.
  - `plays to the end`: `autoPlay` on `seedFor('2026-10-25',1)` and `dailyTeam('2026-10-25')`, then `replay` with the result: `battle.ended === true`, `summary.turns > 0`, exactly one of (all `p1Fainted` true, all `p2Fainted` true).
  - `replay deterministic`: replaying the same choices twice gives identical `battle.log.join('\n')`.
  - `replay ends at forced switch`: take the choices from `autoPlay` up to just before the first `switch` choice; `p1Pending(replay(...))` is `'switch'`.
  - `submit rejects invalid choice`: on a fresh battle, `submit(b, 'switch 1')` throws and `b.turn` and `b.log.length` are unchanged.
  - `sleep clause on`: `createBattle(...).ruleTable.has('sleepclausemod')` is true.
  - `summary order`: `p1Fainted.length === 6`, `p2Fainted.length === 6`, order follows team order after the lead swap.
- [ ] **Step 2: Run** `npx vitest run tests/battle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Before `battle.choose('p1', ...)`, record `battle.log.length`; if `choose` returns false throw without calling the AI. After a successful p1 choice loop: while `p2.activeRequest` exists, is not `wait`, and `!p2.isChoiceDone()`, call `battle.choose('p2', chooseOpponent(battle))`. Run that same loop at the end of `createBattle`.
- [ ] **Step 4: Run** `npx vitest run tests/battle.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/game/battle.ts tests/helpers.ts tests/battle.test.ts && git commit -m "Add battle driver with replay"`

### Task 6: Stats and streaks

**Files:**
- Create: `src/game/stats.ts`
- Test: `tests/stats.test.ts`

**Interfaces:**
- Produces: `type History = Record<string, 'W' | 'L'>`, `computeStats(history: History, today: string): { played: number; winPct: number; winStreak: number; dayStreak: number }`.

- [ ] **Step 1: Write the failing tests** (today = `'2026-10-25'`):
  - `{}` gives `{ played: 0, winPct: 0, winStreak: 0, dayStreak: 0 }`.
  - `{ '2026-10-23':'W', '2026-10-24':'W', '2026-10-25':'W' }` gives played 3, winPct 100, winStreak 3, dayStreak 3.
  - Today not played yet: `{ '2026-10-23':'W', '2026-10-24':'W' }` gives winStreak 2, dayStreak 2.
  - Gap breaks both: `{ '2026-10-22':'W', '2026-10-24':'W' }` gives winStreak 1, dayStreak 1.
  - Loss: `{ '2026-10-23':'W', '2026-10-24':'L', '2026-10-25':'W' }` gives winPct 67, winStreak 1, dayStreak 3.
  - Month boundary: `{ '2026-09-30':'W', '2026-10-01':'W' }` with today `'2026-10-01'` gives dayStreak 2.
- [ ] **Step 2: Run** `npx vitest run tests/stats.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Step back one day with `Date.UTC` arithmetic on the date parts, not local `Date`, to avoid DST.
- [ ] **Step 4: Run** `npx vitest run tests/stats.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/game/stats.ts tests/stats.test.ts && git commit -m "Add stats and streaks"`

### Task 7: Share text

**Files:**
- Create: `src/game/share.ts`
- Test: `tests/share.test.ts`

**Interfaces:**
- Consumes: `Summary` (Task 5), `dayNumber` (Task 1).
- Produces: `shareText(date: string, s: Summary, url: string): string`.

- [ ] **Step 1: Write the failing tests:**
  - Win: `shareText('2026-10-25', { won: true, turns: 23, p1Fainted: [false,false,true,false,true,true], p2Fainted: [true,true,true,true,true,true] }, 'https://x.test')` equals `'Daily Cynthia #1 ✅ 23 turns\n🟩🟩🟥🟩🟥🟥\n⬛⬛⬛⬛⬛⬛\nhttps://x.test'`.
  - Loss: same with `won: false`, all `p1Fainted` true, `p2Fainted` `[true,true,false,false,false,false]` starts with `'Daily Cynthia #1 ❌ 23 turns'` and has row `'⬛⬛⬜⬜⬜⬜'`.
  - Spoiler free: output contains no species name from `dailyTeam('2026-10-25')` or `CYNTHIA`.
- [ ] **Step 2: Run** `npx vitest run tests/share.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `shareText`.
- [ ] **Step 4: Run** `npx vitest run tests/share.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/game/share.ts tests/share.test.ts && git commit -m "Add share text"`

### Task 8: Display name validation

**Files:**
- Create: `src/game/name.ts`
- Test: `tests/name.test.ts`

**Interfaces:**
- Produces: `validName(name: string): boolean`, `BLOCKLIST: readonly string[]` (about 20 lowercase words, implementer's choice of common English slurs and profanity).

- [ ] **Step 1: Write the failing tests:** `'Ash'` true; `'  Red_99 '` true (trimmed); `'ab'` false; 17 chars false; `'bad<script>'` false; each `BLOCKLIST` word false; a blocklist word split with spaces, `_` or `-` false; the same word in mixed case false.
- [ ] **Step 2: Run** `npx vitest run tests/name.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per spec ("Display name").
- [ ] **Step 4: Run** `npx vitest run tests/name.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/game/name.ts tests/name.test.ts && git commit -m "Add display name validation"`

### Task 9: Local save and resume

**Files:**
- Create: `src/ui/storage.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: `History` (Task 6).
- Produces: `type Save = { playerId: string; name: string; history: History; current?: { date: string; lead: number; choices: string[] } }`, `KEY = 'daily-cynthia:v1'`, `load(store: Storage = localStorage): Save`, `save(s: Save, store: Storage = localStorage): void`, `finishOfficial(s: Save, won: boolean): Save` (pure: sets `history[s.current.date]`, removes `current`).

Tests pass a small in-memory `Storage` object (a `Map` behind `getItem` / `setItem` / `removeItem` / `clear` / `key` / `length`), defined in the test file.

- [ ] **Step 1: Write the failing tests:**
  - `fresh save`: empty store gives `history {}`, `name ''`, no `current`, `playerId` matching a UUID regex.
  - `corrupt data`: `setItem(KEY, '{not json')` then `load` gives a fresh save, no throw.
  - `round trip`: `save` then `load` returns an equal object, and the same `playerId` across loads.
  - `finishOfficial uses current.date`: `current.date = '2026-10-25'` gives `history['2026-10-25']` set even though the test runs on another day; `current` is gone.
- [ ] **Step 2: Run** `npx vitest run tests/storage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `load` writes the fresh save back so `playerId` is stable.
- [ ] **Step 4: Run** `npx vitest run tests/storage.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/ui/storage.ts tests/storage.test.ts && git commit -m "Add local save and resume"`

### Task 10: Battle log text

**Files:**
- Create: `src/ui/log.ts`
- Test: `tests/log.test.ts`

**Interfaces:**
- Produces: `formatLog(battle: Battle): string[]`.

- [ ] **Step 1: Write the failing tests:** after `createBattle` + `submit(b, 'move 1')` on the daily team: output contains a line with `'used'`, a line starting `'== Turn 1 =='` or containing `'Turn 1'`, and no line contains `'**'` or `'||'`. A full `autoPlay` battle's last lines include `'won the battle'`.
- [ ] **Step 2: Run** `npx vitest run tests/log.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `@pkmn/client`, `@pkmn/view`, `@pkmn/protocol`, `@pkmn/data` at exact versions. Build a new client `Battle(new Generations(Dex))` and `LogFormatter('p1', clientBattle)` on each call; for each line from `extractChannelMessages(battle.log.join('\n'), [1])[1]`: `Protocol.parseBattleLine`, `formatText`, then `clientBattle.add`. Do not call `clientBattle.update()` (it needs a request and throws).
- [ ] **Step 4: Run** `npx vitest run tests/log.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add package.json package-lock.json src/ui/log.ts tests/log.test.ts && git commit -m "Add battle log text"`

### Task 11: Self-hosted sprites

**Files:**
- Create: `scripts/fetch-sprites.ts`, `src/ui/sprites.ts`, `public/sprites/front/*.png`, `public/sprites/back/*.png`
- Test: `tests/sprites.test.ts`

**Interfaces:**
- Consumes: `dailyTeam` (Task 2), `CYNTHIA` (Task 3).
- Produces: `spritePath(species: string, back: boolean): string` returning `/sprites/front/<file>.png` or `/sprites/back/<file>.png`; `POKEAPI_IDS: Record<string, number>`; `FORME_FILES: ReadonlySet<string>`.

- [ ] **Step 1: Write and run the fetch script.** Per spec ("Sprites"). Run `node scripts/fetch-sprites.ts`. Expected output: about 563 front and 564 back files written; `ls public/sprites/front | wc -l` and `ls public/sprites/back | wc -l` match the printed counts.
- [ ] **Step 2: Write the failing tests:**
  - `known mappings`: `spritePath('Rotom-Wash', false) === '/sprites/front/10009.png'`, `spritePath('Arceus-Psychic', true) === '/sprites/back/493-psychic.png'`, `spritePath('Gastrodon-East', false) === '/sprites/front/423-east.png'`, `spritePath('Garchomp', false) === '/sprites/front/445.png'`, `spritePath('Pichu-Spiky-eared', false) === '/sprites/front/172.png'`.
  - `every Gen 1-4 species resolves`: for every `Dex.forGen(4).species.all()` entry with `num` 1-493 and `isNonstandard == null`, both `public` + `spritePath(name, false)` and `public` + `spritePath(name, true)` exist on disk (`fs.existsSync`). This covers the whole pool, Cynthia, transformed and battle-only formes.
  - `daily pool and Cynthia`: the same check for `CYNTHIA` and for `dailyTeam(d)` over 365 days from 2026-10-25 (explicit, as requested, even though the test above is a superset).
- [ ] **Step 3: Run** `npx vitest run tests/sprites.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `src/ui/sprites.ts` with the lookup order and tables from the spec. `toID` from `@pkmn/sim`.
- [ ] **Step 5: Run** `npx vitest run tests/sprites.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `git add scripts/fetch-sprites.ts src/ui/sprites.ts public/sprites tests/sprites.test.ts && git commit -m "Add self-hosted sprites"` (staging a directory of generated files by name is the exception here; it holds only the PNGs from Step 1).

### Task 12: Client UI

**Files:**
- Create: `index.html`, `src/ui/main.tsx`, `src/ui/app.tsx`, `src/ui/app.css`

**Interfaces:**
- Consumes: everything from Tasks 1-11.
- Produces: the four screens and footer from the spec ("UI"), without any API calls yet.

No unit tests for the UI. Verification is a build plus a manual checklist.

- [ ] **Step 1: Implement** the screens. State: one `useState` holding the screen and the live `Battle`; bump a counter after each `submit` to re-render. Sprites: `spritePath(pokemon.species.name, back)` (player back, Cynthia front). Official flow: confirming the lead writes `current` via `save` before turn 1; each `submit` appends to `current.choices` and saves; on `battle.ended` call `finishOfficial` and save. On load, if `current` exists, `replay` it (on throw, `finishOfficial(save, false)`). Practice uses `PRNG.generateSeed()` and never saves.
- [ ] **Step 2: Build** `npm run typecheck && npm run build`. Expected: exit 0, `dist/index.html` and `dist/sprites/front/445.png` exist. A chunk-size warning and a direct-`eval` warning from `battle-stream.mjs` are expected.
- [ ] **Step 3: Manual check** with `npm run dev` (or the `run` skill) and record the result for each:
  1. Home shows `#1` on 2026-10-25, stats all 0.
  2. Lead pick shows six sprites and damage ranges vs Spiritomb.
  3. In battle, move buttons show ranges; picking a move updates HP and log.
  4. Reload mid-battle: same HP, same log, same turn.
  5. Finish the battle: result screen, Copy puts the share text on the clipboard, Home shows "Come back tomorrow" and played 1.
  6. Practice works after the official attempt and does not change stats.
  7. Footer disclaimer visible on every screen.
  8. Network tab shows no request to `githubusercontent.com` (no hotlinking).
- [ ] **Step 4: Commit** `git add index.html src/ui/main.tsx src/ui/app.tsx src/ui/app.css && git commit -m "Add client UI"`

---

Backend tasks start here. They depend on the client only through `src/game/name.ts` and `src/game/daily.ts`.

### Task 13: Worker, D1 schema and result submission

**Files:**
- Create: `wrangler.jsonc`, `worker/index.ts`, `worker/tsconfig.json`, `worker-configuration.d.ts` (generated), `migrations/0001_init.sql`
- Modify: `package.json` (devDependency `wrangler`; scripts `typecheck`, `deploy`, `test:worker`; exclude `tests/worker.test.ts` from `npm test`)
- Test: `tests/worker.test.ts`

**Interfaces:**
- Consumes: `validName` (Task 8), `seedFor`, `dayNumber` (Task 1).
- Produces: `export default { fetch(request: Request, env: Env): Promise<Response> }`, `Env = { DB: D1Database; ASSETS: Fetcher }`. `POST /api/result` per spec ("Result submission", "Backend"). Other paths go to `env.ASSETS.fetch(request)`.

- [ ] **Step 1: Config and schema.** `wrangler.jsonc` per spec ("Backend"): `name: "daily-cynthia"`, `compatibility_date: "2026-10-25"`, placeholder D1 `database_id`. `npx wrangler types`. `worker/tsconfig.json` includes `.`, `../src/game/name.ts`, `../src/game/daily.ts`, `../worker-configuration.d.ts`, no DOM lib. Schema from the spec into `migrations/0001_init.sql`. Scripts: `"typecheck": "tsc --noEmit && tsc --noEmit -p worker"`, `"deploy": "npm run build && wrangler deploy"`, `"test:worker": "wrangler d1 migrations apply DB --local && vitest run tests/worker.test.ts"`.
- [ ] **Step 2: Write the failing tests.** `env` from `getPlatformProxy({ configPath: 'wrangler.jsonc' })` (from `wrangler`); call `worker.fetch(new Request('http://x/api/result', { method: 'POST', body }), env)`. Base body: `date` = UTC date `new Date().toISOString().slice(0, 10)` (always inside the window), a fresh `crypto.randomUUID()` per test, `name 'Ash'`, `won true`, `fainted 2`, `turns 30`, `seed seedFor(date, 1)`, `lead 0`, `choices ['move 1', 'switch 2', 'move 3']`.
  - `valid result stored`: 204; the row's `won`, `fainted`, `turns`, `name` equal the body; `log` parses to `{ seed, lead, choices }`.
  - `bad name`: a blocklist word gives 400.
  - `inconsistent result`: `won true, fainted 6` gives 400; `won false, fainted 2` gives 400; `fainted 7` gives 400; `turns 0` gives 400.
  - `wrong seed`: `seed seedFor(date, 0)` gives 400.
  - `malformed`: `['move 9']` gives 400; `lead: 6` gives 400; 1001 choices give 400; non-JSON body gives 400.
  - `date window` (spec D28; offsets from the UTC date): UTC yesterday and UTC tomorrow give 204 (with the matching `seed`); 2 days before and 2 days after give 400; `'2026-02-30'` gives 400.
  - `second submission ignored`: a second valid but different submission for the same player and date returns 204 and leaves the row unchanged.
- [ ] **Step 3: Run** `npm run test:worker`. Expected: FAIL.
- [ ] **Step 4: Implement** per spec ("Result submission", "Backend").
- [ ] **Step 5: Run** `npm run test:worker && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Bundle check.** `npm run build && npx wrangler deploy --dry-run --outdir .wrangler/dryrun`. Expected: the reported gzip size is far under the free plan's 3 MB and the output contains no `@pkmn` code (`grep -c pkmn .wrangler/dryrun/*.js` is 0).
- [ ] **Step 7: Commit** `git add wrangler.jsonc worker/index.ts worker/tsconfig.json worker-configuration.d.ts migrations/0001_init.sql package.json package-lock.json tests/worker.test.ts && git commit -m "Add Worker result submission"`

### Task 14: Stats and leaderboard endpoints

**Files:**
- Modify: `worker/index.ts`
- Test: `tests/worker.test.ts`

**Interfaces:**
- Produces: `GET /api/stats/:date` returning `{ played: number; wins: number }`; `GET /api/leaderboard/:date` returning `{ name: string; fainted: number; turns: number }[]` (max 50, winners only).

- [ ] **Step 1: Write the failing tests.** Insert rows directly with `env.DB.prepare(...)` for a fixed date such as `'2000-01-01'` (delete that date's rows first, so reruns are clean):
  - `stats`: 3 rows, 2 won, gives `{ played: 3, wins: 2 }`; `/api/stats/2000-1-1` gives 400; a date with no rows gives `{ played: 0, wins: 0 }`.
  - `leaderboard order`: winning rows (fainted 2, turns 30), (0, 40), (0, 25), (5, 10) come back with turns 25, 40, 30, 10.
  - `winners only`: a losing row (won 0, fainted 6, turns 5) is not returned (spec D19).
  - `anonymous`: a row with `name ''` shows `'Anonymous'`.
  - `limit`: 60 winning rows give 50.
- [ ] **Step 2: Run** `npm run test:worker`. Expected: FAIL.
- [ ] **Step 3: Implement** with one SQL query each (`COALESCE(NULLIF(name, ''), 'Anonymous')`, `WHERE date = ? AND won = 1 ORDER BY fainted, turns, created_at LIMIT 50`).
- [ ] **Step 4: Run** `npm run test:worker && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add worker/index.ts tests/worker.test.ts && git commit -m "Add stats and leaderboard endpoints"`

### Task 15: Client API wiring

**Files:**
- Create: `src/ui/api.ts`
- Modify: `src/ui/app.tsx`

**Interfaces:**
- Consumes: endpoints from Tasks 13-14, `Save` (Task 9), `validName` (Task 8), `summary` (Task 5), `seedFor` (Task 1).
- Produces: `postResult(body: { date: string; playerId: string; name: string; won: boolean; fainted: number; turns: number; seed: string; lead: number; choices: string[] }): Promise<void>`, `getStats(date: string): Promise<{ played: number; wins: number }>`, `getLeaderboard(date: string): Promise<{ name: string; fainted: number; turns: number }[]>`. All throw on non-2xx; the UI catches and hides the section.

- [ ] **Step 1: Implement.** Post once when an official battle ends: `won`, `turns` and `fainted` (count of `p1Fainted`) from `summary`, `seed = seedFor(current.date, 1)`, and `date`, `lead`, `choices` captured from `current` before `finishOfficial` clears it. Home: name field saved to `Save.name` only when `validName` passes; today's leaderboard. Result: "X% of N players beat Cynthia today" and the leaderboard.
- [ ] **Step 2: Verify** `npm run typecheck && npm run build && npx wrangler d1 migrations apply DB --local && npx wrangler dev`, then in the browser: finish an official battle, see the % line and your name on the leaderboard; stop `wrangler dev`, serve `dist/` with `npx vite preview`, reload, confirm the page works with the API parts hidden.
- [ ] **Step 3: Commit** `git add src/ui/api.ts src/ui/app.tsx && git commit -m "Wire client to stats and leaderboard API"`

## Not in this plan

- Creating the production D1 database and deploying to https://daily-cynthia.owennyowy.workers.dev (free Workers plan, spec D30): needs the user's Cloudflare account.
- Server-side replay verification: deferred by spec D29; upgrade path in spec "Verification later".
- Player items, all-time leaderboard, rate limiting, lazy loading: deferred by spec D18, D24, D25 and "Items later".
