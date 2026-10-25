# Daily Cynthia - Share link, link preview, battle state, move info

The owner asked for four items on 2026-10-25. Do them in one pass, after the player items change is merged.

Site URL: `https://daily-cynthia.owennyowy.workers.dev`. Keep it in one constant.

## 3. Share text has the link

- `src/game/share.ts`: add the site URL as the last line of the share text, after the two grid rows.
- Update `tests/share.test.ts` first (expected text ends with the URL line), watch it fail, then change the code.
- The Copy result button and the result screen need no other change.

## 4. Link preview and favicon

- `index.html`:
  - `<meta name="description">` with one plain sentence, for example "A new random team of six every day against Pokemon Platinum Champion Cynthia. One official battle a day."
  - Open Graph: `og:title` "Daily Cynthia", `og:description` (same sentence), `og:type` website, `og:url` (site URL), `og:image` (absolute URL to `/og.png`), `og:image:width` 1200, `og:image:height` 630.
  - `twitter:card` `summary_large_image`, plus `twitter:title`, `twitter:description`, `twitter:image`.
  - `theme-color` for light and dark.
  - Favicon: `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` and `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`.
- `public/favicon.svg`: the same mark as the header logo (the half-gold circle). Hand-written SVG, small.
- `public/apple-touch-icon.png` (180x180) and `public/og.png` (1200x630): make them with Playwright from a small local HTML file in the scratchpad (not shipped), using the site's colours and fonts. og.png: the "Daily Cynthia" wordmark, the tagline, and Cynthia's six sprites in a row on the dark background. Keep og.png under 300 KB.
- Check: `curl` the built page and confirm the tags; open og.png and the icons.

## 5. Battle state on the DS

All values come from the `@pkmn/client` battle the UI already builds at each playback step, so they update during playback.

- **Stat changes:** on each HP box, a row of small chips for non-zero boosts, for example "Atk +2", "Spe -1", also Acc and Eva. Sign and value in text, not colour alone.
- **Field:** a small strip at the top of the top screen (or inside the HP boxes if it fits better) for:
  - weather: Rain, Sun, Sandstorm, Hail
  - Trick Room and Gravity
  - each side's conditions: Stealth Rock, Spikes (with layer count), Toxic Spikes (layers), Reflect, Light Screen, Safeguard, Tailwind, Mist, Lucky Chant
  - Show which side each belongs to ("Your side", "Her side"), or place them near that side's HP box.
- **Volatile states worth showing:** confusion, Substitute, Leech Seed, taunt, encore. Short chips like the boosts.
- Nothing overlaps the sprites or HP boxes at any width from 320 to 1440 (rerun the sweep). Keep the chips small; at narrow widths wrap or show only the count.
- Screen readers: each HP box's chips are part of its accessible text (for example "Spiritomb, Atk +2, Confused").
- Unit test the pure helper that turns the client battle's state into chip labels.

## 6. Move, ability and item info

- **Moves:** an info line on the DS bottom screen, under the move grid and above Switch, shows the hovered or keyboard-focused move: category (Physical, Special, Status), power, accuracy, and the move's `shortDesc` from `Dex.forGen(4)`. When nothing is hovered or focused, it shows a hint ("Hover or focus a move for details").
- **Touch:** an "Info" toggle button in the same row. While it is on, tapping a move card shows its details in the info line and does not use the move; the cards get a visible "info mode" look. Turning it off returns to normal. It turns off by itself when the turn is submitted or the battle ends.
- **Ability and item:** the lead card shows the ability and the item with their `shortDesc` in small text. Party rows and battle party tiles get the descriptions as accessible text and a `title`, not extra visible lines.
- **Cynthia:** inside "Show her moves", add each move's category, power and accuracy, and her items' `shortDesc`.
- Unit test the helper that formats a move's info line (power "—" for status moves; accuracy "Always hits" for `true`).
- The DS height must not change when the info line or toggle appears (fixed height, ellipsis if long; full text in the accessible name).

## Checks

- Tests first for the pure helpers (share text, chip labels, move info line).
- `npm test`, `npm run test:worker`, `npm run typecheck`, `npm run build`.
- Browser (`npm run build && npx wrangler dev --port 8799`): 1280x900 and 390x844, light and dark. A practice battle with a stat boost, a weather move or Stealth Rock if the team has one (or check with a scripted battle), the info line by mouse, keyboard and the touch toggle. The 320-1440 DS sweep (`/private/tmp/claude-501/-Users-owen/350cd5de-0b30-4824-a184-b1bf1e6c052c/scratchpad/dr2/sweep.js`, adjust port).
- Copy-result text pasted contains the link.
