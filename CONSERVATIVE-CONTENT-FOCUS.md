# Conservative automatic content focus

Use `main-content-v2` when a lone promotional article should not hide other
admitted page content. This is opt-in: extraction without a focus policy and
valid `main-content-v1` behavior remain unchanged.

```ts
extractDocument(tree, {
	contentFocus: "main-content-v2",
	format: "markdown",
});
```

The native command host accepts `extract --content-focus=main-content-v2`.
The research browser and ordinary complete-capture replay accept
`--content-focus main-content-v2`, for JSON or Markdown under their existing
format/selection constraints. Build the current source before using these flags.

## Selection rule

V2 keeps the existing unique nonempty outer main priority. If there is no main
and exactly one nonempty outer article, it additionally asks whether other
admitted content exists outside semantic article ancestry. If so, it selects the
document rather than that article. Ambiguous main/article and no-landmark cases
keep their existing document fallback.

The outside-content signal counts visible nonwhitespace text and nonblank HTML
image alt text. It ignores HTML `header`, `footer`, `nav` and `aside` subtrees,
plus subtrees with native roles `banner`, `contentinfo`, `navigation` or
`complementary`. These contextual exclusions affect only this signal: they do
not hide nodes from extraction, change landmark counts, or loosen admission.
They apply only to HTML elements; foreign elements do not gain those semantics
just by sharing a tag name or role attribute.

Article ancestry means the admitted visible semantic article frames used by
v1, not every literal `article` tag. For example, a visibility-hidden article
with a visibility-restored child need not establish an article frame. Existing
source omission, visibility and leaf-descent rules still determine which nodes
are examined. Ancillary context persists through an invisible admitted ancestor.

No domain/class/id rules, minimum lengths, text ratios, prices or language
heuristics are used. The signal shares the existing bounded focus traversal;
there is no second document-wide focus scan or increased node/depth allowance.
This is not a claim that loading/extraction/style work all fit in one pass or
that v2 is faster. Broader output may cost more and retain boilerplate.

## Metadata

Every v2 selection records the requested policy and `outsideArticleContent`.
The boolean describes the signal even when a main, ambiguous landmarks or no
article means it does not change the chosen scope. A lone-article fallback uses:

```json
{
  "policy": "main-content-v2",
  "selected": "document",
  "reason": "article-with-outside-content",
  "mainCandidates": 0,
  "articleCandidates": 1,
  "outsideArticleContent": true
}
```

Actual metadata also includes `scannedNodes`. V1 metadata does not gain the new
boolean. Metadata remains frozen and is included in output-byte accounting.
Invalid-policy error text now names both accepted versions; exact invalid-call
message compatibility is not promised.

## Replay without another request

For a previously admitted complete capture with independently checked pins:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --content-focus main-content-v2 --format markdown \
  --output-limit-policy text-prefix-v1 --table-rows < receipt.jsonl
```

Use the capture's actual profile. Focus remains mutually exclusive with manual
selector/section and other discovery modes. Ordinary focus does not admit failed
captures, incomplete response prefixes, unsupported MIME, tampered pins or access
barriers. Explicit default-profile output-limit focus recovery is now supported
under the unchanged failed-capture admission; see `NESTED-ARTICLE-FOCUS.md`.
It retains original failure/reader policy and rejects text-prefix/MIME overrides.
Source-level challenge checks still precede focused extraction.

V2 can exceed the same old output cap by selecting more content. Strict failure
remains the default; the separate explicit Markdown text-prefix policy can
retain bounded plain text under its existing rules. It does not increase a cap,
preserve every rich link, unlock hidden/paid content or execute page scripts.

## Evidence and limitations

On12 saved captures, valid v1 extractions remain identical to the previous
compiled runtime. V2 preserves11 content outputs and automatically changes Home
Depot from a153-byte promotional card to36201 bytes containing22 product cards.
The actual native replay CLI reproduces that whole-document output without a
selector or another request. See
`reports/conservative-content-focus-2026-09-16.md` for exact targets and checks.

This is not universal readability: a misleading unique main still wins;
navigation-like content outside recognized contexts can broaden scope;
content inside ignored ancillary contexts does not trigger broadening. Retained
source is not full computed visibility, dynamic rendering, verified offers or
complete article/media content. Further live-site coverage remains necessary.

## Fresh product-content check

A new native Home Depot root capture on September 17, 2026 confirms the same
failure mode. Actual offline CLI comparisons on that one response yield 153
Markdown bytes with v1, versus 40,296 identical bytes with v2 and v3. Independent
source review verifies all 22 product cards' descriptive names and distinct
destinations in v2/v3, with none in v1. This does not update the historical
100-entry corpus or verify current product offers.

Five additional empty-text promotional links have explicit source `aria-label`
values. The existing label policy restores them without executing scripts:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --content-focus main-content-v2 --format markdown \
  --source-link-label-policy source-aria-label-v1 --table-rows < receipt.jsonl
```

Do not combine this label policy with `--output-limit-policy text-prefix-v1`;
the tested invocation uses the unchanged strict output bound. The 41,022-byte
result retains all product destinations and adds exactly the five source-labeled
destinations, explicitly marked unrendered and unverified. The SVG-logo home link
and SMS destination remain omitted. This is a tested retrieval option, not a
default change, complete accessibility result or another live request. See
`reports/entry-content-retest-2026-09-17.md` and its JSON evidence.
