# ROCm source investigation stopped at a synthetic control

On September8,2026 the proposed native-browser ROCm compatibility investigation
stopped before any live request. The uncontacted endpoint was
`https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html`.
There is no vendor response/status, source verification/export, release/OS/GPU
association, price or performance result. This is not an AMD access failure.

## Actual failed control and retained uncertainty

The finite native control child runs09:03:08.591–09:03:08.800Z,208.91439000000003ms,
actual exit1, signalnull, completed rather than timed out. One HTML positive passes;
the synthetic table case is attempted and fails its control checks. Eleven later
controls remain unrun. Source requests and denied network attempts are both zero.
Child stdout is0bytes; stderr is32bytes of a fixed failure marker. Outer exit1 and
stable-input evidence remain intact. No failed control is relabeled as passing.

The last table observation is `extracted-unverified`/complete, categorynull, with
one intercepted synthetic request and one fulfillment. That observation precedes
schema, accounting and text assertions. The failed extraction and exact assertion
identity were not retained; therefore the actual failing predicate is unknown.
It is not sound to infer lost table text, parser failure or a particular missing
label from this historical result. No fixture is rerun to manufacture that evidence.

## Static findings, not historical diagnosis

An independent code/evidence review identifies a control-oracle mismatch: raw
hyphenated labels such as `Release-A` are searched in serialized Markdown, while
the pinned native renderer escapes hyphens as `Release\-A`. If text reaches that
rendering path, correctly retained labels can fail a raw substring check. Earlier
schema/accounting checks also exist, so this does not identify which old assertion
actually failed. The successful nonpunctuated HTML check does not cover escaping.

The control publishes its synthetic extraction only after all assertions pass,
and its catch discards assertion identity. Those observability limits are concrete.
A future separately authorized zero-GET diagnostic should preserve exact synthetic
artifacts before checks and name each predicate, without changing old expectations,
weakening validation, stripping Markdown escapes or claiming a source-control pass.

Table text alone is not a compatibility-matrix contract. The frozen renderer lacks
a table/row/cell Markdown branch; its extracted model also does not preserve all
header/span metadata. Repeated Yes/No presence cannot establish row/column pairings.
This is a distinct capability limitation, not evidence of the historical failure's
cause. No hardware recommendation follows from these synthetic observations.

## Evidence and boundaries

Evidence: `node_modules/.cache/native-validation/native-hardware-rocm-matrix-source-01/REPORT.md`.
Final ledger25entries across26regular files including itself:
`f30d63a7f09cdfa1435c720e2c70b8e25f863e72e3f7ffc9b3733012ac58caac`.
The review verifies all25hashes, exact file coverage and1732unchanged frozen engine
files. Parent independently checks the25opaque hashes; no validators are rerun.
Review: `node_modules/.cache/native-validation/native-rocm-controls-review/REVIEW.md`,
SHA256 `c4c84754b299f93378a6be329fa9935bfe962d9bfa925c542daa34198c29dc95`.

The old committed872a6aa `research-long-cli-verified` engine remains unchanged,
not current root or a rebuild. Every actual action had fresh approval; no approval
timeout/retry/denial occurred. Final audit/seal succeeds only at preserving failed
evidence, not at source acquisition. Source verifier and live action are unrun.
No raw capture/body/old export fallback, live DNS/socket probe, scripts/cookies,
authentication, vault/device/SafeJS/TTY or denied endpoint is used. `TASKS.md`
retains the overall browser goal and outstanding compatibility/access gates.
