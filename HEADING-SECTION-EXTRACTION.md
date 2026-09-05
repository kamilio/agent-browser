# Bounded native heading-section extraction

The native research browser can select an HTML heading and its following section
without copying a whole large document into the extraction output. This does not
relax network, reader, document, scan or serialization limits.

## Contract

- CLI: `--section CSS` requires exactly one matching native `h1` through `h6`.
  Existing selector syntax and the 4,096-code-unit limit apply. Missing, duplicate
  or malformed arguments and combinations with `--selector` or `--lines` reject
  before session creation. CSS is not echoed into selection metadata.
- Core: `extractDocument(tree, { section: headingReference })` accepts a native
  element reference, not CSS. It is mutually exclusive with `root` and `lines`.
  `researchNavigation` adds optional `section` as its seventh argument; existing
  argument positions retain their meaning.
- Selection begins at the admitted visible target heading, includes lower-rank
  headings and ends before the next admitted visible heading of equal or higher
  rank, or at document end. It follows native document preorder, not the HTML
  outline algorithm or the nearest semantic section container.
- The iterative planner bounds ancestry, visited nodes and traversal depth.
  Skipped subtrees and visible image/break/separator leaves are not descended.
  Invisible leaf containers follow existing extraction visibility behavior. A
  target inside an excluded or non-descended ancestor is not actionable. Invalid,
  stale, detached and non-heading references reject without arbitrary coercion.
- Target ancestors remain neutral containers. Their earlier text, URLs and
  link/list/heading semantics cannot leak into the selected region. Other selected
  nodes retain normal extraction behavior. Document revision is unchanged.
- The planner supplies ordered included-child edges, bounded by admitted nodes.
  Materialization uses these edges rather than enumerating excluded sibling tails.
  This does not bound pre-existing whole-document style preparation or node-view
  construction by the section scan count.
- Scan and emitted structure each obey existing node/depth ceilings; they are
  not a single combined work counter. Intermediate/output bytes, cleaning,
  Markdown escaping and JSON bounds remain. CLI output stays capped at 256,000
  bytes. A large prefix or selected section can still fail.

## Metadata and limits

Navigation selection is `{ method: "heading-section", matches }`, with `matches`
null until querying succeeds. Extraction adds `sectionSelection`: `method`, native
`heading` reference, numerical `level`, excluded boundary `end` reference or null,
`scannedNodes`, `selectedNodes` and `contextNodes`. The boundary contributes to scan
count, not selection count. Selected nodes describe planner membership, not visible
text nodes or emitted records; later normalization can omit invisible content.
Metadata scope remains the document root. No source/rendered line mapping is added.

The bounded document diagnostic runs before selection, as with root/line modes.
A detected challenge stops extraction rather than being hidden by a later heading.
This limited prefix/classifier check cannot prove no barrier exists elsewhere.
Reader omissions, partial HTML/style semantics and no page-script execution remain.
A captured primary body remains the full response. Reports remain partial and
extracted-unverified, never whole-site compatibility.

## Validation on September 5, 2026

A clean HEAD-plus-increment snapshot passes all **172 new cases**: 63 planner/core
and 109 CLI cases. The exact ten-file native matrix has **752 passes and three
failures**, no skipped tests. Those three existing selector exact-object assertions
also fail on untouched `a935a6a`: the existing loader reports additional resource
diagnostics. The separately authorized baseline selects those three cases only;
its other 115 cases are unselected. No unrelated assertion was weakened.

Initial native results were 740 passes/seven failures: four new expectations did
not account for existing Markdown period escaping, alongside the three old failures.
Only those new fixtures and two strict-test narrowing errors were corrected.
Project build, final strict new-test typing and five-file Biome checks pass.
Initial failures remain in feature-local evidence, not overwritten.

Independent static review then found excluded sibling enumeration outside the
section scan counter. The final candidate uses bounded included-child edges and
adds eight passing regression cases for operation counts, growing tails and
cross-ancestor order. The preceding 744-pass/three-failure run remains separate.

Evidence root: `node_modules/.cache/native-validation/heading-section-extraction/`.
The final clean compiled snapshot is adjacent `heading-section-extraction-final/`;
`heading-section-extraction-integrated/` preserves the earlier observed candidate.
Native tests are synthetic evidence, not live, SDK, device or credential acceptance.

## Separate CTAP2 source observations

Source: the versioned January 30, 2019 Client to Authenticator Protocol document,
`https://fidoalliance.org/specs/fido-v2.0-ps-20190130/fido-client-to-authenticator-protocol-v2.0-ps-20190130.html`.
This is historical, not a claim about the latest CTAP revision.

The original 13:35:57.396 UTC receipt under
`fido-hid-framing/research/ctap2/` remains HTTP 200 followed by extraction
resource-limit, exit 1. Its body SHA-256 is
`7d9d335e856bb7beb4a5c83570ccb7b2ac86ad2e82d4079d397c3b59535a3e45`.
It is not retroactively labeled a successful read.

Two separately authorized offline native probes use that captured body. Attempt
01 fails its assumption that the heading has an HTML ID, before extraction.
Attempt 02 at 18:50:40.643–18:50:40.829 UTC discovers and uniquely verifies a bounded
native tag/nth-child path. Full extraction still fails at the unchanged cap, while
section extraction emits 24,455 bytes; queries and document close. It makes no
network request and is not live validation or raw-source normative fallback.

A new separately authorized native GET using the initial candidate receives
HTTP 200 at **18:55:21.811 UTC**.
The discovered locator resolves once to “8.1. USB Human Interface Device (USB HID)”.
The native section scans 8,074 nodes, selects 1,321 plus four ancestor containers,
and emits 24,455 bytes before the next level-three heading. One real request,
zero redirects, closed transport, exit 0, partial/extracted-unverified. The response
contains 332,248 decoded bytes, but its digest differs from the earlier capture:

- Fresh body SHA-256: `63af11754255f49bca9305ca77be79716a71b5654f3c67e1de946c79c67f9278`.
- Fresh receipt: 473,398 bytes, SHA-256 `133cc888de35bf21ff90755397d9a865926505aa15ad8aeb03701345308c5f0b`.
- Extracted Markdown SHA-256: `527902104d1b22278ddf0973f2e2b4fa0f66d832b692d69cd45671519e698d64`.

Exact request, receipt, extracted Markdown, UTC times and status are under the
feature evidence root's `research/ctap2/`. Equal byte lengths are not identical
response evidence. No retries, alternate engines, credentials or challenge solving.

After the materialization correction, a separately authorized final-candidate
offline replay at 19:05:00.273–19:05:00.467 UTC loads this newer saved receipt
through the native reader. Its selected Markdown and counts exactly match the
earlier live extraction; full extraction still fails, with cleanup. This adds no
network request and does not relabel the initial live read as final-code execution.

The extracted USB HID section corroborates the 7/5-byte framing overheads and
7,609-byte payload ceiling for 64-byte reports. It describes cancellation as an
ongoing CBOR transaction operation: cancellation itself has no reply, and an active
cancelled request supplies its cancellation error. Therefore a framing assembler
alone is not a correct transaction/cancellation implementation. Descriptor sizing,
report IDs, channel allocation/ownership, deadlines and human PIN/UV/consent remain
open; this source observation is not physical-device interoperability.
