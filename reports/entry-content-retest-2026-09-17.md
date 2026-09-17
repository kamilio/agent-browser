# Weak-entry content retest — September 17, 2026

## Result

Two fresh native-browser requests confirm useful retrieval workflows rather
than treating HTTP 200 or nonempty output as success. Home Depot's product cards
are lost by the older article-first option and retained by the newer conservative
focus options. A source-linked RunRepeat review yields substantive text and
tables; document scope preserves more context, with smaller compact output.

This phase changes retrieval documentation and evidence, not production code
or defaults. Both requests use the native browser exclusively. Seven subsequent
actual replay CLI invocations use saved captures under network denial; they are
not seven additional website visits. Neither downloaded source nor SafeJS runs.

## Fresh requests

| Target | Response received, UTC | Status | Decoded bytes |
| --- | --- | ---: | ---: |
| `https://www.homedepot.com/` | September 17, 18:32:56.500 | 200 | 1,255,668 |
| `https://runrepeat.com/brooks-revel-max` | September 17, 18:38:25.876 | 200 | 780,668 |

The RunRepeat URL is a literal link in the hash-verified September 16 root
capture. Its root is not fetched again. Local review of RTINGS and RunRepeat
root evidence finds navigation rather than missing substantive review prose;
RTINGS has additional source-access restrictions and is not requested this time.
Home Depot's previously denied product URL is also not requested.

Exactly **two anonymous GETs, zero redirects and zero retries** occur. Each
exact driver first passes a separate synthetic proof under kernel/JavaScript
network denial. One-shot allowances are spent before the live launches. The
native response, request/socket, session/document and process closure checks
pass. HTTPS certificate validation is enforced by the pinned native transport
and observer; this observer does not archive a secureConnect event or certificate
chain. No credential headers, page scripts, SDK, additional assets, real TTY,
devices, alternate browser/client or challenge solver are used.

## Home Depot: meaningful content, not just more bytes

The fresh source contains one promotional article and 22 product cards outside
it. Independent inert-source review verifies the cards, descriptive names and
distinct public product destinations against actual CLI outputs:

| Interpretation of the same response | Markdown bytes | Product destinations |
| --- | ---: | ---: |
| `main-content-v1` | 153 | 0 |
| `main-content-v2` | 40,296 | 22 |
| `main-content-v3` | 40,296 | 22 |
| v2 plus `source-aria-label-v1` | 41,022 | 22 |

V1 selects the promotional article. V2/v3 detect substantive outside content
and choose the document; both scan the same 3,128 nodes and produce identical
Markdown. The source has 66 product anchors pointing to 22 distinct products,
not 66 products. Product descriptions are retained source statements, not
verified properties, offers, availability or buying advice.

The first independent review also identifies seven missing source destinations.
One additional offline CLI invocation with the existing source-label option
recovers all five empty-text promotional anchors that have explicit aria-labels.
The result adds exactly those five destinations and removes none. Labels retain
their explicit source attribution and `rendered:false` / `verified:false`
metadata. The SVG-logo home link and SMS destination remain absent. This label
policy uses the unchanged strict output bound, not text-prefix truncation.

The later source-label artifact check follows the original independent review;
that review is preserved rather than rewritten to claim it inspected a later
invocation. Navigation, duplicated image labels, some joined brand/title text,
and other source/formatting noise remain. The capture uses the partial semantic
reader without computed styling or hidden-content guarantees.

## RunRepeat: scope and serialization

The source's article has `role="main"`, so v3 correctly reports a main landmark.
The recorded 5,000 scanned nodes alone do not imply an exceeded scan limit.

| Actual offline CLI selection | Markdown bytes | Native tables |
| --- | ---: | ---: |
| `--content-focus main-content-v3` | 37,927 | 29 |
| `--selector body` | 47,474 | 31 |
| `--selector body --compact-tables` | 41,468 | 31 |

All use Markdown and table rows. The full main output is an exact contiguous
slice of the ordinary document output. Compact document serialization saves
**6,006 bytes (12.7%)**. The verifier reconstructs it exactly by shortening only
the existing native row/cell begin-boundary labels; every other byte remains
identical. No table content, row ordering or remaining warnings are removed.
This is not a network, model-token or execution-speed measurement.

Independent inert-source review inventories all 31 source tables and verifies
all 140 rows / 433 cell texts against document output after Markdown/entity and
whitespace normalization. All 51 main-article paragraphs and 45 heading texts
are present. This checks retained text, not every link target, span/header
association, CSS visibility or the truth of the publisher's measurements.
Document scope restores author/date/methodology context and two supplemental
tables outside main. Selected measurement states, radio/disabled-control
semantics and SVG/video/canvas content remain incomplete; the output must not
be treated as an enabled form or a complete interactive review.

All three CLI processes exit 0. The original two document-mode collectors fail
because they expect `selection.method=selector` instead of the public value
`css-selector`. Those failed execution records remain intact. A separate
artifact-only verifier checks the correct schema, source pins, complete output,
process evidence, private-state cleanliness and byte-preserving comparison.
Neither the website nor the successful CLIs are rerun to obtain a green record.

## Evidence and remaining work

The qualified runtime's 1,629 source pins match commit
`5a2f69cc487af176e5494462cbf8c6a312fbeef7`; all 2,412 compiled pins are verified.
Reuse its selected **387 passed / 0 failed** native gate and passing build,
types, format and lint results. This is not a new unit-test or full-suite run.
The canonical manifest retains 22 absent files. Pre-existing dirty work is not
part of this qualification or documentation commit.

The JSON companion records identities, invocations, original failures, artifact
checks and integrity manifests. Local evidence lanes under
`node_modules/.cache/native-validation/` are `entry-content-retest-september17`,
`entry-content-live-september17`, and `entry-detail-live-september17`.

Historical 100-page **33 useful / 67 other** results remain unchanged. This is
one fresh corpus root and one separately selected detail, not a new 100-page
pass rate. Actual SDK scheduling/HTML modules, dynamic state, rendered fidelity,
broader website interactions/performance, crawler restrictions and CAPTCHA
handoff, real credentials/passkeys/devices, missing tests, and original research
remain open. The full browser goal stays active.
