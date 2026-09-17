# Behavioral challenge and storefront checks — September 17, 2026

## What changed

Native research navigation now recognizes a bounded, otherwise empty hidden
behavioral-challenge shell before reader sanitization removes its evidence.
The saved Edmunds response previously produced either empty output or 78 bytes
of branding/privacy text. The final implementation reports a **possible,
unspecified challenge requiring user handoff**, with no extracted content.
No vendor attribution, CAPTCHA solution or successful site access is claimed.

Recognition uses the complete nested control structure, not a brand string or
single ID. Genuine sibling content, wrong namespaces, duplicate markers and
unsupported/incomplete evidence remain inconclusive. Reader/replay and JSON
source workflows cannot silently turn this diagnosed shell into useful content.
Confirmed header and HTTP429 handling retain their existing precedence.

## Fresh website observations

These two anonymous native GETs used release05, **before the final incomplete-
source hardening**. Their original records remain unchanged:

| Site | UTC start, September 17 | HTTP | Body bytes | Observed result |
| --- | --- | ---: | ---: | --- |
| Edmunds | 02:38:53.852 | 403 | 16,270 | Different error page; 475 Markdown bytes, no structural diagnostic |
| Best Buy | 02:38:56.181 | 200 | 435,094 | 43-byte template/"Main Content" placeholder |

The fresh Edmunds response is **not a live reproduction of the historical hidden
shell**. It remains an HTTP failure; no retry, identity change or bypass followed.
Best Buy still needs streamed-page activation for ordinary rendered content.
Its successful HTTP response is not a functioning storefront.

Both final release08 saved-response controls preserve the exact extraction and
classification/outcome from those two live captures. These are zero-network
followups, not new live requests or backdated validation of the final runtime.

## Useful Best Buy source, with limits

Independent inspection finds genuine promotional HTML in a hidden streamed
container, not merely script configuration. Explicit legacy source-reader
selection of `[id="S:4"]` yields **2,556 Markdown bytes** containing outlet copy
and department links. The same scope/output matches across the earlier saved
body, final-runtime saved-body check, and fresh captured body. No second Best Buy
GET was needed for source selection.

An independent Python HTML parser verifies the unique hidden source scope and
outlet statement; the full native outputs compare byte-for-byte. This does not
independently verify every output link or current offer. The earlier probe's
plain-text substring flag remains false because Markdown escapes periods; a
separate source/escaping audit records the distinction without changing old flags.

This source interpretation explicitly has `hiddenContentSemantics: false`.
The normal visibility-filtered result remains 43 bytes. No hidden nodes are
silently revealed, completion scripts executed, current prices verified, or
historical failure verdicts replaced. Stream IDs are capture-local selectors,
not a stable product API. See the private Best Buy investigation for source
coordinates and the distinction from the already document-wide historical focus.

## Validation

- **Final release08: 1,200 passed / zero failed across 19 explicit native files**,
  including **182 new cases**. Build, strict selected types, format and lint pass.
- Canonical manifest: 980 entries, 958 available, **22 still missing**. This is not
  a full-manifest run or acceptance of pre-existing uncommitted runtime work.
- Final saved-response checks make seven routed native navigations: four old
  capture controls, one fresh Best Buy source scope, and two final-runtime
  controls of the fresh responses. All run with kernel/JS network denial and
  preserve source/build/input hashes; processes and native resources close.
- A separate bounded source inspection of all 96 complete historical citation
  captures matches only the Edmunds shell. This is detector regression coverage,
  not 96 new navigations or a fresh usefulness review of the 100-page corpus.
- Before live use, the actual compiled CLI/arguments pass two synthetic routing
  proofs. Live scope is two GETs, zero redirects/retries, no supplied credentials,
  scripts, SafeJS, alternate clients or challenge solving. Request/TLS/process
  closure is recorded; HOME/TMP remain empty.

## Review fixes and remaining work

Reviews catch incomplete trailing tags/raw regions and a bogus-declaration EOF
case that still returned a structural marker. The final refusal policy and
regressions cover those cases, plus the parser's incomplete-doctype diagnostics,
without changing general tokenizer behavior or rejecting ordinary omitted end
tags. Owned source trees close and original bytes remain intact on refusal.

Initial lint/type/format and fixture-selection mistakes remain recorded. The
release06 run retains 1194/1, including the bogus-declaration regression failure.
Two early offline probes incorrectly supplied nonzero encoded bytes to the
synthetic route contract; corrected probes use its required zero value. A corpus
preparer path correction and a launcher label preflight failure did not initiate
additional website requests or conceal browser failures.

The source helper is deliberately limited to small declared HTML responses and
literal marker evidence; it is not universal anti-bot detection. Actual challenge
handoff/solving, SafeJS/HTML modules, dynamic stores, real credentials/passkeys/
devices/TTY, performance measurements and the unfinished research remain open.
Historical citation coverage remains 33 useful/67 other. The overall browser goal
is active; this is a diagnostic improvement plus practical source investigation.

Implementation and limits: `BEHAVIORAL-CHALLENGES.md`. Machine-readable evidence
and hashes are in the adjacent JSON. Private lane:
`node_modules/.cache/native-validation/behavioral-challenge-september17/`.
