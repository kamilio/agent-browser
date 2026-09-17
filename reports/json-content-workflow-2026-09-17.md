# One-command JSON content workflow — September 17, 2026

## Practical result

Native browsing and explicit JSON-source recovery now run in one command. Agents
no longer need to export/decode a raw capture, calculate its digest or start a
separate source CLI to retrieve a known public JSON path. No new dependency or
site-specific extractor is introduced. Source content remains explicitly
unverified and separate from the native reader's outcome.

Two fresh public native requests succeed with the final compiled CLI:

| Page / selected scope | UTC start, September 17 | HTTP | Decoded body bytes | Selected JSON bytes | Whole CLI JSONL bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| Roblox / landing catalog | 02:07:39.149528 | 200 | 101,359 | 7,497 | 11,169 |
| TikTok / navigation | 02:07:41.737132 | 200 | 366,177 | 2,221 | 5,087 |

Roblox supplies two experience carousels containing **6 + 8 = 14 game entries**,
not 14 guaranteed unique games or verified availability/rankings. TikTok supplies
**four groups and 20 navigation links**, not video content or a functioning feed.
Both captures still have `empty-extraction`; each wrapper independently reports
`source-extracted-unverified`. Historical navigation verdicts are not rewritten.

The two commands finish under their supervisor in approximately 0.58 and 0.83
seconds, including startup/validation overhead. These observations are not a
controlled latency comparison or a general browser speedup. Smaller final CLI
output omits the raw body; the complete response is still downloaded internally.

## Validation and independent checks

- **83 passing new API/CLI cases**, followed by **657 passing / zero failing
  tests across eight selected native files**. Build, strict selected types,
  format and lint pass. This is not a full native-manifest run.
- Canonical manifest becomes 977 entries: 955 available, **22 still missing**.
  Earlier full-native evidence remains historical and does not cover this change.
- The exact executable and arguments first pass two synthetic routed commands,
  then two saved-response commands with kernel/JS network denial. Saved outputs
  exactly match the prior committed Roblox/TikTok source selections.
- All six command results have independent Python HTML/JSON semantic comparisons
  and exact UTF16 script/selected-range checks. Original JSON spelling is retained.
  Saved inputs and source/build inventories are hash-pinned before and after use.
- Each live check makes one anonymous GET, with zero redirects/retries and no
  supplied credentials, page scripts, SafeJS, alternate client or challenge solver.
  Test-only policy disables redirects; production retains native bounded redirects.
  Both requests, TLS sockets and process groups close; HOME/TMP remain empty.
- The test guard privately saves the already received response for audit. This
  does not add a request or export unrelated source configuration in CLI output.

## Reviewed issues

The first candidate's test-fixture header union fails strict typing; explicit
fixture typing fixes it. Static API review identifies transport errors/timeouts
being summarized as policy denials. Supported native categories now propagate;
regressions cover network errors, timeouts and sanitized internal-error fallback.
The original nested capture evidence remains intact. Failed initial checks are
retained, not replaced with successful evidence.

Independent CLI review identifies no remaining concrete defect. It explicitly
notes cooperative deadlines and non-transactional output: cancellation awaits
native cleanup and cannot retract bytes already passed to a stream. Executed
stream tests remain separate from the review's static conclusions.

## Remaining work

Source-only recovery is not rendered application support. Callers must still
know a public script ID/path; this is not automatic dynamic-page discovery.
Source selection bounds and the skipped title/textarea cursor-window limit
remain. Access barriers/rate limits are refused before source selection, not
bypassed. No CAPTCHA solution or broad performance improvement is established.

Actual SafeJS 0.1.640 execution/HTML-module acceptance, dynamic sites, real
credential/passkey/device/TTY checks, the 22 missing native files and unfinished
hardware/benchmark/Astra/Poe research remain open. Historical citation-proxy
coverage stays 33 useful / 67 other; this is not a fresh 100-page sweep. The full
browser objective remains active.

Usage and failure/stream semantics: `JSON-CONTENT-WORKFLOW.md`. Exact evidence
hashes and invocation results are in the adjacent JSON report. Private evidence:
`node_modules/.cache/native-validation/json-content-workflow-september17/`.
