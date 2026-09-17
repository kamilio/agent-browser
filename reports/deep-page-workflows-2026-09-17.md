# Three deep-page reads and focused replay — September 17, 2026

## Result

**Three fresh native article navigations retrieve useful source content.** They
use exact public URLs found in earlier native captures, without refetching the
entry pages. Independent bounded reviews verify article prose/list retention;
three subsequent offline CLI calls retrieve selected sections without additional
requests. A fourth offline CLI exposes native table source metadata.

No production code changes are made in this checkpoint. Existing reader/replay
options handle these tasks; formatting and scheme-policy limitations remain
explicit rather than being presented as solved browser compatibility.

## Fresh requests

All times are UTC on September 17, 2026. Every row has HTTP 200, one anonymous
GET, zero redirects/retries and a complete captured response body.

| Entry | Response received | Decoded bytes | Original Markdown bytes |
| --- | --- | ---: | ---: |
| Science Insights article | 20:58:05.436 | 174,478 | 3,990 |
| Yahoo article | 20:58:07.278 | 1,035,472 | 21,218 |
| Grokipedia DOM article | 20:58:08.869 | 359,256 | 71,526 |

Exact tested URLs:

```text
https://scienceinsights.org/when-do-the-salmon-run-timing-by-species-and-region/
https://www.yahoo.com/lifestyle/articles/no-1-restaurant-every-generation-183650135.html
https://grokipedia.com/page/Document_Object_Model
```

The first two pointers come from September 16 homepage captures; the third is
linked by the September 15 Grokipedia Web_browser capture. These are three new
exact targets in the bounded historical search, not three newly working domains.

**Yahoo provenance caveat:** its saved source anchor and ancestor are aria-hidden.
This is an explicit direct-URL retrieval, not a successful visible-link discovery
or click. The public article URL contains no credentials or access tokens. The
destination still uses the unchanged source-hidden-inline policy; hidden source
content is not promoted into a visible discovery result. None of the three runs
tests native clicking or rendered actionability.

## Content review

- **Science Insights:** all eight eligible article paragraphs over 80 normalized
  characters survive in order, in eight separate output blocks. All five article
  headings retain text, level and order. No substantive omission is found in
  this measured region.
- **Yahoo:** all 53 eligible article-body paragraph blocks and all 30 ranked list
  items pass exact normalized comparisons. This inventory includes source-only
  captions with class-based styling; computed visibility is not established.
  Navigation, advertising, related stories and footer material are not exhaustively
  audited. The output contains useful article content but is not article-only.
- **Grokipedia:** all 63 qualifying paragraph-like source wrappers retain their
  normalized text in order. Headings, references, cell text and code are checked
  as detailed in the independent review. **63 wrappers become 18 output blocks:**
  source grouping is flattened, despite the prose surviving. Extra contents-list
  links and player-control labels remain in the main-scope output.

These counts use publication-specific source regions and explicit selection
rules; they are not a whole-page or rendered fidelity score. The JSON report
includes the full methods, per-block hashes, limitations and original artifact
identities. No scientific, restaurant-ranking, or DOM-specification claims from
these publications are independently verified or endorsed.

## Focused content without refetching

Each actual replay CLI consumes its original complete receipt with independent
host receipt/body pins. Every selector has one native heading-section match.

| Entry | Selected output bytes | Reduction versus whole output | Source check |
| --- | ---: | ---: | --- |
| Science Insights | 906 | 77.29% | Both selected paragraphs and heading retained |
| Yahoo | 354 | 98.33% | Heading, substantive paragraph and ten ranked items retained |
| Grokipedia | 7,963 | 88.87% | Nine source wrappers, three headings and code retained |

All three selected outputs are exact substrings of their original full outputs.
They deliberately omit other sections. This is **focused selection, not lossless
whole-page compression**, a token benchmark, or a controlled live speed result.
Grokipedia's selected nine source wrappers still become three output blocks.

Example of the exercised replay pattern, using independently trusted pins for
the saved receipt and body rather than untrusted self-asserted metadata:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" \
  --body-bytes "$BODY_BYTES" \
  --section 'h2#dom-manipulation' \
  --format markdown --table-rows < receipt.jsonl
```

The selector is verified for this capture, not guaranteed for future templates.
Exact invocations for all three publications are retained with the evidence.

## Table roles and formatting limits

The default Markdown table format does not distinguish source `th` from `td`.
An additional actual offline invocation selects the Grokipedia article table with
`--format json --table-metadata`. Its structured export preserves **all three
header cells and 36 data cells**. Independent source comparison matches every
cell's tag, selected attributes and normalized text in physical order. No header
associations, span expansion or computed layout are inferred.

Preserve the initial table collector failure: it expected `selector` rather than
the actual `css-selector` discriminator; its unreached traversal also assumed an
array rather than one JSON root. The actual CLI had exited zero. A separate
audit verifies that unchanged output; neither the CLI nor any website request is
repeated to repair this collector mistake.

Two remaining findings do not justify an untested heuristic change:

- Grokipedia uses paragraph-like spans with utility classes. Extraction already
  consults native display styles, but this inert reader omits external stylesheets.
  Do not invent paragraph semantics from class names. CSS-backed source grouping
  is a distinct follow-up, not established rendering support here.
- Yahoo retains contact text but omits a mailto destination. Current extraction
  deliberately admits only credential-free HTTP(S) links; existing tests cover
  mailto exclusions. This is a policy limitation, not a newly proven regression.
  No contact address is reproduced in this report.

## Qualification and boundaries

The runtime matches commit `5df0b6f88a554136f1e59f9d75eac0e4a410f91c`, with all
1,636 source and 2,416 compiled pins verified. It reuses the prior **1,310/0
selected native result** and passing build/types/format/lint evidence. No new
native suite or build runs in this checkpoint; the 1,026-entry committed manifest
still lacks 22 listed paths. Dirty root code is not used for execution.

Three exact synthetic proofs run with zero wire requests before the three live
GETs. Live request/socket/session/document/process closure checks pass. Four
actual offline CLI invocations use kernel/JS network denial, with no extra
requests. Private HOME/TMP remain empty. Proof/replay guard checks do not
constitute a new socket-device qualification or a live JavaScript test.

All reads retain partial/unverified provenance and `contentSuccess:null`.
There are no page scripts, SDK execution, credentials, extra assets, alternate
browser/client, device/TTY use, fingerprint spoofing or challenge solver. No
general CAPTCHA avoidance or full application compatibility is established.

Historical root-page reports and their **33 useful / 67 other** result remain
unchanged. Continue actual SafeJS/HTML-module functionality, source-style and
task-level coverage, measured performance/access handling, real secrets/passkeys
and the unfinished research topics. The overall browser goal remains active.
