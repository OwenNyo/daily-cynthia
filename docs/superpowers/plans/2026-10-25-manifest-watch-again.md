# Daily Cynthia - Web manifest, and "Watch again" for your official battle

Scope comes from the debate decision ("Build now", items 12 and 11). Two sections, one commit each, in this order. Nothing else: no service worker, no past-day replays, no other players' replays, no D1 or worker change.

## 1. Web manifest (feature 12)

Commit: `feat: web manifest and app icons`

### Files

- `public/manifest.webmanifest` (new), JSON:
  - `name` "Daily Cynthia", `short_name` "Cynthia" ("Daily Cynthia" is 13 characters; Chrome advises 12 or fewer so the home screen label is not cut)
  - `start_url` "/", `display` "standalone"
  - `background_color` and `theme_color` "#17161F" (the dark `theme-color` in `index.html`)
  - `icons`: `{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" }` and the same for 512.
- `public/icon-192.png`, `public/icon-512.png` (new): the apple-touch-icon art at the new sizes. Render them the way `apple-touch-icon.png` was made: Playwright from `~/Personal/lazada-drop-bot/node_modules/playwright`, using a copy of the scratch file `/private/tmp/claude-501/-Users-owen/350cd5de-0b30-4824-a184-b1bf1e6c052c/scratchpad/meta/icon.html` with its 180 px numbers turned into `vw` units (body 100vw square, circle 73.3vw, border 6.67vw), screenshotted at viewport 192x192 and 512x512 into `public/`. The scratch files are not shipped, so the icons cannot be rebuilt from this repo alone; that is accepted for a one-time render.
- `index.html`: `<link rel="manifest" href="/manifest.webmanifest" />` on the line after the `apple-touch-icon` link.

### Serving (checked 2026-10-25)

`npm run build && npx wrangler dev --port 8799`, with a probe file `dist/probe.webmanifest`: `curl -I` returned `200` and `Content-Type: application/manifest+json`. Workers static assets infer the type from the extension, so `wrangler.jsonc` needs no change. (Probe file removed, wrangler stopped.)

### Tests first

New `tests/manifest.test.ts` (node `fs`, no new dependency):
- the manifest parses as JSON; `start_url` is "/", `display` is "standalone".
- every icon in `icons` exists in `public/`, and its PNG width and height (read from the IHDR chunk, bytes 16-23, big-endian) match its `sizes`. At least one 192x192 and one 512x512 icon is listed.
- `index.html` contains `<link rel="manifest" href="/manifest.webmanifest"`.

Watch it fail (no manifest yet), then add the files.

### Checks

- `npm test`, `npm run typecheck`, `npm run build`, then `ls dist/manifest.webmanifest dist/icon-192.png dist/icon-512.png`.
- `npx wrangler dev --port 8799`, `curl -I http://localhost:8799/manifest.webmanifest` shows `application/manifest+json`. Stop wrangler afterwards.
- Chrome DevTools, Application > Manifest on the wrangler page: name, colours and both icons shown, no errors. (A warning about a missing `id` or `screenshots` is expected and fine.)
- Open both PNGs and confirm they look like `apple-touch-icon.png`.

## 2. Keep your official battle and "Watch again" (feature 11, own battle only)

Commit: `feat: keep your official battle and watch it again`

### How it works today (do not break)

- Playback: `play: Playback | null` in `App` (`src/ui/app.tsx` around line 248). `play.shown` is how many log steps are on screen, `play.menu` is the bottom screen shown, locked, while steps play. The effect at line 304 calls `advance()` every 700 ms and sets `play` to `null` at the end. `view` (line 302) is the client battle cut at `steps[play.shown - 1].end`. Skip (`onSkip`, line 430) sets `play` to `null`.
- `Ds` (line 660) focuses Skip when playback starts and focus is on `<body>` or inside the DS. `BattleView` (line 987) focuses `[data-autofocus]` (the result heading) when `playing` turns false and `done` is set.
- `resume()` (line 132) rebuilds the official battle with `replay(seedFor(date, 1), dailyTeam(date), lead, choices)`.
- Two tabs: every write goes through `persist()` -> `update()` (read-modify-write on the latest save). `staleOfficial()` is only used in `choose()`. The `storage` listener (line 274) refreshes `store` when no battle is running (`inBattle` false, which includes a finished battle).
- The result is posted only in `choose()` (when `live.battle.ended`) and from `init.post` (resume of a finished battle).

"Watch again" uses none of the write paths: it reads the save, builds a finished `Live`, and starts playback. It never calls `persist`, `save`, `update`, `finishOfficial` or `postResult`.

### Files

`src/ui/storage.ts`:
- `export type Result = Summary & { lead?: number; choices?: string[] };` and `results?: Record<string, Result>`. Optional, because days played before this ships have none.
- `finishOfficial`: when `done` is given, store `{ ...done, lead: current!.lead, choices: current!.choices }`. With no `done` (failed resume) still no `results` entry.
- `isSummary` and `withValidResults` stay as they are (extra fields already survive load).

`src/ui/app.tsx`:
- Next to `resume()`:
  - `const watchable = (r?: Result) => !!r && Number.isInteger(r.lead) && Array.isArray(r.choices);`
  - `export function watchAgain(date: string, r?: Result): Live | null`: `null` unless `watchable(r)`; else `replay(seedFor(date, 1), dailyTeam(date), r.lead, r.choices)` inside `try`. On a throw, `console.error` and `null`. If the rebuilt battle has not ended, `null`. Else `{ battle, official: true, done: summary(battle) }`.
