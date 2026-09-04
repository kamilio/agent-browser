# Native solid-border core integration

September 4, 2026 checkpoint in the seven-day standalone browser plan.

## Scope and provenance

This promotes the existing pending border grammar, used-edge resolver and
software painter with focused adapters for the committed cascade, CSSOM,
normal-flow layout, geometry, element sizes and raster pipeline. It does not
import the entire pending rendering tree. The original `BORDERS.md`,
`INLINE-BORDERS.md` and historical reports retain their paths and measurements.

The source worktree retains its pre-existing implementations. The only new
behavioral edit there fixes border-width inheritance, with a matching existing
test correction and a new 43-case core suite. Independently constructed adapters
are validated against HEAD in an isolated tree before staging; pending flex,
physical insets, control presentation, scrolling, pointer and paint-order changes
remain outside this commit. The broader pending border suites are not promoted
because they also exercise those uncommitted dependencies.

## Behavior

- Physical width/style/color longhands and border shorthands enter the existing
  authored and inline declaration owners. Supported styles are none, hidden and
  solid; width keywords resolve to 1/3/5 pixels. Finite non-percentage CSS math,
  font-relative units, cascade winners and custom-property substitution reuse
  their committed owners rather than adding another parser/runtime dependency.
- None and hidden have zero effective width. Explicit width inheritance now
  observes that effective parent value, including an unstyled parent's initial
  border. The native BoxStyle record deliberately retains its own declared width
  so a later own-style mutation can reveal it; that retained value must not leak
  through inheritance. Nine regressions fail before this fix in both trees.
- Border edges participate in content-box/border-box dimensions, client offsets,
  replaced-element aspect-ratio constraints and image content origins. Top and
  bottom borders stop the corresponding parent/child margin collapse.
- Ordinary left-to-right inline fragments include borders in horizontal advance
  and rectangles, slice side edges at wraps, and keep vertical decoration outside
  line-height. This is not clone decoration, bidi or vertical-writing support.
- Software painting gives each corner pixel one side/color contribution, retains
  transparent border geometry, and paints root/body borders independently of
  propagated canvas backgrounds. Border-free objects do not consume border-paint
  work. Capture quotas and owner-close checks remain enforced.
- Native inline/computed CSSOM reads and complete shorthand edits are covered.
  Existing unresolved-shorthand partial-mutation/serialization limitations remain.
  The capability export explicitly reports a partial normal-flow solid profile.

Border-width computation and sliced decoration were reviewed against
`https://www.w3.org/TR/css-backgrounds-3/` and
`https://www.w3.org/TR/css-break-3/` on September 4. Native currentcolor inheritance
is tested as the existing consuming-color profile, not asserted as comprehensive
CSSOM/browser interoperability. Dashed/dotted/double borders, radius, images,
collapsed table borders and broader writing modes remain unsupported.

## Validation boundary

The new suite is explicitly listed in `native-tests.json`. Its image-resource
case uses an injected native fetch callback, not a network request; CSSOM cases
use native host factories, not released SafeJS execution. Initial isolated
validation exposed five obsolete border-rejection/enumeration/inheritance test
expectations and one draft inline-fragment metric regression. Matching
expectations were updated; the metric was corrected in the adapter without
changing the existing paint test. Typechecking also caught a missing isolated
initial-style import, which was restored before final validation.

- All 43 new core cases pass. Working-tree focused checks pass 258 tests across
  seven allowlisted files; isolated final regression checks pass 183 across seven.
- Production typechecks/builds, strict checks of the five new/updated test files
  and 22-file lint pass in both trees.
- Final full native validation passes 9,200 tests across 252 allowlisted files.
- The isolated border-only tree passes 6,430 tests across 191 available files.
  Its smaller suite excludes absent pending integrations, not failing tests.

No live website, socket, real TTY/PTY or SafeJS probe ran. The previously denied
SafeJS probe remains unrun. No dependency is added and nothing is pushed.

Next integrate remaining inline/flex layout, paint ordering and scrolling before
the corrected coordinate adapters. The isolated core retains the existing
normal-flow painting schedule; this checkpoint does not claim complete stacking
or custom-select presentation. Picker/multiple-selection breadth, pending CSSOM
slots and independent runtime/site/reference-renderer/UI gates remain open.
The overall browser scope and seven-day continuation remain active.
