# Wikipedia: current-runtime captured diagnostics

## Result and scope

On September 14, 2026, the native browser loaded the original Wikipedia portal
capture once, built formatting, read cached CSS diagnostics, looked up
`#searchInput`, and attempted its geometry once. The diagnostic observation and
verification pass. **Input geometry still fails; no interaction or live-site
success is claimed.** No new website/domain or live response was tested.

Browser interval: **08:07:54.841–08:07:55.197 UTC**. Supervisor interval:
08:07:54.771–08:07:55.210 UTC. The entry point is native `loadBrowserDocument`,
not `BrowserSession` navigation. No click, typing, search submission, second
page, raster, page script or image/stylesheet callback was enabled. Actual wire
requests and recorded JavaScript guard attempts are zero. The seccomp wrapper
does not collect denied-syscall telemetry. Only the native engine
interpreted captured HTML/CSS; baseline review used metadata and native results.

Runtime commit: `fefbb8b083e83587b7b45e8ca19e9719c1c8f447`; repository HEAD at
observation: `eaa2359218662838fef798d5575237d1cfca089e`. The reused frozen gate is
`node_modules/.cache/native-validation/font-wide-work-september14/release01`:
22,741 passed, zero failed, two unchanged exclusions; 449 selected files,
448 strict roots, 801 clean-manifest entries. Its 1,356 source files, 2,180
compiled files and 158 receipt entries were rehashed. The nine owned committed
source files and clean manifest match. **The native suite was not rerun here**;
its earlier pass is separate from this captured-page observation.

## Original fixture and comparison

Original capture: `https://www.wikipedia.org/`, received September 13, 2026 at
05:25:34.449 UTC, status 200, no recorded barrier. Body and receipt remain at:

- `node_modules/.cache/native-validation/native-wikipedia-form-flow-september13/response-1.body`
- `node_modules/.cache/native-validation/native-wikipedia-form-flow-september13/response-1.json`

The body is 119,573 decoded bytes, SHA-256
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
Receipt SHA-256:
`21377d6bddde7d091dcb54ee927d55d60b2bc19627220447e6a8ecdaa38dd0d5`.
No missing asset was fetched. In particular, the deferred logo is an asset gap,
not evidence that its image format is unsupported.

The latest previous executed Wikipedia observation is the **radius** replay,
not the earlier cursor replay:
`node_modules/.cache/native-validation/native-wikipedia-radius-september13/after-RESULT.json`,
September 13 at 23:25:26.256–23:25:26.518 UTC. Its result SHA-256 is
`68ce09204ffe028ec8eb501092ba63e9440d908ea33fa9d4d3f84aefb5f0be45`.
That historical runtime had 21,517 native passes and two exclusions. Nothing in
that lane was rewritten or reclassified as a current run.

| Formatting issue occurrences | Previous | Current |
| --- | ---: | ---: |
| CSS unimplemented property | 65 | 64 |
| CSS invalid/unimplemented value | 24 | 24 |
| CSS unimplemented at-rule | 1 | 1 |
| CSS invalid/unimplemented selector | 8 | 8 |
| CSS invalid/unimplemented media query | 2 | 2 |
| Overflow layout unsupported | 7 | 1 |
| Positioned layout coordination | 16 | 16 |
| Element layout unsupported | 1 | 1 |
| HTML direction unsupported | 22 | 22 |
| Display layout unsupported | 2 | 2 |
| Float layout unsupported | 14 | 14 |
| Clear layout unsupported | 5 | 5 |
| **Total overlapping occurrences** | **167** | **160** |

The CSS portion decreases 100→99. These are diagnostic occurrences, not distinct
broken elements, completeness scores or an isolated attribution to the latest
font change. Multiple runtime changes separate the observations.

Both runs have 2,708 DOM nodes, revision 2,712, viewport 1280×900, 2,114 visited
DOM nodes, 2,250 formatting boxes, 5,016 text code units and three deferred
subtrees. Formatting work changes **20,974→20,977**. The deferred nodes remain
the logo and two generated display cases. No speed or memory improvement is
claimed from these differently scoped single observations.

## New bounded diagnostics

Raw CSS counts are 97 unsupported properties, 37 invalid/unimplemented values,
eight selectors, one at-rule and two media queries. Applicable counts are
64/24/8/1/2 respectively. The historical radius result does not include separate
raw/applicable CSS snapshots; no raw-count trend is invented.

