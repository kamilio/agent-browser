# Native fieldset legends

September 13, 2026. This completes a bounded native legend profile, not full
fieldset conformance. Native validation and website checks remain distinct.

## Supported behavior

- The first qualifying rendered legend child box belongs directly to the
  fieldset outer box, alongside its anonymous content box. Remaining children,
  later legends and generated content stay in the anonymous box. Selection
  follows the formatting tree, including `display:contents` flattening; it skips
  `display:none`, floated and absolute/fixed legends. A `visibility:hidden`
  legend still owns space. DOM ownership and the first-DOM-legend exception for
  disabled controls do not change.
- Simple normal-flow static legends use an independent flow-root. Auto width
  is fit-content within the fieldset's padded available width; supported explicit
  widths, box sizing and horizontal auto margins retain their sizing behavior.
  Fieldset percentage padding uses the original containing-block width.
- Shared intrinsic sizing adds the percentage-padding correction to anonymous
  content contributions **before** taking the maximum with legend contributions,
  independently for minimum and maximum widths. Both block minimum sizing and
  inline-block shrink-to-fit use this correction; legend-dominant widths do not
  receive the content padding a second time.
- With an unconstrained auto-height owner and zero used legend block margins,
  block-start allocation reserves the larger of the top border thickness and
  legend border-box height. The legend is centered in that band, and anonymous
  content starts below it. Padding remains on the anonymous content box.
- Border painting shifts the fieldset's painted top edge to the legend band
  and excludes a legend-local rectangle: the legend's border-box inline span
  and the union of its block span with the painted top border band. Exclusion
  skips pixels rather than clearing or repainting them, preserving underlying
  content, surviving corner ownership, dash phase, groove shading and alpha.
  Half-open pixel-center bounds apply in raster coordinates.
- Existing work, box and depth budgets remain enforced. Selected-child search
  and suffix movement are charged before extraction with `splice`; intrinsic
  child lookup is charged too. Border exclusion is validated before painting,
  with an effective-exclusion surcharge charged before any pixel writes.

Implementation: `src/formatting-tree.ts`, `src/fieldset-layout.ts`,
`src/inline-atomic-layout.ts`, `src/document-layout.ts`,
`src/document-raster.ts` and `src/border-raster.ts`.
Coverage: `src/fieldset-legend.test.ts` and `src/border-exclusion-raster.test.ts`.

## Explicit limits and source uncertainty

Relative/complex selected legends, clearance, nonzero block margins and owners
with explicit height, nontrivial minimum height or constrained maximum height
remain guarded by `fieldset-legend-layout-not-supported`. This does not add
floated/absolute/fixed fieldsets, fieldsets as flex/grid items, flex/grid content
layout, general authored intrinsic-keyword support, or bypass existing overflow
and writing-mode limits. Skipping an ineligible legend does not grant support
for its otherwise unsupported layout.

The retained WHATWG edge min/max prose remains ambiguous: interpreted literally,
its rectangle encloses the whole fieldset border. Inspection found no inline
correction resolving that result. The retained SVG's geometry and painter order
support a local top-border interruption **by inference only**. That illustration
does not correct the prose or establish a universal pixel oracle, exact
margin-box exclusion formula, or transparent-legend behavior. Native SVG text,
dashed strokes and markers prevent faithful rendering of the retained diagram;
no stripping occurred and no rendered reference screenshot is claimed.

Exact source and diagram evidence:

- `node_modules/.cache/native-validation/fieldset-legend-work-september13/SOURCE-HANDOFF.md`
- `node_modules/.cache/native-validation/fieldset-legend-work-september13/DIAGRAM-HANDOFF.md`
- `node_modules/.cache/native-validation/native-legend-source-september13/EXCERPTS.json`
- `node_modules/.cache/native-validation/native-legend-diagram-september13/DIAGRAM-ANALYSIS.json`

## Retained native validation

The final `native-fieldset-legend-september13-round01` gate records **21,042
passed, zero failed and two unchanged skips**: 411 selected files, 410 strict
roots and 765 manifest entries, leaving 354 unselected. This is a successful
executed native subset, not an all-manifest or skip-free result. The unchanged
skips are the host-object-ceiling case in `focus-provisioning-pressure.test.ts`
and the unsupported-display/advisory-media case in `media-fallback-layout.test.ts`.

The 90 new cases comprise 43 border-exclusion and 47 legend cases. With identical
test sources, focused baseline05 records 581 passed / 84 failed / 1 skipped;
fixed05 records 665 / 0 / 1. Of the new cases, 81 failed on the old runtime and
nine were invariant passes; three prior diagnostic-fixture changes account for
the other baseline failures. Review regression fixed04 was 660 / 5 / 1 and
caught percentage-padding overcount and uncharged extraction movement. Earlier
failed attempts remain retained in the cache; final success does not erase them.

Exact validation and review evidence:

- `node_modules/.cache/native-validation/native-fieldset-legend-september13-round01/AUDIT.json`
- `node_modules/.cache/native-validation/native-fieldset-legend-september13-round01/results/SUMMARY.json`
- `node_modules/.cache/native-validation/fieldset-legend-work-september13/FOCUSED-VERIFICATION-05.json`
- `node_modules/.cache/native-validation/fieldset-legend-work-september13/fixed04/results/SUMMARY.json`
- `node_modules/.cache/native-validation/fieldset-legend-work-september13/REVIEW-FOLLOWUP-HANDOFF.md`

## Offline form replay, not live acceptance

The retained parent replay `native-httpbin-form-legend-september13` records eight
synthetic preparations, 19 preparation events, then native pointer click and
submit events. A valid synthetic POST intent was denied before transport:
**zero HTTP requests** reached the wire. Formatting reports no issues and zero
deferred boxes, but remains a partial subset. The replay records
`flowPassed:false` and audit exit code 1; it is not a completed live echo flow.

Evidence:
`node_modules/.cache/native-validation/native-httpbin-form-legend-september13/RESULT.json`
and
`node_modules/.cache/native-validation/native-httpbin-form-legend-september13/OFFLINE-AUDIT.json`.
These results do not establish or predict live-site, socket, real TTY/PTY or
SafeJS acceptance. Those separately authorized gates and broader browser work
remain tracked in `TASKS.md`; historical evidence is unchanged.

## Separate live public form result

At 20:22:57 UTC, a fresh bounded native HTTPBin navigation and genuine pointer
submit passed. One GET and one POST returned HTTP 200; the echo contained exactly
the eight authorized synthetic field entries. The native session committed the
echo document, with no fallback submit, DOM/style rewrite, mocked response,
credentials, page scripts or additional resources. This is one successful public
form flow, not full website/browser conformance or a repeatable performance result.

Evidence:
`node_modules/.cache/native-validation/native-httpbin-form-legend-live-september13/VERIFICATION.json`.
