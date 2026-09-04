# Standalone select keyboard integration

September 4, 2026 checkpoint in the standalone TypeScript browser.

## Scope and provenance

This checkpoint adopts the previously pending select-keyboard and typeahead
helpers into the committed native core, with their required label helper,
capability export and a focused adapter for the committed keyboard implementation.
It does not bundle the larger pending held-key, scrolling, pointer or rendering
changes. The working keyboard and index files remain byte-for-byte unchanged;
only the verified select-related subset is staged from an isolated HEAD tree.
The existing pending keyboard/typeahead test files remain separate.

`SELECT-KEYBOARD.md`, `SELECT-TYPEAHEAD.md` and their historical reports retain
their original evidence. The measurements below are new native runs, not renamed
or reinterpreted historical live validation.

## Behavior

- Arrow keys, Home and End choose enabled options without navigation wrap.
  Empty and disabled-only lists do not emit selection notifications.
- The timed-prefix profile supports repeated-initial cycling, case/canonical
  accent folding, spaces within active prefixes and reset on focus changes.
  Its timeout, prefix, label and scan limits are explicit, not OS-parity claims.
- A user-keyboard choice now uses a select-selection transaction. This refreshes
  selectedcontent before native input/change notifications, without making the
  ordinary option selected setter a new cloning trigger.
- Displayed option labels use nonempty label attributes, falling back to option
  text for absent or empty attributes. This is separate from reflected raw
  attributes and from the children copied into selectedcontent.
- Canceled key events, lost focus, disabled/detached controls, option mutations
  and listener-time selection changes retain their distinct handling.
- Multiple-select keyboard operation and picker opening fail explicitly;
  unsupported popup requests still complete the native keyup path.

The relevant WHATWG HTML label and select-update ordering algorithms were
reviewed on September 4:
`https://html.spec.whatwg.org/multipage/form-elements.html`.
The native profile does not claim to implement the standard's queued user
interaction task source or platform-specific picker behavior.

## Implementation

- `src/select-keyboard.ts` is promoted with one behavior correction: selecting a
  candidate uses `setSelectSelection` before sending input/change events.
- `src/select-typeahead.ts` is promoted unchanged. Its state and work bounds
  remain explicit and it registers native focus/close cleanup.
- `src/controls.ts` promotes the displayed-label helper with empty-label fallback;
  other pending control edits remain excluded.
- `src/keyboard.ts` receives only select routing, required key parsing, typeahead
  initialization and native event timestamps in committed HEAD. Existing
  unrelated non-select shortcut behavior is retained.
- `src/index.ts` promotes the select-keyboard capability export only.
- `src/select-keyboard-core.test.ts` is a new explicit native suite that runs on
  both committed-core and broader working-tree implementations, without relying
  on pending held-key or software-rendering APIs.

## Validation

Three initial regressions fail before the fix: selectedcontent visibility at
keyboard notifications, typeahead cloning and empty-label matching. The new
suite covers navigation, notification flags/order, cancellation, focus and DOM
changes, modifiers, typeahead timing/cycling/folding, label precedence, multiple
and picker limitations, resource bounds, async delivery and closed owners.

- 50 new tests and 223 focused checks across seven working-tree files pass.
- The isolated focused run passes 149 checks across five owned files.
- Full native validation passes 9,020 tests across 248 allowlisted files.
- The archived-HEAD promotion tree passes 6,260 tests across 187 available files;
  pending held-key/rendering suites remain absent there.
- Production typechecks, builds, strict new-test typechecks and six-file lint
  pass in both trees.
- Original keyboard, index and typeahead worktree bytes are preserved. The
  existing select-keyboard helper and control-label helper each receive only
  the one-line corrections described above. Unrelated pending deltas remain
  outside the commit, and nothing is pushed.

## Remaining gates

Coordinate implicit-inert targeting, custom picker/rendering, complete multiple
selection, fallback-button text state, broader physical/held-key semantics,
task-source timing and platform/browser interoperability remain open. Pending
software pixel checks are not live visual comparison or real keyboard evidence.

No live website, socket, real TTY/PTY or SafeJS probe ran. The previously denied
SafeJS probe remains unrun. Native passes do not close independent acceptance
gates, and no page-runtime dependency was added. `TASKS.md` and
`SEVEN-DAY-PLAN.md` retain the overall browser scope and active seven-day goal.
