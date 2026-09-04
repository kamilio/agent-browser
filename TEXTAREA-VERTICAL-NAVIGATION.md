# Native textarea vertical navigation

September 4, 2026 continuation from `c348739`. This adds bounded native
ArrowUp/ArrowDown behavior to the software textarea. It is not a full platform
editing, selection-affinity, page-runtime or live-browser acceptance result.

## Behavior and ownership

- An allowed unmodified vertical key moves from the current selection focus to
  the closest boundary on the adjacent visual row and collapses there. Shift
  retains the existing anchor, including reverse selections. The original key's
  modifiers govern the default, not later handler changes to held-key state.
- The same bounded bitmap advances, font-size row steps, normalized LF, wrapping
  and UTF-16 code-point boundaries drive painting, pointer hits and navigation.
  Blank lines and trailing LF remain actual rows. Beyond the first/last row,
  navigation clamps to zero/value length.
- Only canonical following-row stops participate in vertical navigation. A
  soft-wrap offset cannot simultaneously represent an upstream visual-row end.
  This prevents an Up destination from painting on the source row, but does not
  implement upstream/downstream caret affinity or platform selection collapse.
- The preferred horizontal coordinate survives consecutive vertical moves over
  shorter or empty rows. One transient keyboard record references the existing
  authoritative caret record, its geometry fingerprint and one number; it is
  not another selection owner or per-widget history.
- Pointer placement, horizontal/Home/End movement, native editing, fill, focus
  changes, relevant control mutations, removal and close reset the preference.
  Different owned selection identity or geometry prevents reuse. A generation
  guard preserves a same-offset pointer reset made reentrantly during selection
  notification rather than restoring the superseded preferred coordinate.
- Readonly textareas may select but still reject edits. Canceled keydown does
  not move or reset the preferred coordinate. Focus redirection does not apply
  the old control's default; a focus round trip during a vertical key rejects.
  First publication goes directly to the destination, without an intermediate
  end caret. Changed selection invalidates presentation, not DOM value or Range.
- Selection movement emits no beforeinput/input, changes no value or root scroll,
  and retains the existing stateless focus-edge widget scrolling. Tiny/zero-font
  or ineligible geometry does not invent a visual row. Hidden controls lose
  actionable focus under the existing focus policy.

## Implementation seams

`src/control-text-state.ts` extracts the existing pointer geometry lookup without
changing its arithmetic or fingerprint. Both pointer and keyboard use the same
connected, non-disabled, non-inert, visible software-control box and used content
dimensions. Existing pointer focus preparation and integer-scale hit behavior
remain unchanged.

`moveControlText` in `src/control-text-layout.ts` reuses checked input and shared
geometry. A local bounded Map keeps the last stop per code-unit offset. It returns
a frozen numeric destination/preferred-coordinate pair, keeping no DOM, owner or
persistent state. Non-textarea/missing-selection/ineligible inputs return no move;
invalid parameters still reject before unsupported returns. Selected placeholder
text has logical offset zero, not hint-string selection positions.

Existing limits remain 4,096 UTF-16 units, font size 512, each texture axis 4,096,
and 1,048,576 texture pixels. There are at most 8,194 shared stops and 4,097
canonical entries. The additional passes are bounded and linear. Ordinary
painting still disables stop collection; navigation adds no work to that path.
An optional preferred coordinate must be finite and within zero through 4,096.

`src/keyboard.ts` owns preference lifetime and publishes through the existing
native caret's atomic `select` operation. No public DOM selection API, fake Range,
new runtime dependency, browser-engine adapter or new page-runtime probe is added.

## Native validation

The integration archive is
`node_modules/.cache/native-validation/textarea-vertical-integrated.IcdDkd`.
All new snapshots, builds, logs and images remain on the home filesystem; the
known root-disk pressure is not treated as resolved or used to delete evidence.

New explicit tests total **100 cases**:

