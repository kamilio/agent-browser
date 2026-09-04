# Generated disclosure style inspection

September 4, 2026. Native-only continuation of `GENERATED-INSPECTION.md` and
`GENERATED-INTERFACES.md`; the seven-day browser goal remains active.

## Boundary and implementation

`styles <generated-reference>` and the unique generated role locator now inspect
the native fallback header rather than failing DOM reference resolution or
substituting its host's style. The report identifies the generated kind, real
owner reference and `generated-details-summary-style` profile, with `partial:true`
and `layout:false`. Ordinary element reports and no-target metrics are unchanged.

`src/generated-style.ts` is the shared immutable style factory used by inspection
and generated formatting. It retains the existing rendering behavior:

- List-item display, initial box properties and transparent background; host
  width, padding, margins, border and background are not header declarations.
- Supported typography, color and visibility inherit through the native style
  owner. The marker remains inside and follows the host's open state, independently
  of author list styling on that host or selectors for authored summary elements.
- Pointer-event eligibility reflects inherited host handling, without implying
  click readiness, focus eligibility or a CSS outline for the native focus ring.
- Available hidden targets can be inspected. Effective displayed/visible flags
  are not guarantees of layout boxes; use generated geometry for used bounds.
- Canonical registry validation rejects unavailable/foreign references and closed
  owners. There is no new mutable cache, fake DOM node or runtime dependency.

The initial box reports computed defaults, not used geometry: an auto width can
produce a 240px header, and initial border widths do not imply painted borders
when the corresponding border styles are none.

## Research

Primary specifications reviewed September 4, 2026:

- WHATWG HTML, rendering, “The details and summary elements”: internal default
  summary, list-item display and inside disclosure markers.
  `https://html.spec.whatwg.org/multipage/rendering.html#the-details-and-summary-elements`
- CSS Cascading and Inheritance Level 4, inheritance and explicit defaulting:
  distinguish inherited values from initial values and used geometry.
  `https://drafts.csswg.org/css-cascade/#inheriting`

This is a bounded native projection, not implementation of the specified full
shadow tree, flattened-tree cascade, pseudo-elements or browser computed-style API.

## Validation

All 31 new tests fail on isolated prior HEAD because generated style targets are
rejected. They pass with the patch. Coverage includes ordinary-host separation,
formatting agreement, display/flex variants, zero font size, inherited styles,
dynamic attributes/stylesheet text/focus, hidden and nested closed disclosures,
pointer eligibility, inert rendering, role targeting, stale/foreign references,
registry/style-owner closure, immutable records and bounded serialization.

Matching focused runs pass 165 tests across six files in both working and isolated
trees. Typecheck, build, strict checking of the new test and four-file Biome checks
pass in both trees. Authorized full native validation passes 9,453 tests across
272 isolated files. The working suite reports 10,598 passes and the unchanged
pending `src/page-bindings.test.ts:161` Window-onload assertion failure across
294 files; this is not an all-green working-tree claim. The explicit
`native-tests.json` list is used in both trees. Local run logs are preserved as
`node_modules/.cache/native-validation/generated-style-red.log`,
`generated-style-focused-working.log`, `generated-style-native-isolated.log` and
`generated-style-native-working.log` in that same directory.

In-memory command evidence uses actual open, Tab, Enter, styles and geometry
commands. `node_modules/.cache/native-validation/generated-style-evidence.mjs`
produces `generated-style-evidence.json` in the same directory. Inspected output
retains `u1-details-7` across all three phases: auto style width and 240px used
width; red 16px text before focus, green 24px text after focus; transparent header
background despite the blue host; closed then open disclosure marker. These are
native command/style/geometry observations, not new visual or live-browser evidence.

## Remaining gates

Broader authored focus feedback, CSS outline/focus-visible, full UA/shadow style
behavior, localization, platform accessibility and original browser/runtime
acceptance remain open. No live website, socket, real TTY/PTY or SafeJS probe ran;
the denied SafeJS probe remains unrun. Preserve historical evidence and unrelated
pending work, including the separately known Window-onload test disagreement.