- In `App`, one handler:
  ```ts
  const onWatch = () => {
    const w = watchAgain(date, load().results?.[date]); // latest save, like the rest of the official flow
    if (!w) return;
    setSwitching(false);
    setCopied(false);
    setLive(w);
    setPlay({ shown: 1, menu: { kind: 'wait' } });
  };
  ```
  Playback runs even with reduced motion (the player asked to watch; the CSS already turns off the animations). Owner confirmed 2026-10-25: this is the one exception to the battle-playback plan's reduced-motion rule; normal turns still show at once.
- Where the button shows (only for the page's `date`, only when `watchable(store.results?.[date])`):
  - Home screen, result view: in the `.actions` row under the DS, before Practice: `<button type="button" class="secondary">Watch again</button>`. ("Battle Cynthia" is already hidden there because the day is played.)
  - Battle result screen (`BattleView`, `done && !playing`), official battles only: in `.screen-actions`, a third `pill` "Watch again" before Practice and Back to home. Pass it as an optional `onWatch` prop; `App` passes it only when `live.official && watchable(store.results?.[date])`. Practice results never show it.
- `BattleView` "wait" screen (line 1062): show `done ? 'Watching your battle again.' : 'Waiting...'` so the bottom screen does not say "Waiting..." during a replay.
- No CSS change expected (`.actions` and `.screen-actions` already lay out N buttons). Fix only if the 320 px check fails.

### UI behaviour

- Label "Watch again" (visible text is the accessible name). A native `<button>`, so Tab, Enter and Space work.
- On click: the battle screen opens at the first log step, header shows the "Official battle" badge and the turn, steps advance every 700 ms, the battle log grows and is read by its existing `aria-live="polite"`. Focus goes to Skip (existing `Ds` effect: the clicked button unmounts, focus falls to `<body>`). Party tiles and move buttons are not usable (the bottom screen is the "wait" note, `canSwitch` is false because `done` is set). Her best-hit strip is hidden (`done` is set). No music (`inBattle` is false).
- Skip (button, or click on the top screen): playback stops, the result screen shows with focus on its heading, plus Watch again, Practice, Back to home.
- End of replay: the same as Skip.
- Back to home: the existing `home()`; the home result view and its Watch again button come back.
- Nothing is saved, posted or added to history at any point.

### Edge cases

- Old saves (results without `lead`/`choices`): no button.
- Two tabs: the click reads `load()`, so it uses whatever the latest save has. The replay never writes, so it cannot overwrite the other tab. The other tab finishing its battle while this one replays only updates `store` through the existing listener.
- Page left open past midnight: replays the page's `date` (a finished past battle, not a new attempt). Back to home reloads to today as before.
- Replay throws or does not end (should not happen for a stored log): nothing happens on click, an error goes to the console, nothing is recorded. Decided: no hiding the button.
- Storage size: about 1 KB of choices per day, about 0.4 MB a year, well under the localStorage limit.

### Tests first

`tests/storage.test.ts`:
- change "finishOfficial keeps the summary for the day" to expect `{ ...done, lead: 0, choices: [] }`.
- new: `finishOfficial` with `current: { lead: 2, choices: ['move 1', 'switch 3'] }` stores `lead: 2` and those `choices` in `results[date]`.
- new: `finishOfficial(s)` with no summary writes no `results[date]` entry.
- new: a stored save whose `results` has one entry with `lead`/`choices` and one without loads with both kept unchanged.

`tests/flow.test.ts`:
- change "a finished battle left in current is recorded on resume" to expect `results[DATE]` equal to `{ ...done, lead: 1, choices }`.
- new `describe('watchAgain')`:
  - after `autoPlay` to the end, `finishOfficial`, `save` and `load` from `memoryStorage()`: `watchAgain(DATE, load(store).results[DATE])` gives `official: true`, `done` equal to the stored summary fields, and a log equal to the original battle's (`withoutTimes`). This is the check that the replay is the same battle.
  - `null` for `undefined` and for an entry without `lead`/`choices` (old save).
  - `null`, without throwing, for `choices: ['move 9']` (rejected choice) and for choices that stop before the end (`slice(0, 2)`).

There is no DOM test setup (vitest `environment: 'node'`); button visibility and the no-post rule are covered by `watchAgain` tests, code review (the `onWatch` path has no `persist`, `save`, `update` or `postResult`), and the browser checks.

### Checks

- `npm test`, `npm run typecheck`, `npm run build`.
- Browser (`npm run build && npx wrangler dev --port 8799`, then stop it), 1280x900 and 390x844, one width at 320:
  - play today's official battle to the end: result screen shows Watch again, Practice, Back to home on one row with no overflow.
  - Watch again: replay starts at the first step, Skip has focus, the moves and party are locked, the final result matches the one shown before; Skip mid-way lands on the result with focus on the heading.
  - reload: home shows the result and Watch again; it replays the same battle.
  - DevTools Network: no `POST /api/result` during or after a replay. Application > Local Storage: the save is the same before and after.
  - a save edited to drop `lead`/`choices` from today's result: no Watch again button.
  - two tabs: replay in one tab while the other is on home; both stay consistent after a reload.
