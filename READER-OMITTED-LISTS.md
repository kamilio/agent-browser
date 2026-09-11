# Scoped list-item endings in omitted reader content

September 11, 2026: the native semantic reader now handles omitted `li` end tags
inside HTML subtrees that it deliberately removes. This fixes the specific
object-fallback list failure isolated in `GRID-READER-DIAGNOSIS.md`, rather than
relaxing the reader's general malformed-input checks.

The reader closes a pending direct `li` only when its immediate parent is `ul`,
`ol` or `menu`, and the next structural token starts another `li` or closes that
same parent list. The omitted root is not popped by this recovery. Any SVG or
MathML ancestor disables the new rule; foreign integration-point recovery is
not claimed. Nested lists retain their own boundaries. Intervening unclosed
elements, mismatched lists, stray endings and premature omitted-root closure
still fail under the existing strict checks.

All fallback content remains omitted, including links. Existing raw-script
discarding, partial-reader declarations, token/text/source/output limits and
depth bounds remain intact. Sequential list items no longer accumulate as fake
nesting. The reader does not execute scripts, fetch object assets, apply CSS or
claim complete hidden-content semantics. No new dependency, cache, admission
flag or larger budget is introduced.

## Validation

Nineteen new cases in `src/research-loader.test.ts` cover object/template/canvas/
video list omission, each list parent, legacy and separate-raw policies, default
and long profiles, native heading/text extraction, nested/sibling boundaries,
raw-script containment, malformed/foreign rejection, depth and accounting limits.

The unchanged `34749c0` implementation with the new tests in
`node_modules/.cache/native-validation/native-reader-omitted-list-baseline-september11/`
passes 117 cases and fails 11: ten omitted-stack failures and one false nesting
budget failure. The improved focused run passes all 128 reader-loader cases.

The clean `34749c0` snapshot in
`node_modules/.cache/native-validation/native-reader-omitted-list-september11-round01/`
overlays only the reader loader and its tests. From **11:54:41.981 to
11:56:19.831 UTC**, build, strict checking, formatting and all 112 selected
manifest-listed files pass: **6805 passed, zero failed, one existing assertion
excluded**. All 1006 source inputs remain unchanged; the 549-entry native manifest
is untouched. The documented strict snapshot typing exception remains (111
roots), with runtime coverage retained. The focus-provisioning-pressure exclusion
remains a known baseline failure, not a pass.

These tests deny networking. The original W3C live research failure remains
failed until separately scoped replay/live evidence demonstrates the relevant
outcome. This feature alone does not establish specification extraction, Grid
layout, native MDN clicking, CAPTCHA effectiveness, credentials or SafeJS/TTY
acceptance.
