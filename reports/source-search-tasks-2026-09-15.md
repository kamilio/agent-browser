# Source-derived search tasks — September 15, 2026

## Outcome

Four public research paths reach useful article/reference/abstract source using
the native browser. This validates more than homepage accessibility, but it does
**not** make all four sites' search UIs functional. Python and Git supply empty
client-side search shells. arXiv's original search URL triggers a correctly
blocked HTTPS-to-HTTP redirect. All three limitations remain recorded.

Existing explicit workflows recover useful retrieval: follow a linked static
index for a narrow API/command lookup, or separately choose the same-host HTTPS
counterpart of arXiv's advertised redirect destination. No production code change
is justified by the two inspected shells: neither contains matching result text
that the reader lost. No scripts, SDK, login, form-control actions, credential
access, alternate browser, CAPTCHA solver or retry of an original URL was used.

Guide: `SOURCE-SEARCH-WORKFLOWS.md`. The adjacent JSON retains exact public-query
URLs, timestamps, source/body/receipt hashes, outcomes and focused selections.

## Every live attempt

All requests occurred on **September 15, 2026**, starting at20:30 UTC. Search
endpoints and field names came from pinned earlier native captures; subsequent
index/result destinations were verified in fresh source extractions before
navigation. Exact paths and link-chain evidence remain in the local lane.

| Order | Target/task | Observed HTTP | Outcome/content | Markdown bytes |
| --- | --- | ---: | --- | ---: |
| 1 | Wikipedia search: HTML parsing tokenizer | 200 | Search results, titles and snippets | 13,244 |
| 2 | Python docs search: asyncio timeout | 200 | JavaScript-required search shell | 1,649 |
| 3 | Git search: rebase | 200 | Empty client-side search container plus site UI | 1,264 |
| 4 | arXiv search action without trailing slash | 308 | HTTPS downgrade rejected; no completed capture | — |
| 5 | Python linked general index | 200 | Directory of letter indexes | 3,069 |
| 6 | Git linked reference index | 200 | Command links, including rebase | 6,772 |
| 7 | arXiv same-host HTTPS redirect counterpart | 200 | Server-rendered result titles/snippets | 54,864 |
| 8 | Wikipedia Web_scraping result | 200 | Article source with references and site UI | 63,233 |
| 9 | Python linked T index | 200 | Names and links, including asyncio timeout | 73,555 |
| 10 | Git linked rebase reference | 200 | Synopsis, descriptions, options and site UI | 75,076 |
| 11 | arXiv linked abstract2609.15895 | 200 | Abstract, metadata and site UI; not the full paper | 9,261 |
| 12 | Python linked asyncio.timeout anchor | 200 | Reference page containing timeout section | 72,719 |

The native outcome for all eleven completed HTTP200 captures is
`extracted-unverified`, with `contentSuccess: null`; the table's content judgments
come from separate source inspection, not a changed classifier. The initial
arXiv receipt reports `policy-denied` / `https-downgrade` and no primary response.
Its308 status and HTTP destination are transport observations, not an admitted
response/body. No plaintext HTTP request was sent, and no redirect was followed.

The arXiv follow-up preserves the observed redirect's hostname, path and query,
changing only HTTP to HTTPS. It is an explicit new target, not an automatic
redirect fix or an access-control bypass. Wikipedia's result and all final
documentation destinations were source-linked; no interactive click was tested.
The arXiv abstract was selected because its visible snippet contains the public
query phrase, not because its research claims were verified.

## Shell diagnosis

An independent offline reviewer checked both complete bodies and their hashes.
Python has an empty results/glossary container and external search dependencies;
neither query word appears in the delivered HTML. Git has an empty search
container and external Pagefind UI reference; its inline scripts handle themes
and taglines, not result payloads. No matching result list or hidden result text
is present in either capture. The native reader did not lose supplied search
results. External indexes and future scripted DOM states were not inspected.

The source-linked Python index chain supports a narrow named-API lookup. Git's
command index supports a narrow command lookup. Neither is claimed equivalent
to working full-text search. These failures do not establish CAPTCHA blocking.

## Focused offline retrieval

Four separate native replay CLI children use exact fresh receipt/body hashes and
byte counts, default-profile admission and source-derived unique selectors.
All succeed with one match and preserve actual UTF-8 encoding, explicit fallback
and visibility provenance. Each desired section contains inspected topic markers.

| Captured document | Selector | Original bytes | Focused bytes |
| --- | --- | ---: | ---: |
| Wikipedia Web_scraping | `#mw-content-text` | 63,233 | 51,842 |
| Git rebase | `#main` | 75,076 | 60,359 |
| arXiv abstract | `blockquote.abstract` | 9,261 | 1,737 |
| Python asyncio reference | `#timeouts` | 72,719 | 7,222 |

The focused outputs retain article techniques/references, command synopsis and
options, the selected abstract, and the timeout API section respectively. This
is deliberate subtree selection, not whole-document hash equivalence. Python
and Git examples are never executed. Abstract claims, article assertions and
documentation correctness are not independently fact-checked. Some table markers,
escaped characters and site-specific presentation remain.

## Scope and integrity

Runtime `6040343780ee4010afe3e44c27f6b1d9ea3bcae5`: **1,484 committed runtime
source/script/package/config files** match the reused clean release01 candidate;
source and compiled manifests remain pinned and unchanged. Dirty root output was
not used. No new native test/build run or actual SDK acceptance is claimed.

**12 native navigations /12 HTTPS GETs /11 complete captures /one rejected
downgrade /zero followed redirects or original-URL retries.** Four additional
guarded offline replays make zero actual or mocked HTTP requests. All16 children
and process groups terminate; all12 observed live requests and sockets close.

Live runs use empty HOME/TMP, a restricted environment,192MiB heaps,45-second
outer deadlines, default response/output budgets, source-hidden-inline filtering,
raw-text separation and explicit UTF-8 fallback. Only one live child runs at a
time, with two-second gaps within each batch. Offline replay additionally uses
kernel socket/io_uring denial and JS guards, with30-second deadlines. The arXiv
failure is preserved rather than rerun with weaker transport policy.

Local lane: `node_modules/.cache/native-validation/source-search-tasks-september15/`.
Its `AUDIT.json` pins scopes, source-form/link chains, receipts, observers, child
records, the shell review and offline guards. Audit success means these checks
passed, not that every initial search request succeeded. Source receipts redact
query values in URL metadata; the host corpus and observer retain these chosen
public technical queries for reproducibility. Captured bodies remain local.

The original100-page AI-citation proxy matrix and all historical measurements
remain unchanged. No new global agent-popularity claim, automatic search
capability, page-runtime activation, passkey/device gate, push or overall-goal
completion is claimed. SafeJS callback admission and broader interactive/access
limitations remain open; the goal stays active.
