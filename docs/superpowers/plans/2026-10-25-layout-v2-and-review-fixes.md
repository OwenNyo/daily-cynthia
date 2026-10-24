# Daily Cynthia - Layout v2 and review fixes

The owner approved a new layout on 2026-10-25. This plan also carries the fixes from the full-app code review and design review, and points to the battle playback plan. Do all of it in one pass.

Related plans:
- `2026-10-25-battle-playback.md`: turn playback, move button hover and press, same-size Pokétch panels. Do everything in it.
- `2026-10-25-styling-pass.md`: tokens, fonts, shapes. These still apply unless this plan says otherwise.

## L. New layout

Reference: `docs/design/mockup/MainV2.dc.html` (home) and `docs/design/mockup/InBattleV2.dc.html` (battle). `Battle.dc.html` is still the DS. The old `Main.dc.html` and `InBattle.dc.html` are superseded for layout.

- **Top row, two columns** (desktop): left `minmax(0, 1fr)`, right 480px (the DS). Both columns stretch to the same height.
- **Home, left column:**
  - Intro: the heading "Six Pokemon you didn't choose. One Champion who never changes." (Dela Gothic One, about 30px) and the line "Everyone gets this same team today. Pick a lead, read her team, and take your one official shot before midnight." Its top lines up with the top of the DS. Show the intro only on the home screen before today's official battle is played; after it is played, keep the result content the home page already shows in that place.
  - "Your party" heading, then the lead card, then the other five as a single column of "Set as lead" buttons.
  - The five buttons share the leftover height evenly (`flex: 1 1 0`, `min-height` 64px), so the last one ends level with the bottom of the right column.
- **Home, right column:** the DS, then "Battle Cynthia" and "Practice", then the note.
- **Battle, left column:** "Your party" in battle mode as one column of six, then the battle log on a Pokétch screen that fills the rest of the column height (it scrolls inside).
- **Battle, right column:** the DS, then the best-hit strip.
- **Cynthia's team, full-width row below the top row** (home and battle):
  - Dark panel (`#1D1B2B`, radius `6px 28px 6px 28px`). Left part: the gold bar, "Pokemon League Champion", "Cynthia", the description and "Show her moves" (the existing `<details>`). Right part: her six as cards in a grid (`repeat(auto-fill, minmax(130px, 1fr))`): 64px sprite, name, held item in gold.
  - During a battle: the subtitle becomes "Cynthia has N of 6 left". Each card shows its state instead of the item: "Fainted" (greyed, grayscale), "In battle, NN%" (gold border), or "Not seen yet". A Pokemon she has sent out and switched away shows its last known HP %.
- Then the three Pokétch panels (same height, see the playback plan), How to play, FAQ, footer.
- **Phone (under 900px):** one column in this order: DS, party (with the log during a battle), Cynthia's row, the rest. Hide the intro heading's second sentence size problems by letting it wrap; no horizontal scroll at 320px or wider.
- **Source and tab order:** on desktop the party comes before the DS in tab order, so a keyboard user reaches "Set as lead" before "Battle Cynthia". On phone the DS is shown first (CSS `order`). Pick the source order that gives a sensible tab order on desktop; note the choice in the report.

## C. Code review fixes (owner's choices)

- **C1, two tabs overwrite each other (F2).** Every save does a read-modify-write: load the latest save from localStorage, apply only this change, write it back. Starting an official battle reads the latest save first and refuses (shows the played or in-progress state) if another tab has a result or a `current` official battle for today. On the `storage` event for the save key: if this tab has no battle running, reload the state from storage (re-render, no page reload needed if simple; a page reload is fine too). Add tests in `tests/storage.test.ts` for the read-modify-write helpers.
- **C2, music after a reload (F3).** If music is on and `play()` is blocked, start it on the first user click or key press.
- **C3, malformed `results` (F4).** `isSave` (or `load`) drops `results` entries with the wrong shape. Test it.
- **C4, finished battle stuck in `current` (F5).** On resume, if the replayed battle has ended, record the result as if it had just finished (history, results, post once) and clear `current`. Test it at the storage or flow level.
- **C5, recharge button.** The `recharge` placeholder move shows "Recharging" with no type, PP or damage. Keep the `typeStyle` fallback the reviewer added in `src/ui/app.tsx` and its test `tests/app.test.ts`.
- **C6, small trims:** `finishOfficial(s, done?)` using `done?.won ?? false` instead of the extra `won` parameter; call `summary(battle)` once per render; inline `liveMoves` if it still has one caller.
- F6 (no retry of a failed result post) stays as it is, per the spec.

## D. Design review fixes

1. Switch tiles clip at 375px and narrower. Hide the tile sprite under a container width of 400px and ellipsize the name. Nothing may clip in the DS from 320 to 1440.
2. Focus ring contrast. Keep the gold outline and add a dark ring under it (for example `box-shadow: 0 0 0 5px var(--ink)`), or use `--ink` as the outline in light mode and inside `.poketch`. Must be 3:1 or better on every background.
3. DS text on phones: minimum sizes, for example `font-size: max(11px, calc(13 * var(--k)))` on the move foot, damage chip, HP number and HP box name. Recheck overlap.
4. Keyboard focus after a turn returns to the same move index that was used, when it still exists.
5. Party switch buttons: no doubled HP in the accessible name (`aria-hidden` on the bar inside the button, or an explicit `aria-label`).
6. Home on phone: under 900px hide the header tagline and shrink the countdown digits to about 22px. Make the home-screen move cards on the DS look like a preview, not buttons, with a small "Preview vs Spiritomb" caption.
7. The voluntary switch menu must not change the DS height (Back in the title row, or a smaller gap).
8. No visible focus box on the result heading (`h2[tabindex="-1"]:focus { outline: none; }`).
9. Status badge colours per status: BRN red, PAR yellow, FRZ light blue, SLP grey, PSN and TOX purple.
10. On a forced switch the top text box shows "<name> fainted!" or "Choose your next Pokemon", not the last log line.
11. Log: remove the leftover "The opposing Spiritomb's Pressure" style line; while waiting, show "What will X do?" under the empty "Turn N" heading; round percents to whole numbers.
12. Escape closes the "Switch to" menu.
13. Move card foot must not wrap unevenly (type and PP on one line; shrink or ellipsize).
15. Check the Worker allows one official result per player per day (look at the D1 schema and `/api/result`). If it does not, report it; do not change the Worker without a test.

## Checks

- Unit tests for new pure logic first (TDD): playback step split, read-modify-write save, malformed `results`, ended battle in `current`.
- `npm test`, `npm run test:worker`, `npm run typecheck`, `npm run build`.
- Browser (`npm run build && npx wrangler dev --port 8799`): home and battle at 1280x900 and 390x844, light and dark; 320px DS sweep. The design reviewer's sweep script is at `/private/tmp/claude-501/-Users-owen/350cd5de-0b30-4824-a184-b1bf1e6c052c/scratchpad/dr/sweep.js`.
