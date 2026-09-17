# Source-linked product and comparison reading — September 17, 2026

## Practical result

Two source-linked public pages returned HTTP200 through the native browser, one
anonymous GET per page, without scripts, credentials, retries or a browser-engine
fallback. HTTP success is not the content verdict: Target provides limited
visible product detail plus bounded source metadata; OutdoorGearLab provides
substantive comparison prose, tradeoffs and review links.

| Fresh capture | Received UTC | Decoded HTML bytes | Markdown bytes | Content assessment |
| --- | --- | ---: | ---: | --- |
| Target product `/p/apple-watch-series-12/-/A-1013556561` | 14:06:19.363 | 807,116 | 3,398 | Identity/options and structured source details; not a rendered or selected-variant storefront. |
| OutdoorGearLab `/topics/camping-and-hiking/best-soft-cooler` | 14:06:19.485 | 464,490 | 125,300 | Substantive recommendation narratives, qualifications, comparison material and methodology. |

Both links were present as active same-origin anchors in previously captured
homepages. Those homepages were not fetched again. Each new request, session and
owned process group closed. Response CSP evidence remains attached; neither
page's script policy was bypassed or its scripts executed. Automatic outcomes
remain `extracted-unverified`, with no classified barrier, not factual validation.

## Smaller useful output from the same captured body

Existing explicit table serialization options reduce the GearLab whole-body
Markdown without changing the source or raising limits:

| Replay options | UTF-8 Markdown bytes |
| --- | ---: |
| Default | 125,300 |
| `--table-rows` | 114,036 |
| `--compact-tables` | 104,526 |
| Both | 98,202 |

The combined form saves **27,098 bytes, or 21.6%**. After removing explicitly
delimited table regions, the remaining 49,152 Markdown bytes are identical in
all four forms. The actual compiled replay CLI produces exactly the same
98,202-byte Markdown as the API, inside its JSONL provenance envelope. Table
source-order and partial/unspecified-association warnings remain; this check
does not establish semantic table associations or complete table fidelity.

This is an output-size result, not a token-count, network, rendering or engine
speed benchmark. The implementation already existed; this change corrects the
stale statement in `TABLE-ROWS.md` that the replay CLI lacked compact tables.

## Select the review, not its summary wrapper

The initial ordinary CSS selections of the bordered recommendation wrappers
returned only 336 and 361 bytes. Their source wrappers end before the narrative,
so their empty paragraph inventories did not prove a browser text-loss bug or
successful review extraction. That original analysis remains unchanged.

Selecting the actual `h2` as a heading section crosses those wrapper boundaries
and stops before the next equal-level heading:

| Source-derived section selector | Compact Markdown bytes | Stops before |
| --- | ---: | --- |
| `div:has(> a#best-premium-soft-cooler) h2` | 2,501 | Best for Most People |
| `div:has(> a#best-for-most-people) h2` | 2,480 | Best Soft Lunchbox |

Both native API selections match all two source `p` elements and both source
headings in their respective sections. A `p` inventory alone is insufficient:
the opening narrative is an unwrapped text flow and each caption is a `div`.
The independent full-page review confirms those flows, caveats, captions,
read-more links, heading pairs and eleven pro/con strings survive in the
corresponding full-page sections. Strong-emphasis formatting is not fully
retained; the words are. A separate comparison of the actual bounded outputs
matches all **23 source-text checks and four exact label/destination link
checks**, with no mismatch in that inventory. Its evidence remains alongside
the native results; paragraph counts alone are not proof that every form of
content was recovered.

Both actual section CLI runs match their API Markdown byte-for-byte. For the
verified capture, the first command is:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" --body-bytes "$BODY_BYTES" \
  --section 'div:has(> a#best-premium-soft-cooler) h2' \
  --format markdown --table-rows --compact-tables < receipt.jsonl
```

Supply the independently verified receipt/body pins from the JSON report. Use
`--section`, not `--selector`, for heading-delimited content. The anchor itself
is not a heading. No recovery flag is required for this complete ordinary
capture. These are bounded source excerpts, not a compressed complete page or
an assertion that a future page retains the same structure.

## Target: useful metadata, incomplete visible detail

The existing `sourceProducts` record contains four titles, 76 specifications,
27 highlights and three descriptions: **110 text fields in 26,865 compact JSON
bytes**. The independent review matches those fields and four IDs to their
recorded paths in this same fresh `__NEXT_DATA__` source. The route product is
`1013556561`; three retained child variants are `91122649`, `91122502` and
`91122539`. Eighteen other children are not retained.

Keep those identities separate: specifications such as band size differ.
Metadata explicitly remains partial, truncated, unrendered and unverified.
Details/Specifications headings in the visible Markdown do not establish a
substantial rendered description. No newly dropped ordinary HTML or missing
collector was demonstrated. This is not a new collector, verified product
claim, inventory/price check, login, cart action or variant-selection workflow.

## Qualification and remaining work

The runtime is the isolated build qualified by
`reports/native-available-2026-09-17.md`: 1,621 source and 2,404 compiled pins,
49,370 passing native tests in 992 available files. That earlier native run is
reused, not rerun here; 22 manifest-listed committed paths remain unavailable.
Current replay invocations use kernel and JavaScript network denial, pinned
module/file scopes, private empty HOME/TMP, bounded resources and owned-group
cleanup. The five replay invocations close all 17 observed documents.

No production code or default changes are claimed. Historical 100-page outcomes
remain 33 useful and 67 other results; these focused checks are not a corpus
rerun. General challenge avoidance, actual SafeJS/dynamic-page execution,
credential/passkey/device acceptance, broad performance and unfinished research
remain open. The full browser objective stays active.

Private evidence:
`node_modules/.cache/native-validation/source-linked-details-september17/` and
`node_modules/.cache/native-validation/source-linked-details-live-september17/`.
