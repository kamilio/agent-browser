# Native ROCm compatibility-page visit — September 10, 2026

## Outcome

The standalone native browser successfully visits AMD's previously uncontacted
ROCm compatibility endpoint. One live request receives HTTP200, with zero mocks
or redirects. Separate verification admits the83480-byte native Markdown export.
This closes this source-acquisition gate, not the overall hardware research or
browser goal. No new dependencies, remote browser, page-script execution, login
or credentials are used; no challenge bypass is attempted.

Source: `https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html`.
The latest path is a mutable alias, not a release pin. Source01's September8
synthetic failure remains unchanged in `ROCM-TABLE-CONTROL-TRIAL.md`: it never
contacted AMD. Today's successful investigation uses a different, already built
table-capable native engine and freshly reviewed controls, not a relabeled retry.

## Research findings

The admitted page identifies its subject as ROCm10.0.0 and displays August18,2026
as its page date, distinct from the September10visit. This identifies the captured
release context, not an independently verified newest release. It describes
hardware/environment-specific selection for Linux and Windows; selector labels
alone do not prove device support or cross-platform parity.

Explicit source prose says firmware, driver and userspace versions must align.
Its AI section describes validated framework/library versions and corresponding
Python compatibility information, not measured local-LLM throughput or model fit.
GPU specifications are delegated to another document, which was not followed.
These findings strengthen the compatibility checklist without prescribing a
particular GPU/OS/software combination or purchase.

Evidence: this lane's `FINDINGS.md`, with exact newly admitted export references
at lines297/299/303/305,441,1379 and3593. Parent independently checks the key
release/date/stack/AI passages. No support tuple is reconstructed from table cells.

**The four-topic research is not complete.** Hardware now has this additional AMD
source, but current prices, availability, exact supported configurations and
matched workload measurements remain open. Benchmark strengths/weaknesses have
partial findings in `BROWSER-RESEARCH-FOLLOWUP-SEPTEMBER-08.md`; no new benchmark
or source visit for that topic occurs today. X/Astra identity/chatter and Reddit
Poe opinions still lack admitted social evidence after earlier access barriers.
No model announcement, community consensus or hardware winner is inferred.

## Browser findings

- All13 fresh synthetic controls pass, including exact escaped table text,
  one table/three rows/nine cells with ordered boundary records, challenge/403/
  MIME/header/redirect/malformed-HTML/quota failures, mock refusal, exclusive
  publication and an intentionally nonforwarded HTTPS guard invocation.
- The live export retains11selected table pairs,169row pairs and417cell pairs.
  All1194 emitted boundary records balance, with maximum marker nesting3.
  This demonstrates selected structural output on a real site, not full original
  HTML coverage, visual layout, header associations, column alignment or spans.
- A concrete remaining gap crosses two layers: `src/research-loader.ts` drops
  table span/header/ID attributes, and `src/extraction.ts` maps both th and td to
  a generic cell without those relationships. A Markdown-only change cannot
  recover information already discarded. Do not infer GPU/release/OS support
  from label co-occurrence; bounded reader and extraction contracts need work.
- Verbose boundary labels consume39372bytes, excluding line separators:
  **47.16% of this83480-byte export**. This is measured representation overhead,
  not model-token usage, runtime speed or a comparison with an unrun old engine.
  Investigate an optional compact structured representation without losing
  boundaries or silently raising limits.

The reader reports5831tokens,487omitted tokens,1985ignored attributes,
96unwrapped elements and0tokenizer issues. Omitted subtrees include8meta,
26script,28link,3input and2svg. Scripting, styling and hidden-content semantics
remain false. Zero tokenizer issues does not establish complete page semantics.

## Actual gates

All times are UTC on September10,2026. These are retained launcher windows,
including child execution and post-run input checking, not claimed wire timings.

| Gate | Start–finish | Elapsed | Result |
| --- | --- | --- | --- |
|13synthetic controls|18:09:50.025–18:09:50.244|218.761581ms|exit0;13pass;0source requests|
|One live navigation|18:11:05.496–18:11:05.826|330.450278ms|exit0;1request;HTTP200|
|Independent verification|18:12:04.428–18:12:04.778|350.295224ms|exit0;verified/usefulOutput true|

