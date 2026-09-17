# Native-captured Pagefind query-to-fragment check — September 17, 2026

## Outcome

The new bounded `research-pagefind` CLI searches captured Pagefind 1.5.2 data and
includes supplied result-fragment content. Six literal queries agree with
independent calculations on the captured index. The first `rebas` result includes
the retrieved Reference fragment's exact **1,202 UTF-8 content bytes**, with its
145 reported words matching metadata.

This is **one source-fragment retrieval and scoped offline search**, not 85 working
result pages, 442 validated documents, executed search UI, full Pagefind semantics
or a new 100-site pass. See `PAGEFIND-SOURCE-SEARCH.md` for usage and limits.

## Source acquisition

All online acquisition uses the standalone native engine on the previously
qualified committed runtime: 1,604 source and 2,380 compiled pins, prior 3,804
selected native passes. Neither dirty workspace output nor the new decoder runs
in live transport. No alternate browser/client, downloaded JS/WASM, SDK,
credentials, redirects, retries, devices/TTY or challenge bypass is used.

| Asset | Received UTC on September 17 | HTTP | Captured body bytes | Unwrapped payload bytes |
| --- | --- | ---: | ---: | ---: |
| English metadata, reused earlier capture | 10:04:13.184 | 200 | 4,419 | 7,889 |
| Index chunk en_cc40c7f | 10:22:29.120 | 200 | 29,553 | 50,463 |
| Fragment en_2ac05e1 | 10:38:46.332 | 200 | 817 | 1,387 |

The two new GETs follow observed metadata hashes and captured module templates.
The metadata lexical range containing `rebase` supplied the candidate chunk;
inspection found a literal `rebas` record, not an exact `rebase` record. Its first
posting's initial document delta 7 maps to metadata document 7's en_2ac05e1 hash.
Source byte spans and hashes are retained. The fragment reports `/docs.html`,
title Reference, and content listing the rebase command. No separate document
navigation is claimed.

All three bodies remain native **unsupported/loader document failures**, despite
complete captures. The source-data path does not reclassify those receipts as
successful browser loads. Limits remain 2 MB response, 256 KB extraction, 256 MiB
child heap and 60-second supervision. Every actual request closes.

## Implementation

- Independent CBOR codec: owned input, exact offsets, canonical definite forms,
  strict UTF-8, duplicate scalar-map rejection, bounded work and checkpoints.
- Pagefind metadata/posting validation, delta accumulation, literal direct-term
  and variant membership, intersections, limits and document-ID ordering. Signed
  position/weight arrays are validated but not interpreted or ranked.
- SHA256-pinned strict JSON bundle CLI: exact source paths, canonical base64,
  bounded gzip/signature handling, optional fragment enrichment, word-count
  agreement, source identities and bounded stdin/stdout. No new dependency.

Filename hashes are identifiers, not implemented publisher authentication. Assets
were fetched separately; atomic deployment consistency is not proven. The delta
interpretation is consistent across all 431 records and the retrieved fragment,
not independently verified against Pagefind's full engine. Missing assets are
never silently fetched. Unknown versions fail.

## Validation

Final clean candidate `release04` is archived HEAD `0a9be78` plus six explicit
source/test overlays and three manifest entries. **830 passed, zero failed, across
10 selected native files**, including 40 decoder, 25 query and 36 CLI cases.
Build, selected test types, and six-file format/lint checks pass. The other 729
cases exercise existing CTAP, JSON/Sphinx queries and source-index CLI behavior.

All **1,610 source and 2,392 compiled pins** verify before and after actual-source
checks. The canonical 1,006-entry manifest still has 22 missing paths in the
isolated committed tree; they exist in the dirty workspace's 1,009-entry manifest.
This is not full-suite, dirty-runtime, actual SafeJS, credential or passkey
qualification. No authentication codec file or its 7,609-byte bound changes.

The new decoder matches **all 32,081 index CBOR nodes, values and offsets** against
an independent Python decoder, and all six metadata fields against prior decoding.
Independent membership calculations and the compiled CLI agree:

| Literal terms | Matches in supplied chunk | Returned with limit 100 |
| --- | ---: | ---: |
| rebas | 85 | 85 |
| rebase | 0 | 0 |
| ref | 179 | 100 |
| rebas + ref | 56 | 56 |
| rätta | 1 | 1 |
| ratta | 0 | 0 |

`ratta` is observed with empty direct postings; `rebase` is absent. The exact
`rätta` variant matches without diacritic folding. These distinctions are retained.
The first fragment content SHA256 is
`9b0ef9e8fac67dd69653f10dc608393e6080064b6df902d6582ec2c905d93e3c`.

Eight offline children (comparison, six CLI queries, wrong-digest rejection) run
under kernel and JavaScript network denial. All close with empty private HOME/TMP
and zero denied-I/O attempts; the wrong digest emits no result. The comparison
process observes 68.3 ms for its combined checks and a 106,184,704-byte RSS sample.
These are single local verifier observations, not browsing performance guarantees.

## Retained incidents

- Decoder-only release01: 769 native passes; build/types/lint pass, format fails.
- Integrated release02: 829 passes, one failure. Its test incorrectly calls the
  present-but-empty `ratta` term absent. The corrected expectation preserves zero
  matches with no missing term. Buffer typing and scoped lint errors are fixed.
- First fragment synthetic proof exits before browser work because copied guard
  fields still name the index target. Original files/proof remain. Versioned
  replacements pass a new proof before the single actual GET.
- A publication preflight rejects a whitespace-normalized reconstruction of the
  pre-existing manifest. Exact append removal confirms original bytes unchanged.
  Final release04 preserves canonical manifest whitespace; its production code
  is identical to the already passing release03, which also passed 830 tests.

## Evidence and remaining work

Evidence roots under `node_modules/.cache/native-validation/` are
`git-search-postings-september17/`, `git-search-fragment-september17/`, and
`pagefind-data-query-september17/`. Earlier sealed metadata/module evidence stays
at its original paths. The accompanying JSON records evidence hashes and checks.

Historical reports and 100-entry **33 useful / 67 other** outcomes remain unchanged.
The overall goal stays active: dynamic pages/SafeJS, task-level coverage,
access/CAPTCHA friction, performance and real authentication/passkeys remain open.
