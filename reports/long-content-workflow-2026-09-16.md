# One-shot large-page content — September 16, 2026

## Delivered

Added `scripts/research-long-content.ts`: one explicit long-profile capture,
followed by strict offline Markdown selection, in one command. This removes the
manual receipt-hashing/replay steps for routine content retrieval without changing
the ordinary 2 MB response limit or retrying a failed request automatically.

```sh
node dist/scripts/research-long-content.js https://www.techradar.com/
```

The output is a bounded JSONL report with Markdown in `replay.extraction.content`.
The selector defaults to `body`; an optional `--selector CSS` must match uniquely.
See `LARGE-PAGE-WORKFLOW.md` for output, failure, ownership and evidence contracts.
This is a workflow improvement using existing native capture/admission/replay
primitives, not a new browser engine or a change to website access controls.

## Fresh actual CLI checks

All four runs execute the actual compiled standalone entry point, not a replacement
HTTP client or mocked response. Each makes one GET, follows zero redirects, retries
zero times and returns `extracted-unverified`/exit0. Native transport metrics report
zero mocked requests. Every body exceeds the ordinary 2 MB ceiling but fits the
explicit unchanged 4 MB long-profile ceiling.

| Exact URL | HTTP | Native decoded bytes | Markdown bytes | Original capture outcome |
| --- | ---: | ---: | ---: | --- |
| https://play.google.com/store/games | 200 | 2707712 | 29951 | empty-extraction |
| https://www.techradar.com/ | 200 | 2317477 | 130896 | extracted-unverified |
| https://www.tomsguide.com/ | 200 | 2826822 | 108532 | extracted-unverified |
| https://www.cnbc.com/ | 200 | 2731494 | 30561 | extracted-unverified |

Google Play uses the canonical final URL from its earlier root capture. Its fresh
heading discovery finds zero entries across 2932 nodes. The new command retains
that original `empty-extraction` outcome and `contentSuccess:false` in `capture`,
then invokes the existing strict empty-outline selector recovery. The separate
replay records `captured-empty-outline-selector`, the original discovery/outcome
and `originalRequestRetried:false`. No headings or successful capture are invented.

The other three use ordinary validated replay. No source prices, current news
claims, linked articles, app installation, purchasing or interactions are verified.
Nonempty output and a zero exit code are not a substantive-content or rendering-
completeness verdict. The companion JSON contains the separate saved-output content
review and its inspection limits.

That review finds useful partial catalogue/editorial-index content on all four,
not complete destination articles. Google Play and CNBC Markdown are read fully;
the longer TechRadar and Tom's Guide outputs are sampled. Google Top charts has
unassociated rank numbers, and CNBC's Most Active/Unusual Volume tables have no
market rows. These missing associations/data remain unresolved; source discovery
is not acceptance of those widgets or financial data.

## Controlled equivalence

Eight isolated processes compare the existing manual capture-plus-replay API
sequence against the new CLI API on four identical pinned historical bodies.
Both variants receive one clearly labeled mocked transport response per page;
native loading, serialization, admission, selectors and extraction execute for
real. Kernel network denial and JavaScript guards record no I/O attempts.

All four pairs match extracted Markdown hashes, original capture outcomes and
recovery provenance exactly. These fixtures use decoded bytes and selected
captured headers, not original wire redirects or all response headers. They are
not the fresh live bodies and do not replace historical measurements. The baseline
already supports the underlying recovery; this change makes that workflow directly
usable without manual orchestration, not a novel content-parsing claim.

## Validation and fixes

- Clean baseline:774 passing tests in9 explicit native-manifest files.
- Clean final candidate:837 passing tests in10 files, including63 new tests.
  Build, selected test types, formatting and lint pass. No full-manifest claim.
- Four additional actual standalone CLI controls under network denial: help exits0;
  missing URL, pseudo-element selector and unknown option each exit64 before any
  network attempt. In-memory CLI tests cover successful and failed exit selection,
  backpressure, cancellation, output-size refusal and caller-owned listeners.
- Static review found preflight/replay selector mismatches, missing failure stage
  metadata for returned empty/barrier outcomes, and a cancellation cleanup leak
  for `emitClose:false` streams. All are fixed and reviewed again.
- Executed release01 also exposes an unsupported-selector error-text leak. Final
  preflight now returns a generic invalid-input error without echoing selector or
  URL details. Its regression passes. The initial Markdown-escaping expectation,
  test-only type errors and lint failures remain archived with their corrections.
- Invalid, ambiguous, missing, empty, HTTP-error, challenge, timeout, resource-limit,
  incomplete and otherwise inadmissible captures/selections do not trigger a retry
  or fallback URL. Existing admission and unfiltered visibility checks remain.

The command leaves caller-owned Writable streams under caller control, including
on cancellation. It removes its own listeners and timer, but does not claim to
force-terminate an arbitrary caller's pending custom write. The standalone CLI
has its own stdout/stderr error handling.

## Safety, provenance and limits

Four live GETs and sixteen audited process groups total:8 saved-body comparisons,
4 live CLI runs and4 help/usage controls. All recorded groups and observed live
request/socket pairs close. Live children have empty HOME/TMP,256 MiB heap,60-second
supervisor deadlines and two-second launch gaps. Native capture retains15-second
transport/20-second navigation deadlines,4 MB response and8 MB total-byte caps,
bounded redirects, and2-second per-origin pacing. Observer checks are diagnostics;
native public-network policy remains the preventive network boundary.

No credentials, page scripts/SafeJS, challenge solving, identity spoofing, alternate
browser/client, form submission, real TTY or passkey access. This does not establish
that CAPTCHA handling, authenticated sites or dynamic rendering work.

The convenience command intentionally exports metadata/hashes and selected content,
not full captured bodies or raw receipts. Its receipt SHA identifies an in-memory
artifact which is discarded; those fresh raw bytes are **not** available for an
independent later replay. For retained full receipts, keep using the documented
manual two-command workflow. The separate historical fixture proofs do retain
their original source pins and must not be mislabeled as fresh-body replay.

Local evidence:
`node_modules/.cache/native-validation/long-content-workflow-september16`.
The JSON report pins checks, runtime manifests, reviews, comparisons and each live
invocation/result/output. The original100-page checklist remains unchanged; this
is not another100-page sweep or a global agent-traffic ranking. Existing uncommitted
work is preserved, no push is performed, and broader goals remain in `TASKS.md`.