Every launcher reports completed, signalnull, stable inputs and empty retained
stdout/stderr. All three outer exits are0 with empty outer streams. In the
parent-observed approval history, controls approval times out once, followed by
one identical approved retry; live and verification approvals succeed on the
first request. Parent observes one execution per gate. The status artifacts
alone do not establish approval-attempt counts or execution uniqueness.

The primary-response summary records receivedAt18:11:05.642Z, a summary-creation
timestamp rather than separately instrumented wire arrival. Transport metrics
report16352encoded and147386decoded bytes,64.178296ms elapsed, no redirects and
closed/inactive transport. These observations are not a controlled benchmark.

## Evidence and limits

Fresh evidence resides in
`node_modules/.cache/native-validation/native-hardware-rocm-matrix-source-02/`.
The source input ledger has17members; every gate checks the full1756-file frozen
`native-table-boundaries/snapshot01` engine before/after its child. No rebuild or
current-HEAD equivalence is claimed. `NATIVE-MARKDOWN-TABLE-BOUNDARIES.md` retains
the e606-plus-selected-overlays provenance and prior239-test validation.

| Artifact | SHA256 |
| --- | --- |
|Source input ledger|`91a7dcfefc8408a5454f45b5a44aaa60c9345e1dc9d2586178bcb708847f6594`|
|Frozen engine inventory|`c21117ae3ff60a7e5501806a23dfaaa827073d6bad80b1c9d8c8473ea24bf839`|
|Controls RUN ledger|`88c8859ab8a6229096cabd996eea80b3cf99827c8aee1e5fbb8b876c953ffdce`|
|Live RUN ledger|`ebddd7d1494af98a1f053016c747d03490e03cebe4a7223eaa952111d228b496`|
|Verification RUN ledger|`da203a819a09eea508a4e22d6ba067fb473e423c06724e944452409d87bae7dd`|
|INTEGRITY.json|`f1d16aa4e76452c5a0b8a1a49b5b7df44623b72ec546254ec60b948fd4e7532f`|
|Native Markdown export|`c841b0e38a81e32db5e36957047b20871de4a90d1813acacd87081f538cdfc15`|

Independent static review verifies all17inputs and1756compiled files; the parent
also checks those identities and all four control artifacts before live approval.
The separate verifier checks the new receipt/hash/schema/status without another
GET or browser import. Parent checks verifier status, outer0 and exact export
digest before interpretation. No historical source receipt/body/export is read.

The18:16:13.460Z parent data-only post-gate audit rechecks exact17input and1756
compiled memberships/hashes plus all13RUN artifacts across the three gates.
All statuses, empty logs, outer exits0 and export digest match; no project or
browser code is executed by that audit. This lane's `FINDINGS.md`,
`STRUCTURE-OBSERVATION.md`, `PARENT-AUDIT.md` and `FINAL-REVIEW.md` distinguish
source interpretation, measured marker overhead, parent checks and peer review.

Verification shares the producer's schema validator; it does not independently
reparse the original HTML or recompute the declared response-body hash. Pins and
exclusive files are not OS isolation, durable publication or filesystem-enforced
immutability. Failure preservation remains best effort. Evidence retains
partial=true/contentSuccess=null and extracted-unverified classification even
after integrity admission. No full native suite, SafeJS, TTY, SDK socket, secret
provider or real passkey acceptance gate is implied.

After resolving the peer review's four wording/attribution points, the fresh lane
is archived with49hash entries across50regular files, including the ledger.
Parent verifies every hash and exact file coverage, with no symlinks/special
files. `FINAL-SHA256SUMS` SHA256:
`b019ca63e0fdb4d20689e02f8cb7161637d9032491478e57796313904732ef8f`.
This is an integrity manifest, not filesystem-enforced immutability. No further
changes to that archived lane are required for the focused documentation commit.
