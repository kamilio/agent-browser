# Inert JSON source recovery — September 17, 2026

## Practical result

Added a generic bounded HTML-JSON source API and offline CLI. They recover exact
caller-selected values from inline application/json scripts without page
execution, a framework/hostname-specific extractor or fabricated DOM content.
This closes a source-access gap observed in two formerly empty reader pages.

**Fresh Roblox source now yields a platform description and a catalog containing
14 game entries across two source carousel records.** TikTok's saved source
yields four navigation groups and 20 links—not videos or a functioning feed.
These are unverified source values, not rendered controls, available games,
verified current rankings or permission to follow their links.

## Source evidence

Five selections run through the final compiled CLI with kernel/JS network denial:

| Capture | Selection | Script UTF-16 units | Selected UTF-8 bytes | Useful source data |
| --- | --- | ---: | ---: | --- |
| Saved Roblox | Attribution row | 37,695 | 158 | Title and platform description |
| Saved Roblox | Vertical feed | 37,695 | 7,080 | Two carousel records, 14 game entries |
| Saved TikTok | Navigation list | 260,259 | 2,221 | Four groups, 20 links |
| Fresh Roblox | Attribution row | 38,535 | 158 | Title and platform description |
| Fresh Roblox | Vertical feed | 38,535 | 7,497 | Two carousel records, 14 game entries |

An independent HTML/JSON parser compares all five selected values, rejecting
duplicate JSON members. UTF-16 slicing independently verifies complete script
bodies and exact selected-source ranges. The original large integers/escapes are
not round-tripped through JavaScript numbers. Broad application, telemetry,
session and authentication configuration is not selected by these workflows.

The original September15 Roblox/TikTok receipts remain `empty-extraction` and
are unchanged. These explicit raw-source selections do not bypass receipt
admission or turn those historical navigations into successes. Final source
checks use release04; earlier release03 source checks are retained separately.

## Fresh native browsing

One anonymous GET to `https://www.roblox.com/` starts at
**2026-09-17T01:37:46.134Z**. It returns HTTP200 and **101,365 decoded bytes**, with
no classified barrier, redirects or retries. The native reader still returns
`empty-extraction`/exit1; its measured native operation is **218ms**, not a general
performance improvement. A separate explicit source operation makes the useful
public landing data available from that same response.

The actual compiled native command passes an exact-command synthetic routing
proof before browsing. It uses default limits, honest AgentBrowser identity,
credential omission and explicit reader visibility/raw policies. All request,
TLS/socket and process resources close. Source selection uses the pinned capture
afterward with zero requests; no additional page, asset, account, form, download,
SDK, CAPTCHA solver or alternative browser/client is involved.

## Validation and reviewed fixes

- **893 passed / zero failed across nine selected native files**, including
  **140 new cases**: 60 core source cases and 80 CLI cases. Build, strict selected
  types, format and lint pass. This is not a full native-manifest run.
- Canonical manifest: 975 entries, 953 available, **22 still missing**.
- Core review requires a declared interpretation of noscript. Every successful
  result now explicitly records disabled-scripting lexical source mode; hidden
  and template source is not mistaken for verified visible content.
- CLI review catches a paused-Readable stall. The runner now resumes active
  input after installing its listener, and a regression verifies exact output,
  listener restoration and caller-stream ownership.
- Earlier build/type failures remain recorded. They concern the initial resource
  error helper signature/type and a test context type, not successful releases.
  Static reviews and executed acceptance results remain distinct evidence.

## Boundaries and next work

The core bounds source, script size, selected bytes, tokens, JSON complexity and
cursor work. The CLI additionally bounds input/chunks/output and owns a deadline.
Skipped title/textarea RCDATA must still fit the inherited 65,536-unit window;
the new larger selected-script bound does not silently remove that limitation.

This is explicit source recovery, **not JavaScript application support**. The
normal reader still has no Roblox DOM content or TikTok feed. Practical one-shot
integration, actual SafeJS/HTML-module execution, wider dynamic-site support,
authentication/passkeys/devices/TTY, access/CAPTCHA handling and the original
research requests remain open. Historical100-entry33-useful/67-other judgments
remain unchanged; the full browser goal is still active.

Usage: `HTML-JSON-SOURCE.md`. Exact hashes, coordinates and test metadata are in
the adjacent JSON report. Private evidence is under
`node_modules/.cache/native-validation/html-json-source-september17/`.
