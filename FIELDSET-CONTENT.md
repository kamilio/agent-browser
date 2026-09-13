# Native fieldset content layout

Legend-free HTML fieldsets now have distinct outer and anonymous content boxes.
This is a supported subset, not complete fieldset/legend conformance.

## Behavior

- The outer box alone owns the DOM reference, background and border. Its used
  padding is zero; the element's computed padding remains unchanged.
- A reference-less inner flow-root owns the content and transferred padding.
  Its percentage padding uses the fieldset's original containing-block width,
  including the vertical sides. Its height is 100% with content-box sizing.
- Block fieldsets use flow-root layout; inline fieldsets use an atomic
  inline-block. Computed display is not rewritten to match the used display.
- The default minimum is genuinely min-content, resolved through native
  intrinsic measurement rather than replaced with zero. Author minimum resets,
  border-box sizing, external percentage bases and nested fieldsets are covered.
- HTML UA defaults supply 2px side margins, 2px groove borders and padding of
  0.35em / 0.75em / 0.625em / 0.75em. Legends receive 2px horizontal padding.
  Missing/reverted values receive defaults; author cascade and CSS-wide values
  retain their existing behavior. Same-name foreign elements are unaffected.
- ThreeDFace uses the existing native-control face palette, rgb(240, 240, 240).
  This is not operating-system theme emulation or general system-color support.
- Existing revision, work, depth and node limits apply to the synthetic box and
  intrinsic calculation. No second DOM reference or synthetic DOM node is added.

## Admission and remaining gaps

The admitted subset is normal-flow block/flow-root/inline/inline-block fieldsets
with supported none/hidden/solid border styles. Default groove painting remains
unsupported; a default fieldset is not silently painted as a solid rectangle.

Visible legend layout, fit-content sizing and interrupted border painting remain
unsupported. So do floated/absolute/fixed fieldsets, fieldsets participating as
flex/grid items, and flex/grid content layout. Overflow, writing-mode and other
existing native limitations are not bypassed. The first-DOM-legend exception
for disabled form controls is distinct from rendered-legend selection.

This change does not add general authored CSS intrinsic-keyword parsing. The
native minimum path accepts the fieldset UA minimum and existing inheritance.
Unsupported layouts retain explicit diagnostics rather than guessed geometry.

## Focused evidence

The two new manifest suites contain 82 cases. On unchanged production code,
31 pass and 51 fail. With the implementation, all 82 pass; the focused regression
selection passes 712 cases across 15 suites, with one explicit exclusion.
Build, formatting, source stability and the selected 14 strict roots pass.

The excluded legacy case is `does not guess intrinsic sizes for unsupported
formatting: main{display:grid}` in `src/intrinsic-widths.test.ts`. It fails
identically in an independent unchanged-production run (96 pass, one fail).
It is retained as a pre-existing test discrepancy, not fixed or silently omitted.
That suite runs behaviorally in the focused selection but was not among the
prior broad gate's selected suites or strict roots.

Evidence under
`node_modules/.cache/native-validation/fieldset-content-work-september13/`:
`baseline03`, `fixed04` and `original-intrinsic00`. Earlier formatting/setup
failures remain in their original lanes. The native manifest and clean snapshots
exclude unrelated pre-existing uncommitted work.

The clean broad snapshot passes 17,945 cases with zero failures and two unchanged
exclusions across 347 suites and 346 strict roots. The 725-entry manifest leaves
378 entries unrun. Build, strict checks, formatting, source stability and 1,247
unchanged tracked inputs are audited; 1,257 source and 2,088 compiled files.
The historical snapshot strict-root omission remains. Root dist is not rebuilt.
Audit: `node_modules/.cache/native-validation/native-fieldset-content-september13-round00/AUDIT.json`.

## Captured Wikipedia limitation

The real portal replay does **not** pass. The previous runtime defers the search
fieldset and returns a formatting tree without the search input. With fieldset
content traversal enabled, an actual rich button throws `unsupported` while
building the tree. The after process exits 1 before its geometry call. There is
no completed after-tree or whole-page search-input geometry to claim.

Both phases load identical captured bytes without HTTP, scripts, resources,
actions, raster or DOM/CSS rewriting. Native trees close and runtime/cleanup
integrity passes; those checks do not turn website failure into acceptance.
Evidence: `node_modules/.cache/native-validation/native-wikipedia-fieldset-content-september13/RESULT.md`.

## Standards context

The retained native WHATWG rendering capture from September 13, 2026 documents
outer/content ownership, zero used outer padding, percentage-padding bases,
100% content-box block size and intrinsic sizing. It also documents the legend
and border requirements that remain open. Reading this source is not a rendered
reference comparison or a conformance claim.

Source evidence:
`node_modules/.cache/native-validation/native-whatwg-rendering-september13/EXCERPTS.json`.
No Chromium, Firefox, remote browser or additional page runtime is introduced.
