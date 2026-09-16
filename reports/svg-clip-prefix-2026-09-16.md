# Lazy bounded SVG clip lookup — September16,2026

## Production change

`src/svg-scene.ts` previously built a document-wide first-ID map before answering
any clip lookup. A small SVG near the beginning of a larger document could fail
on unrelated trailing nodes, depth or ID-source size. The implementation now
uses one resumable pre-order generator and map per scene build. It stops after
the first requested ID is indexed, resumes for unknown later references and
reuses earlier indexed IDs. It does not queue a document-sized sibling list.

First-ID document ordering, duplicate/wrong-kind/foreign-namespace shadowing,
case-preserving fragment decoding and outside-root definitions remain intact.
The4096 examined-node and64-depth caps, numeric source limit and caller work
failures remain enforced on the visited prefix. Missing or needed-too-late IDs
still exhaust the same bounded scan. Geometry preflight retains its independent
source/node/shape/segment limits. Each new scene builds a fresh lookup; no
cross-document or persistent mutation-sensitive cache is introduced.

Unexamined trailing nodes/IDs/depth are intentionally no longer charged or
validated by reference indexing. Deferred traversal can also reach an outside
clip descendant after its ID was charged by geometry preflight; indexing then
charges work but not that source length again. Such descendants can contribute
source length once rather than twice, while the requested outside clip's own ID
still contributes at both indexing and preflight. Three additional tests verify
the exact count, numeric source cap and one-unit overflow for a missing nested
reference that resumes this traversal. Geometry attributes remain validated.
Source accounting/admission and error timing can change even when a later
reference eventually examines the same nodes. No CSS/layout policy,
network identity/pacing/access rule, runtime dependency or default cap changes.
O(depth) describes continuation state, not all document-access memory or CPU:
existing native node-view caching can copy a wide ancestor's complete child array.

## Same-source CNET evidence

The source is the original complete native CNET root capture from September16,
not a fresh request. Decoded body425688 bytes; SHA256
`87636e3c0737c0c8af0f721a3ab223b5b704c6909ac47c43d9076684d92e0dba`.
The full inert native parser produces5345 walked nodes and32 inline SVG roots.
Baseline matches commit `8c649f701ad33d3560d5e84a72bb2040099ccf17`; candidate
runtime changes only the SVG scene module. The same guarded source helper runs
both variants, with source/runtime hashes checked before using them.

| Outcome | Baseline | Candidate |
| --- | ---: | ---: |
| Constructed inline SVG scenes | 27 | 29 |
| Clip-reference-cap failures | 5 | 3 |
| Successful original-page native click | 0 | 0 |

The27 originally constructed scenes retain identical complete serialized scene
values. Two header-logo roots, native node IDs4914 and4989, now construct five
shapes each, including one clipped shape. Three footer-logo roots9650,9701 and
9737 still fail at the reference-index cap. Scene IDs are native parser IDs,
not their ordinal positions in the5345-node walk.

Separate full-source click replays identify the same CNET article anchor and
call `BrowserSession.click`. Both baseline and final candidate stop with
`SVG scene: clip reference node limit exceeded`, produce zero click events and
make only the initial fixture request. No destination is reached and there is
no direct-navigation/forced-click/reader-DOM substitute. Fixing two scenes does
not establish complete page interaction, rendered output or live recovery.

Core and final candidate scene/click outputs also agree; final test formatting
does not change production runtime. Per-scene charged work is retained, but a
successful scene's work cannot fairly be compared with an earlier partial
failure as a speedup. No wall-clock performance benchmark or general website
compatibility claim is made.

## Regression and quality checks

- Clean baseline435pass/0 in7 explicit native-manifest files; unchanged existing
  tests also435pass/0 over the production-only core candidate.
- Final456pass/0 in the same7 files:21 new cases in the existing clip-scene suite.
  They cover early/outside-root clips with large tails, wrong-kind shadowing,
  shared traversal/reuse, exact node/depth/source boundaries, missing/later IDs,
  trailing irrelevant overflow, ID mutation/reordering and caller failures.
- Exact final test-file bytes over old production give94pass/14 expected failures
  in one108-case file. The seven newly added passing cases are limit/behavior
  controls, not evidence that the old implementation had the new behavior.
- Final build, selected test types and formatting pass. No full937-file manifest
  run, actual SafeJS SDK, credentials/passkeys, socket/TTY or rendered acceptance.
- Lint exits1 in both baseline and final candidate:8 pre-existing production-file
  diagnostics and1 pre-existing test-file diagnostic. Machine comparison matches
  category, severity, description, filepath and exact highlighted source for all
  nine; no diagnostic is introduced by this patch. These unrelated issues are
  not fixed or suppressed, and lint is not called green.
- Initial release01 formatting failed on new test wrapping; release02 corrects
  it. Release03 adds three accounting cases; release04 corrects one line wrap.
  All456 cases pass before and after that final formatting-only change. Original
  failed checks remain archived; production is identical across candidates.
- A hash-bound production-only review finds no blocking defect and documents
  accounting/node-snapshot caveats. The reviewer authored the first18 new cases;
  this is not independent review of that test work. Main adds the three explicit
  interleaving/accounting cases and runs all validation.

## Isolation and preservation

All captured-source scene/click runs use kernel-denied network and the native
engine, inert scripts, exact source-derived GET policy and unchanged CSS checks.
Every supervised replay has empty guard attempts, empty HOME/TMP, closed native
session/documents and observed absent process/group. Their exit0 means the
diagnostic was collected and cleanup checked, not that the website workflow
passed. No fresh website request, CAPTCHA solver, external browser or credential
access occurs. Native test success is not evidence for those separate gates.

Quality and lint tools use separate local HOME/TMP directories. The dedicated
lint comparison creates an empty `.cache/biome` directory tree under each HOME;
it is retained rather than mislabeled as empty HOME or browser credential state.
Source/compiled manifests cover clean minimal candidates; pre-existing dirty
root runtime is not rebuilt or certified. Original42 dirty tracked and697
untracked files, including unrelated TASKS content, remain preserved.

Local evidence lane:
`node_modules/.cache/native-validation/svg-clip-prefix-september16`.
The companion JSON pins runs, old/new source/compiled manifests, raw-source
provenance, final tests, exact lint comparison and production review. Historical
100-entry reports and earlier click failures remain unchanged.

## Remaining work

The three later footer references and complete CNET click remain failures.
Investigate document-level ID lookup/admission without silently treating an
incomplete search as no match, dropping SVG geometry or resetting budgets.
Home Depot's CSS cap, Wikipedia's unsupported full-page formatting, dynamic
content, challenge handoff, SafeJS, credential/passkey and real-input gates stay
open. This is concrete scene compatibility progress, not completion of the
overall browser goal. No push is performed.
