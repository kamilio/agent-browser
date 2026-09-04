# Focus-visible matching and native input modality

September 4, 2026. Continuation of `OUTLINES.md` and the active seven-day browser
plan. This is native engine work, not a completed browser or runtime acceptance.

## State and behavior

`:focus-visible` is now supported in native selectors, relational selectors,
stylesheet matching and selector support checks. It requires the existing focus
eligibility and a document-owned indication decision; it does not alias `:focus`.
The indication policy distinguishes these paths:

- Native non-shortcut keydown and Tab movement indicate focus, including canceled
  keydown. Alt/Control/Meta chords do not change modality. Initial modality is
  keyboard; this does not implement automatic document autofocus.
- Pointer presses and direct native click actions switch to pointer modality.
  Pointer movement, wheel scrolling, synthetic event dispatch and programmatic
  clicks do not change modality. Pointer focus remains real focus when its
  keyboard-style indication is suppressed.
- Writable text/calendar inputs and textareas retain indication after pointer
  focus. Inherited contenteditable state is recognized for otherwise-focusable
  elements; a false editing boundary blocks inheritance. This does not implement
  general contenteditable editing or new editing-host Tab stops.
- Script focus transfers carry the previous indication. Pointer transfers do not
  inherit a text field's indication onto a non-editing control. Native indication
  hints are not an implementation of page `focus({focusVisible:...})` options.
- A transition-scoped hint preserves script inheritance through blur/change
  callbacks, when the old active element has already been cleared. Reentrant
  transitions supersede the hint safely, and completion/error/close cleanup keeps
  it from leaking into later unrelated focus operations.

`focus-indication` is a distinct document change kind. Selector caches refresh
interaction state without rebuilding structural indexes. Indication-only changes
do not masquerade as focus transitions or clear armed Space activation. Styles
and prepared captures still invalidate when the decision changes. Pointer presses
rehit after indication-dependent CSS changes, and keyboard actions recheck focus
eligibility before dispatching their events.

Generated disclosure headers retain their separate native reference and real-host
page focus. Their native inset focus feedback now follows indication: keyboard
focus shows it; pointer/direct-click focus does not. The owner can match
`:focus-visible` without fabricating a DOM summary or inheriting an editable
host's text-entry behavior onto the generated button. Historical captures showing
the older always-on generated focus ring are unchanged.

## Research boundary

Primary source reviewed September 4, 2026:
`https://drafts.csswg.org/selectors/#the-focus-visible-pseudo`

Selectors Level 4 leaves indication heuristics to implementations and describes
keyboard/text-entry indication, pointer focus and script-driven inheritance. The
policy above is a bounded native implementation of those cases, not a claim of
platform preference, accessibility integration, full shadow focus or browser
heuristic parity. Always-indicate preferences, forced page focus options, full
editing and richer platform input modalities remain open.

## Verification

All 70 new tests fail on isolated prior HEAD. During implementation, the two
sync/async blur-reentrancy cases reproduced a lost indication before the transition
hint fix; both now pass. Coverage includes real native key/pointer actions, canceled
events, script transfers, reentrant focus/blur, synthetic dispatch isolation, input
types, readonly/editability changes, stale hit/event targets, cache refresh, held
Space, generated headers, outline captures, invalid arguments and document lifetime.

One obsolete unsupported-selector case is removed; selector-support coverage now
expects support. The unsupported-style diagnostic fixture uses a still-unsupported
selector instead. Existing generated-ring tests now verify suppressed pointer
indication while confirming the generated control remains focused.

Matching focused runs pass 442 tests / ten files in both working and isolated
trees. Typecheck, build, strict checking of five affected test files and thirteen-
file Biome checks pass in both. Authorized final full native validation passes
9,584 tests / 274 isolated files. The working run reports 10,729 passes and the
unchanged pending `src/page-bindings.test.ts:161` Window-onload assertion failure
/ 296 files; this is not an all-green working-tree claim. Both suites use the
explicit `native-tests.json` list. Local evidence logs are preserved under
`node_modules/.cache/native-validation/` as `focus-visible-red-final.log`,
`focus-visible-blur-red.log`, `focus-visible-focused-working.log`,
`focus-visible-native-isolated-final.log` and `focus-visible-native-working-final.log`.

## Inspected command captures

`node_modules/.cache/native-validation/focus-visible-capture.mjs` uses native
open/resize/click/press/styles/geometry/screenshot/artifact-read commands with an
in-memory transport. Its JSON and three 270 by 200 PNGs are stored alongside it.
All three images were inspected: pointer focus changes the first button's focus
appearance without an outside outline; ArrowRight adds a separated blue outline
without moving focus or geometry; clicking the second button moves focus and
removes keyboard indication. Native selector reads accompany command output.

The first button remains `e9` at `(36,76,180,30)` before/after keyboard input;
indicated references change from empty to `[e9]`. Pointer focus then moves to
`e11` with an empty indicated set. PNG sizes are 5,391, 5,599 and 5,391 bytes.
This is fresh native capture evidence, not a browser UI, real TTY/PTY, socket,
live-site or released SafeJS validation run.

## Remaining gates

Next: page focus-option/preferences coverage and broader default focus behavior,
while keeping full browser compatibility and the seven-day scope intact. Richer
outline shapes/3D patterns, platform/shadow/accessibility, live sites, real TTY/PTY,
sockets, browser UI, released SafeJS and original browser gates remain open. No
gated probe ran; the denied SafeJS probe remains unrun. Preserve historical
evidence and unrelated pending work, including the known Window-onload assertion.
