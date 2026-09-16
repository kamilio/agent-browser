# Nested article focus — September 16, 2026

## Implemented

Opt-in `main-content-v3` can refine a unique main landmark to one nonempty article
when no admitted substantive content exists outside article/ancillary ancestry.
It retains ambiguous scopes and outside warnings/text/image alternatives. Local
state shares the existing bounded traversal; no domain/class/text heuristic,
second scan, larger limits, new dependency or default-policy change is added.
V1/v2 and absent-policy extraction remain unchanged. See
`NESTED-ARTICLE-FOCUS.md` for exact rules, metadata and visibility limitations.

The research/link/replay CLIs and native command extraction accept v3. Explicit
default-profile output-limit replay also accepts content focus through the new
`recoverResearchOutputLimitContentFocus` API, using unchanged complete-receipt,
body, original-failure and barrier admission. Recovery preserves original failure,
captured reader policy and no-retry provenance. MIME/text-prefix overrides and
empty-outline focus recovery remain prohibited.

## Real source distinction, not forced success

The original vLLM source capture declares hidden-content semantics disabled. A
source-hidden Back to top button outside the article therefore remains admitted
text, even though its interactive wrapper is unwrapped by the reader. V3 correctly
retains that main and still fails the output budget. No arbitrary button text is
dropped and the old receipt is not rewritten.

Separate source reprocessing with existing explicit `source-hidden-v1` excludes
the authored hidden control. On identical captured bytes, v2 still exceeds the
output limit, while v3 selects the article. This policy distinction is tested
through source loaders, native command/link execution and actual CLI processes.
It is not a CSS/rendered-visibility guarantee or automatic policy change.

## Executed validation

- Final focused checks:2469/0 in36 files on release02; final integration checks:
  3/0 in one file on release06. Their compiled runtime inventories are byte-identical.
  Both have passing build, strict selected-test types, formatting and lint checks.
-155 new cases span nested focus, replay and three integration paths. Red02 on
  old production gives2328/141 across the same36-file selection; red03 gives0/3
  for the final integration file. These include an intentional existing CLI
  contract change; not all new negative cases fail against old production.
- Full native execution:46,488 passed/0 failed, zero pending, across945 available
  files in four isolated shards. Each shard exits0, with all children/groups
  closed and empty isolated HOME/TMP.967 canonical entries retain22 missing files.
- The full wrapper exits1 because its planner expected48,805 tests: it resolved
  an earlier focused report against the wrong protected root and counted2317
  existing cases again. The untouched plan, wrapper result and shard receipts
  remain. `native-full01/COUNT-AUDIT.json` independently uses each report's actual
  root, verifies every file/count/source pin/zero-exit shard, and reconciles46,488.
  This is a separate accepted count audit, not a rewritten successful wrapper run.
-135 pinned saved-body regression pairs retain exact legacy extraction objects,
  structured extraction results, reader/DOM metadata and classifications where
  successful:128 success pairs and7 matching non-HTML failures. No new requests.
- Four additional captured-body policy probes preserve v1/v2 output; the original
  vLLM interpretation still fails, and separately source-hidden v3 matches the
  audited17,451-byte article exactly.
- Eight actual CLI processes run under kernel/JS network denial: four explicitly
  routed source reprocessing commands and four zero-request replay commands.
  V3/source-hidden succeeds directly and through Markdown/JSON recovery. V2 and
  the original default-reader v3 controls retain their failures. All resources
  close; no model examples, SDK or credentials are executed.

All initial failed controls remain. Core01 retains old unknown-v3 assertion and
TypeScript narrowing failures; core03 retains a Unicode/punctuation expectation
failure. Release01's type check exposes11 weak conflict tests whose array rows
were spread incorrectly; final tests pass complete flag arrays instead. The
integration iterations preserve reader-unwrapping and Markdown/entity expectation
errors, including one failed patch followed by an unintended unchanged snapshot
run. Final assertions retain the substantive policy, code, click and cleanup checks.

## Fresh native acceptance

After these gates, one separately scoped anonymous native GET retrieves
`https://docs.vllm.ai/en/stable/serving/online_serving/` at
**2026-09-16T22:49:52.680Z** with v3 plus explicit source-hidden-v1. HTTP200,
one real request/TLS connection, no redirects/retries/cookies/credentials/scripts.
A same-command synthetic control runs first under kernel/JS network denial.
The tested protected release06 candidate is built from41d52e4 plus only owned
changes; it is not yet committed at the time of this request.

The636,652 decoded/49,181 encoded bytes have the same SHA-256 as the earlier real
capture: `52e20035779c0d9b63a95eb5bb49929a5a2bf1db6dcc1f75e5d799288ef88830`.
Fresh automatically selected Markdown is byte-identical to the previously
independently audited17,451-byte article:28 heading labels and3 literal pre blocks.
V3 scans29,556 nodes within the existing bound and records unique-article-in-main.
The native outcome remains extracted-unverified/contentSuccess:null; source
facts are not independently verified. Full CLI output is872,782 bytes because
body capture is included. No transfer saving or general speedup is claimed.

## Review and remaining work

Static review finds no blocking production/admission defect. Its concrete reader-
policy and command/link coverage gaps are addressed by the final three integration
cases; all three new files are included in the tested canonical manifest. The
default broad-reader vLLM interpretation still fails without explicit scope/policy.
This is improved optional retrieval, not universally reliable article discovery.

Historical100-entry33 useful/67 other verdicts remain unchanged. Dynamic/SafeJS
scheduling, full rendering, crawler/access/CAPTCHA handling, real password providers,
passkeys/authenticators/devices, missing manifest files and unfinished research
remain separate gates. The overall browser goal stays active.

Evidence: `node_modules/.cache/native-validation/nested-article-focus-september16/`.
Cache receipts preserve complete captures and failed attempts; this committed
report is not a portable full-response archive. Prior42 dirty tracked files and
697 untracked files are preserved separately from the focused change.
