# Native float document layout

The native page pipeline now coordinates physical `float:left` and `float:right`
with block geometry, inline text, painting and hit testing. This consumes the
existing bounded float-placement and shrink-to-fit implementations; it does not
rewrite floats as absolute positioning or discard page styles to obtain a result.
The supported profile is partial. Isolated tests are not live website evidence.

## Supported profile

- Source-ordered left/right floats use their outer margin boxes. Text uses the
  remaining line interval, including opposing floats, variable line extents and
  downward retries, then regains full width below the exclusions.
- Ordinary block flow does not advance by the height of a floating child.
  Ordinary descendants share their block formatting context's exclusions;
  independent contexts have separate ownership and avoid earlier float boxes.
- Auto-width non-replaced floats use bounded intrinsic shrink-to-fit sizing.
  Replaced floats use replaced sizing. Explicit sizes, borders, padding, margins
  and supported min/max constraints retain their native geometry.
- Auto-height independent contexts include their own same-context floats,
  including floats inside ordinary descendants. Ordinary auto-height boxes do
  not expand just to contain floats; explicit heights retain their constraints.
- Physical `clear` on floating boxes uses float placement clearance. This is not
  general non-floating clearance or margin-collapse support for cleared blocks.
- Native text, glyphs, fragments, raster paint and hit ownership use the actual
  placed float subtrees. Float painting is grouped at the float phase while
  positioned descendants retain their actual stacking-context ownership.
- Static-position fallback in ordinary float-containing flow uses coordinated
  full-page hypothetical layout, rather than an isolated float-free shortcut.
  Relative offsets and fixed viewport insets preserve their separate semantics.

`src/float-document.ts` owns page-level validation, measurement, same-context
placement and merging. `src/document-layout.ts` exposes the internal sequential
flow hooks. Formatting retains float anchors without splitting inline ancestors;
text layout queries real line intervals. Float-free pages keep the existing
dispatch path, and float-free measured interiors avoid the coordination pass.

## Limits and failure behavior

Raw formatting diagnostics remain available. The coordinator accepts only the
exact float and floating-clear diagnostics it owns; other guards remain active.
Logical float/clear sides, non-floating clearance, atomic inline/flex/grid/table
interactions, floats inside positioned reflow roots, and unmeasured nested-auto
float intrinsic sizing remain unsupported. Negative outer float dimensions are
also rejected rather than approximated. A float anchor inside a pending word
that already requires emergency wrapping also remains unsupported. Overflow
clipping/scrolling is not implemented by this change.

Document work remains capped by the native formatting budget. Float retention is
limited to 4096 and measurement nesting to 32. Placement retries, text layout,
subtree merging and aggregate text retention are charged or checked against
their native limits. Placement contexts close on success and on failure. These
are bounded native checks, not real SafeJS or operating-system acceptance.

## Source and regression evidence

The locally retained native primary-source captures remain in
`FLOAT-FORMATTING-SOURCE.md`, `FLOAT-SIZING-SOURCE.md`, `FLOAT-HEIGHT-SOURCE.md`
and `FLOAT-MARGINS-SOURCE.md`. Their paths and measurements are not rewritten.

The exact public-API fixture in `src/float-document-integration.test.ts` checks
float and following-block rectangles, wrapped line/glyph coordinates, raster
color and hit ownership. On otherwise unchanged clean
`d7dce49c99bbe68cbdf228d7a6bb432eff006754`, the corrected fixture fails at the
original unsupported-width guard. That baseline runs September 12, 2026,
01:39:54.944–01:39:56.395 UTC, with one failure and 1083 unchanged tracked
inputs. Its SHA-256 is
`e5f8e9aefea4ae0770874a516ab3ddafa98d56637af5a6173aa51def92a484ab`.

The earlier draft incorrectly assumed a 4px native glyph advance instead of 6px.
Both the original baseline and the first integration failure are preserved;
only the corrected byte-identical fixture is used for the final comparison.
Private evidence lives under
`node_modules/.cache/native-validation/float-document-work-september12/`.

The final focused snapshot, `fixed08`, passes 888 checks in 23 explicit,
manifest-listed suites with no failures or exclusions, September 12, 2026,
02:00:03.224–02:00:14.125 UTC. Six new suites contribute 161 checks covering
formatting, line intervals, sizing, BFC ownership, static anchors, painting,
mutations and resource limits. Existing blanket float-failure cases now check
actual layout, including outside list markers and image text alternatives.
The marker fixture's initial top-offset mistake is preserved in `fixed07`;
the corrected expectation follows the existing first-line baseline model.

Earlier full gates retain their failures: `round01` stops at strict fixture
typing, while `round02` passes build/strict/format and reports 11490 passes,
two obsolete blanket float-failure assertions and the same two exclusions.
No exclusion is added to make either failure disappear.

The sealed `native-float-document-september12-round03` gate passes build,
strict checking, formatting and 11492 selected native tests, with no failures
and the same two exclusions. It runs September 12, 2026,
02:00:14.217–02:02:37.200 UTC: 203 selected suites, 202 strict roots and
599 clean manifest entries. Parent audit verifies 1069 unchanged tracked inputs,
1091 source files, 1928 compiled files and all 21 owned source/test files.
The exact standalone baseline fixture remains unchanged. The review of work
accounting, coordinate merging and cleanup found no concrete defect in its
bounded static scope; the release gate, not that review, supplies test evidence.
The separately documented legacy grid failures outside this selection remain;
this is not an all-repository test pass.

No new website run is claimed here. In particular, the previously captured
OpenBSD overflow diagnostics remain a separate gate even after physical float
support. NetBSD and curl have additional independent layout/CSS guards; man7's
pre-transport optional-resource policy abort is not a float-layout verdict.
Provider/credential, passkey/device, real SafeJS, socket/TTY and access-challenge
acceptance remain separate from this isolated native work.
