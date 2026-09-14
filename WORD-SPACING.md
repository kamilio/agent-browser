# Native word spacing

The standalone native engine implements a bounded `word-spacing` profile in its
own style, text-layout and control-rendering pipelines. This is actual separator
geometry, not parser-only acceptance or suppression of unsupported-value reports.
No Chromium, Firefox, remote browser, page-runtime or runtime dependency was added.

## Supported profile

- Inherited `normal`, finite signed `px`, `em`, `rem`, unitless zero and the
  existing CSS-wide keywords. Computed values use absolute pixels; `normal`
  computes to zero. Relative values resolve against the appropriate own/root
  font size before inheritance. The implementation exposes computed zero as
  `0px`; it does not reuse letter-spacing's legacy `normal` serialization.
- SPACE and NBSP surviving existing white-space processing receive additive
  spacing. Collapsed-away source whitespace receives none. NBSP retains its
  nonbreaking behavior. Existing preserved tabs and hard breaks remain separate
  layout operations rather than word separators.
- Intrinsically zero-advance separators remain zero. Negative spacing can
  contract an ordinary separator to zero, but not below zero in this profile.
- Widths, wrapping, intrinsic sizes, line edges, inline fragments, generated
  text, ranges, hit testing and glyph placement consume adjusted advances.
  Word spacing is not trimmed as trailing letter spacing. Glyph bitmaps are
  positioned, not stretched. Existing letter spacing still applies separately.
- Justification can expand a normal separator contracted to zero. It also
  preserves previously eligible positive advances contributed by letter spacing;
  an intrinsically and actually zero-width separator is not newly expandable.
- Native text controls and textareas share separator geometry for wrapping,
  selection, caret positioning, pointer placement and keyboard navigation.
  Style changes participate in stale-geometry checks. Password controls continue
  measuring their masked text rather than exposing or measuring hidden spaces.
- Button/select/file caption painting uses adjusted advances. Button/select
  intrinsic caption sizes adapt; text/textarea size attributes and file inputs'
  existing fixed 34-cell capacity remain nominal. Long selected filenames stay
  clipped instead of expanding the file input. No file chooser was added.

## Explicit limitations

This is not complete CSS Text conformance or whole-site compatibility.

- Percentages, other units and math expressions remain unsupported.
- A negative final separator advance produces an explicit `unsupported` error.
  It is not silently clamped. This non-backtracking layout limit is an engine
  restriction, not a claimed standards-mandated lower bound.
- Nonzero spacing of the five explicitly enumerated non-native separator
  characters U+1361, U+10100, U+10101, U+1039F and U+1091F remains unsupported
  when they have nonzero advance. SPACE/NBSP are not claimed to exhaust all
  languages' word separators. Existing bitmap/shaping limits still apply.
- Independent image-alternative and decimal/decimal-leading-zero list-marker
  pipelines reject nonzero word spacing explicitly. Their existing guards have
  not been bypassed. These restrictions are intentionally conservative.
- Existing resource limits remain in force, including numeric layout bounds,
  text/option counts and raster dimensions. Native editable-control cell advances
  above 4,096 pixels are rejected rather than allocating unbounded geometry.
- CSS Text's typography-dependent distribution around separator characters,
  cross-script typography, and full white-space/justification conformance are not
  established by the current synthetic tests.

## Evidence and review

Four explicitly listed native suites cover styles, layout/range/hit/pixels,
click/navigation and control geometry. Their fixture transports are synthetic;
these are not live website, socket, SafeJS, TTY/PTY, credential or passkey tests.

The isolated validation lane is
`/dev/shm/agent-browser-word-spacing-september14/`. It starts from clean commit
`41d5439b4db623631a3e0bb8804bae36e554b1d2`, excluding pre-existing dirty work.
`REVIEW-RESOLUTION.md` records corrections to file capacity, applicability checks
and zero-width justification, including its interaction with letter spacing.
Earlier successful snapshots remain unchanged and do not validate later edits.

Final `release02` ran September 14, 2026, 13:03:42.066–13:09:45.399 UTC:
23,513 passing cases, zero failures and the same two explicitly excluded cases,
across 470 selected files. Build, 469-root strict checking and existing formatting
all pass. The audit preserves all 23,342 prior case occurrences, including their
two exclusions, and adds 173 passing word-spacing cases without broadening the
inherited exclusions. The total host-object ceiling and advisory-media/display
cases remain excluded, not passed.

Final `controls02` independently passes 437 cases: the same 173 new cases plus
264 existing native control cases in six additional manifest-listed suites.
Its source and compiled inventories are identical to `release02`. Those 264
additional cases give 23,777 distinct passing case occurrences across the two
selections; the repeated new cases are not counted twice. `focused02` separately
passes 475 cases. All final runs use immutable 2,914-file source snapshots,
private HOME/TMP and inherited native/network guards. These counts do not imply
that every repository test or acceptance gate ran.

`release02/AUDIT.json` retains the exact selections, case-preservation checks,
source/compiled hashes and supplemental identity audit. Durable evidence is under
`node_modules/.cache/native-validation/word-spacing-september14/`; original
execution paths remain unchanged. Pre-existing dirty tracked and untracked work
is excluded from the feature's clean candidate and preserved during adoption.

The `spec/` sublane extracts section 7.1 from the already captured W3C CSS Text
body using this native browser, without wire requests or scripts. Original
capture provenance remains in `W3C-TEXT-SPACING-RESEARCH-SEPTEMBER-14.md`.
`spec-parent-audit/` independently checks the local extraction evidence. This
supports narrowly stated semantics, not engine conformance. In particular, the
section does not establish exact CSSOM serialization or a universal negative
spacing clamp. The initial zero-font interpretation was corrected before the
feature's final tests; the historical extraction report remains unchanged.

## Website follow-up

The motivating captured Wikipedia portal rule is
`.search-container fieldset { word-spacing:-4px }`, documented in
`WIKIPEDIA-BACKGROUND-DIAGNOSTICS-SEPTEMBER-14.md`. That earlier observation found
the search input but could not produce supported geometry. This implementation
alone is not a new Wikipedia run and does not establish a working search flow.
Any subsequent captured observation must retain its own runtime, scope,
measurements and result. Opacity, layered backgrounds, appearance and clipping
remain separate gaps; the overall browser goal stays active.
