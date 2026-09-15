# Native multilingual content — September 15, 2026

## Public observations

Four once-only native navigations, four GETs, zero redirects/retries, four verified
captured bodies and closed transports/child groups. Reused runtime source,
scripts, package and config match commit ae584d14d8450b048e060081bf55116ab0a51ead; older archived
documentation is not represented as a complete current-HEAD build archive.
No page scripts, credentials, supplied cookies, SDK imports, media, account
interaction, impersonation or CAPTCHA solving. Nonempty text remains unverified,
not interactive website or pixel-layout acceptance.

| Source | HTTP | Original live outcome | Markdown bytes |
| --- | ---: | --- | ---: |
| www.aozora.gr.jp | 200 | failure | 0 |
| ja.wikipedia.org | 200 | extracted-unverified | 18426 |
| www.w3.org | 200 | extracted-unverified | 33538 |
| developer.mozilla.org | 200 | extracted-unverified | 44962 |

Exact targets:

- `https://www.aozora.gr.jp/cards/000081/files/456_15050.html`
- `https://ja.wikipedia.org/wiki/%E9%87%8F%E5%AD%90%E5%8C%96`
- `https://www.w3.org/International/articles/ruby/`
- `https://developer.mozilla.org/fr/docs/Web/HTML/Reference/Elements/ruby`

Japanese Wikipedia, W3C's Ruby Markup article and French MDN return readable
reference text. Their original UTF-8 extraction remains unchanged in offline
comparison. This does not verify interactive examples, CSS/ruby positioning or
all source characters and external images.

## Aozora diagnosis and repair

The original response has text/html without an HTTP charset, 124623 body bytes
and 82683 decoded code units. Native HTML metadata sniffing and decoding already
select shift_jis correctly and reproduce the Japanese title. Its leading XML
declaration triggers Malformed reader input under default and both source-hidden
policies. No decoder behavior needs changing.

The candidate allows only a syntactically complete declaration at normalized
input offset zero, <=256 code units, as one omitted HTML comment. Required version
1.0/1.1 and optional encoding/standalone fields have bounded syntax and ordering.
No XML mode, charset override, entity expansion, external-resource fetch or generic
PI support is enabled. Misplaced/malformed/overlong declarations still reject.
Token, omitted-token and tokenizer-issue accounting remain visible. The bound
limits acceptance/matcher input, not the tokenizer's preceding scan of rejected
input. Design and supported syntax: INERT-XML-DECLARATIONS.md.

All three Aozora policy variants now yield 127443 bytes of Japanese Markdown,
including title, author, chapter headings, body and reading annotations. Their
Markdown SHA-256 is cf3f283e20303ef71c98d5202c7bc6ba220261e159ffb5c34a5dae4875a8532e.
The inline-hidden policy omits one empty hidden subtree, while all three text
outputs match. Layout and every character/gaiji image are not independently
validated. This is controlled native saved-response recovery, not a live retry
or a rewritten successful receipt. Original failed-receipt replay stays denied.

## Validation

- Baseline: 1452 passing native tests in 18 explicit manifest-selected files.
- Final release02: 1592 passing in 19 files, 140 new; build, targeted types,
  format and lint also pass. No full-native-suite release claim.
- 1451 prior cases retain identical outcomes. One existing rejection vector is
  intentionally replaced by the same XML declaration after a paragraph; positive
  leading-declaration behavior is covered by the new tests. No hidden test drop.
- Release01 had 1592 passing tests but failed strict typing on two string includes
  calls against union extraction content. A Markdown format guard corrects those
  new-test errors. Original failed type log and source archive are retained;
  production bytes are identical between release01 and release02.
- Independent read-only production review reports no actionable finding. Its
  acceptance-bound qualification is incorporated above; review is not execution.
- Eighteen saved responses supply twenty policy cases per build: seventeen are
  unchanged, and three Aozora variants recover. Compared fields are outcomes,
  failures, Markdown hashes, reader reports, source-alternate, source-description
  and source-Markdown metadata; not every browser or extraction state field.
- Forty native in-memory navigations, twenty-four successful original-receipt
  replays and eight failed-receipt denial checks run without HTTP. One additional
  three-policy decoder/sanitizer diagnostic records the original failure.
  All three offline child groups close, with empty HOME/TMP, unchanged source/
  compiled/fixture pins and no denied-I/O attempts.

Controls include the prior GitHub hidden-paragraph recovery, RFC whole-document
output-limit failure, Apple HTML JavaScript notice and its Markdown alternative.
Those outcomes remain unchanged. No historical report or capture is rewritten.

## Access barriers and remaining work

A separate manual saved-output review covers fourteen short top-100 extractions
and three original HTTP failures. It substantiates no new missed challenge rule;
the historical LinkedIn case is already handled by current classifier source.
This is source inspection, not classifier execution or new live visits. Generic
login controls, JavaScript notices and compatibility errors are not promoted to
CAPTCHA detections. The complete review and source hashes remain in the private
BARRIER-REVIEW.md artifact.

No speed, network-latency or block-rate improvement is measured here. SafeJS,
credentials/passkeys/devices, live scripts, service/socket, real TTY and broad
research acceptance remain open. Continue diverse content checks and human
handoff at actual access restrictions; no complete-browser claim or push.

Detailed results: reports/multilingual-content-2026-09-15.json.
Private complete lane: node_modules/.cache/native-validation/multilingual-content-september15/.