The cached native diagnostics read leaves style metrics unchanged: cascade
build 1 and 367,271 work units. It retains **128 samples, omits 14 occurrences,
and reports `exhaustive: false`**. Independent text/selector bounds are verified.
Retained states: 86 matched/active, 28 unmatched/active, two unresolved/active,
11 not-evaluated/inactive and one unmatched/uncertain. These are a bounded
sample, not complete winning-declaration or affected-element attribution.

Notable applicable retained samples include 21 sprite `background-position`
values, one background image and one repeat declaration, 12 transitions,
six opacity values, five transforms and five box shadows. Other retained gaps
include appearance, selection, columns, clipping, filters and word spacing.
Sprite declarations refer to assets not provided by this one-body fixture.
Accepting their syntax alone would not establish painting support.

## Geometry and cleanup

The one native lookup finds input `e239`, with an existing formatting node.
The one `getBoundingClientRect` attempt throws `AgentBrowserError`, code
`unsupported`, because document width resolution still requires an issue-free
supported profile. The reported blockers are CSS values (24), at-rule (1),
properties (64), selectors (8), element layout (1), HTML direction (22) and
overflow (1). No input rectangle is returned. The guard is not suppressed.

The private, empty child environment uses pipes, the byte-identical existing
network guard/seccomp wrapper, JS child-process/worker/addon denial, a 30-second
timeout plus five-second grace, 35-second watchdog, 1 MiB aggregate output cap
and 10 MiB file-size ceiling. Document bounds are 50,000 nodes, depth 128,
3,000,000 text code units and 1,024 changes; formatting work cap is 2,000,000.
There is one run lock and one workload lock, with no retry.

PID/process group 1418792 exits zero and is absent at verification. Browser
owners close, node count becomes zero, private home/tmp remain empty and are
removed; cleanup/integrity/guard errors are empty. Before/after source, compiled,
fixture and framework inventories match. This is not a separate socket, TTY,
SafeJS, credential, passkey/device or challenge acceptance test.

## Evidence and remaining work

Original execution artifacts are at
`/dev/shm/agent-browser-wikipedia-september14/`. This new RAM lane is volatile;
it was chosen when project space was exhausted. Project capacity subsequently
recovered. A byte-identical durable evidence copy is stored at
`node_modules/.cache/native-validation/wikipedia-current-diagnostics-september14/`;
its `PERSISTENCE.json` records the original location and copied hashes. Embedded
execution paths still name RAM; the copy is not a second execution or a relocated
historical run. Do not execute copied scripts as a new lane.

| Original artifact | SHA-256 |
| --- | --- |
| `RESULT.json` | `551cd23f6226fce8e46eb6454adcab45128d0fcb4de82fb1f3fbbb72e8e229ff` |
| `VERIFICATION.json` | `22b826d3a28ac7acb1c81672ef6992e4ad743039b411f4836d63b26b79c3af52` |
| `EVIDENCE.sha256` (25 entries) | `619e44bc29dda3241f2e311e293bd305363ff8d2534ecd09ac3156cd02d228e0` |
| `RELEASE.json` | `cd010192a2738278f6c787cd521f14487ea07d839304bba7fe1ec7635f8d23ec` |
| `BASELINE.md` | `c34f56b13c7326be922ea00ac03d65ea036238fb381bda85bae74d41cf2cdc65` |

Next: prioritize real native layout/paint behavior from observed gaps, with
synthetic regressions before another bounded captured replay. Missing sprite
assets and external resources need their own scope; they must not be silently
fetched. MDN's destination remains uncaptured. Original research, broader live
sites/forms, credentials/providers/passkeys/devices, SafeJS, socket/real terminal
and challenge gates remain open. Overall browser goal active; nothing pushed.

Independent metadata review in `REVIEW.md` confirms the 25 sealed hashes and
observed outcome, while noting that the generic verifier alone does not assert
the exact input/geometry result. Separate `PARENT-VERIFICATION.json` asserts
`e239`, one geometry call, the unsupported error, no rectangle, no interaction,
exact comparison maps and bounded sample metadata without rerunning the page.
It also records the finalized durable-copy check. The original verifier and
review remain unchanged; corrected report wording distinguishes historical
formatting projections from raw/applicable snapshots and JS guard telemetry
from kernel-level denials.
