# Daily Cynthia - Player held items

The owner asked for held items on the player's daily team (2026-10-25). Decisions:
- **Source:** the item the Gen 4 random-battle generator already picks for each set in `dailyTeam` (`src/game/teams.ts`). Today the code clears it with `item: ''`.
- **Item Clause (spec D32):** no two of the player's six hold the same item.
- **Fixed per day (spec D5):** everyone gets the same items on the same date. Items come from the same seeded generator call, so no new randomness is needed.

## Rules

1. **Keep the set's item.** `gen.randomSet(...)` already returns `item`. Stop overwriting it. The species, moves, ability and EVs of every past and future day stay exactly the same, because no extra PRNG calls are made before or between `randomSet` calls.
2. **Item Clause.** Walk the six in team order. If a Pokemon's item is already held by an earlier one, replace it with the first item from this fixed fallback list that is not yet used on the team: `Leftovers`, `Life Orb`, `Expert Belt`, `Lum Berry`, `Sitrus Berry`, `Muscle Band`, `Wise Glasses`, `Quick Claw`. No PRNG call. Pure function, unit tested.
3. **Start date.** Items apply only to dates on or after `ITEMS_FROM = '2026-10-26'` (a constant in `teams.ts`). Earlier dates keep `item: ''`. Reason: an official battle started today must replay the same after a reload, and stored choice logs must replay later. Add a comment saying this.
4. Every item must exist in `Dex.forGen(4).items` and be holdable. Test it over many dates.

## Tests first (`tests/teams.test.ts`)

- A date before `ITEMS_FROM` has no items, and its species and moves are unchanged from today's behaviour (compare with a snapshot taken before the change, or compare against the old function's output computed in the test).
- For 365 dates from `ITEMS_FROM`: six items, all non-empty, all different, all valid Gen 4 items.
- The same date gives the same items on every call.
- Species and moves for a date on or after `ITEMS_FROM` equal the species and moves the old code produced for that date (items are the only difference).
- The fallback picks the first unused item when two sets share one (unit test the helper directly).

## Battle and UI

- The simulator, calc (`toCalc` already passes `set.item`) and the AI need no change; check that Cynthia's best-hit numbers and the player's damage ranges now include items (for example Life Orb, Choice Band, Expert Belt). Add one calc test with an item.
- **Choice items:** the simulator locks the move. Check that the move buttons follow the request's `disabled` flags so locked-out moves are disabled. Fix it if not, with a test where possible.
- **Show the item:**
  - Lead card: the item under the name line (for example "Electric, Minus, Choice Specs" or its own line).
  - Bench rows: the item next to the type dots, short and muted.
  - Battle party tiles: the current item from the client view; when it is used up (Sitrus Berry, Focus Sash, Lum Berry), show it as gone (for example struck through or "used"). Keep it small.
  - DS: nothing new.
- **Copy:** the FAQ answer "Your Pokemon hold no items." changes to say each of your Pokemon holds one item, the same for everyone that day, and no two hold the same item. Keep it short and plain.
- Matchups table and "Spiritomb's best" lines include items through the calc. No layout change.

## Checks

- `npm test`, `npm run test:worker`, `npm run typecheck`, `npm run build`.
- Browser (`npm run build && npx wrangler dev --port 8799`): temporarily set `ITEMS_FROM` to today's date to see items, check the lead card, bench and battle party show items, a Choice item locks moves, and a consumed berry shows as used. Then set `ITEMS_FROM` back to `'2026-10-26'` and rerun the tests.