- `src/textarea-vertical.test.ts`: 25 direct integration/lifetime cases.
- `src/control-text-navigation.test.ts`: 50 pure geometry cases.
- `src/textarea-vertical-command.test.ts`: 25 actual native command-host cases.

Both isolated and working focused runs pass **1,027 tests / 32 files**, with
project no-emit checks, builds using `--outDir dist`, strict checking of the three
new tests and scoped Biome over seven production/test files. Logs use the prefix
`node_modules/.cache/native-validation/textarea-vertical-integration-final-`.
Both explicit manifests retain **379 unique entries**. The archive still lacks
22 separately pending working-tree tests; no full-manifest result is inferred.

The geometry worker preserves the existing source as a byte-identical prefix:
all 68 layout and 71 hit assertions remain unchanged. Its independent evidence
compares **450 complete layouts and 2,250 hit results byte-for-byte** and checks
15,024 exhaustive navigation comparisons inside the 50 test cases. These are
deterministic geometry comparisons, not separate test-run counts or performance
measurements. Worker evidence is in
`node_modules/.cache/native-validation/parallel-control-text-navigation-c348739/REPORT.md`.
The command worker's original test file and baseline remain in
`node_modules/.cache/native-validation/parallel-textarea-vertical-command-c348739/`.

Preserved earlier attempts distinguish failures from acceptance:

- The initial parent run omitted the new manifest entry and collected no tests;
  the listed baseline then showed 11 missing-behavior failures / one pass.
- The independent command baseline showed 16 missing-navigation failures / nine
  passes. The unchanged command expectations pass against actual integration.
- The first integrated 100-case run found one genuine reentrant preference bug
  and three fixture assumptions: hidden controls release focus, and initial
  geometry use provisions one lifecycle listener. The repeated-listener test now
  measures forty cycles after initial provisioning, not a falsely zero cold cost.
- An intermediate test-registration placement error is retained in the fixed
  log. The corrected focused replay passes all 100 cases before broader checks.
- The first capture script incorrectly read the press result's cancellation
  field at its outer level. Its script, log and partial images remain preserved;
  the corrected script reads `keyboard.canceled` and uses a new baseline prefix.

## Capture evidence and remaining gates

Fresh actual native-host captures exercise sixteen phases: short-row preferred
column retention, repeated up/down, Shift reverse selection, canceled keydown,
pointer reset, a restored middle column and narrow wrapped rows with scrolling.
The transport and document are fully injected; no actual website or runtime runs.
Captures export/delete each artifact and assert the host artifact list is empty.

Evidence lives under `node_modules/.cache/native-validation/`:
`textarea-vertical-host-before-v2`, `textarea-vertical-host-after`, and
`textarea-vertical-host-working` JSON/PNG prefixes, with
`textarea-vertical-host-comparison.json` recording the comparison. Intended
anchors/focus offsets are asserted; values, serialized form, boxes, root scroll
and document paint counters remain unchanged. Pixel changes are confined to
control text clips, and each working PNG matches the isolated build byte-for-byte.
Document glyph/caret counters do not count control-texture glyphs or carets; these
checks are not CPU, retained-memory or resource-reservation measurements.

The short-row caret, extended hard-line selection and wrapped Shift-selection
captures were visually inspected. Changed pixel counts, in capture order, are
0, 32, 32, 32, 0, 888, 1,220, 1,220, 0, 18, 14, 0, 614, 606, 1,024 and 606.
Partial bottom rows remain clipped by the existing text viewport rather than
changing the control frame or box geometry.

Inputs retain their existing vertical-key no-op policy. Control/Meta/Alt vertical
shortcuts, Page keys, word/grapheme/bidi/IME behavior, visual Home/End, drag/word
pointer selection, full control selection APIs, general caret affinity and
persistent widget scrolling remain open. Home/End still use logical LF lines.
The full native manifest and denied transport file are not retried or replaced
with a broad filtered suite. SafeJS, live website, socket, real terminal, service
process and original seven-day browser acceptance gates require their own
authorization and evidence. The until-stopped browser goal remains active.
