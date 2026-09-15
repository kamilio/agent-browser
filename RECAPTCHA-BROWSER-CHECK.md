# Browser-check interstitial diagnostics

The shared native challenge classifier recognizes the exact normalized title
`Checking your browser - reCAPTCHA` when it is paired with an existing bounded
challenge-text marker. The research workflow and captured-response replay no
longer present the observed interstitial as ordinary extracted content.

This is detection and handoff, not challenge solving, identity impersonation,
automatic continuation or access to protected content. It adds no dependency,
option, provider enum or resource-limit increase.

## Contract

- Existing HTML/status gates and confirmed `cf-mitigated` header priority stay
  unchanged. A title or body marker alone is insufficient.
- Titles remain bounded to 256 code units and diagnostic text to 8,192. Existing
  truncation and word-boundary checks remain; a truncated match is not invented.
- Case and whitespace use the existing normalization. Other titles, suffixes,
  documentation mentions and unsupported MIME types do not gain this match.
- The HTML-only diagnosis is `kind: challenge`, `provider: unspecified`,
  `confidence: possible`, with `html-challenge-markers` evidence and
  `stop-and-request-user-handoff` action. A title does not prove vendor identity.
- Research output becomes `semantic-barrier` with `contentSuccess: false` and
  no extraction. Captured replay skips selection/extraction and returns the
  established CLI status 1 with a structured report, not an unhandled exception.

This is one verified interstitial shape, not universal CAPTCHA recognition.
JavaScript-required, compatibility, login and empty application shells still need
separate handling. The lower-level loader and extractor are not disabled merely
because an interstitial's text can be loaded.

## Saved-page proof

The September 15, 2026 top-100 sweep's rank-18 `https://linkedin.com/` response
was HTTP 200 with 21,220 decoded bytes. Its historical receipt remains
`extracted-unverified`, with 184 bytes of interstitial text and no diagnosed
barrier. That historical result is preserved rather than rewritten.

Fresh offline baseline and candidate children use the exact pinned capture:

| Path | Baseline | Candidate |
| --- | --- | --- |
| Native research API, captured response injected | 184-byte unverified extraction | Challenge handoff, no extraction |
| Actual captured-replay CLI, `--selector body --format markdown` | Exit 0, 184-byte extraction | Exit 1, structured challenge handoff |
| Captured Zoom response control, injected API | 29,997-byte unverified extraction | Same bytes and SHA-256 |

Two actual CLI children and two injected-response API children run under the
socket-denying kernel/preload guards, with no page scripts, credentials or new
HTTP requests. The API children receive two captured responses each; they are
not real transport tests. No offered continuation is followed. Process and
transport cleanup checks pass; original receipts and frozen source/build pins
remain unchanged. This is offline validation, not a fresh LinkedIn or Zoom visit.

## Tests and remaining failures

Baseline: **1,210 passed / 2 failed across 16 selected native files**.
Candidate: **1,247 passed / 2 failed across 17 selected native files**.
All **37 new tests pass**, and all 1,212 prior case statuses match exactly.
The two unchanged failures are the older `research-body-capture.test.ts` cases
named `retains unscoped capture and post-extraction barrier classification`, one
with `reader=false` and one with `reader=true`. They still assert extraction
content where the existing workflow already stops before extraction. They were
not repaired as part of this classifier change; this is not a green full release.

Build, strict types, format and lint pass. Only `browser-challenges.js` and its
source map change in production compilation. The canonical native test list gains
one explicit entry, bringing it to 859 files; only the selected 17 are run here.

## Evidence

Results: `reports/recaptcha-diagnostic-2026-09-15.json`.
Durable lane: `node_modules/.cache/native-validation/recaptcha-diagnostic-september15/`.
Original lane: `/dev/shm/agent-browser-recaptcha-diagnostic-september15/`.
Original paths and measurements remain in the evidence after copying.

LinkedIn receipt SHA-256: `24c081a6f67ccb413dc24d59c9779dcf7f46f3b1b074814409bb519c67aa2978`.
LinkedIn body SHA-256: `20ce0ad3b2719c7b81bf1d3f188b50f38f9cb08d2d3f2c61e64139368355abbb`.
Unchanged Zoom Markdown SHA-256: `9aebf29205b47e3aa9f9ed17bd75efd6c498a63a82bbe530ee47aa8923fbbb7e`.
