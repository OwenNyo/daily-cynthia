# Daily Cynthia - Battle playback plan

The owner asked for a more animated fight: HP bars that drain, and move buttons that react on hover. The owner chose step-by-step turn playback over a plain CSS HP transition.

## Today

`submit()` in `src/game/battle.ts` runs a whole turn in the simulator. The UI reads HP, sprites and the text box straight from the simulator `Battle`, so the screen jumps to the end of the turn.

## Behaviour

- After the player picks a move or a switch, the turn plays one message at a time on the DS top screen, in log order.
  - The text box shows the current message.
  - HP bars drain to their new value when their damage or heal message plays. The HP number on the player's box counts along with the bar.
  - The Pokemon that takes damage flashes briefly.
  - A fainted Pokemon's sprite drops down and fades out at its faint message.
  - A switch-in shows the new sprite, name and HP at its switch message.
  - Ball indicators and the party panel update as their messages play.
  - The battle log panel adds lines as they play, not all at once.
- Timing: about 700 ms per message and 400 ms per HP drain. A whole turn takes about 1 to 3 seconds.
- While a turn plays, the move, switch and party buttons are disabled. A "Skip" control (button, plus a click on the top screen, plus Enter or Space while it has focus) jumps to the end of the turn.
- After the turn ends, the UI goes back to the current behaviour: "What will X do?", the forced-switch heading, or the result screen. Keyboard focus moves only after playback ends.
- `prefers-reduced-motion: reduce`: no playback. The turn shows at once, as today.
- Resume after a reload shows the end state at once. Only new turns play back.
- The game logic does not change. The simulator still runs the whole turn in `submit()`; playback is display only. The official result, `choices`, and what the Worker receives stay the same.

## Approach

- Display state comes from the p1 protocol lines (`extractChannelMessages(battle.log ..., [1])`), fed into a `@pkmn/client` `Battle`, like `formatLog` in `src/ui/log.ts` already does.
- Add a pure function in `src/ui/log.ts` (or a new `src/ui/playback.ts` if it is clearer) that splits the protocol lines into steps: each step is the protocol lines up to and including one visible message. Unit test it in `tests/`: step count matches the formatted message count for a turn, the last step equals the full log, a faint and a switch land in the step of their message.
- The component keeps an index into the steps. It renders the top screen, HP boxes, balls, party panel and log from the client battle built at that index, and advances the index on a timer. When the index reaches the end, it renders exactly what it renders today.
- HP drain: CSS `transition: width 400ms` on the HP bar fill, and on its colour. The bar moves because the rendered value changes per step.
- Flash and faint: short CSS keyframe animations, triggered by a class on the sprite for the step that hits or faints it.
- All motion is disabled under `prefers-reduced-motion: reduce`.

## Move buttons

- Hover and keyboard focus: the button lifts by 2px, gets a stronger drop shadow, and brightens a little (`filter: brightness(1.08)`). Pressed: it moves back down and the inner shadow shrinks, like a pressed DS button. The same applies to the Switch button and the party switch buttons.
- Disabled buttons do not react.
- Transitions of 120 ms or less. Under reduced motion, keep the shadow and colour change but drop the movement.

## Checks

- `npm test`, `npm run test:worker`, `npm run typecheck`, `npm run build`.
- In the browser (`npm run build && npx wrangler dev`): one practice battle with several turns, a faint and a forced switch. Check that the order of messages matches the log, the buttons stay locked during playback, Skip works, a reload mid-battle shows the end state, and reduced motion turns playback off.

## Pokétch panels below the play area

The owner asked for the three panels (Your record, Today all players, Matchups) to be the same size where possible.

- The three panels in a row share the same height (grid row with `align-items: stretch`, each panel and its inner screen fill the height). Content stays top-aligned.
- Use the same inner layout in all three: the same heading style and spacing, the same padding, the same gap between blocks, and the same big-number style where a panel has one.
- When "Show matchups" opens, the table must not stretch the other two panels into tall empty boxes. Let the open table span the full row width below the three panels, or open it in its own full-width panel. Pick the simpler of the two.
- On a phone (one column) the panels stack at full width and their height follows their content.
