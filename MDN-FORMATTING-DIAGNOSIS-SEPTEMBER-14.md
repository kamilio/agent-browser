# Captured MDN formatting diagnosis — September 14, 2026

## Scope And Outcome

One separately scoped offline native diagnosis completes: initial navigation,
one default `buildFormattingTree`, one hint-attribute query and bounded native
property sampling. It does **not** attempt or prove a click, width resolution,
rendering or destination navigation. The prior failed action stays unchanged in
`MDN-OWNERSHIP-REPLAY.md`; `flowPassed` remains false here too.

The original September 11 querySelector corpus supplies all19 exact responses
once:270,288 decoded bytes, zero denied requests, wire requests, redirects or
unused fixtures. No source-body interpretation occurs outside the native browser.
Normal image loading and script/process/network guards remain unchanged.

This diagnosis stays on ownership runtime23e988d, not the concurrently developed
text-transform optimization in453d2e7. The historical4,096/current8,192 cascade
rule ceilings remain explicitly distinct, with no production-budget change.

## Complete Raw Formatting Inventory

The native display-decomposition result reports13 issue codes and255 occurrences.
These counts overlap; they are not255 distinct bugs or affected owners. This is
the raw formatting stage, not the later coordinated width-resolution profile
from the earlier click failure.

| Native issue | Count |
| --- | ---: |
| `css:unimplemented-css-at-rule` | 14 |
| `css:unimplemented-or-invalid-css-value` | 15 |
| `css:unimplemented-css-property` | 78 |
| `css:unimplemented-or-invalid-media-query` | 16 |
| `css:unimplemented-or-invalid-css-selector` | 2 |
| `display-layout-not-supported` | 63 |
| `positioned-layout-requires-coordination` | 29 |
| `generated-content-item-layout-not-supported` | 29 |
| `inline-vertical-align-not-supported` | 3 |
| `generated-content-vertical-align-layout-not-supported` | 3 |
| `html-presentation-hint-not-supported` | 1 |
| `element-layout-not-supported` | 1 |
| `svg-layout-not-supported` | 1 |

Metrics:1,954 visited DOM nodes,2,047 returned formatting nodes,2,054 boxes
including7 outside markers,15,270 text code units,83,210 work and94 deferred
subtrees. The default formatting limits are unchanged.

## Bounded Samples

127 of128 permitted attribution calls produce30 records, without raising any
cap. Each category allows at most32 records. No attribute/content string is
truncated, but substantial candidate coverage remains incomplete.

| Category | Records | Meaning and omissions |
| --- | ---: | --- |
| Generated item | 22 | Direct native deferred-reason attribution;29 matching wrappers exist,7 are not represented |
| Generated vertical alignment | 3 | Candidates only, not exact ownership of the aggregate issues |
| Ordinary inline vertical alignment | 0 | Only23 of553 candidates inspected;530 unexamined, so this is not evidence of absence |
| HTML presentation hints | 5 | All selector candidates sampled; supported exceptions still prevent exact issue attribution |

The generated queue examines22 of58 wrappers, leaving36 unexamined. Every direct
generated-item sample has a flex formatting parent. Sampled owners include
buttons, list items, spans and a summary element, with empty computed pseudo
content. These are retained generated boxes, not evidence that removing them is
safe or that their dimensions/paint are irrelevant.

Three generated vertical-alignment candidates are `li::after` owners `e1088`,
`e1097` and `e1106`: flex parents, computed inline display, static position,
no float and `vertical-align:middle`. The hint candidates are four SVG elements
with width/height attributes and iframe `e1927` with `height="200"`. None of
these candidate records is promoted to an exact aggregate-issue attribution.

The next implementation target is genuine generated flex-item participation and
its display/alignment handling, with focused native regressions. Do not merely
remove the unsupported-layout guard, drop empty generated boxes, or claim all
MDN failures are explained by this sample.

## Preserved Verifier Failure

The prepared verifier reports **false** because it assumed indexed nodes equal
reported boxes:2,047 versus2,054. Its original result and implementation remain
sealed and unchanged. Pinned native source defines boxes as
`nodes.length + outsideMarkers`; the7 markers explain the difference exactly.

A separate supplemental check, then an independent parent check, verifies that
accounting, the remaining sampling constraints, all18 ledgers/11,049 entries,
resource identities and cleanup. This supports the native diagnostic observations
without rewriting the failed prepared verification or running the browser again.
Future diagnostic harnesses must use the actual node-plus-marker convention.

## Timing And Provenance

Native observation: `2026-09-14T05:39:22.610Z` to
`2026-09-14T05:39:23.023Z`,0.413 seconds. GNU time:0.55 seconds wall,0.99 seconds
user CPU,0.06 seconds system CPU and135,916 KiB peak RSS. These are diagnostic
measurements, not a full-flow speed comparison. The process exits0, is reaped,
and group1313821 is independently absent. Native owners close; private HOME/TMP
are empty and removed. There is no retry or post-run browser probe.

Evidence under `node_modules/.cache/native-validation/`:
- `native-mdn-formatting-diagnosis-september14/before-RESULT.json`:
  `2405e37336c416ce3a27a5ee42c0aca9b046a1f40fec510b81ed2d80877c82cf`.
- `native-mdn-formatting-diagnosis-september14/VERIFICATION.json`, preserved false:
  `493ddbf8bee757793204519b650459ae62d0635c54b396f778632083904b5a00`.
- `native-mdn-formatting-diagnosis-september14/EVIDENCE.sha256`:
  `d2c9af2972d05f00e0f97bc6b650777e164be10c9b70a44cf87c0d4643fabf50`.
- `mdn-formatting-diagnosis-work-september14/PARENT-OUTCOME-VERIFICATION.json`:
  `2dd454428f96d6fa77a273fa868d6a8250b308806c9b592f216247d602fd9e26`.
- `mdn-formatting-diagnosis-work-september14/preparation/DIAGNOSIS-REPORT.md`:
  full lookup counts, omissions, supplemental verification and original seals.

Fresh live sites, MDN interactions, research, credentials/devices, SafeJS, socket,
real TTY and challenge-handling gates remain open. No push.
