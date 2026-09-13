# Native rich HTML button content

HTML buttons with element children now retain real child formatting, geometry,
hit targets and raster content in the supported native layout profiles. They
are not flattened into a software caption or represented by an invented
fieldset wrapper. This is incremental button support, not full web or native
widget conformance.

## Ownership and layout

- The button keeps one DOM reference and one outer formatting owner. Its
  padding stays on that owner; child references and the original DOM survive.
- Ordinary inline outer displays use an independent inline-block context;
  ordinary block outer displays use flow-root. Computed display is unchanged.
- Native flex/inline-flex and block-grid coordinators retain their own content
  model. Floated buttons use the existing float coordinator.
- Auto inline size is fit-content even for a block button. Intrinsic measurement
  uses actual children, margins and the supported box model. Author width,
  minimum/maximum size and box-sizing remain effective.
- HTML UA defaults provide border-box, centered text/content, normal line height,
  zero text indent and no text transform through the existing cascade. Author
  overrides, CSS-wide values and namespace boundaries remain effective.
- Used border-box intrinsic minimums include percentage padding resolved against
  the real containing width. Cyclic intrinsic contributions retain their zero
  percentage basis. Block, inline and float paths share this distinction.

The minimum-width regression is reachable through supported `min-width:inherit`
from a fieldset's UA `min-content` minimum. Directly authored
`min-width:min-content` remains outside current author-syntax support; the tests
do not pretend otherwise.

## Painting and bounded work

The outer box receives the existing primitive software-control appearance with
an empty caption; genuine children paint separately. CSS borders and outlines
retain their existing handling. Focus/disabled state uses existing native control
state, and supported child hit targets participate in native button actions.

This is the repository's software palette, not platform-widget emulation. It
does not establish plain-caption/rich-caption geometry or pixel equivalence.
Plain controls still have legacy intrinsic caption allowances and a different
appearance rectangle; wrapping text can change natural size or frame placement.
Theme/inset consistency and full button sizing remain follow-up work, not a
completed conformance gate.

Node, intrinsic-layout, raster-axis, pixel and work ceilings still apply.
Fully clipped appearance is skipped; partial clipping does not exempt the full
control raster from pre-allocation limits. No script runtime or other browser
engine is introduced.

## Admission limits

Absolute/fixed rich buttons, rich buttons participating as flex/grid items and
inline-grid rich buttons remain explicitly unsupported. Unsupported descendants,
CSS features and whole-document layout requirements can still prevent geometry
or raster output. Hidden content and foreign-namespace elements retain their
own behavior. No real website click, submission, credential, passkey, SafeJS,
TTY or challenge-handling acceptance follows from fixture tests.

## Source and regression evidence

The retained native WHATWG reading is at
`node_modules/.cache/native-validation/native-button-source-september13/`.
It establishes button display/context, fit-content and UA alignment requirements,
not fixed primitive padding/border dimensions or rendered conformance. Its
original source capture, measurements and evidence remain unchanged.

Two explicit-manifest suites add 84 cases: 32 style and 52 layout cases.
The 78-case pre-minimum suite first gives 19 pass/59 fail against unchanged
production. The final six-case inherited-minimum reproduction gives 2 pass/4 fail
against the earlier rich-button implementation, with 46 unselected cases
reported as pending. These pending cases are not broad-gate exclusions.

Final focused validation passes 699 cases across 19 suites and 19 strict roots,
with zero failures or exclusions; build, strict checking, formatting and source
integrity pass. The minimum cases cover block/inline-block, border-box/content-box,
floats and a containing-width mutation. Other cases cover actual ownership,
centering, author overrides, fit-content, percentage heights, floats, flex/grid,
mutation, foreign/hidden content, native actions and resource limits.

Three related legacy test files now exercise the still-unsupported positioned
profile where they require deferral. Normal supported buttons instead assert
retained children. No exclusion is added to hide those expectation changes.

Focused evidence:
`node_modules/.cache/native-validation/button-content-work-september13/fixed03/`.
The original failed attempts, provisional broad round00 and review findings stay
at their original paths. Root `dist` and unrelated pre-existing work are not
part of this validation.

Clean broad round01 passes 18,046 tests, zero failures and two unchanged historical
exclusions across 350 suites and 349 strict roots. The 728-entry manifest leaves
378 suites unrun. Build, strict checking, formatting and source integrity pass;
1,247 unchanged tracked inputs, 1,262 source files and 2,096 compiled files are
audited. The historical snapshot strict-root omission remains explicit.

Audit:
`node_modules/.cache/native-validation/native-button-content-september13-round01/AUDIT.json`.
The separately sealed unchanged-byte Wikipedia replay retains real rich-button
children and reduces deferred subtrees from two to one. It still rejects
whole-page geometry. See the tenth September 13 website inventory for exact
measurements, source/runtime hashes and remaining blockers.
