# Content follow-up and manual redirects — September 18, 2026

This checkpoint records five fresh, separately authorized native GETs, compact
reading of saved content, and an explicit manual-redirect diagnostic. It does
**not** establish Zoom participation or complete the browser/research goal.

## Five fresh requests

Each lane made one anonymous HTTPS GET with verified TLS, no redirect follow,
retry, subresource, script, authentication or identity change. Request guards
and child/session/document/transport cleanup passed. The first four reads used
earlier qualified immutable readers; only the final row exercises the newly
qualified manual-redirect CLI. They are not all core02 live qualifications.

| Exact target | Received UTC | HTTP | Captured body bytes | Markdown bytes |
| --- | --- | ---: | ---: | ---: |
| `https://docs.prismml.com/get-started/introduction` | 05:19:49.185 | 200 | 268,252 | 8,540 |
| `https://docs.prismml.com/llms.txt` | 05:31:37.581 | 200 | 2,615 | 2,623 |
| `https://docs.prismml.com/download/formats` | 05:31:39.522 | 200 | 291,384 | 18,335 |
| `https://arxiv.org/html/2105.00272v1` | 05:31:37.627 | 200 | 116,307 | 49,812 |
| `https://docs.prismml.com/quickstart` | 05:55:40.332 | **404** | 104,276 | **0** |

The four HTTP200 reports remain `extracted-unverified`, `partial: true`, and
`contentSuccess: null`. Their publisher claims were not independently verified.
The introduction was a separately authorized continuation from an earlier
observed Location; the old root request and its failed wrapper remain unchanged.
Native source-anchor inspection independently established the later targets.

### Actual manual result versus synthetic proof

The `/quickstart` request returned **404, not 308**. Its CLI exited 1 with
`outcome: http-failure`, `contentSuccess: false`, `redirectMode: manual`, and no
redirect diagnostic. `safetyPassed: true` validates the bounded one-shot execution
and cleanup, not content retrieval or a real Location handoff. This lane is spent;
there was no retry, replacement URL or follow.

The separate zero-network fixture intentionally returned **308** with a benign
301-byte body and Location `/get-started/quickstart`. It correctly exited **1**,
retained 174 Markdown bytes, and reported `http-failure` and
`contentSuccess: false`. Its exact diagnostic had action
`review-before-new-request`, `followed: false`, reason `available`, the canonical
same-origin target, and false query/fragment flags. One mocked route and full
cleanup passed under JavaScript/kernel guards. All seven CLI arguments plus the
entry path were checked. This proof did not load the Location destination.

## Existing compact reading options

All following measurements reuse captured bytes with zero additional requests.
They do not require a new selection heuristic or extraction policy.

- **Introduction:** `main-content-v3` reduces 8,540 bytes to 6,323; adding
  `--compact-tables` gives 5,413, or adding `--table-rows` gives **4,250**. Native
  raw-source and reader cell sequences match: **7 rows / 28 cells**. Each observed
  cell remains in the measured output; direct extraction and replay agree, and
  the reader revision/JSON extraction remain unchanged. Six source card headings
  have no enclosing href in captured HTML; this is not evidence about hydrated
  card clickability or a removed rendered link.
- **Machine-readable index:** the `text/plain` body is preserved exactly inside
  a Markdown fence: **2,615 source bytes + 8 fence bytes**. No index link was
  followed. This is a verified text representation, not a claim that the index
  enumerates every documentation page.
- **Formats:** `--selector '#content-area' --format markdown --table-rows
  --compact-tables` reduces 18,335 bytes to **8,784**. Within that root, source
  parser versus semantic-reader DOM comparisons match **10 headings, 1 code
  block, 77 cells and 23 href/label pairs**. Those DOM checks do not establish
  one-to-one preservation of every emitted Markdown or rendered link.
