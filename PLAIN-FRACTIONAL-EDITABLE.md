# Plain fractional Range and editable geometry

## Root-cause correction

Plain text with fractional font sizes/origins can produce adjacent glyph edges
that differ only by floating-point roundoff. The prior native implementation
treated such collapsed Range positions as ambiguous; selection containment and
caret mapping also used exact comparisons. The casing review independently
confirmed those plain-text limitations on native14032 and retained them in14922.
This change addresses them separately rather than rewriting those earlier results.

Collapsed Range deduplication now accepts a finite four-epsilon horizontal
difference only for adjacent source spans in the same context, formatting node
and line. Vertical coordinates, font/height, zero rectangle width and source
adjacency remain strict. Preserved-break candidates do not use this tolerance.
Real gaps/overlaps, mixed identity and ambiguous boundaries remain unsupported.

Caret and selection use the existing bounded coordinate helper against public
Range geometry. No error-message catch, fallback scan, second geometry path or
new dependency remains. Glyph metrics and summed edges must be finite and
nonnegative; zero font requires zero advance. Negative/overflowing rectangles
also reject. Existing mapping, geometry, pixel and work ceilings are unchanged.

## Tests and preserved iterations

The new suite adds143 native cases; no existing case is counted as newly authored.
Coverage includes every source boundary of plain `AASS` and transformed
`aa\u00df` at0.1,8,8.1 and12.7px, source subintervals, native selection/caret
painting, relative/absolute/fixed positioning, fractional scroll, malformed
metrics, real subpixel displacement, source/line/context identity and empty/
zero-font limits. The source text and Range/selection ownership remain unchanged.

Exactly one prior casing-control expectation changes: at0.1px the literal
selection now prepares successfully and rasterizes as `clipped`, not
`unsupported`. Historical snapshots and their assertions remain untouched.

Private worker evidence:
`node_modules/.cache/native-validation/plain-fractional-editable-work-september12/`.

| Stage | New suite pass/fail | Existing related pass/fail |
| --- | --- | --- |
| baseline01 |93/11|889/0|
| baseline02 |95/13|889/0|
| fixed01 |107/1|888/1|
| fixed02 |107/1|888/1|
| baseline03 |128/15|889/0|
| fixed03 |143/0|889/0|
| baseline04 |119/24|889/0|
| fixed04 |143/0|889/0|

The final baseline04 and fixed04 new-suite bytes are identical. Final focused
validation is1032passed/0failed, plus strict TypeScript and existing formatter.
The related889 cases were already part of the prior broad selection.

Main rejected the intermediate large caret fallback because it caught a Range
error string and duplicated source mapping. Its failing snapshots remain.
The final change fixes Range itself. An intermediate fixed-position fixture
incorrectly omitted the raster pipeline's existing fixed-layout projection;
the corrected test exercises that projection and actual raster output.
Another test initially rechecked its earlier collapsed Range after selecting a
full range. Correcting that reference exposes nine more original invalid-metric
failures, increasing final baseline failures15 to24 without changing production
between fixed03 and fixed04. All original outputs remain in the worker directory.

The initial formatter-spawn setup failure is retained, followed by successful
separate formatting attempts. Decoded string/template values are checked through
formatting, including the known local combining-mark hazard. No old failure is
silently reclassified as a pass and no cap is raised.

## Scope

This is bounded horizontal native geometry, not complete Unicode typography,
bidirectional shaping, zero-height caret support or general browser equivalence.
All tests are isolated from sockets, providers, SafeJS, devices and real TTYs.
The sealed Selenium live/cached/image-replay reports use immutable14922, not
this later candidate; their live failure and missing-image boundary are unchanged.
No new website, navigation, performance, credential/passkey or challenge gate
is established by these tests.

## Independent review

The separate bounded review finds no new correctness, source-identity or
resource-bound regression. Nine native scenarios pass on fixed04 versus six
passes/three retained failures on14922. All14 supported nonzero public
Range/caret boundary comparisons agree exactly, including scroll translation.
Soft-wrap ambiguity, zero-font limitations, empty-editor behavior and work-limit
rejection/recovery retain their explicit boundaries.

Candidate reproduction runs17:52:15.363–17:52:15.558UTC on September12,2026;
baseline reproduction runs17:52:42.108–17:52:42.298UTC. An initial baseline
inventory setup failed before execution because the new test does not exist in
the old baseline; the untouched failed allocation and corrected separate run
remain evidence. No reviewer source edits or broad-gate rerun occurred.
FINAL-REVIEW.md and review-audit.json in the integration directory preserve
scope, exact five-path comparison, immutable runtime inventories and results.
This is not exhaustive floating-point or Unicode conformance proof.

## Broad isolated validation

Lane:
`node_modules/.cache/native-validation/native-plain-fractional-editable-september12-round00`.
On September12,2026,17:49:28.212–17:52:41.615UTC, build, strict TypeScript,
the existing formatter and the explicitly selected native gate pass:

- **15065 passed, zero failed, two unchanged exclusions**.
- 291 selected suites,290 strict roots and669 clean-manifest entries.
- 1177 source files,1992 compiled files and1171 unchanged tracked inputs.
- Five owned source/test files plus the clean manifest form the release inputs.
- Original pre-existing workspace changes remain excluded from the snapshot.

The unchanged exclusions are the focus-provisioning total-host-object-ceiling
case and the media-fallback unsupported-display case. They are not passes.
The current143 additions account for the increase from14922; no extra existing
suite is newly counted as authored coverage.

```text
source inventory SHA256
b5bb23b9aa932b00b4cca97edd485d1995b73998aca2a7bbfa8b19f44ec15cad
compiled inventory SHA256
d96a1d34f6dfc78862cc8fe1a986d2af8e1d780fa09c2a721434723453fe31f7
native result SHA256
169a9f0fffc9d4485422b3e06235c5b3c4739140f93669de8cbf5c582eab9739
```

AUDIT.json and RECEIPTS.sha256 retain exact commands, times, selected counts,
excluded names and stable source/compiled inventories. Commit binding is separate
and is recorded in COMMIT-VERIFICATION.json after an accepted atomic commit.
