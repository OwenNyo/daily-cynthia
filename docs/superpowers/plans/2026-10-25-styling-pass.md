# Daily Cynthia - Styling pass plan

The user approved this design. It follows the MVP plan (`2026-10-25-daily-cynthia-mvp.md`). The game logic, the Worker and the tests stay as they are. This pass changes the UI layer: `src/ui/app.tsx`, `src/ui/app.css`, `index.html`, plus small additions in `src/ui/` and `src/ui/log.ts` where a task says so.

## Design reference

- The mockup source is in `docs/design/mockup/`. Use it as the reference for layout, colours, type and copy. It is HTML in the Design canvas format: inline styles, `{{holes}}` filled from the `renderVals()` script at the bottom of each file.
  - `Main.dc.html` is the home page before a battle. It has a `dark` boolean that switches the colours.
  - `InBattle.dc.html` is the page during a battle, shown at turn 4.
  - `Battle.dc.html` is the DS play area. Both pages embed it.
- `/_blob/<id>` image URLs in the mockup point to sprites. Use `spritePath()` instead. Map the background blob to `/bg/champion-room.png`.
- Mockup numbers are placeholders. Real values come from the game modules.

## Tokens

- Light theme: bg `#E4E2EC`, panel `#F7F6FB`, lead tile `#FBF3DC`, ink `#1D1B2B`, ink2 `#3E3B52`, muted `#545069`, line `#BCB8CE`.
- Dark theme: bg `#17161F`, panel `#23222E`, lead tile `#2E2B22`, ink `#EEEDF5`, ink2 `#C6C4D4`, muted `#A3A1B5`, line `#3D3B52`.
- Use `prefers-color-scheme` for dark mode. Put all tokens as CSS custom properties on `:root`.
- Fixed colours:
  - Gold `#E2B84B`, with ink `#1D1B2B` on top.
  - Cynthia panel `#1D1B2B`, rows `#2A2740`.
  - Pokétch case `#4E5868`, case shadow `#39414E`, screen `#A6C48A`, screen ink `#233320`.
  - DS shell `#A7ADB9`, edge `#6F7684`, bezel `#23262E`, bottom screen `#2C3045`.
  - Text box white `#FAFAF7`, border `#4A5468`.
  - HP green `#48C058`. Use the usual yellow and red below 50% and 20%.
  - Gen 4 type colours: the `T` table in `Main.dc.html`.
- Fonts from Google Fonts:
  - Dela Gothic One for headings.
  - DotGothic16 for game text, numbers and the Pokétch screens.
  - M PLUS Rounded 1c (400/500/700/800) for body text.
- Sprites use `image-rendering: pixelated`.
- Shapes:
  - Party tiles and How to play cards: `border-radius: 22px 6px 22px 6px`.
  - Cynthia panel: `6px 28px 6px 28px`.
  - Pill buttons: `999px`.

## Layout

- One row container holds three regions: left, centre and right.
- The DS (`section` for the battle) comes FIRST in the source order. Use CSS `order` to place it in the centre on desktop.
- Desktop (1280px or wider): left column `1fr`, centre 480px, right column `1fr`.
- Phone (under 900px): one column in this order: DS, right region, left region. There must be no horizontal scroll at 390px.
- **Before a battle:**
  - Left: party panel. The lead card shows stats and moves. The other five are buttons: "Set as lead".
  - Centre: DS, with "Battle Cynthia" and "Practice" below it.
  - Right: Cynthia panel with her six and their held items.
- **During a battle:**
  - Left: party in battle mode. Each member is a `<button>` with an HP bar and the text "In battle" or "Fainted". Clicking it sends `switch N`.
  - Centre: DS, plus the strip "<her active>'s best hit on <your active>".
  - Right: battle log on a Pokétch screen.
- Below the row:
  - Three Pokétch panels: Your record, Today all players, Matchups. Matchups uses a "Show matchups" button that opens the 6x6 table in a `<details>` with `overflow-x: auto`.
  - How to play.
  - FAQ.
  - Footer.
- Header:
  - Logo and "Daily Cynthia".
  - A Pokétch-style countdown: "No. N", HH:MM:SS, "to next team".
  - Links: How to play, FAQ.
  - The music toggle (Task S4).
  - During a battle: an "Official battle" or "Practice" badge and "Turn N".

## Tasks

Each task: make the change, then run `npm test`, `npm run typecheck` and `npm run build`. Add a unit test only where the task changes pure logic (S1, S3).