- **Experimental paper HTML:** `--selector 'article.ltx_document' --format
  markdown --table-rows --compact-tables` reduces 49,812 bytes to **45,570**.
  The compared DOMs retain all **17 observed headings**; anchors differ
  **125 source / 124 reader**, with one source-only `mailto` anchor. No address
  is published here. The source contains **9 figure elements**, but images were
  not fetched and figures were not interpreted. This is not full paper-rendering
  or figure-understanding validation.

### Reused GitHub README, not another GET

The Bonsai-demo capture is from **04:55:32.075 UTC in the preceding phase**:
501,587 body bytes and 76,825 Markdown bytes. Its historical full-page output is
reproduced before narrowing selection. The measured existing option set is:

```text
--selector article.markdown-body --format markdown --table-rows --compact-tables --output-limit-policy text-prefix-v1
```

It produces **37,618 bytes**, a **51.0% reduction**. The same options without
text-prefix produce byte-identical output; no fallback or recovery is needed.
The single selected article retains **42 headings, 29 fenced code blocks,
79 non-permalink links to 59 distinct destinations, and 11 tables / 71 rows /
204 cells**. Source code comparison normalizes only a final newline; emitted
content-link order is checked. The 42 omitted empty heading-permalink controls
are counted separately, not claimed as retained links. Row lists do not infer
table-header associations.

This is the README article in captured HTML, not a newly downloaded raw README
or a pinned remote revision. Eight guarded captured-replay cases pass; no README
command was executed. Useful sections/code/links survive, but vendor claims and
full rendered-site equivalence remain unverified.

## Manual redirect implementation and qualification

`--redirect-mode manual` exposes the existing host behavior without changing the
default or following Location. It cannot combine with
`same-origin-upgrade-v1`. A readable redirect body remains an HTTP failure, not
successful destination retrieval. Challenge handling retains precedence.

The bounded diagnostic covers 301/302/303/307/308, resolves one unambiguous
Location, redacts queries, omits/flags fragments, and rejects malformed,
credential-bearing, oversized or locally disallowed targets. It grants no
permission and does not certify DNS/TLS safety of the destination. Raw Location
is not added to selected headers. Redirect-only validation covers detached
default-profile serialization and the general evidence path without broadening
unrelated default validation. See `RESEARCH-REDIRECTS.md`.

- **Final core02: 817 passed / 0 failed in 9 files**, 30.97 seconds; includes
  **137 helper and 24 integration cases**. Build/types/format/lint pass.
  The runtime has **1,692 source and 2,512 compiled pins**. This is not a full
  suite, and qualification was not rerun for this publication.
- **Baseline: 0 / 1**, one explicitly filtered CLI regression against the prior
  implementation, which rejects the new flag. Preserve that expected failure;
  it is not an unfiltered-suite result.
- **Initial core01: native 817 / 0**, but type checking exited 2 and lint exited 1.
  Fixture fixes addressed an optional header-value union, a recursive `toString`
  return annotation, and a legacy-header `delete` operation. Initial artifacts
  remain intact; final quality is not substituted for their results.
- The first compact-content harness wrongly guessed **32 cells** and failed
  against the observed **28**. The corrected check compares raw-source and reader
  sequences rather than guessing size. Both original and corrected executions
  remain at their original paths. An auxiliary manual handoff assertion also
  needed to account for normal Markdown punctuation escaping; the passing 308
  proof and its pinned lane were not changed.

## Evidence and remaining gates

The JSON companion records exact private artifact paths and SHA-256 hashes for
live receipts/bodies, parent authorizations, guards, synthetic proof, compact
checks, README seal, qualification and failed runs. Publication verified source/
compiled manifests, receipt/body identities and referenced evidence without
performing network requests, tests or builds. Full site text, raw IPs and mailto
addresses are not copied into this report. Historical TASKS sections and earlier
100-site measurements are not rewritten.

No Zoom join, native client execution/media/decode, vault/credentials, devices,
recording, transcript, summary or delivery qualification occurred here. Actual
SafeJS and broader runtime/site access gates, full-suite and 100-site coverage,
and the original research/browser objectives remain open. No alternative browser,
default-runtime switch or push is part of this checkpoint.
