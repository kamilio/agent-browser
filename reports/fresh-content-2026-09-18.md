# Fresh native content and escaped-label fix — September 18, 2026

## Fresh website results

Three separately scoped anonymous native GETs ran at **03:35 UTC on September 18**.
Each returned HTTP 200 with useful content, no reported access/CAPTCHA barrier,
one observed TLS request and clean document/session/transport/process shutdown.
There were no redirects, retries, credentials, scripts, subresources or fallback
browsers. Synthetic zero-network route proofs preceded the individual live runs.

| Page | Captured HTML bytes | Full Markdown bytes | Focused Markdown bytes |
| --- | ---: | ---: | ---: |
| MDN — Response.arrayBuffer | 156,303 | 23,199 | 8,798 |
| Wikipedia — Benchmark (computing) | 211,735 | 67,049 | 58,802 |
| Hacker News front page | 34,053 | 33,172 | 26,490 |

Task-level checks go beyond HTTP status/nonempty text:

- **MDN:** method description, return value, exceptions, worker qualification and
  all five code blocks survive unchanged in the focused output.
- **Wikipedia:** definition, five relevant sections, strengths/limitations and
  the outdated-source maintenance notice survive. Article claims were not
  independently fact-checked and citations were not followed.
- **Hacker News:** all 30 title/destination pairs preserve order. All 29 scored
  entries retain their score text; the unscored job also lacks a score in source.
  Manual source review confirms author/comment-link association. Voting controls
  are not preserved or tested by this reading workflow.

The existing `main-content-v3` and `--compact-tables` options are then exercised
through the actual offline replay CLI, with no refetch. They reduce output bytes
by **62.1%, 12.3% and 20.1%**, respectively. MDN/Wikipedia select their unique main
landmark; Hacker News correctly falls back to the document rather than inventing
an article boundary. This measures output reduction, not faster network loading.

## Bug found and fixed

Cross-checking story links exposed a genuine source-discovery gap: ordinary
escaped punctuation in a literal Markdown label caused the candidate to be
omitted. One captured headline contained `Near\-Lossless`; the original HTML and
both Markdown outputs had preserved it, but the source-link scanner skipped it.

The scanner now treats a backslash plus ASCII punctuation inside a link label as
one non-structural pair. Escaped brackets/backticks do not change nesting/code
state. **Labels remain literal source, including backslashes.** No Markdown
rendering, entity decoding, URL escape handling, unsafe URL admission, network
access or resource-limit increase is added. Existing code/HTML exclusions remain.

The patched native scanner recovers all 30 original headline/destination pairs
from both saved Markdown outputs. An integration regression verifies source-only
document discovery without creating DOM anchors or modifying source extraction.

## Validation

- Pre-live content pipeline: **1,293 passed / 0 failed in 16 native files**.
- Offline focus/replay pipeline: **775 passed / 0 failed in 9 native files**.
- New escaped-label checks against baseline production: **865 passed / 87 failed
  in 10 files**. Preserve this reproducer; failures are confined to the new or
  deliberately changed escaped-label expectations.
- Final parser candidate: **952 passed / 0 failed in 10 files**, including
  **133 new scanner cases** plus one new document integration regression.
  Build, types, format and lint pass. Initial candidate lint caught a test variable
  shadowing `escape`; the renamed test and final qualification are preserved.
- The first two offline content-verifier failures were verifier mistakes: a
  capitalized mid-sentence phrase, then an expectation for a removed navigation
  link instead of the retained article heading. Both originals remain. The third
  failure exposed the scanner gap; final verification passes after the real fix
  and the correct literal-label comparison. No failure caused a website retry.

These are selected suites, not a full-suite pass. Live GETs used committed
`94dfd04`; the parser change was subsequently qualified and checked against those
unchanged captures, not refetched. Final candidate has **1,685 source pins and
2,504 compiled pins**. Source, runtime, harness, body and receipt pins are checked;
native/live/replay processes and groups are gone afterward. Their private HOME/TMP
directories are empty. Quality tools retain only their reported cache entries.

## Evidence and remaining work

Evidence phases:

- `node_modules/.cache/native-validation/fresh-content-september18`
- `node_modules/.cache/native-validation/markdown-label-escapes-september18`

Original captures and replay outputs remain under
`/tmp/agent-browser-fresh-content-2sliGg`, with original-path/hash archives in the
fresh-content phase. The JSON companion records exact URLs, times, hashes, scoped
authorization, supervisors, content checks and final qualification. Historical
website inventories and the old 100-page corpus counts are unchanged.

The first captured Hacker News story supplies a source link titled “Astra for
Law” to an OpenAI page. It is a useful **unfollowed research candidate**, not proof
about a model, Twitter chatter or the linked article's contents. No story,
comment, login or voting link was followed in this batch.

No CAPTCHA occurred here, so this does not prove challenge handling or avoidance
elsewhere. Script-driven interaction, broader 100-site coverage, original
research, actual SafeJS gates, Zoom/WebRTC/audio/notetaking and real credential/
passkey gates remain open. No default-runtime switch or push. The full browser
objective remains active.
