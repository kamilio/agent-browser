# Shared reader metadata and native content validation

September 18, 2026. Focused native functionality change, not Zoom or full-browser
acceptance. No Chromium/Firefox/remote fallback, SDK execution or new dependency.

## Change

`extract-page SELECTOR --reader-metadata=page` shares the document reader report
once per page. The library equivalent is `readerMetadata: "page"`. Entries omit
only their duplicate `reader`; a page-level `readerMetadata: "page"` marker makes
the representation explicit. Consumers can restore the shared report to each
entry. Default and explicit `entry` preserve the original representation.

Content and unrelated extraction metadata are unchanged. Missing reader metadata
is not fabricated. Shared metadata counts toward the complete compact-JSON UTF-8
page cap, including empty results; individual extraction limits still apply.
The implementation checks report identity before sharing and releases queries on
success and failure. It does not mutate documents or extraction records.

## Tests and checks

- Old production with the final new tests: **114 passed, 31 failed**, two files.
  These retained failures demonstrate missing old behavior, not website failures.
- Changed immutable native overlay: **487 passed, 0 failed**, nine files from
  `native-tests.json`. This adds 54 cases to the prior 433-case selection.
- Build, TypeScript, formatting and lint all exit zero for that overlay.
- Tests cover default compatibility, CLI/library validation, Markdown/JSON,
  byte-exact Unicode and cursor boundaries, report lookup/mismatch, frozen
  records, missing reports, empty results, item/page limits and cleanup paths.
- This is not a full-worktree test pass. The overlay includes only this phase's
  owned changes on the previously qualified native basis. Native checks do not
  qualify SafeJS, devices, sockets, credentials or real meeting execution.

## One new website request

The native reader fetched `https://docs.python.org/3/library/asyncio-task.html`
once at **10:23:45.783 UTC on September 18, 2026**: HTTP 200, **177,603 decoded
body bytes**, **72,719 whole-reader Markdown bytes**. Actual classification stays
`extracted-unverified`, `partial: true`, `contentSuccess: null`, no fallback.
This is not a claim of publisher completeness or rendered JavaScript behavior.

The prior immutable 433-test runtime made this capture; the new 487-test runtime
performed the subsequent offline content comparisons. The capture used ordinary
AgentBrowser identity, verified TLS and public-address checks, no credentials,
no HTTP retry/redirect, scripts, subresources or alternative engine. Limits were
2,000,000 decoded bytes, 256,000 extraction bytes, 256 MiB V8 old space (not RSS),
16 MiB per file and a 60-second supervised child. DNS resolver tries=2 is separate
from HTTP retries and is not a measured DNS query count.

The matching isolated proof used one mocked GET, preserved punctuation/code and
excluded source-hidden and inert raw content. It made no real network/DNS calls.
Both proof and live checks passed; transport/session/documents and child/process
groups closed, with empty task HOME/TMP. The one-shot lane is spent, not reusable.

## Captured-source comparisons

Three zero-network **in-process native command-host** replays compare default and
shared modes using identical selectors, limit=100 and 32,000-byte page/item caps.
They are not spawned CLI, socket-service, browser UI or SDK acceptance tests.

| Captured page / selection | Entries | Default → shared JSON bytes | Pages | Reduction |
| --- | ---: | ---: | ---: | ---: |
| GitHub llama.cpp build guide / `article.markdown-body pre` | 56 | 113,459 → 67,958 | 4 → 3 | 40.1% |
| Hacker News discussion / `.commtext` | 414 | 364,618 → 202,463 | 12 → 7 | 44.5% |
| Python asyncio tasks / `pre` | 34 | 66,044 → 44,406 | 3 → 2 | 32.8% |

Every page stays within 32,000 bytes, including metadata and cursors. Restoring
the shared report reproduces every ordinary entry structurally, including content
and other metadata, with no skipped or duplicated reference. All 56 GitHub and
34 Python code-block texts match the source parse; all 414 HN comment Markdown
bodies match prior source-verified artifacts. Retained Markdown is respectively
10,237, 107,455 and 11,723 bytes. Documents remain unmodified and resources close.

These are aggregate compact-JSON serialization measurements, **not** CPU latency,
token counts, network transfer or general compression benchmarks. The selectors
cover code examples/comment bodies, not entire articles or independently rendered
browser output. Original capture times remain GitHub 09:10:09.751 UTC, HN
04:15:02.383 UTC and Python 10:23:45.783 UTC, all September 18. No GitHub/HN
refetch occurred. HN's original whole-page output-limit failure remains a failure;
this inspection reuses its captured body without overriding receipt admission.

## Evidence and outstanding work

Machine-readable report: `reports/shared-reader-pages-2026-09-18.json`.
Local validation phase:
`node_modules/.cache/native-validation/shared-reader-pages-september18`.
Python lane: `/tmp/agent-browser-python-docs-preparation-2fOuPa/python-asyncio`.
Replay directories: `/tmp/agent-browser-shared-reader-github-NSxR4B`,
`/tmp/agent-browser-shared-reader-hn-sTyBep`,
`/tmp/agent-browser-shared-reader-python-mIQTOK`.
The report pins artifacts at their original paths; private caches are not shipped
as repository source. Prior evidence and unrelated working changes are preserved.
An initial publication assertion compared pretty-file size with compact-JSON
bytes; its script and failure are retained. Correcting that artifact check did
not change implementation, replay results or the website request.

**Zoom notetaking is not operational.** The classic-Script and scheduling patches
remain source-only proposals; separate SDK execution is still unapproved. Global
window identity, client execution, native media receive/decode, admission, permitted
recording, transcription and delivery remain open. No meeting was joined and no
audio or credential was accessed. Broader website/research and access-challenge
coverage also remain incomplete; this change neither solves nor bypasses CAPTCHAs.
