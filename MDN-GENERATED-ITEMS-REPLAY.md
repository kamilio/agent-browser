# Captured MDN generated-item replay

September 14, 2026. **Diagnostic completed; interaction acceptance remains open.**
The native browser consumed the original September 11 MDN querySelector-page
capture on committed runtime `97a98e12e8a4b321080daee1f374f5e4597d96a3`.
This is a new offline observation, not a new live visit or a relabeled old run.

## Result

The native observation ran from **06:23:50.942 to 06:23:51.344 UTC**. It performed
one navigation, one default formatting build and one hint query. All 19 original
responses were served once: 270,288 decoded bytes, zero denials, zero wire
requests, no scripts and no clicks. No width resolution, geometry, rasterization
or destination navigation occurred.

Compared with the earlier captured formatting observation:

| Native diagnostic | Earlier | New |
| --- | ---: | ---: |
| Generated-item layout unsupported | 29 | 0 |
| Inline vertical alignment unsupported | 3 | 0 |
| Generated vertical alignment unsupported | 3 | 0 |
| Raw diagnostic categories | 13 | 10 |
| Overlapping diagnostic occurrences | 255 | 220 |
| Deferred subtrees | 94 | 65 |

The formatting tree retains **2,047 indexed nodes plus seven outside markers =
2,054 boxes**, 1,954 visited DOM nodes, 15,270 text units and 83,210 formatting
work units—the same values as the earlier observation. Empty generated boxes
were not dropped. The complete raw issue map, rather than sample absence alone,
shows that these three diagnostic categories disappear.

The earlier observation used runtime `23e988d`; intervening runtime changes also
include native performance fixes. These two observations are not a controlled
single-change speed benchmark. The occurrence reduction is not a count of 35
distinct bugs or proof of complete MDN rendering.

## Remaining diagnostics

All ten remaining category counts are unchanged:

| Raw diagnostic | Count |
| --- | ---: |
| `css:unimplemented-css-at-rule` | 14 |
| `css:unimplemented-or-invalid-css-value` | 15 |
| `css:unimplemented-css-property` | 78 |
| `css:unimplemented-or-invalid-media-query` | 16 |
| `css:unimplemented-or-invalid-css-selector` | 2 |
| `display-layout-not-supported` | 63 |
| `positioned-layout-requires-coordination` | 29 |
| `html-presentation-hint-not-supported` | 1 |
| `element-layout-not-supported` | 1 |
| `svg-layout-not-supported` | 1 |

These are display-decomposition diagnostics, not the final coordinated action
profile. Some represent required layout coordination; they must not all be
described as independent missing features. CSS property/value attribution is
still needed before selecting the next compatibility implementation.

Attribution uses 127 of 128 allowed calls and retains five presentation-hint
candidates. It leaves 36 generated and 530 ordinary-inline candidates unexamined.
The samples remain nonexhaustive and do not establish exact hint ownership.

## Verification and evidence

The new verifier and independent parent checks pass. They confirm exact runtime,
fixture and framework bindings; unchanged native-gate evidence; complete remaining
issue counts; node-plus-marker accounting; closed owners; removed empty private
directories; and absence of the supervisor process group. The earlier false
verifier remains byte-for-byte unchanged; its old node/box assumption is not
retroactively corrected.

Lane: `node_modules/.cache/native-validation/mdn-generated-items-preparation-september14/`.
Despite its preparation-oriented directory name, this lane now contains the
separately authorized, single completed run and its sealed evidence.

- Result SHA-256: `4c345c3452931ba9a8db8e06972d5befb9545b2af692a83c6793faa2cb310b41`.
- Verifier SHA-256: `7668aae42010721ca87221bd1d0806066169041ef3247a231af8e3fc9eb722a8`.
- 36-entry evidence ledger: `ceb1cf922c8ca4ed144439cf7e9259a44f795b8d152cd16cc9992c8588be027a`.
- Parent proof: `generated-items-work-september14/MDN-PARENT-OUTCOME-VERIFICATION.json`
  within the same native-validation cache; SHA-256
  `a4ec99b639e164ffbc82f044cda800642103cca15a2446c3f3da4f88ca7ba790`.

The underlying native implementation separately passes 22,296 selected tests,
with two unchanged exclusions; see `GENERATED-FLEX-GRID-ITEMS.md`. That test gate
is not website acceptance. This diagnostic does not retest the earlier failed
link click, and the MDN querySelectorAll destination remains uncaptured. Fresh
website, research, credentials/devices, SafeJS, socket, real terminal and challenge
gates remain open. Overall browser work stays active. No push.
