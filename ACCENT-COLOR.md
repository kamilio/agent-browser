# Native checkbox and radio accent colors

Continuation after `8d60fc6`, September 5, 2026. This adds the bounded inherited
`accent-color` longhand and a software palette for existing enabled, active
checkbox/radio controls. It does not introduce a platform widget engine, new
control kinds or new interaction geometry.

## Primary references and native policy

```text
https://www.w3.org/TR/2026/WD-css-ui-4-20260120/#widget-accent
https://drafts.csswg.org/css-ui/#widget-accent
https://drafts.csswg.org/cssom/#resolved-values
https://drafts.csswg.org/css-color-4/#serializing-other-colors
https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
```

CSS UI defines an inherited `auto | <color>` property, requires transparent accent
colors to be precomposed over Canvas, and permits adjusting companion colors to
keep controls legible. This native implementation retains its existing default
palette for `auto`. Explicit colors fill the checkbox interior or radio disc;
the existing checked rectangle, indeterminate bar or radio dot uses whichever of
opaque black and white has higher sRGB relative-luminance contrast against that
fill, with black on ties. This is a local deterministic palette, not a promise of
OS/browser pixel parity or complete WCAG conformance.

The existing light native profile supplies opaque white Canvas. Each accent RGB
channel is precomposed using the existing 8-bit alpha and rounded to a byte. The
resulting fill and mark are opaque: transparent accent produces white with a
black mark rather than hiding checked state. Authored background does not replace
Canvas for this calculation. Dark themes, color-scheme negotiation, forced colors
and system-color grammar remain outside this feature.

## Shared CSS state

One canonical longhand participates in existing stylesheet, inline, supports,
variables, importance and CSS-wide declaration pathways. Native inline CSSOM
offers `accentColor`, the literal property, methods, priorities and removal.
Computed property enumeration grows from 74 to 75, with `accent-color` now the
first sorted supported longhand. Existing caret-color count/bounds assertions
are updated without changing their behavioral expectations.

`PaintStyle` stores an optional color; absence represents initial `auto` and
preserves the old default object shape. The existing inherited auto-color path
is shared with caret-color. Parent-map equality includes both optional fields,
so sharing cannot discard an explicit accent override. Inherited currentcolor
stays a keyword until the receiving control resolves its own foreground.

Computed CSSOM retains `auto` and `currentcolor`, and serializes explicit colors
using the existing RGB/RGBA representation before painting's opaque precomposition
or contrast choice. This follows CSSOM's computed-value fallback and CSS Color4's
computed-keyword serialization rather than copying caret-color's used-value rule.
Primary-source review also found a July 2021 WPT change expecting used RGB instead.
Current WPT source retrieval was unsuccessful; no external browser or WPT ran.
This known historical discrepancy remains an explicit CSSOM interoperability gate,
not a claim that existing browsers match the chosen draft-derived keyword behavior.
The research record is
`node_modules/.cache/native-validation/parallel-css-accent-color-8d60fc6/delivery/CURRENTCOLOR.md`.

## Rendering boundaries

Explicit accents apply only to enabled checked/indeterminate checkboxes and
enabled checked radios. Unchecked and disabled controls retain their old pixels.
The outer focus/border, radio exterior corners, geometry, hit testing, values,
form state and actions are not recolored or moved. Other controls, ordinary text,
caret colors, selection highlights and placeholder rendering are unchanged.

Existing named/hex/rgb/hsl/currentcolor/transparent grammar and 8-bit color limits
remain. No range/progress painting, new color spaces, animation, appearance
property or operating-system theme integration is added.

## Validation evidence

There are 115 new cases: 49 CSS/CSSOM and 66 rendering tests. The identical final
CSS test file has 4 passes / 45 assertion failures on exact `8d60fc6`, and 49
passes on both actual v2 and final v3. No missing helper imports or test skips
hide baseline behavior. Native inline/computed host objects use the existing
injected factory, including live values, priority, variables, reset, mutation,
detachment and lifetime. The final new test passes strict types and scoped Biome.
Source hashes, the researched serialization decision, both replay patches and
all test JSON/logs remain in
`node_modules/.cache/native-validation/parallel-css-accent-color-8d60fc6/delivery/README.md`.

