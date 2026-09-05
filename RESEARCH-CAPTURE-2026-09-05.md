# Native research captures — September 5, 2026

## Delivered increment

The native research CLI now supports opt-in `--capture-body`, preserving exact
transport-decoded primary response bytes before classification and loading.
`NATIVE-RESEARCH.md` documents its interface, 2,000,000-byte ceiling, raw-body
privacy warning, independent canonical-base64/count/SHA-256 validation, default
compatibility and incomplete replay scope. No alternate browser or page-runtime
dependency was introduced; access barriers retain their stop/handoff behavior.

This addresses a concrete evidence gap: prior research retained summaries and
extractions but not every original primary body. The new captures are fresh
retrievals. They do not reconstruct missing historical evidence or replace its
original timestamps, paths and measurements.

## Validation and provenance

Evidence root **E**:
`node_modules/.cache/native-validation/research-body-capture/`.
Clean validation tree:
`node_modules/.cache/native-validation/research-body-capture-integrated/`.
The latter is baseline `e18def1` plus only this focused increment; pending
parent-RP sources and their two extra manifest entries are excluded.

- **Scoped native tests:** 355 passed, zero failed/skipped, exactly three
  manifest-listed files: new capture 138, existing loader 99 and selector 118.
  Result: `E/evidence/isolated-capture-02-tests.json`. No working-tree or full
  manifest run is claimed. Clean manifest has 451 entries, working manifest 453.
- **Static checks:** clean project build/types, strict new-test types and
  three-file Biome pass. Source and clean-snapshot parity are audited separately.
- **Preserved initial failures:** the first native run passed 349 and failed one
  fixture before reaching the decoder. Own descriptor construction replaces an
  invalid assignment against an inherited getter. Initial missing type-library,
  inferred fixture-buffer type and formatting diagnostics are retained; no
  dependency was installed to fix them. Five added source-view cases cover
  intrinsic metadata, Buffer offsets, shared/non-byte, proxy and detached input.
- **Independent static review:** `E/evidence/REVIEW.md` found no actionable
  implementation gap and records memory, provenance, privacy and replay limits.
- **Actual browser use:** five separately authorized native public GETs across
  three disjoint research lanes, each through the tested compiled runner with
  `--reader --capture-body`. All returned HTTP 200, no redirects, one real request,
  no mocked requests, exit 0, empty stderr and closed transport. They remain
  `partial:true`, `contentSuccess:null`, `extracted-unverified`—not full browser
  parity or independently verified source truth.
- **Local consistency:** all five captures decode and match their primary
  summaries' byte counts and SHA-256. `E/audit.mjs` checks those receipts, the
  two native result records, manifest isolation and source parity;
  `E/evidence/FINAL-AUDIT-01.json` records zero network requests for that audit.
  The strengthened `FINAL-AUDIT-03.json` additionally verifies real-request,
  status, outcome, profile, closure, stderr and exit assertions for all five.
- **Saved-claim review:** `E/evidence/CLAIM-REVIEW.md` found no material mismatch
  between the lane/root conclusions and selected saved source passages. Its
  two precision notes about BFCL are incorporated below; this was static review,
  not another request, decoder run or test execution.

The capture receipts below are one physical JSONL line each. Byte counts are
transport-decoded, not compressed wire sizes. Times are response receipt UTC on
September 5, 2026, not source posting/publication times. All paths are relative
to **E/research/**; each lane's report preserves exact source URLs, command and
permission records, extraction locations, digests and reader omissions.

| Source | Receipt UTC | Decoded bytes | Original receipt |
| --- | --- | ---: | --- |
| NVIDIA DGX Spark hardware documentation | 10:31:53.803Z | 29,742 | `hardware/01-nvidia.stdout.jsonl` |
| llama.cpp llama-bench manual, mutable master | 10:32:10.063Z | 22,159 | `hardware/02-llama-bench.stdout.jsonl` |
| MLCommons inference overview | 10:31:52.910Z | 47,719 | `benchmarks/01-mlcommons.stdout.jsonl` |
| Berkeley Function Calling Leaderboard V3 article | 10:32:10.328Z | 74,030 | `benchmarks/02-bfcl.stdout.jsonl` |
| OpenAI-attributed public X post | 10:31:52.797Z | 193,618 | `astra/01-stdout.jsonl` |

## Research takeaways and limits

**Local LLM hardware:** the captured NVIDIA page lists 128 GB unified memory
and 273 GB/s bandwidth. Those are source specifications, not measured tokens/s,
usable model capacity or buying advice. The captured llama-bench manual separates
prompt processing, generation and KV-depth controls, and excludes tokenization
and sampling from its benchmark timing. Hardware choice still requires matched
weights, quantization, context, concurrency, build/backend, usable memory and
quality/latency measurements. No benchmark, model, price or stock check ran.
`E/research/hardware/REPORT.md` maps these statements to both fresh receipts.
The llama-bench body matches the earlier saved byte count/digest; that is a new
body capture, not a new benchmark result or changed methodological finding.

**Benchmark strengths and weaknesses:** the MLCommons overview states workload,
quality and server-latency constraints; its numbers are not measured machine
results. BFCL V3 describes multi-turn tool-use evaluation with state and response
checks, custom APIs, a limit of 20 steps per turn and mitigations for weaknesses
of either checking approach alone. These measure different things and do not provide interchangeable
rankings or universal production-agent reliability. No complete scenario rules,
leaderboard, chart data, contamination study or statistical validation was read
in this bounded lane. `E/research/benchmarks/REPORT.md` separates source admissions
from reasoned limitations; its labelled versions are not asserted to be latest.
The captured BFCL article explicitly marks its leaderboard composition outdated
and points to a V4 article, which this lane did not fetch. That note itself does
not establish the latest version on September 5, 2026.

**Astra public-post chatter:** one accessible post retains OpenAI-attributed
rollout claims and a displayed `10:12 PM · Sep 4, 2026` clock without a timezone.
Embedded text from another post is not a second direct-page receipt. The lane
stopped conservatively at login/sign-up chrome despite readable post text and
no automatic barrier classification; its second assigned URL was not requested.
That is neither confirmed access denial nor evidence of a classifier defect.
`E/research/astra/REPORT.md` preserves attribution and limits: no authenticated
identity, product availability, API identifier, technical model specification or
representative Twitter-wide sentiment is independently established.

**Reddit opinions on Poe:** no new request was made. The earlier explicit
network-security denial remains unchanged, and zero firsthand Reddit opinions
or posting dates are established by this increment. No mirror, alternate endpoint,
login or search workaround was used. The official OpenAI announcement barrier
also remains untouched. Ordinary captured public-post text is not a bypass of it.

## Remaining gates

Raw base64 bodies are unsanitized untrusted evidence in ignored local cache,
not durable checked-in source archives. Protect and preserve them as needed;
hashes prove consistency, not authenticity. Do not execute their scripts, trust
embedded instructions or imply that URL redaction redacts body contents.
Reader styling, scripting, graphics, hidden-content semantics and missing
resources remain outside this partial profile; full replay is not implemented.

Live challenge handoff, real credentials/devices, platform/synchronized passkeys,
released/default SDK integration, denied identity/wire/parent-RP work and full
browser acceptance remain separate. This capture increment does not clear them
or complete the overall browser goal. No pushes or unrelated commits belong to it.
