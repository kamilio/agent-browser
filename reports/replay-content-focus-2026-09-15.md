# Replay content focus — September 15 captures

## What changed

Ordinary complete-capture replay now supports `--content-focus main-content-v1`
and optional `--output-limit-policy text-prefix-v1`. The API exposes the same
selection properties. Focus reuses the core unique-main/article/document policy;
plain-text fallback reuses the existing bounded core extractor. No second policy
algorithm, transport-prefix admission, dependency or browser engine was added.

The output policy also supports ordinary HTML selector/section replay. It requires
Markdown; links, literal-text/headings and named recovery workflows reject it.
Invalid or explicitly undefined policy values reject without coercion. Default
strict extraction and source visibility/barrier checks remain unchanged. The
report records the requested policy even when rich Markdown fits and no fallback
is necessary. Contract and invocation: `REPLAY-CONTENT-FOCUS.md`.

## Native capture and actual CLI results

The earlier default Wikipedia article request failed at the 2MB response bound.
A separate explicit `long-v1` native CLI capture on **September 15, 2026** used the
existing 4MB ceiling and returned **2,266,381 decoded bytes, HTTP200 and 68 headings**.
The exact source-linked URL is `https://en.wikipedia.org/wiki/Wikipedia`.
It made one GET, without redirects, credentials, page scripts or challenge solving.
This does not change the default cap or retrospectively upgrade the failed record.

Capture runtime was clean committed `69be4f2b7a4e51cc77534a1bb21f0a871ad5cc73`, matching all 1,500
committed runtime source/script/config inputs and sealed compiled hashes. New
replay changes were not used to acquire the website. Replay candidate release03
uses a clean archive of that commit plus the four pinned source/test overlays.

Three actual compiled replay CLI children read complete receipt stdin with
supervisor-supplied profile, receipt SHA256 and body byte-count/SHA256 pins:

| Captured source | Profile | Focused Markdown bytes | Fallback |
| --- | --- | ---: | --- |
| Wikipedia article | long-v1 | 231,283 | Indented plain text |
| CNET cellular-home-internet article | default | 26,686 | None; rich Markdown |
| RunRepeat Brooks Revel 9 review | default | 19,688 | None; rich Markdown |

CNET/RunRepeat are **saved complete captures from the earlier review-content-tasks
run**, not new website requests. Each replay CLI ran under kernel socket denial
and a JavaScript network/process guard; all guards recorded zero attempts.
The adjacent JSON retains exact URLs, source/body/result hashes and timestamps.

## Why the fallback matters

The complete Wikipedia capture still exceeds the unchanged **256,000-byte rich
Markdown extraction limit**, even with main-content focus. The explicit fallback
retains **all 218,129 selected source UTF-16 units** in 231,283 Markdown bytes,
with `contentFallback.representation = "indented-plain-text"` and
`truncated = false`. Its original rich-output trigger records 256,160 observed
bytes against 256,000. This is loss of rich representation, **not** an incomplete
HTTP body or a claim that a rendered article was fully reproduced.

The selected text includes substantive lead/history material as well as infobox
and navigation material. Review sampled those sections; it did not independently
verify every statement or read all 2,574 decoded output lines. Automatic landmark
selection is not a content-quality detector. Existing source/visibility omissions
and partial-source qualifications remain in force.

The two smaller controls use focus without needing fallback. Candidate ordinary
body selection remains byte-identical to baseline where it succeeds and preserves
the same Wikipedia strict failure. Focused candidate outputs match the existing
core extractor's content, title, focus and fallback metadata on the same bytes.
These are wiring/equivalence checks, not independent factual verification.

## Validation and evidence limits

- Clean selected baseline: **811 passed**, nine native-manifest files.
- Final candidate: **875 passed, zero failed**, eleven files; **64 new cases**.
- Old production with identical final new tests: **25 passed/39 expected failures**
  across the two new files; old type declarations also reject new selection fields.
- Build, strict selected types, formatting and changed-file lint all pass.
- No full-manifest or actual SafeJS/SDK acceptance is claimed.

Initial archives retain a bad test import, overload-union type errors, and later
incorrect unescaped Markdown expectations. An 843/0 count with an unregistered
failed test suite was not accepted as success. No production changes were needed
to fix those test failures. Large immutable-byte
checks now use hashes rather than recursive typed-array equality. Final red03 and
release03 use identical test bytes; all prior attempts remain available.

The capture and five offline inspection/API/CLI child groups were reaped. Its
request/socket closed and capture metrics show no active requests. Four direct
tree close calls were made by inspection/core controls. API comparison records
observed unique close calls; internal CLI allocations were not independently
counted, so these are not presented as a complete allocation census. Source and
compiled pins were rechecked after the runs.

Existing capture ceilings remain 2MB/default and 4MB/long-v1. Extraction stays 256KB
and replay serialization 327,680 bytes. Partial/failed/blocked receipts, bad pins,
unsupported MIME, other resource failures and source barriers remain failures.
Named empty-outline/output-limit recovery keeps its explicit selector/section
contracts. No credentials, page scripts, alternate browser, cap increases,
automatic retry, CAPTCHA bypass or push. Overall browser improvement remains open.
