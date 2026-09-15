# Avoid full-node snapshots for parser metadata checks

Native loading repeatedly obtained immutable full-node views just to inspect
parent pointers, namespaces, tag names or attributes. A full view copies the
child list. Recreating the growing body view during each sibling insertion
made wide documents expensive even without networking or page scripts.

The first candidate replaced only image-CSP ancestor reads. Its tests passed,
but timings did not improve: profiling showed the snapshot cost move into
parser namespace checks. Those initial measurements remain in the evidence.
The final change addresses both consumers rather than claiming success from
the first passing test suite.

## Implementation and safety boundaries

- `DocumentTree.parentOf(id)` returns a validated parent ID or null without a
  full snapshot. CSP traversal still debits exactly once per parent edge;
  connected-subtree scans, the metadata-work cap and fail-closed behavior stay.
- `DocumentTree.elementInfo(id)` returns a frozen kind/tag/optional-namespace/
  attribute view. Its attribute snapshot uses the same helper as `get()`;
  children, parent, data, controls and IDs are absent. It validates node identity
  and closure without exposing mutable internals or adding a view cache.
- Formatting, foreign-context and parser namespace/type checks use that narrow
  view. Foreign fragment attributes, integration points, formatting recovery,
  table behavior and all existing work limits remain. Actual child-list reads
  still use the full view. `get()` and retained immutable snapshots are unchanged.
- No runtime dependency, transport behavior, credential handling, challenge
  bypass, SafeJS execution or browser/navigation resource limit changes.

## Unprofiled measurements

September 15, 2026; Node v22.22.0, 192 MiB heap, CPU affinity 0, separate
sequential processes under network-denying guards. Each process warms both
paths on 1,000 siblings, then measures three samples per configuration. Values
below are medians in milliseconds, including owned closure and excluding
subsequent signature checks. Sources are synthetic flat sibling elements plus
one heading, not page-rendering or live-network workloads.

| Elements requested | Direct loader before | Direct loader after | Research path before | Research path after |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 39.92 | 38.25 | 60.77 | 64.69 |
| 10,000 | 151.21 | 112.83 | 188.97 | 107.56 |
| 30,000 | 1,563.03 | 424.69 | 1,807.07 | 459.43 |
| 50,001, node-limit failure | 3,573.15 | 336.07 | 4,195.92 | 359.95 |

The valid 30,000-element case is about 3.68x faster through direct loading and
3.93x through native research in this run. The capped case still fails at the
same 50,000-node limit with observed count 50,001; faster failure is not more
content or a raised cap. All DOM/heading/failure signatures match the baseline.
Large-case sample ranges do not overlap, but the small-case timings are mixed:
the 1,000-element research median is slightly slower. Three samples are not a
universal performance guarantee. Every range, initial unsuccessful candidate
and raw sample remains in `reports/parser-metadata-performance-2026-09-15.json`
and its evidence lane.

## Content check: saved Office page

Existing reader replay scoping obtains useful source content without blanket
hidden-text filtering. The saved Office response has hidden startup/trace
containers outside `main#main`, but also four collapsed FAQ answers inside it.
Dropping all inline-hidden content would discard those answers.

| Existing replay selector | Markdown bytes |
| --- | ---: |
| `main#main` | 9,786 |
| `main#main .faq-section` | 2,132 |
| `main#main #faqList` | 1,817 |

The original whole-page record contains 41,789 Markdown bytes. All scoped
baseline/final outputs are byte-identical. Native JSON checks verify that all
five independently selected answers, comprising eleven nonempty text leaves,
remain in the main selection. Actual replay CLI invocations match API Markdown.
Startup/trace markers are absent. This uses an existing selection feature, not
a new default filter, rendered-visibility guarantee or fresh Office visit.

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --selector 'main#main' --format markdown --table-rows < authorized-receipt.jsonl
```

Pins must come from the supervising host. These selectors are verified for
this captured document, not promised for future responses. Output remains
partial and `extracted-unverified`, with `contentSuccess:null`.

## Validation and remaining work

All 1,724 tests in 30 explicit native-manifest files pass, including 31 new
cases; all 1,693 existing statuses match the expanded baseline. Build, strict
types, formatting and lint pass. The final candidate corrects two new test
assertions to allow the parser's one initial empty-body snapshot; it still
requires zero growing-body snapshots. Its production bytes match release02.

Eleven guarded offline children cover two diagnostic profiles, three benchmark
runs, three Office API checks and three actual replay CLI checks. All children
and process groups close, all guards record zero network attempts, and source,
compiled and original receipt/body identities stay intact. Historical website
receipts, paths, timings and top-100 counts are unchanged.

This is not a full native release, live-site latency measurement, rendering or
interaction gate. General application-shell detection, other parser costs,
research conclusions and separately gated SafeJS, services/sockets, TTY,
credentials and passkey-device acceptance remain open in TASKS.md.
