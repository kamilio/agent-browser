# Bounded static-position sibling reuse

September 4, 2026. Equivalent adjacent out-of-flow siblings can now reuse a
measured hypothetical flow anchor within one layout pass. Actual positioned
sizing, subtree layout, painting and stacking still run for every target.
No work budget was increased and no unsupported-layout gate was removed.

## Reuse boundary

The first eligible target runs the existing hypothetical-layout algorithm.
Reuse requires the same parent and insertion run, equivalent layout metadata,
box/typography styles, text and supported child shape. Paint, z-index and the
original absolute/fixed distinction do not alter this hypothetical anchor;
their actual positioned behavior is still processed independently.

Intervening normal-flow siblings, other parents, different content/styles,
complex descendants, direct-flex static alignment and explicit-inset paths do
not reuse this anchor. Indexing, eligibility, string/style comparison and cache
hits are charged to the existing budget. Reuse state is never retained across
layout passes, revisions or viewports. This does not make arbitrary pages linear.

## Fresh integrated measurements

These compare actual compiled isolated HEAD 27ee227 with the integrated follow-up,
using identical HTML and the default 2,000,000 layout-work ceiling. They are work
counter measurements, not elapsed-time or released-browser performance claims.

| Fixture | Siblings | Before work | After work |
| --- | ---: | ---: | ---: |
| Empty absolute block | 100 | 36,948 | 27,546 |
| Empty absolute block | 1,000 | resource-limit | 276,846 |
| Empty fixed block | 100 | 36,648 | 27,246 |
| Empty fixed block | 1,000 | resource-limit | 273,846 |
| Text-only block | 100 | 55,648 | 36,149 |
| Text-only block | 1,000 | resource-limit | 362,849 |
| Text-only inline-origin target | 100 | 58,148 | 36,273 |
| Text-only inline-origin target | 1,000 | resource-limit | 363,873 |
| Explicit insets | 100 | 2,848 | 2,848 |
| Explicit insets | 1,000 | 28,048 | 28,048 |
| Separate normal-flow insertion slots | 100 | 205,800 | 206,100 |
| Separate normal-flow insertion slots | 1,000 | resource-limit | resource-limit |

All seven cases completed by both versions have identical full geometry hashes.
The failed before-version runs are not claimed as completed equivalence checks;
focused tests separately check large-run coordinates and work scaling. Historical
worker/v2 measurements retain their original paths, bases and values. In
particular, current text-work counts include later integrated text-layout work
and are not substituted into the worker's earlier report.

Two optimized native-module captures were visually inspected at 320 by 180,
at root scroll 0 and 60. Each is byte-identical to its fresh before-version
counterpart: 4,538 and 3,530 bytes. Capture layout work falls from 142,517 to
54,781 at scroll 0 and from 145,421 to 57,685 at scroll 60. These are direct native
raster calls, not CLI, external browser or page-runtime execution. The fixed box,
normal flow, inline targets and flex-centered target retain their pixels.

## Validation and limits

Twenty-seven new tests cover geometry equivalence, margins, source order,
separate/nested scopes, excluded cases, cache invalidation and budget accounting.
Both integrated focused runs pass 277 tests / eight files, including fixed-target
scrolling, pre-wrap and production double-click regressions. Source types/builds,
strict new-test checking and three-file full Biome checks pass. Evidence uses
positioning-performance-integration-* in the native-validation cache; original
worker handoffs/patches and /tmp evidence remain unchanged.

Authorized full native validation passes 10,374 tests / 304 isolated files.
Working validation reports 11,505 passes and the same fifteen pending
positioning/capability/onload assertion failures / 326 files. Those expectations
remain untouched; the same 22 preexisting uncommitted test files remain absent
from the HEAD archive, not removed from the explicit native allowlist.

Distinct flow slots and unsupported/complex shapes retain the original bounded
fallback, including the demonstrated 1,000-slot resource-limit result. CSS
positioning exclusions in ABSOLUTE-FIXED-LAYOUT.md remain. No live website,
socket, real TTY/PTY, SafeJS or released-runtime probe ran, and no dependency or
historical acceptance evidence was changed.
