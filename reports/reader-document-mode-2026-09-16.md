# Reader document-mode preservation — September 16, 2026

## Change

Retain the effective initial doctype's exact normalized source span. Original
token eligibility prevents later declarations from being promoted across removed
script/style/link/hidden content. Missing, malformed, quirks and limited-quirks
inputs keep their actual mode; no unconditional HTML5 prefix or parser override.
See RESEARCH-DOCUMENT-MODE.md for BOM, counter and structured-output semantics.

The root cause is demonstrated by a minimal saved-runtime fixture: native HTML5
parsing closes a paragraph before a table; the old reader drops the declaration,
enters quirks and leaves the table in that paragraph. Existing Markdown validation
then correctly refuses the structure. The fix preserves mode instead of weakening
table validation, increasing budgets, adding dependencies or executing page code.

## Executed validation

- Final release02:4,756 passes/0 failures in57 selected native files. All116 new
  cases run against the prior reader with46 passes/70 failures. Build, strict
  selected-test types, formatting and lint pass.
- Full02:45,991 passes/0 failures in935 available committed manifest files,
  593.231 seconds.957 entries still include22 missing
  committed files; this is not full-manifest, actual SDK or device acceptance.
- Independent source review finds no blocking defect. It identifies nonblocking
  coverage additions for quota cleanup, combined source-offset/raw capture and
  malformed non-force-quirks tails; those are not described as executed tests.
- Initial BOM/lint failures and two replay verifier mistakes remain recorded in
  their original paths. EXECUTION-NOTES.md explains each correction without
  rewriting evidence or changing production code to satisfy a mistaken assertion.

## Saved responses and live recovery

124 pinned responses give120 prior successful pairs, three matching non-HTML
failures and one recovered Node page. All prior Markdown and serialized HTML
element trees remain identical. Normalization is limited to opaque refs and the
explicit doctype effects: one revision/scanned node, retained output/omission
counters, and the exact new direct-root empty doctype container.

115 successful pairs gain a doctype.39 successful structured document roots
include its existing empty-container representation; selected main/article roots
do not. These are actual accounting/shape changes, not byte-identical structured
output. No unknown extraction-field difference is ignored.

One fresh native CLI GET returns the same857,597-byte Node body as the original
failed retrieval and yields222,068 Markdown bytes,45 table pairs and99 fenced
blocks with no text-prefix fallback. Complete extraction matches saved-body API
replay after only opaque-ref normalization. Whole structured Node output remains
over its budget. See reports/node-stream-recovery-2026-09-16.md and JSON.

An actual native CLI saved-body section check retrieves the pipeline API as36,937
JSON bytes/699 nodes without another GET. Both selected code blocks exactly match
full Markdown. Its original summary used an absent section field; SECTION-AUDIT
checks the authoritative sectionSelection and exact node/code relationships.

## Measured reader cost

Warm in-process decode/sanitize/parse/Markdown extraction,20 timed samples per
version/page after four warmups, alternating versions. No page execution,
networking, cold module startup, forced GC or cleanup time; six convenience pages.
The broad native process had terminated before this benchmark started.

| Saved page | Baseline median ms | Candidate median ms |
| --- | ---: | ---: |
| developer-mdn | 26.106 | 25.911 |
| reference-rust | 9.876 | 9.974 |
| reference-postgresql | 12.224 | 12.550 |
| reference-rust-future-trait | 7.251 | 7.425 |
| reference-reqwest-crate | 16.934 | 17.308 |
| reference-go-generics | 10.405 | 10.615 |

Small mixed differences do not establish a general speedup or regression. This
is primarily a content-correctness fix, not a browser performance claim.

## Preservation and open goal

Baseline:c5d7d3ee37a2a48c95f3826565fc76639f72e6b8. Two owned source/test files plus one canonical manifest
append are tested in a protected committed checkout.42 prior tracked edits and
697 untracked files remain outside the commit; TASKS/manifest use canonical blobs
while preserving working-only changes. No push is claimed.

All recorded validation/live children and groups close, with no timeout or
cleanup signal and empty HOME/TMP. Native JS-level guards, kernel-denied offline
checks and observed public HTTPS checks remain distinct scopes. SafeJS callback
admission, dynamic sites, access/CAPTCHA handling, rendering, real credentials/
passkeys/devices/TTY and unfinished research remain open; goal is not complete.

Evidence:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/reader-document-mode-september16. Sealed495 files,96273091 bytes;
inventory SHA-256:f8acc7b1bcd24bb752ad438d6bde301247baa39c3dea4aa1fd6e15fb117f0d06.
