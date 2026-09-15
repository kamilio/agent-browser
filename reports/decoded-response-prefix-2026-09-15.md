# Failed decoded-response prefix — September 15, 2026

## Scope and result

The original citation-proxy corpus already attempted **100/100 selected entry
URLs**; its complete matrix remains in `reports/agent-citation-pages-2026-09-15.md`.
This follow-up is **not** a new 100-page sweep or a global ranking of agent visits.
It addresses the oversized advertised WhoWhatWear feed observed in the later feed
run without increasing the existing network ceilings.

New default-off Node option `captureDecodedPrefixBytes` and transport-local
`responsePrefix(error)` retain a bounded raw prefix on a genuine decoded-response
overflow. The public request still rejects. Returned byte copies and frozen
response-hop metadata stay separate from successful responses, caches, document
loaders and complete-body replay. Close discards lookups. Contract:
`RESPONSE-PREFIX.md`.

## Fresh native evidence

Target: `https://www.whowhatwear.com/feeds.xml`, from its previously advertised
feed link. Two explicitly scoped attempts used the same clean release04 runtime:

| Attempt | Started UTC | Observation | Prefix |
| --- | --- | --- | --- |
| Initial | 2026-09-15T18:39:19.217Z | Observer rejected the DNS-pinned IP instead of checking HTTP Host; no response observed | None |
| Corrected host guard | 2026-09-15T18:40:05.412Z | HTTP200 headers, then original decoded-byte overflow | 65,536 bytes |

**Two request-start events, one guard-denied attempt, one response-bearing GET,
zero redirects.** Both requests, observed sockets, children and process groups
close. No automatic retry, credentials, account interaction, SDK, scripts,
challenge solving, other browser or alternative fetch client. The initial guard
mistake is retained and is not classified as a website block or as no network.

The corrected attempt observes Brotli/XML, encoded bytes **266142**,
and decoded bytes **2015232** against the unchanged **2,000,000-byte**
response ceiling. It still reports `resource-limit / network.response-decoded`;
`contentSuccess` stays false, complete response/navigation are null, and the
document loader is never called. Prefix lookup is unavailable after close.
Compressed trailer integrity and remaining response content are not verified.

Retained prefix SHA-256:
`aa3100ff9b09c9926a3c51c17637e627ab8c3b219bf08e09a967e734990ea7dd`.
Hash scope is incomplete transport-decoded prefix, not full response body.
UTF-8 streaming decode with no final flush yields 65527 code units /
65,536 bytes; it is not XML or HTML parsing.

Lexical markers and first/middle/end/embedded-body samples show two item starts,
one item close, and descriptive article/product prose about patterned sneakers
in the first apparent item. The second includes shoe/product content and is cut
inside its embedded article body. This is **useful literal source**, not validated
full-feed or full-article recovery. Raw bytes remain private evidence, not a
committed body export; only hashes, bounded measurements and review are published.

## Native regression and review

- Clean parent: `ad499c66b5de47a27b8584bcd3948b0a03cf83d2`; only the owned transport change and new test
  overlay are included. Dirty working-tree runtime is not used.
- Baseline: **811 passed / 2 failed in 11 explicit native files**. Candidate:
  **871 passed / the same 2 failed in 12 files**; all **60 new tests pass**.
- Build, selected-test types, format and lint pass. This is not a full-manifest,
  passkey, socket-server, TTY or SafeJS acceptance run.
- The two unchanged failures are research-body-capture's unscoped post-extraction
  barrier cases, reader false/true. No unrelated fix or exclusion hides them.
- Tests cover bounds/codecs/accounting, identity and copied-byte ownership,
  redirect-hop context, cache exclusion and cancellation. Review found two real
  ordering gaps: coupled request errors during pipeline teardown, and cancellation
  between consumption and public settlement. The exact-error deferral and staged
  publication fixes retain the original failure. A pre-fix targeted reproduction
  records one failure/one pass, then both cases pass in the final suite.
- Earlier candidate results are retained: four incorrect abort/cache test
  assertions or fixtures, then one missing Date header in the cache fixture.
  Corrections change tests, not existing abort/cache semantics.

## Remaining limits

The option is host-side and off by default; it does not silently feed incomplete
bytes into research extraction. Header/URL disclosure requires explicit research
sanitization. Parser-safe fragment admission and agent-facing bounded content
workflows remain separate work. Encoded/identity oversize responses, timeouts,
session/accounting failures and barriers are not recovered. The original missing
GooglePlay/TechRadar/CNBC/Tom'sGuide/Comparor bodies, wider functionality, interactive
controls/passkeys and the SafeJS acceptance gates remain outstanding.

## Evidence

Private lane: `node_modules/.cache/native-validation/decoded-prefix-september15`.
The adjacent JSON pins validation, scopes, reviews, both live attempts and prefix
artifacts. Initial failures remain in their original paths. Preserve the original
42 dirty tracked and697 untracked files; commit only owned changes, no push.
