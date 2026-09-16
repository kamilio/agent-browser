# Maintained native reader link-content validation

## Outcome

The browser now has a maintained source-to-article command at
`scripts/research-link-content.ts`, documented in `RESEARCH-LINK-CONTENT.md`.
It selects one exact same-origin public hyperlink, performs a native click,
extracts the destination and writes bounded JSONL. It never substitutes direct
navigation for a failed click. Nonempty output remains `extracted-unverified`,
`contentSuccess: null`, with explicit partial-reader metadata.

The clean release02 candidate uses parent commit
`9c773175ed6f21ea23a572f1810994e5152cfbb9` plus the new command and tests.
All1514 inherited source/script/config inputs match that commit; the source and
compiled manifests identify the exact candidate. Unrelated dirty runtime files
are not used. This is not a full-tree or full-manifest validation claim.

## Offline validation and discovered fixes

| Gate | Result | Scope |
| --- | --- | --- |
| Baseline native | 491passed,0failed | Seven explicit existing manifest files |
| Final native | 618passed,0failed | Same seven files plus127 new cases |
| Exact pre-fix control | 107passed,20failed | Final behavioral tests against the pre-fix command |
| Final build/types/format/scoped lint | All exit0 | Clean candidate; formatting/lint only the two new code files |
| Saved-source replay | Three workflows pass | Six explicitly mocked native responses, zero new live requests |
| Actual CLI controls | Five pass | Help and four invalid-input cases; kernel-denied network |
| Independent final review | No remaining blockers | Static review, not execution or authorization |

The review found C1 controls accepted in URL spelling and output error guards
removed too early after cancellation with a write still pending. The fix rejects
U+007F through U+009F while retaining ordinary Unicode paths, and gives pending
writes their own error/close guard lifetime. Late callback failures are tested
with and without pre-existing caller error listeners. Cancellation clears the
command timer and caller signal listener but cannot retract accepted bytes.
Never-acknowledging, never-closing streams can retain the per-write guards;
the command never ends or destroys its caller's stream.

The20 pre-fix failures comprise six control-character cases, twelve new pending
write cases and two adjusted pending-write ownership assertions. The remaining
107 cases pass, including two ordinary-Unicode controls. No unhandled late error
is needed to demonstrate the old failure: tests check retained guards first.
Earlier core lint findings and release01 type/format failures remain recorded;
they are not rewritten as successful final runs.

Final saved-source replays reproduce all previously reviewed Markdown bytes:
CNET20676, Engineerfix10610 and Reviewed19255. These exercise the maintained
runner API and real native reader/selection/click/extraction/output over mocked
transport. They are not fresh websites or actual CLI-main execution. The five
separate actual CLI controls cover help, missing target, cross-origin target,
invalid selector and synthetic userinfo refusal without disclosing its sentinel.

## Separate live command check

On September16,2026, from08:40:53.053933UTC through the observed process exit at
08:40:55.291UTC, the compiled release02 CLI executes one CNET homepage-to-Shenzhen
article workflow. The supervised process duration is2.268seconds, including
two-second request pacing; this one observation is not a general speed benchmark.

- Two native HTTPS GETs return200, with454430 source and283511 target decoded
  bytes. The source homepage differs from the previous capture.
- One eligible exact-target anchor is selected. Native events are
  `mousedown`, `mouseup`, `click`; two navigations commit.
- Output contains20676 Markdown bytes, SHA256
  `7e5a88949e390fe923236f9118dd12725eac144bbf87cb4dc770a8749e560b8b`.
  Target body and extracted Markdown match the previous live capture exactly.
- Beginning and tail were sampled again; the existing sampled article review
  applies to byte-identical content. The article is retrievable, but facts are
  not verified and unrelated navigation remains at the end. The native result
  is deliberately not relabeled as an automatic content-quality pass.
- Both requests/sockets, both retained documents, browser/transport and child
  process group close. HOME/TMP remain empty. No retries, redirects, credentials,
  page scripts, SafeJS, challenge solver, alternate client or real TTY/PTY.

The bounded live plan applies the user's existing public-site testing request.
Input/evidence hashes bind it to final review, passing checks and the actual
source/compiled candidate. Static review alone does not authorize live activity.
Raw live response bodies are not exported by this command; reports retain body
hashes, lengths, extracted content and observed request lifecycle instead.

## The100-entry corpus remains separate

`reports/agent-citation-revalidation-v2.md` contains every URL and verdict from
the earlier September16 run:100 unique native navigations,108 GETs,96 complete
captures and zero retries. The offline audit in this lane rechecks all100 review
records and668 saved artifacts against their hashes; it makes no new requests.
The original result remains33 useful,19 navigation-only,23 consent/access,
3 login-required,6 empty,8 HTTP errors,2 transport failures and6 other failures.

This is a citation-derived100-host entry-page proxy, not established global
page-level agent visit telemetry. Deep article workflows must not be added to
the root-page success count or used to revise historical measurements.

## Remaining gates and evidence

Reader projection intentionally omits some raw-source attributes and scripts;
a native projected hyperlink click is not original-source behavior equivalence.
CNET full-source CSS/layout recovery, general rendering, authenticated access,
passkeys, actual SafeJS compatibility and real-input validation remain separate.
Access restrictions stop the workflow rather than triggering bypass attempts.

Machine-readable measurements and evidence hashes are in the adjacent JSON.
Local evidence lane:
`node_modules/.cache/native-validation/research-link-command-september16`.
Original work and historical reports are preserved. No push is performed.
The overall browser-improvement goal remains active in `TASKS.md`.