The first working-tree regression run passes 172 of 175 cases across five named
native files. Three failures expose expected enumeration metadata changes: the
new first sorted property and two caret-color tests' old count/bounds. Those
expectations are updated; no behavioral assertion is removed. The original JSON
is retained at `node_modules/.cache/native-validation/accent-color-first.json`.

The independent rendering suite passes all 66 cases against exact production v3.
The identical final baseline suite has 4 passes and 62 failures: 30 independent
palette assertions and 32 unsupported actual-CSS cases. Hard-coded 10-by-10 masks
check every checkbox, indeterminate and radio pixel. Nine literal palettes include
alpha, transparent and adjacent grayscale colors on either side of the black/white
mark transition. Other controls, caret/selection pixels, disabled and unchecked
states, native actions, radio groups and closure are covered. The source archive,
all earlier runs, exact v2/v3 patches and scoped static checks remain in
`node_modules/.cache/native-validation/parallel-accent-color-rendering-8d60fc6/report.md`.

The final injected command-host comparison contains 48 captures: sixteen each
from exact `8d60fc6`, the isolated feature and the working tree. All sixteen
new-build pairs are byte-identical. Seven frames retain default pixels; nine
accented frames change 3,916 pixels, with zero differences outside actual native
widget interiors. Geometry, actions/state, hit testing, revisions, source glyphs,
other paint metadata and counters compare exactly. Transparent retains a visible
black mark; dynamic red-to-auto/removal restores the original complete PNG.

Baseline fixtures explicitly omit unsupported accent-color declarations; actual
new CSS contains them. The comparator removes only that exact property when
checking otherwise identical source, and separately asserts its presence/absence.
Dynamic baselines use equivalent navy foreground syntax to preserve real revision
counts. This is not a claim of identical authored CSS or a baseline acceptance
shim. The final v3 source/dist fingerprints pass; a stale-v2 audit failure caused
by the parent formatting change is preserved with all earlier captures. The 112
PNGs across retained checkpoints are not 112 distinct final cases. Parent visual
inspection covers final alpha-green checkbox and red radio exports.

Capture report, runner, raw source/metadata and final `comparison-v3.json` reside
under `node_modules/.cache/native-validation/parallel-accent-color-capture-8d60fc6`.
All exported native artifacts were released and every host closed.

Final parent integration passes 743 isolated and 744 working-tree tests across
the same twenty-one explicitly listed native files. The one extra working case
is pre-existing pending work and is excluded from this commit. Both typechecks
and builds pass, as do strict compilation of the two new test files, scoped Biome
and formatting of all four production files. The helper checks real child errors,
exits, manifest membership and populated no-failure/no-skip JSON summaries.
Logs use `accent-color-integration-final-*` under the native-validation cache;
the exact helper is `/tmp/accent-color-validation.mjs`.

Both manifests contain 394 unique entries. All files exist in the working tree;
22 pending-only entries remain absent from the isolated archive, unchanged by
this feature. The final capture's 42 recorded source/dist fingerprints still
match after parent builds (`accent-color-parent-final-fingerprints.json`).
No full-manifest, actual SafeJS, live-site, socket, TTY/PTY, external browser,
timing/RSS or portable release acceptance is inferred. Original gates remain
open in `TASKS.md`, along with the explicitly documented currentcolor CSSOM
interoperability discrepancy.

Three existing organizeImports diagnostics in css-paint, css-declarations and
computed-styles are reproduced on exact HEAD source in the retained
`accent-color-biome-baseline` directory. They are not repaired by sorting pending
unrelated imports. Production formatting and the control/new-test scoped checks
are separate from these known diagnostics. Root disk pressure was relieved by
an approved byte-verified relocation of one completed older snapshot, preserving
its original path as a symlink; the retention record is `accent-color-disk-retention.md`
under the same native-validation cache. Historical reports are not rewritten.
