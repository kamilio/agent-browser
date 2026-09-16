# Native publisher article workflows — September 16, 2026

## Result

**Three fresh native reader-profile click workflows return substantive article
text.** Each begins at a publisher's home page, rediscovers one exact
source-audited article link, performs `BrowserSession.click`, loads the resulting
destination and extracts its content. Six native GETs return HTTP200, with zero
retries, redirects, mocked live requests or challenge-solving attempts.

This is useful content retrieval using the existing explicit reader profile, not
full-source rendering compatibility or a production-code repair. In particular,
CNET's earlier full-source CSS/layout failure remains a failure. The original
100-page checklist in `reports/agent-citation-revalidation-v2.md:85` and all its
33 useful/67 other entry-page verdicts remain unchanged. These article outcomes
are not added to that root-page tally or presented as a global agent-visit rank.

## Every live workflow

Live execution starts at07:57:22 UTC and the last child exits at07:57:34 UTC on
September16,2026. Runtime source matches commit
`c17397297fa37f1d725447bbfac0019119cbdb83`.

| Publisher landing | Exact discovered article | HTTP pair | Target decoded bytes | Markdown bytes | Content review |
| --- | --- | --- | ---: | ---: | --- |
| https://www.cnet.com/ | https://www.cnet.com/tech/computing/visiting-shenzhen-chinas-silicon-valley/ |200/200|283511|20676|Useful source content; sampled|
| https://engineerfix.com/ | https://engineerfix.com/plc-programming-languages-a-comparative-guide/ |200/200|160855|10610|Useful source content; full extracted text|
| https://www.reviewed.com/ | https://www.reviewed.com/cooking/features/30-inch-vs-36-inch-range-guide |200/200|123572|19255|Useful source content; full extracted text|

All three record native `mousedown`, `mouseup`, `click` in order and the exact
target document navigation. Each native transport records two requests, zero
mocked requests/bytes and zero redirects. All six observed request/socket pairs
close; both documents and each browser/session close without pending activity.
The independently observed fresh landing bodies differ from their earlier
captured fixtures. This is not an identical-response performance comparison.

### Content assessment

- **CNET:** substantial first-person narrative spans the city, an electronics
  marketplace, technology retailers, robotics and transport, with a conclusion
  and travel-cost disclosure. Beginning, body sections, conclusion and output
  ending were inspected; not every line was reviewed. Repeated author material,
  image descriptions/captions and a large related-product link tail remain.
- **Engineerfix:** all191 lines were read. The output contains sustained
  descriptions and comparisons of PLC language approaches, application and
  learning discussions, FAQs and closing/author material. Illustrations remain
  descriptions rather than evaluated diagrams; external references were not
  followed. This does not verify technical correctness or standards currency.
- **Reviewed:** all338 lines were read. Sustained comparison prose, a selected
  table and product-specific explanations continue beyond newsletter labels and
  reach a conclusion. Affiliate/vendor links, repeated product labels, related
  cards and promotion remain. Its ten-row table explicitly leaves cell/header
  associations unspecified. Product, price, installation and safety claims were
  not checked or endorsed; no shopping or subscription action was taken.

All three select the unique `main` under `main-content-v2`, retain partial-reader
provenance and do not trigger text-prefix overflow fallback. Absence of a
fallback record is not completeness proof: scripts/styles and other source
material are intentionally omitted, and images/widgets are not rendered.
Machine workflow results retain `contentSuccess:null` and
`contentStatus:nonempty-unverified`; the separate manual reviews establish only
article-content availability, not factual accuracy or complete functionality.

## Reader behavior and selector correction

Both pages use `loadResearchDocument` with `long-v1`,
`separate-omitted-raw-v1` and `source-hidden-inline-v1`. The initial native page,
not a guessed target URL, supplies the selected anchor and its current reference.
There is no direct target navigation after a failed action or automatic switch
from a failed full-source workflow.

The initial Engineerfix selector relied on `rel=bookmark`, which the existing
reader deliberately omits. The saved-source proof correctly returned no eligible
anchor. Removing only that predicate preserves the exact heading/href target and
makes the intended reader selector work; production code did not change. An
initial supervisor also retained an old output-directory suffix. Those initial
results remain under `offline04`; final inputs/proofs use `offline02` consistently.

Reviewed's source card contains an inline handler. The reader omits it; this run
tests only the retained public hyperlink's native default action, not the source
scripted behavior. The native selector finds four featured-card candidates, but
only one has the pinned eligible destination. Its retained label includes a
classification prefix. Labels are bounded and nonempty, not required to be
byte-identical to the historical title. Projected rel/handler/download/target
checks do not establish absence of those attributes in the original source.

## Validation and boundaries

- Fresh **428 passed/0 failed** in six explicitly selected committed native-test
  files. The canonical manifest remains937 files; no full-manifest claim.
- Three final captured-landing/synthetic-destination native click proofs pass
  under kernel network denial. They prove action mechanics, not destination
  content availability. The fresh live article bodies are separate evidence.
- **126 isolated policy checks pass**, including exact URL/GET/header bounds,
  excluded source candidates, unique selection and rejection of missing or
  changed proof inputs. These are harness checks, not126 new native regressions.
- Reuse the unchanged clean build/types/format evidence. Prior scoped lint still
  contains22 exactly matched pre-existing diagnostics; no fresh green lint claim.
  All1514 committed runtime/source/script/config inputs match the pinned build,
  not the dirty root runtime.
- Independent static review matches all21 pinned inputs and finds no blocker for
  this main-supervised snapshot. Main validates and hash-binds the126-case policy
  result in its live decision. `claimLive` alone is **not** a reusable unattended
  negative-policy freshness gate; the review explicitly records that limitation.
- Runtime and current source/proof hashes are checked before one-shot live
  claims. Same-origin HTTPS, exact pinned destination, unchanged base, no
  userinfo/query/fragment/encoded/action path and bounded reader candidates are
  required. A missing, changed or ambiguous link stops rather than selecting an
  alternative. Rate limits, access/challenge/consent diagnostics and non-success
  responses also stop; no bypass or successful barrier-handling claim is inferred
  from this all-200 batch.
- Explicit existing limits:4MB decoded response,8MB aggregate, two requests,
 16KB headers,15s transport,20s navigation,60s outer deadline,256MiB heap,
  2s per-origin pacing and256KB extraction. Source/profile ownership limits remain
  unchanged. No credentials, forms, scripts/SafeJS, remote browser, real TTY,
  identity impersonation or alternate HTTP client is used.
- Process groups, native resources and observed live request/socket pairs close;
  HOME/TMP remain empty. Initial failures remain recorded. No retry is hidden
  behind a truncated tool display or an observation timeout.

## Evidence and next work

The adjacent JSON records85 evidence hashes, full native response metadata,
source/target identities, selected references, event sequences, separate content
reviews and closure results. The local evidence lane is
`node_modules/.cache/native-validation/reader-publisher-workflows-september16`.
Original42 dirty tracked and697 untracked files are preserved. Only focused
documentation/evidence is committed; no push or production change.

Keep expanding useful source-linked tasks and investigate genuine extraction or
runtime failures when they occur. Do not require complete visual rendering for
an explicitly selected reader task, and do not relabel reader success as visual
compatibility. Access handoff, full rendering, actual SafeJS execution,
credentials/passkeys and real-input acceptance remain separate outstanding
work. The overall browser goal stays active in `TASKS.md`.
