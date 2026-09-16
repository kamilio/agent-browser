# Formatting-owned SVG clip references — September 16, 2026

## Outcome

The native formatter now shares a bounded document ID index across embedded SVG
scenes. On the previously captured CNET home page, formatting advances past the
clip-reference node limit and constructs all32 SVG scenes. **Full-source native
clicking still fails on unsupported CSS/layout.** This is saved-source progress,
not live recovery or a successful rendered workflow.

The original100-page checklist remains
`reports/agent-citation-revalidation-v2.md:85` and its adjacent JSON/CSV. It records
100 individual native navigations/reviews,33 useful source-content outcomes and
67 other outcomes. Selection is a reproducible AI-citation host-root proxy, not
measured worldwide agent visits or the specific deep pages agents use. This
change neither repeats that live run nor rewrites its historical outcomes.

## Implementation

Base commit: `6629b63906dd82f8d0a29ac943977dc5e45dc98a`.

- `src/formatting-tree.ts` owns one lazy map/traversal per pass, shared by SVG
  roots. It keeps document-order first-ID semantics across namespaces and hidden
  nodes; detached nodes and separate template trees are excluded. Repeated calls
  start fresh. Work and encountered string lengths use existing formatting
  budgets, with existing owned-node/depth limits. Exhaustion propagates.
- `src/svg-scene.ts` accepts a trusted synchronous host resolver. Valid fragments
  are decoded without case folding. Invalid callbacks/results fail explicitly;
  missing results do not trigger standalone fallback. Matching-ID wrong-kind or
  namespace elements still shadow later definitions. Existing geometry admission
  remains independent. Omitted callbacks preserve standalone behavior.
- Full formatting intentionally uses its50000-node/256-depth/2000000-work owner
  budget for reference discovery instead of each standalone scene's4096/64
  search limit. This changes scene source accounting and admitted document
  references, not numeric default limits. It is not universal byte equivalence
  or an exact allocation/wall-clock bound.
- `FORMATTING-SVG-REFERENCES.md` documents the host trust boundary: complete
  first-connected-ID search, charged budgets, no mutation, synchronous only, and
  no guest registration. Arbitrary callback membership/first-ID correctness is
  the host's responsibility; returned-node checks alone do not establish it.

No dependencies, page scripts, credential providers, challenge solvers, external
browser engines or default CSS/visibility policies change.

## Native validation

Clean snapshots include1514 committed runtime/source/script/config inputs,
overlaid only with the two production and two test files. The dirty working
runtime and three pre-existing uncommitted manifest entries are not used.

| Run | Passed | Failed | Explicit manifest files |
| --- | ---: | ---: | ---: |
| Baseline |519|0|8|
| Production-only candidate |519|0|8|
| Initial new tests |588|1|8|
| Corrected tests, before final wrapping |589|0|8|
| Final candidate |589|0|8|
| Exact final tests on old production |211|52|2|

All70 added cases pass. Every old-production failure is a new case, not an
existing regression. Coverage includes actual raster clipping, callback return
validation/errors, shared search work, duplicate IDs, hidden/namespace shadowing,
late/outside references, missing IDs, detached/template exclusions, mutations,
and geometry/source/work/node/depth caps. The committed manifest stays937 files;
this is not a full-manifest test run.

The initial new malformed-geometry test incorrectly expected deferred output;
the existing style-metrics guard rejects that presentation before formatting.
Corrected the new expectation, added revision/valid-geometry recovery assertions,
and left production unchanged. A final wrapping-only edit follows the second
format check. Earlier failures remain in their original artifacts.

Final build, focused test typecheck and four-file formatting pass. Lint is **not
green**:22 diagnostics exactly match the same four baseline files, including
category, severity, message and highlighted source;0 new diagnostics. No
suppression or unrelated lint repair. Lint writes an isolated `.cache` directory
under its temporary HOME; native tests and source replays leave HOME/TMP empty.
Every recorded child/process group closes without timeout or forced termination.

Final compiled artifacts exactly match the production-only candidate. Relative
to baseline, only the two owned modules' JavaScript, relevant declarations and
source maps differ:7 artifacts. The audit's initial four-artifact expectation
omitted declaration maps and was corrected without rerunning or altering the
recorded probes.

## Captured-source evidence

- Source: CNET home page, original receipt
  `node_modules/.cache/native-validation/agent-citation-revalidation-v2/live/017-www.cnet.com/stdout.jsonl`.
- Complete decoded body:425688 bytes; SHA256
  `87636e3c0737c0c8af0f721a3ab223b5b704c6909ac47c43d9076684d92e0dba`.
- Parsed connected walk:5345 nodes. No source stripping, forced action, direct
  destination fallback or external stylesheet/script fetch is substituted.
- Baseline formatting and click both fail at the SVG reference node limit.
  Core and final formatting construct32 SVGs in a partial tree:6144 output nodes,
 711901 measured work and141 deferred subtrees.
- All29 scenes from the prior **separate standalone scene inspection** retain
  identical shape arrays; only their `sourceCodeUnits` field differs. Three
  footer scenes,`e9650`,`e9701`,`e9737`, additionally construct. The baseline
  formatter itself aborted rather than returning29 scenes.
- Actual native click identifies the audited Shenzhen article link, advances
  past the SVG cap, and rejects the unsupported formatting profile. No click
  event fires and no destination response is returned.
- Each of6 baseline/core/final click/formatting replays consumes one in-memory
  fixture GET. Kernel denial blocks network syscalls; JavaScript guard attempts
  are empty. Each browser/document closes. These are **0 new live requests**.

Remaining formatting issues are explicit:13 unloaded external stylesheets,
12 unimplemented CSS properties,2 invalid/unsupported CSS values,5 at-rules,
5 selectors,16 positioned-layout coordination issues,7 overflow issues,
69 display issues,72 unsupported elements and1 inline vertical-align issue.
These counts describe this inert captured source, not a currently fetched page.

## Review and next work

Independent static review found no blocking production issue. Its nonblocking
request to preserve the trusted resolver contract is addressed in the durable
guide. Review source hashes match final production; it is not separate live
acceptance.

Evidence lane:
`node_modules/.cache/native-validation/formatting-clip-index-september16`.
The adjacent JSON records77 evidence hashes, native results, old-production
failures, quality details, exact scene accounting differences and replay cleanup.
Original42 dirty tracked/697 untracked files are preserved; only this focused
change is committed, with no push.

Next prioritize useful source-linked content workflows and bounded CSS/layout
support rather than declaring interaction success from nonempty output. Site
access restrictions and human handoff remain distinct. No full-manifest, actual
SafeJS SDK, credential/passkey or real-input acceptance is claimed. The overall
browser goal remains active in `TASKS.md`.
