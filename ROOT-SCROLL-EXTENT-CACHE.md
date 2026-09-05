# Native root-scroll extent cache

Continuation after `34a27e4` and `ROOT-SCROLL-CSS-CACHE.md`. This repairs redundant
extent scans separately from the preceding CSS-cache repair. It does not cache
document layout, client geometry, hit testing or raster output across revisions.

## Measured premise

The premise recorded at `2026-09-04T23:53:36Z` uses actual sources based on
`fd85e20` plus the two root-scroll paint-mode call sites, before their later
`34a27e4` commit. Four root moves to vertical positions 10, 20, 30 and zero retain
CSS cascade count one but increase extent scans from one to five. Bounds stay
380 by 720 throughout. The source fingerprint, positions and counters remain in
`node_modules/.cache/native-validation/scroll-extent-cache-premise.json`.
That pre-commit provenance is not relabeled as an older committed benchmark.

## Conservative ownership

`DocumentScroll.refresh` still checks owner/document lifetime first and requires
a successful initial full extent scan. For a previously populated cache, it may
advance the validated revision without replacing its maximum only when the
bounded journal is intact and every intervening change is a `style` record with
`presentationOnly: true`.

All other changes take the existing scan path. This includes ordinary style
invalidation, CSS/viewport inputs, attributes, text, structure, focus/pointer
state, unknown/mixed journals and lost history. Real control-value changes also
rescan: the extent owner deliberately does not borrow the CSS owner's broader
eligible-control shortcut.

The two approved sources of these presentation-only changes are native control
caret publication/close and root movement/clamp. They do not alter document
extents. New page-runtime APIs, marker producers or layout-dependent shortcuts
are not added here.

Position and document revision still change on real movement. Each geometry,
hit-testing and raster consumer retains its existing revision checks and current
scroll projection. Fixed boxes, source positions and scrolled control clips remain
the responsibility of the shared native geometry/rendering paths.

The diagnostic `DocumentScroll.metrics().builds` counts completed extent scans.
Its `revision` is the last validated revision, and `work` remains the last full
scan's work, as on existing cache hits. Calling metrics alone does not refresh
the owner. Bounds are immutable and may retain identity on an eligible hit;
relevant changes can replace them even when their numeric values are unchanged.

Coordinate validation, fractional values, clamping, reentrant notification order,
update/work limits and no-op behavior are unchanged. Unchanged requests still
consume the existing update quota. A failed full layout cannot be hidden by later
paint notifications, because its unresolved relevant journal still forces a scan.

## Validation evidence

Eighteen new lifecycle/fallback cases plus the existing viewport and scroll
notification suites pass all 75 cases. They cover first population, cached bounds
identity/work, generic and mixed invalidation, control-value conservatism, bounded
history loss, reentrant dimension changes during automatic clamp, reentrant reads,
resource-limited layout failure/recovery, coordinate validation, update quotas
and owner/document close.

The first run had six fixture failures and 69 passes: an unconstrained input
overflowed the small containing block and invalidated the expected extents. Its
source/log are preserved. Giving that fixture input an explicit 50 by 20 CSS
size fixes the setup; no production change or weakened extent assertion follows.
The deep-tree case genuinely exceeds the formatting depth limit while remaining
within its larger document-tree limit, then recovers after removal.

The consumer worker adds 16 cases, all failing on exact `34a27e4` and passing
unchanged against actual formatted parent production. Its four-file replay passes
91 cases, including 75 existing cases. The final nineteen-file integration runs
pass **505 tests in both trees**, including all **34 new cases**. Source types,
builds using `--outDir dist`, strict new-test compilation and scoped Biome checks
pass. Both manifests retain 390 unique entries; 22 existing pending-only files
remain absent from the isolated archive.

Consumer evidence covers actual wheel/hover sequencing, keyboard/scroll-into-view,
fixed/absolute/normal geometry, live hit targets, prepared-raster invalidation,
input/textarea selection and clipping, real value/focus transitions, and inline/
embedded/external/media-driven extent changes. Required scans still happen when
CSS objects happen to be reusable. Source formatting changed only a line break;
the worker preserved and replayed both exact source versions rather than ignoring
the intermediate fingerprint mismatch.

Focused results use `scroll-extent-integration-final-*` in the native-validation
cache. Worker test lineage and logs are in
`parallel-scroll-extent-cache-34a27e4/delivery/README.md` and
`FINAL-PROVENANCE.md`. The recorded native UTC starts are September 5; the older
September 4 premise above retains its original timestamp and lineage.

## Native capture evidence

The final exact-base, isolated and working set contains **54 native captures**:
eighteen phases each. All 36 cross-build full PNG pairs are byte-identical, with
zero changed pixels and no masks or coordinate/source/revision normalization.
Geometry, hits, values, selections, glyph/source mapping, snapshots and paint
metadata match. Only the intended extent-build diagnostic differs; all other
extent diagnostics and full geometry metrics compare exactly.

Forty-eight bounded samples measure actual extent and CSS counters separately:

| Sample sequence | Baseline extent scans | Repair extent scans | CSS cascades in both |
| --- | ---: | ---: | ---: |
| Ten root actions, including real style/viewport changes | 11 | 2 | 2 |
| Six control actions, including a real value change | 6 | 1 | 0 |

Pure root moves and caret-only updates add zero extent scans after repair. Real
dimension and control-value inputs retain their required scans. All six control
actions still rebuild geometry; the complete capture sequence retains geometry
builds one through eighteen in every build. The prior CSS improvement is not
credited again.

Sixteen adjacent capture phases visibly change, while the intentional clamped
no-op stays identical. The parent inspected the visible scrolled-caret image.
Each artifact is released and each injected host/transport closes. Source-format
changes prompted new actual-root builds and `after-v2` / `working-v2` replays;
all earlier successful images and logs remain intact. There are 90 exported PNGs
across retained checkpoints, but the final three-root set is 54, not 90 cases.

Evidence is retained at
`node_modules/.cache/native-validation/parallel-scroll-extent-capture-34a27e4/`:
`FINAL.md`, `comparison-v2.json`, per-stage `evidence.json`, exact runners, hashes,
logs and counter samples. The parent verifies final source/build fingerprints.

## Acceptance boundary

No CPU/RSS, allocation, end-to-end speedup or completed-browser claim is made. Full
native execution remains unauthorized after the earlier denial; focused suites
are not a broad filtered substitute. Actual SafeJS, live sites, sockets, TTY/PTY,
GUI and original acceptance gates remain separate and open. New archives/evidence
use HOME cache; pending work and historical reports remain preserved.

Root-disk pressure required relocating the completed
`/tmp/agent-browser-editable-caret-f1d7b43.jsdpZJ` snapshot after an approved
byte-for-byte directory comparison. Its original path remains a symlink to the
retained HOME copy; no historical report or measurement was rewritten. This freed
approximately 138 MB without treating overall disk health as resolved.