### S1. Structure fixes from the design review (do first)

The numbers are from the design review.

1. **Battle log**
   - (2) The full log becomes its own `<section aria-label="Battle log">` in the right region, in place of the Cynthia panel while a battle runs. Keep `role="log"` and `aria-live="polite"`.
   - Add a pure grouping function, `groupLog(lines) -> {turn: string, lines: string[]}[]` (headings "Start", "Turn 1", ...). It replaces the `== Turn N ==` text lines.
   - (18) Strip the bracketed ability lines, for example `[The opposing Spiritomb's Pressure]`, down to readable text. Trim leading spaces.
   - Add a unit test in `tests/log.test.ts`.
2. **Log scrolling**
   - (1) The log scrolls to the newest line after each update.
   - The DS top-screen text box shows only the latest message, or "What will X do?" when waiting for a choice.
3. **Party in battle**
   - (3) Add the party panel battle mode described under Layout.
   - (10) On a forced switch, show the heading "Choose your next Pokemon". A fainted member says "Fainted", not 0%.
4. **Layout and order**
   - (4, 5) Swap the right region by state. Use the source order and the row wrapper described under Layout.
5. **Matchups**
   - (6) Matchups table in `<details>` with `overflow-x: auto`.
6. **Keep the result**
   - (7) Store the finished official summary (turns, fainted pattern, won) with today's history entry. The played-today home state then shows the result, the share grid and "Copy result" after a reload.
   - Keep the stats derivation working.
   - Add a unit test in `tests/storage.test.ts`.

### S2. Visual styling to the mockup

- Apply the tokens, fonts, shapes and layout above.
- Add the DS shell: top screen and bottom screen joined by a hinge, with Platinum-style HP boxes and the ball indicators.
- Use `/bg/champion-room.png` as the top-screen backdrop. It is 256x192, scaled with `pixelated`. The bottom 48px of the image is black; the text box covers it.
- Platform centres in native pixels: player (64,136) and enemy (192,88). Place the sprites on them.

### S3. Design review items 8-20

- (8) Always show the Official or Practice badge and Turn N.
- (9) Set the home message by state. Add the hint "Practice battles don't count and don't resume after reload."
- (11) Status moves show "Status" or a short effect, not "0-0%". Damaging moves with 0% read "No effect".
- (12) Result screen:
  - Add a one-line legend for the share grid.
  - "Close" becomes "Back to home".
  - Focus moves to the result heading.
- (13) Lead pick:
  - Show a "Leads" text label.
  - Show the best-move damage vs Spiritomb, and Spiritomb's best move vs each party member.
- (14) All buttons are at least 44px tall.
- (15) The back sprite alt text is "<name>, seen from behind".
- (16) HP meter `aria-label`. Status abbreviations get a `title`.
- (17) Ball indicators use one `aria-label`, for example "Cynthia has 4 of 6 left".
- (19) Round damage to whole numbers. Matchup cells over 100% read "OHKO".
- (20) Copy:
  - "Your party" everywhere.
  - The main button says "Battle Cynthia" everywhere.

### S4. Music

- The file is `public/audio/battle-champion.mp3`: 5.3 MB, 2:52, the track plays twice with a fade. The owner accepts the fade for now.
- Add a speaker toggle button in the header:
  - `aria-pressed` and the label "Music".
  - Off by default.
  - Remember the choice in localStorage, with the same try/catch pattern as `src/ui/storage.ts`.
- Use one `Audio` element with `loop = true` and `preload = "none"`, so nothing downloads until the player turns music on.
- The music plays only while a battle is on screen. It pauses on the result and home screens.
- Credits line in the footer: "Music: Pokémon Diamond/Pearl/Platinum (Game Freak), game rip by DMoore721, ViviVGM and kirbyhammer766 via KHInsider. Battle background: Pokémon Platinum, extracted from the pret/pokeplatinum decompilation."
- Not in this pass: re-encoding to 128 kbps. No encoder is installed on this machine. Note it as a follow-up.

### S5. Final check

- Run `npm test`, `npm run test:worker`, `npm run typecheck` and `npm run build`.
- Run the app with `wrangler dev` and check:
  - 1280x900 and 390x844 in light and dark mode
  - one practice battle
  - one official battle with a reload in the middle
  - the result screen after a reload
  - music on and off
- Save the screenshots in the scratchpad, not in the repo.
