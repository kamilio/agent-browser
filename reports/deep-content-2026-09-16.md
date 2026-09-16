# Native deep-article validation — September 16, 2026

## Scope and visits

Three exact article/review links were followed from prior native homepage captures
classified as navigation-only. These are deeper destinations, not replacements
for the historical100-entry corpus or a new agent-popularity ranking.

- businessinsider: https://www.businessinsider.com/jacob-coxon-explains-disagreements-anthropic-leadership-warning-2026-9
- yahoo: https://www.yahoo.com/news/us/article/spongebob-meets-one-piece-for-mcdonalds-new-happy-meal-collab-201123880.html
- reviewed: https://www.reviewed.com/headphones/best-right-now/the-best-true-wireless-earbuds

Live runtime commit:03c04322138b78a9c2ca168559851b54eb33e0dc. All1537 source/config/test inputs and2316
compiled artifacts matched its committed snapshot. Its prior selected gate is3316
passing tests, not a new native run attributed to these visits. Final adaptive-window
checks use saved responses, not fresh requests with the changed tokenizer.

| Page | Received UTC | HTTP | Decoded bytes | Encoded bytes | Markdown bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| businessinsider | 2026-09-16T16:26:47.650Z | 200 | 417413 | 61446 | 7001 |
| yahoo | 2026-09-16T16:26:50.461Z | 200 | 839101 | 188918 | 14603 |
| reviewed | 2026-09-16T16:26:53.515Z | 200 | 229897 | 39476 | 54830 |

Three anonymous native GETs,0 redirects/retries/credentials/scripts/alternate
clients or challenge solvers. 1486411 decoded/289840
encoded bytes total. Each request/socket/TLS connection and native transport closes.
HTTP200 and extracted-unverified/contentSuccess=null are not automatic content passes.

## Independent source review

- Business Insider:20 narrative paragraphs and its embedded quotation match the
  captured source in order. Explicit isAccessibleForFree=false declarations and
  a locked-content source marker remain recorded. This is useful captured prose,
  not verified unrestricted/full publisher access. No account, payment, visibility
  override or authentication was attempted. Author-following state and promotional
  modules pollute full-main extraction; they are not actual authenticated state.
- Yahoo:8 narrative paragraphs and15 list items match. Headline, attribution and
  article context survive, alongside unrelated top stories, ads/recommendations
  and comment UI. Absence of an access declaration is not proof of entitlement.
- Reviewed:372 non-overlapping source text blocks and14 detailed products match
  in order without cross-product fallback. Affiliate disclosure, authorship,
  methodology, qualifications and product-local pros/cons survive. Overview/detail
  repetition already exists in source. Prices, ratings and recommendations are
  source claims, not independently verified buying advice or interactive controls.

Both reviewers used local native captures only, not additional browsing or engine
execution. Full mappings, caveats and hashes remain in review-news.md/JSON and
review-products.md/JSON. No rendered or unrestricted-access acceptance is claimed.

## Focused CLI output

Two unique CSS selectors were tested with baseline and final native CLI saved
responses. Output is an exact substring of reviewed full output, retaining every
reviewed narrative/list line plus document title and sourceAccess metadata.

| Page | Full bytes | Focused bytes | Output reduction |
| --- | ---: | ---: | ---: |
| businessinsider | 7001 | 3976 | 43.21% |
| yahoo | 14603 | 2716 | 81.40% |

Business Insider selector: \#post-body section.post-body-content. It excludes
headline/byline/time/caption context outside the body; retain the full capture's
context separately. Yahoo selector is the exact captured article ID recorded in
FOCUS-INPUTS.json, not a universal site rule, and some local ad/control text remains.
No extra GET occurred. Output reduction is not reduced network cost or a speedup.

## Evidence and limits

Evidence:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/reader-deep-content-september16. Sealed 2026-09-16T16:52:11.449Z,129 files/13536429
bytes; ARTIFACTS.json SHA256:d2b439adf0452016a326708c38c11e6ce742a2669fb88bf2d6e300a9cd53f82d. Inventory excludes itself
and SEALED.json. All11 recorded process groups
are absent at audit; HOME/TMP are empty. Initial synthetic proof expected an
unescaped hyphen and failed its verifier; the separate corrected proof passed before
any live access. That failure remains preserved. Ordinary native request errors
are distinct from unexpected-request guard violations; no failure was retried.

INPUTS.json's original linkOffsetCodePoints label actually stores a JavaScript
UTF16 index. Its bytes remain pinned; AUDIT.json publishes corrected UTF16 and
Unicode-code-point coordinates. Parent extraction hashes and exact URLs are verified.

These visits exposed conservative raw-work overcharging, addressed separately in
reports/raw-discard-windows-2026-09-16.md. Historical100-page verdicts,62 broader
failures/22 missing committed tests, actual SDK/rendering/credential/passkey/device/
TTY/access gates and the complete browser goal remain open. No push is performed.
