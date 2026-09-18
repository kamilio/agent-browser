# Native table options and explicit public API reading

September 18, 2026. This checkpoint fixes an observed native command gap and
validates a separate public API source. It does not make Stack Overflow's blocked
website work or complete the browser/Zoom objective.

## Native command fix

Ordinary native `extract` now accepts `--table-rows` and `--compact-tables`, which
the library and `extract-page` already support. Both flags are parsed as booleans,
admitted by the command host and forwarded to the existing extraction library.

```text
extract #main-content --table-rows --compact-tables
extract --content-focus=main-content-v1 --table-rows
```

Absent or explicitly false flags preserve the original representation. Enabling
either preference requires Markdown; table-source metadata still requires JSON
when enabled. Selectors, references, content focus and byte/node/depth limits
retain their existing behavior. No renderer semantics, source limits, dependencies,
network policies or runtime defaults change. See `TABLE-ROWS.md`.

**775 native tests pass across 16 explicit files**, with green build, TypeScript,
format and lint checks. There are 47 added command cases covering flag parsing,
invalid/unrelated options, default/false compatibility, selectors/references/focus,
library parity, current mutated content, JSON restrictions, caps and no refetch.
Old production with identical new tests gives **53 passes and 22 failures** in
the 75-case command file. This is selected immutable-overlay qualification, not
a full-worktree, SDK, socket-service, device or meeting pass.

## Previously failing command, now working

The original Tokio inspector is reused **unchanged**, with the new compiled native
runtime. Its earlier `Unknown option: --compact-tables` failure remains preserved.
It now completes: the same captured page has 23 source/reader-matching headings,
five code blocks and 23,992 focused Markdown bytes. Whole-reader output remains
31,761 bytes. No new Rust-site request occurs and the flags do not reduce this
particular focused output. The original capture time remains 10:36:46.584 UTC.

A table-heavy saved GitHub README provides a second check. Ordinary article
extraction returns **53,917 Markdown bytes**; row lists plus compact boundaries
return **37,618 bytes**. Both native results exactly match the current library.
The compact Markdown also exactly matches the earlier independently checked
artifact, including 42 headings, 29 code blocks, 79 content links and 71 physical
rows/204 cells across 11 tables. Source-parser versus reader comparisons agree
on heading/code/table/row/cell text. No table associations are inferred.

This is approximately 30.2% less Markdown for the same selected article, not a
network or CPU speedup. The 501,587-byte capture remains the original
04:55:32.075 UTC September 18 response. No repository refetch or README command
execution occurs. Both checks use the native command host in-process, not a
socket-backed CLI or independently rendered browser.

## Separate public API request

The previous Stack Overflow question-page request remains a **403 confirmed
Cloudflare challenge**. No challenge was solved/submitted, no website retry was
made and the old receipt is not reclassified.

An explicit, separately prepared request instead uses Stack Exchange's public
questions-by-ID API with the documented `withbody` filter. Official method,
filter and throttling documentation was checked separately, not counted as
native-browser validation:

- `https://api.stackexchange.com/docs/questions-by-ids`
- `https://api.stackexchange.com/docs/filters`
- `https://api.stackexchange.com/docs/throttle`

One anonymous native GET to
`https://api.stackexchange.com/2.3/questions/20001229?site=stackoverflow&filter=withbody`
returns HTTP 200 at **11:00:41.394 UTC on September 18, 2026**: **1,560 decoded
JSON bytes** and **1,569 fenced Markdown bytes**. The captured reader outcome
remains `extracted-unverified`, `partial: true`, with no content-success claim or
fallback. Query reporting remains redacted; the guarded raw request matches the
authorized exact URL. No key, token, cookies or credentials are supplied.

The response contains exactly question 20001229 and its **763-byte HTML body
string**. It reports `has_more: false`, `quota_remaining: 299`, no backoff and no
API error. These are receipt-time observations, not an ongoing quota guarantee.
An accepted-answer ID is advertised but **no answer, comment, paging or subsequent
request is fetched**. This is API question content, not a complete website task.

The API capture reuses the earlier immutable 433-test reader, independently of
the new 775-test table-option runtime. Its matching synthetic proof verifies
literal JSON/fence fidelity, inert embedded HTML, query redaction, one mocked
GET, zero real IO, module restrictions and cleanup. One preparation attempt
fails before a child because its patch argument is too large; another proof
rejects an incorrect expected fence newline. Both originals remain preserved.
The corrected proof keeps the request and fidelity guards, checks zero external
stylesheets rather than requiring empty native style metadata, and verifies
4,375 pins plus eight corruption-rejection checks.

The live lane is spent. There are no redirects, retries, scripts, subresources,
alternate engines or new SDK execution. TLS/public-address checks and ordinary
AgentBrowser identity remain. Caps stay 2,000,000 decoded bytes, 256,000 extraction
bytes, 256 MiB V8 old space (not RSS), 16 MiB per file and 60 seconds per child.
DNS tries=2 is configuration, not HTTP retry permission or a query-count claim.
Transport/session/documents and child groups close, with empty task HOME/TMP.

## Lossless selected content

The existing **programmatic** admitted replay API selects `/items/0/body` from
the pinned response under kernel/JS network denial and native-module restrictions.
The 773-code-unit quoted JSON source slice is exact; decoding it reproduces the
763-byte question body. It returns 782 Markdown bytes inside a **2,447-byte JSONL
provenance envelope**. That envelope is larger than this small whole response;
selection is demonstrated for fidelity, not claimed as an overall size saving.

The HTML stays a literal JSON string, not a rendered document or executed script.
No duplicate-member ambiguity, receipt-admission bypass, source reserialization
or additional request is introduced. This check is not a standalone replay-CLI
JSON-pointer pass; the current programmatic path is identified explicitly.

## Evidence and open work

Machine-readable companion: `reports/native-table-options-2026-09-18.json`.
Local phase: `node_modules/.cache/native-validation/native-table-options-september18`.
Final API lane: `/tmp/agent-browser-json-api-preparation-cvzdrS/stackexchange-question`.
Its authoritative preparation is `api-preparation/attempt-003`; earlier attempts
are retained. Private captures and hashes preserve their original paths and
measurements; no fetched bodies are shipped as repository source.

Broader access/challenge handling, dynamic/runtime compatibility, full-site and
research coverage remain open. Zoom client execution, native media receive/decode,
admission, permitted recording, transcription and delivery are unfinished. No
meeting was joined or recorded. These changes do not complete the overall goal.
