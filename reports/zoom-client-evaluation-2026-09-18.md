# Native Zoom client evaluation and scheduler proposal

September 18, 2026. **The actual browser-client HTML is captured, but no meeting
is joined.** No audio, recording, transcript or summary delivery is demonstrated.
This continues the discovery checkpoint without rewriting its earlier evidence.

## Actual native requests

Three bounded anonymous GETs used the existing qualified native browser. This
means two distinct query-bearing URLs, with one intentional diagnostic repeat of
the first URL—not three websites and not an automatic retry loop.

| Request | Native observation | Outcome |
| --- | --- | --- |
| Initial `quora.zoom.us/wc/join/7982110526` client route, forced error-on-redirect | HTTP observer sees 302; transport rejects under the explicitly restricted probe policy | Exit 1, `redirect-mode-error`, no captured body or Markdown |
| Same exact client route, separately scoped manual mode | 302 at 06:41:20.517 UTC; available cross-origin Location handoff | Exit 1, `http-failure`, zero body/Markdown, empty-response loader unsupported |
| Exact private Location target at `app.zoom.us/wc/join/7982110526` | 200 at 06:45:04.516 UTC; 71,193 complete HTML bytes | Exit 0, 48 Markdown bytes, `extracted-unverified` |

All query values remain private. These displayed paths are descriptions, not
replacement navigation targets. The exact targets are resolved from pinned
task-owned constants inside the host process; query-bearing URLs are not placed
in OS arguments or public HTTP request-path logs. Private captures still need
appropriate handling; this is not a general credential-redaction guarantee.

**Correction:** the production native transport already defaults to following
redirects with its existing checks. The first probe deliberately overrode that
with error-on-redirect. Its failure is a harness restriction, not a production
redirect bug. No change to the default policy is needed or made here. The second
request now supplies real 302 evidence for the previously added manual-handoff
diagnostic; the earlier 404-only check remains unchanged.

The app client's entire extracted text is the message that JavaScript must be
enabled. This is a noscript shell, **not usable meeting UI or successful content
recovery**. An exit-zero extraction is not Zoom compatibility. Each lane closes
its request, document, session, child and process group. No page scripts, SDK,
subresources, authentication, meeting actions or device APIs run.

## Captured client structure

Offline native parsing and compiler syntax inspection find eleven script
elements: nine inline and two external, with zero inline syntax errors. There
are four link elements, zero anchors and 48 hidden inputs whose values are not
read. The two external scripts are fingerprinting/experiment assets; neither is
fetched or executed. CSS, manifest and icon links are also not fetched.

Inline source contains paths for `externals.0.min.js`, `pwa-webim.js`, `vendors.js`,
`main.js` and a video-background preload. A separate source trace establishes that
the loader concatenates those paths with an initial `https://st1.zoom.us` base
or the backup `https://us01st-cf.zoom.us`, not the document origin. The five
scripts are appended sequentially after CDN selection, with `async` disabled.
These ten possible asset URLs are source-derived candidates, not observed loads.

The helper has image-based CDN detection, cached-domain and fallback branches;
the cached-domain branch alone does not demonstrate script dispatch. Script
load rejection does not establish an automatic alternate-CDN retry, and this
helper supplies no script-load timeout. Actual branch selection, event delivery
and execution remain unverified. The generic initial inventory's document-origin
resolutions are retained as historical observations, not used as fetch targets.
Missing media identifiers in this shell do not establish what the unfetched
executable client requires. Captured versions are not latest-release claims.

## Proposed scheduler correction

The source proposal in `contributions/safejs-browser-scheduling/README.md` adds
an explicit public `callbackScheduling: "after-prefix"` construction option to
an isolated copy of the pinned local SafeJS source. It separates callback tails
from source ownership, retains the real synchronous-prefix boundary, and adds
conservative lifetime accounting and cleanup coverage. Default overlap denial
is retained. No installed SDK or production browser adapter is changed.

Independent source review found a concrete defect in the initial proposal:
opt-in callbacks could report success despite an unhandled guest rejection,
without triggering cleanup. That finding and the ensuing correction are kept
separate from runtime evidence. Authored tests do not demonstrate a passing
scheduler, bounded cleanup or regression-free default behavior.

The accompanying JSON records the final source-review disposition and exact
static-check outcomes. Preliminary semantic runs are preserved: the first had
compiler-host type-resolution errors; the corrected second found ten shared
missing-generated-Intl/type diagnostics, plus seven expected old-API diagnostics
in the baseline with new tests. Those were not SDK executions or passing checks.
The final comparison uses fresh snapshots and pinned existing type declarations,
not generated JavaScript execution, dependency installation or changed history.
The targeted unmodified source and first corrected candidate have zero semantic
errors; adding that revision's new tests to old source produces nine absent-new-API
diagnostics. That candidate checks seven TypeScript roots and 594 resolved files.
A subsequent source review finds that its callback checkpoint can prematurely
report an unfinished source's rejection. Revision two adds operation attribution:
ordinary checks exclude other active owners but retain completed-owner late
rejections, while fatal budget/reentry errors remain realm-wide. No waiting for
other owners is added. A test-only constructor-overload diagnostic is then fixed
without changing implementation or assertions; its failed check is preserved.

The fresh revision-two targeted check has zero candidate errors across nine
TypeScript roots and 595 resolved files. Unmodified source also checks cleanly;
old source plus the three new test files has 55 new-contract diagnostics. No SDK
or test body runs. Independent review then identifies resumed-generator work
retaining a prior resumer's rejection owner. Revision three refreshes attribution
at explicit frame resumption while preserving independent jobs/reactions and
already registered promise ownership. Five more regressions are authored.

The fresh revision-three candidate checks cleanly across ten TypeScript roots
and 595 resolved files; baseline source has zero errors and old source with new
tests has 72 unavailable-contract diagnostics. The parent verifies the patch
exactly matches the candidate diff and the checked source roots. The JSON links
each independent review rather than claiming blanket source approval. None of
these compiler/source checks is a full build or runtime test pass.

The latest focused source review finds the exact generator counterexample
corrected and no definite new defect in that delta. It explicitly does not
approve the entire scheduler or establish passing runtime behavior.

## Remaining execution gates

- Qualify the reviewed SDK candidate through separately approved isolated runtime
  tests; then explicitly opt in a staged browser adapter and preserve all
  nineteen core expectations, including ordinal12's later-source success.
- Keep the ten page-extension and seven module checks separate. The historical
  released-SDK result remains eleven core passes followed by the ordinal12
  callback-overlap failure; it is not overwritten by this proposal.
- Execute the actual client through supported native/SafeJS interfaces, with
  evidence for resource loading and application behavior—not static symbol counts.
- Implement and verify actual native realtime meeting-media reception and decode.
  Existing WebSocket and decoded-PCM primitives do not supply a working Zoom
  media stack or automations-compatible notetaker by themselves.
- Verify legitimate host admission, permitted recording, transcription and
  summary delivery. Credential/passkey and broader browser/research gates remain
  open; no alternate browser engine or access-control bypass is used.

The reused native runtime has 817 passing selected tests in nine files and green
quality checks from its earlier qualification, not a new suite run here. No
full-suite, actual SDK, media, vault/device or notetaker success is claimed. The
precise next proposed isolated scope is in
`contributions/safejs-browser-scheduling/QUALIFICATION.md`.
