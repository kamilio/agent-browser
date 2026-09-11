# Native Box Alignment source confirmation

## Result

On September 11, 2026, the native browser retrieved the actually observed W3C
CSS Box Alignment target once and extracted two observed sections successfully.
This fills the specific distributed-alignment overflow source gap documented in
`node_modules/.cache/native-validation/native-grid-overflow-source-september11/`.
It does not validate a renderer or any parent implementation change.

### Source-supported findings

- **Section 4.3:** when distribution cannot be performed, each distribution value
  uses its fallback. Both `space-around` and `space-evenly` fall back to
  `safe center`; `space-between` falls back to `safe flex-start`. Outside Flex
  layout, `flex-start` is equivalent to `start`. `stretch` falls back to
  `flex-start`.
- **Section 4.4:** `safe` alignment changes to `flex-start` when the alignment
  subject exceeds its container. `unsafe` preserves the chosen alignment despite
  overflow. Unspecified overflow alignment has separate, layout-dependent rules.
- **Combined implication for Grid:** overflowing `space-around`/`space-evenly`
  distributions start-align rather than applying a negative centering offset.
  This follows from their explicit safe fallback; it is not a reason to force all
  overflowing `center` or `end` alignment to start.

The two extracted sections also include default-overflow subsections. Their full
scroll-safety/layout-dependent behavior is not implemented or tested by this task;
no general conformance claim follows from this source check.

## Observed source and retrieval

Evidence lane:
`node_modules/.cache/native-validation/native-alignment-spec-research-september11/`.

The target came from `justify-content`/`align-content` links in the previously
extracted Grid §10.5 receipt, not a guessed endpoint. `SOURCE-TARGET.json` retains
the complete observed links and source receipt hash. Fragment removal yielded the
single requested HTTP URL, `https://www.w3.org/TR/css-align-3/`; final URL was
identical. No redirects were followed.

- Live child: **13:56:55.074–13:56:55.367 UTC**, exit zero, process group absent.
- Exactly **one** bodyless, credentials-omitted native GET; **HTTP 200**.
- **574,165 decoded bytes**, **77,740 encoded bytes**, Brotli response encoding.
- Native reader outcome: `extracted-unverified`, partial semantic content,
  barrier `null`; **76 headings**, outline not truncated. `contentSuccess` is
  `null`, not a claim of rendered-page success.
- Requested/final URL and safe response metadata: `LIVE-AUDIT.json`,
  `response-1.json`, `response-1.headers.json`, `live.jsonl`.
  Header sidecars use an explicit metadata allowlist; cookie/authorization header
  values are not retained there. Public response-body capture is unchanged.

| Artifact | SHA-256 |
| --- | --- |
| `response-1.body` | `7361249cbb73d90e811e6eb7f8cd5bc4de5bbb81c2a7add6d1cbcb9dfd800d37` |
| `live.jsonl` | `7cdd2c116edbe98abaf4a3817bd90a2ccdecd6c3a68331a36942237467af0a76` |
| `section-1.jsonl` | `302237cc5ba029bdf8e744ab48f66d9ae1253400fbfdc2433fcba720785d04d3` |
| `section-2.jsonl` | `202b77cf847baed32f324a5c55134ce2fbbdc0bd6b3efdf55f971ffb4e6359a3` |

## Observed section selections

Offline child: **13:57:48.264–13:57:48.690 UTC**, exit zero, process group absent.
Exactly two extractions, zero further navigation or network requests:

1. `4.3. Distributed Alignment: the stretch, space-between, space-around, and space-evenly keywords`
   — heading `e2556`, selector
   `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(55)`.
   Output `section-1.jsonl`, **20,033 bytes**.
2. `4.4. Overflow Alignment: the safe and unsafe keywords and scroll safety limits`
   — heading `e2826`, selector
   `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(62)`.
   Output `section-2.jsonl`, **28,214 bytes**.

Each native extraction selected exactly one untruncated, observed heading and
returned `extracted-unverified`. `OFFLINE-INPUT.json` pins the live receipt and
original captured body before replay. No raw-HTML search substituted for reader
output, no headings were guessed and no extraction was retried.

## Bounds, isolation and verification

The immutable fixed reader is the original **6805-pass** build used for the prior
offline extracts. That count is historical validation, not a new test run.
Source inventory (**1006 files**) and compiled inventory (**1788 files**) match
their pinned before/after hashes throughout live retrieval and offline extraction.
Earlier source receipts and original Grid live evidence remain unchanged.

The original `long-v1` admission and `separate-omitted-raw-v1` policy remain in use:
4,000,000-byte response/capture ceiling; 15-second transport and 20-second
navigation timeout; original reader source/text/output/token/depth and document
limits; 30-second outer timeout plus five-second grace; 6 MiB combined output and
hard per-file caps. The original network admission's request ceiling of twelve is
restricted by the harness to the single authorized primary GET.

The transport closes with zero active requests; its total request count is one,
mocked count zero, and redirects zero. The reader fetched no stylesheets, images,
scripts or subresources. Offline extraction uses inherited seccomp and network/
process guards, has zero guard attempts and closes each document to zero nodes.
Temporary home/directories are empty and removed, with both process groups absent.
There was no timeout, cap breach, retry, SafeJS, credential access or TTY use.

`VERIFICATION.json` and `RECEIPTS.sha256` bind these results and this report.
Only this new report and private lane were written. No source/tests/TASKS/manifest
edits, parent test runs or commits occurred.
