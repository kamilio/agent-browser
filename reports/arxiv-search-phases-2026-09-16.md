# arXiv lightweight native search and 100-entry evidence audit

## Result

**A new arXiv search workflow succeeds: two native HTTPS GETs, both HTTP200,
followed by a 50-record paper listing and 59,960 bytes of Markdown.** This is
not a rerun of the earlier timed-out query URL, an automatic fallback, or a
production timeout fix. The previous failure remains recorded unchanged.

An independent offline audit also confirms that the original corpus contains
100 distinct entry URLs, 100 individual native outcomes and 100 linked content
reviews, with no missing or duplicate entries. Its counts remain **33 useful
source-content judgments and 67 other judgments**. Every one of its 803 sealed
artifacts matches its recorded pin; this adds no new corpus navigations.

## All 100 pages

The complete URL-by-URL checklist is `reports/agent-citation-revalidation-v2.md`;
machine-readable rows are in the same-basename JSON and CSV files. The original
September 16 run records 100 navigations, 108 GETs including redirects, 96
complete decoded captures and no retries. These are historical measurements,
not requests repeated by this audit.

| Original reviewed outcome | Pages |
| --- | ---: |
| Useful source content | 33 |
| Navigation only | 19 |
| Consent or access restriction | 23 |
| Login required | 3 |
| Empty | 6 |
| HTTP error | 8 |
| Transport failure | 2 |
| Other failure | 6 |
| **Total individually reviewed** | **100** |

The selection is a **citation-derived host/root-page proxy**, not a measured
global ranking of agent page visits. Its five captured September 2026 Ahrefs
tables have a September 2 publisher update and cover Google AI Overviews,
AI Mode, Perplexity, Copilot and Gemini. Their 250 rows pool to 113 hosts;
the documented appearance/rank/hostname ordering selects 100. There is no
dedicated ChatGPT or Claude table, and frequently cited hosts are not the same
as deeply cited pages. No source table was refreshed in this follow-up.

The audit verifies recorded review coverage and every nonempty evidence quote;
it does not reclassify all uninspected text or authenticate publisher facts.
Full versus sampled extraction and receipt-only reviews remain differentiated.
Later successful workflows do not turn the original 33/100 into a new rate.

## New live workflow

- Runtime: `4aafdcdffe13c1dd7c86c405816b7430d74ab590`, using its pinned clean
  build rather than the dirty repository runtime. All 1,513 committed runtime
  source/script/config inputs match; source and compiled manifests are rechecked.
- Start: `https://arxiv.org/search/`.
- Destination: `https://arxiv.org/search/?query=transformer+inference&searchtype=all&abstracts=show&order=-announced_date_first&size=50`.
- The first request starts at `2026-09-16T04:27:13.285Z`; the second starts at
  `2026-09-16T04:27:15.287Z`. The observer records process exit at
  `2026-09-16T04:27:15.798Z`; total supervised elapsed time is 2.868648 seconds.
- The new source has one matching `/search/` GET form and one matching query
  input. The native parser sees an empty initial value; `fillAsync` supplies
  the public literal and `requestSubmit` serializes the actual form. The exact
  destination is checked before dispatch, not manually passed to navigation.
- Both responses are HTTP200. The source is 16,159 decoded bytes; the destination
  is 253,868 bytes. The full bodies are retained separately from extraction.
- Two requests, two responses, zero redirects/retries, two closed documents and
  zero cleanup errors. All request/socket, session/network, route, cookie,
  storage, storage-event and supervising child/process-group closures pass.

| Artifact | SHA-256 |
| --- | --- |
| Initial decoded body | `72023ef39f0be1592ddf691dae3db18799e0728e09c075a8e1ae17cb93888445` |
| Destination decoded body | `6bcbcd1181bda8f4531fb64023b7fff2fc5d833dfc511ddb6fc738df9a5cf5f9` |
| Extracted Markdown | `1cfcbb05b3bc415eba86edc3537c7a30e6ad689ec31d6971d675434746147acf` |

The numbered paper records run from 1 through 50. Independent review compares
all 50 identifiers, titles, short abstract snippets and 198 author-link
occurrences against the captured source, without mismatches. This is listing
content, not complete abstracts, full papers, verified relevance or a correct
total result count. All 50 snippets are truncated in the source; longer spans
are explicitly hidden and the script-dependent More controls are not expanded.
Navigation clutter and concatenated select-option labels remain readability
issues. No linked paper or PDF is fetched, and no results are invented.

## Connection observations

Milliseconds below are relative to each diagnostic `request-start`, not the
beginning of DNS or the native request. Transport elapsed time includes pacing.

| Positively observed event | Initial GET | Search GET |
| --- | ---: | ---: |
| TCP connect | 0.666 | 0.815 |
| TLS secureConnect, authorized=true | 3.984 | 5.990 |
| Local request finish | 4.294 | 6.074 |
| Response headers, status200 | 488.636 | 299.230 |
| Request close | 543.115 | 505.538 |
| Socket close | 543.199 | 505.581 |

Initial socket state and final counters are also retained. Local request finish
is **not server acknowledgment**; raw socket counters are not decoded HTTP body
sizes. The observer's channel named `response-finish` is not treated as body
completion. Missing phase events would not establish that a phase never occurred.

The previous different-query timeout has no comparable phase trace. This success
therefore neither locates that timeout nor proves that the partial-DNS fix caused
an improvement. No TLS, identity, address policy, retry or connection-racing
behavior is changed for this run.

## Isolated checks and safeguards

- **389 native tests pass, zero fail, nine explicit native-manifest files.** This
  is a fresh focused run, not the full manifest and not 389 new tests. The sealed
  unchanged runtime's successful build/types/format/lint gate is reused, not rerun.
- One kernel-denied offline form workflow passes. Its historical results body
  was captured at a different query URL and rebased for fixture serialization;
  it is explicitly not a fresh capture of the new root page.
- All 39 request/admission policy checks and 11 synthetic observer scenarios
  pass. Their no-network guards are distinct from actual live socket evidence.
  The observer scenarios use synthetic EventEmitter objects, not real TLS.
- Review finds no blocking harness or observer defect. All 26 proof-pin members,
  exact two-phase request admission, isolated HOME/TMP, credential omission,
  zero redirects, 15-second native deadline, 2MB response bound and one-shot
  claim are retained. The observer is diagnostic, not the pre-dispatch gate.
- No SafeJS/page scripts, alternate browser/client, external resources,
  credentials/passkeys, real TTY, challenge solver or identity evasion is used.
  This is native API/source-content validation, not actual CLI or rendered UI
  acceptance. No production behavior changes are made in this follow-up.

## Evidence and remaining work

Evidence is retained under
`node_modules/.cache/native-validation/arxiv-search-phases-september16/`:
`CORPUS-AUDIT.md`, `CONTENT-REVIEW.md`, `REVIEW01.md`, `REVIEW02.md`, isolated
proofs, native results, immutable attempt claim and `live01/1/` raw captures,
Markdown, phases, invocation and cleanup records. The same-basename JSON report
pins the supporting artifacts. The historical 100-page lane is unchanged.

Python's JavaScript search shell, diagnosis of the earlier arXiv timeout,
connection fallback, dynamic source content, challenge/human handoff, SafeJS,
credentials/passkeys and real-input gates remain open. The broader browser goal
remains active. This focused result is committed locally; nothing is pushed.
