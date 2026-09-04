# Focused native control Shift-click selection

September 4, 2026 continuation from `0784655`. The earlier pointer-caret work and
measurements remain in `CONTROL-POINTER-CARETS.md`. This change extends selection
only in an already focused eligible native text control; it is not general drag
selection or a new public DOM selection API.

## Behavior and ownership

Before dispatching mousedown, the mouse snapshots native coordinates and Shift
into frozen default-action input. It does not trust public event getters after
callbacks: overriding coordinate/Shift properties cannot redirect placement.
If the eligible input/textarea is already focused, the
prepared hit retains its numeric native anchor and uses the shared point hit as
the new focus. Forward, reverse and existing noncollapsed selections preserve
that anchor, including when the focus crosses it. An unmodified click collapses
as before; a blurred control receives ordinary collapsed placement rather than
a fabricated per-control anchor.

Changing live keyboard state inside a mousedown handler does not rewrite the
captured modifier. Releasing Shift in the handler still extends; pressing Shift
in an originally unshifted handler does not retroactively extend. Canceled or
nonprimary mousedown does not select. Readonly controls allow selection without
edits; disabled/inert eligibility and prior focus-mutation safeguards remain.

`NativeControlCaret.select(id, anchor, position)` validates both endpoints against
the current relevant value and publishes one authoritative record through the
existing guarded lifecycle path. There is no provisional end caret, second
selection record or value history. Identical state does not invalidate; changes
of direction still do. Existing collapse/move behavior remains unchanged.

The keyboard entrypoint validates both native code-point boundaries before
provisioning an owner, then the owner rechecks its current value before atomic
publication. Invalid keyboard placement requests neither allocate ownership or
listeners nor replace state. Post-notification checks still detect changed
value/focus, newer records and closure. The rendering snapshot remains frozen and
numeric; private native relevant-value reads are not exposed in metadata.

Password offsets remain surrogate-safe and descriptors retain existing masks.
An empty placeholder has only logical offset zero and no selected hint text.
Replacement/deletion follows the same native selection that rendering highlights.
No document Range, glyph, line, DOM value mutation or document scroll is invented
by the pointer gesture. Existing minimal control scroll recalculates after the
selected focus changes; persistent widget scrolling remains outstanding.

The added `mouseCapabilities.controlShiftSelection` profile is
`focused-native-anchor-primary-press`.
The broad `textSelection` flag remains false: this does not implement general
contenteditable, drag or word selection. Native input admission remains text,
search, url, tel and password plus textarea; email/number editing is not expanded.

## Validation

Three new explicit native files add **80 cases**: 18 pointer integration,
40 atomic owner and 22 actual BrowserCommandHost cases. Final focused suites pass
**816 cases / 26 files in both isolated and working trees**, with passing project
no-emit types and explicit `--outDir dist` builds in both. Strict compilation of
the three new tests and Biome on five changed production modules plus those tests
pass. Both native manifests retain 376 unique entries; the same 22 pre-existing
pending files remain absent from the archive.

Evidence under `node_modules/.cache/native-validation/`:

- `control-shift-integration-baseline.log`: original 12 parent cases produce
  nine extension failures and three unchanged-behavior passes.
- `control-shift-integration-first.log`: 99 passing parent/owner cases after
  integration, including the four added noncreating invalid-boundary checks.
- `control-shift-integration-final-*.log`: initial 814 / 26 combined checks.
- `control-shift-integration-event-override-before.log`: two new failures show
  that public event-property overrides could redirect the default after dispatch;
  the previous 16 parent cases pass. The matching
  `control-shift-integration-event-override-after.log` records all 18 passing.
- `control-shift-integration-final-v2-*.log`: final 816 / 26 combined checks,
  types/builds, strict compilation and scoped style verification.
- `parallel-native-control-select-0784655/delivery/README.md`: 40 new owner
  failures / 43 original passes before the operation exists, then 83 passes;
  reentrancy/lifetime checks and exact source provenance remain preserved.
- `parallel-control-shift-command-0784655/FINAL.md`: original 13 failures /
  nine passes, then all 22 unchanged command cases pass with supplied production;
  strict/build/style checks and baseline evidence remain separate. The final
  combined run also includes the subsequent native pre-dispatch snapshot guard.

The exact 26-file wrapper was approved after one approval-timeout retry. No full
manifest, denied transport test or broad replacement suite ran. SafeJS, live
website, real socket, TTY/PTY, GUI and service-process gates remain separately
unclaimed. Large new archives and evidence stay on the project filesystem, not
the still space-constrained root filesystem.

## Fresh native captures

`control-shift-host-capture.mjs` uses actual native keydown/mouse/down/up/keyup
commands, an injected in-memory transport and no page runtime. The retained
pointer integration supplies the exact `0784655` production baseline. Twelve
phases cover anchor placement, forward/reverse extension, canceled replacement,
ordinary collapse, captured Shift after handler release, blurred placement,
scrolled input/textarea, masked selection, canceled press and empty placeholder.
Every exported PNG is followed by artifact deletion and an empty-list assertion.

`control-shift-host-before.*`, `control-shift-host-after-v2.*`,
`control-shift-host-working-v2.*` and `control-shift-host-comparison-v2.{json,log}`
retain the fixtures, paths, hashes, numeric state and final pixel comparison.
All twelve working-build PNGs match the isolated build byte-for-byte. Values, serialized DOM,
placed boxes, document scroll and outer geometry remain identical to baseline;
every changed pixel is inside a control text clip. Every intended anchor/focus is
asserted. Canceled input and canceled pointer phases preserve their respective
previous pixels, and handler-released Shift matches ordinary forward extension.
Forward and textarea-selection captures were visually inspected. Original
unversioned captures/comparisons remain unchanged; both final replays also match
their respective pre-guard PNGs and descriptors exactly, proving the additional
event-property protection does not alter ordinary captured behavior.

Changed pixel counts are respectively 0, 396, 112, 112, 0, 396, 0, 1088, 3832,
444, 444 and 0. Document glyph/caret and paint-budget metrics remain identical;
they do not count native control texture detail or measure CPU/RSS.

## Remaining scope

Dragging, word selection, contenteditable Shift-pointer selection, persistent
widget scrolling, full selection APIs/per-control lifetime, IME/bidi and platform
appearance remain open. The original browser/runtime/live gates remain in
`TASKS.md`; this native continuation is progress, not browser completion.
