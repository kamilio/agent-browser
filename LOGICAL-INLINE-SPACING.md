# Native inline logical spacing — September 14, 2026

## Behavior

The native horizontal-tb/LTR profile now implements `margin-inline`,
`padding-inline`, and their four start/end longhands. Start/end map to left/right
through the real box cascade, not just parser acceptance. Existing physical
length, percentage, math, signed-margin and margin-auto rules are reused;
negative or automatic padding remains invalid. No runtime dependency is added.

Authored logical identity remains distinct from physical declarations. Mapping
follows variable resolution and preserves importance, inline origin, specificity
and source order. Element and generated-content paths share the implementation.
Computed and inline camelCase/named accessors, CSS-wide values, `all`, pending
shorthands and live style invalidation include the new edges. Mixed physical/
logical CSSOM compaction and setter-order protections cover both logical axes.
Independent variable longhands are not combined into a newly valid shorthand.

The existing exported logical-block helper API remains block-only; generalized
spacing helpers serve the wider internal profile. Existing vertical-writing,
CSS RTL and HTML-direction guards remain. This is not full vertical/RTL logical
layout, a new text-direction implementation or universal CSSOM conformance.

## Actual layout coverage

The tests exercise geometry, raster pixels and hit ownership against equivalent
physical edges, not just specified values:

- One-value inline spacing moves a block from x=0 to x=5, changes its width from
  100 to 90, and moves its child from x=0 to x=8. Two-value spacing produces
  width86/content-width76 with independent left/right padding.
- Percentage spacing produces target x/width10/70 and child x15 in a100px
  containing block. Changing that width to200px produces20/140 and30 through
  existing cached geometry/hit owners; a sampled pixel/hit changes from the
  blue child to red parent padding.
- Negative start margin produces x=-6/width96 while retaining the correct
  padding paint and child hit target. Automatic margins center the padded box.
- Content-box/border-box, em/rem/calc, inline text, rich buttons, generated
  before/after content, inherited spacing and custom-property mutations have
  physical rectangle/pixel/hit parity checks. Direction guards still reject
  unsupported layouts without mutating the document.

These are synthetic native fixtures. The motivation comes from the already
recorded MDN diagnostic samples: inline padding in em/custom properties, auto
inline margins, and a negative inline-start margin. Those samples are bounded
and nonexhaustive; this implementation report is not a new MDN observation.

## Validation

There are67new cases:23declaration/CSSOM,22style and22layout. The corrected
before-feature run has676passes/67failures, all failures confined to the three
new suites. The focused implementation run passes741cases across14selected
files, including all67new cases. Strict compilation and formatting pass.

The first implementation run had719passes/24failures:22came from an erroneous
cross-document numeric-node-ID comparison in the new test helper; equivalent
DOM hit paths now compare correctly, while explicit per-document hit assertions
remain. Two obsolete global inline-property rejection cases were retired from
the logical-block suite. Its legacy block-only helper rejection and vertical/
RTL assertions remain. Every other previous selected case is preserved.

The full selected native gate passes **22,991 tests, zero failures, two unchanged
exclusions** across455selected files/454strict roots. Its clean manifest has807
entries;352remain unselected. The gate runs from09:39:58.336to09:45:29.399UTC on
September14,2026. Build, strict compilation, formatting and native commands all
exit0; source inputs remain unchanged. The audit verifies every prior selected
case/status except the two explicitly retired rejection cases. The net increase
is65passes:67new cases minus those two obsolete cases.

The final inventories contain1,363source and2,184compiled files. All100evidence
receipts verify. Final gate: `release00/` within the work directory below.
Audit SHA256: `3b98a6e49f17dd853eb4f1ddb80c91aff01dab8f66b3d97c45f9c1e3b806159d`.
Receipts SHA256: `a86f993d3b8a8e7788384f2ebd1d0809b41434812fa9684f2727e0aeed76f16c`.

The original `before00`, corrected `before01`, initial `focused00` and passing
`focused01` results remain separate. An optional preliminary production typecheck
finished successfully, but its shell cleanup failed on a generated Node cache;
`TYPECHECK-NOTE.md` records that nonzero shell outcome rather than calling it a
clean gate. The final immutable run is the acceptance evidence for native code.

## Evidence and boundaries

Original work: `/dev/shm/agent-browser-logical-inline-september14/`.
Durable-copy target: `node_modules/.cache/native-validation/logical-inline-work-september14/`.
Original paths, source/compiled inventories, failed runs, review, receipts and
copy provenance are retained. Copying artifacts does not create a new execution.
The tested clean snapshot is adopted separately from pre-existing dirty work;
those unrelated changes are preserved, not included in the feature commit.

Pre-existing generic partial-pending/crossed-group removal and independent
physical-variable shorthand serialization limitations are not fixed by this
change. No live/captured site, credential/provider/passkey/device, SafeJS,
socket/real terminal or challenge gate runs here. Native passes do not establish
those outcomes or a speed/memory improvement.

Next: bind the committed runtime and final gate, then separately replay the
original MDN capture. Prior Python success and Wikipedia/MDN interaction
limitations remain historical, not new validation on this runtime. Original
research and broader browser acceptance stay open. Overall goal active; no push.
