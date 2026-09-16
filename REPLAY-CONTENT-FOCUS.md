# Focused content from complete captures

Ordinary research replay can now choose the existing `main-content-v1` extraction
policy instead of requiring a manually inspected CSS selector. It works with
admitted complete HTML captures under either the default or `long-v1` profile.
No network request is made during replay.

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile long-v1 \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --content-focus main-content-v1 \
  --format markdown \
  --output-limit-policy text-prefix-v1 \
  --table-rows < receipt.jsonl
```

The supervising host must supply the intended profile and independent receipt/
body identity pins. Keep the original receipt unchanged. The long profile still
requires an explicitly selected complete capture; a failed response prefix is
not admitted by these options. For capture instructions, see
`LARGE-PAGE-WORKFLOW.md`.

## Automatic selection

`--content-focus main-content-v1` reuses core extraction's unique nonempty outer
main, then unique article, then document fallback. Ambiguous landmarks fall back
to the document instead of choosing an arbitrary element. Existing source
visibility and barrier checks still run. This is not a content-quality detector.

The replay report records `selection.method: "content-focus"` and `matches: null`
because this is not a CSS match count. The extraction's `contentSelection` records
the policy, selected scope, reason and bounded candidate counts. Title and other
existing source metadata keep their normal core behavior and limits.

Focus is mutually exclusive with selector, section, link, heading and literal-text
discovery/selection modes. JSON and Markdown output are supported under existing
table-option rules. The API spelling is:

```ts
extractResearchReplayJson(
	rawReceipt,
	trustedAdmission,
	{ contentFocus: "main-content-v1" },
	undefined,
	"markdown",
);
```

## Explicit output fallback

`--output-limit-policy text-prefix-v1` is optional and separate from focus. It is
also available for ordinary HTML selector and section replay. Omit it to preserve
strict output-limit failure. It requires explicit Markdown output in the CLI;
the API requires the Markdown format argument. Invalid tokens, accessors and an
explicitly present `undefined` policy are rejected rather than coerced.

If rich Markdown exceeds the existing extraction-output bound, core extraction
may return bounded **indented plain text**. `contentFallback` identifies the
representation, original limit trigger, source/retained UTF-16 counts and whether
text was truncated. It does not pretend to preserve rich links or table/list
formatting. If all selected text fits, `truncated` can be false even though rich
formatting required fallback. If ordinary Markdown fits, no fallback metadata is
emitted. The requested policy remains recorded in `selection.outputLimitPolicy`.

No ceilings increase: extraction stays at 256,000 bytes and the serialized replay
result at 327,680 bytes. Other resource or output-envelope failures still fail.
Do not treat fallback text as a complete rendered page or verified facts.

## Admission remains strict

Neither option admits incomplete bodies, failed receipts, denied statuses,
tampered pins, access barriers or unsupported MIME. Named `--recover-output-limit`
and `--recover-empty-outline` workflows retain their explicit selector/section
contracts and reject these new options. Existing manual recovery remains
available; this feature does not silently convert those receipts to ordinary
successful captures. Literal text/link/heading modes reject the output policy.

`RESPONSE-PREFIX.md` describes a different, diagnostic-only incomplete transport
prefix. It remains inadmissible here. No SDK, page scripts, alternate browser,
credentials or automatic retry is introduced.

## When a unique article is only a promotional card

`main-content-v1` is a structural policy, not a content-quality detector. A
homepage can have one small promotional `article` and a much larger product
shelf in sibling `div` elements. In that case, successful article selection can
omit the information the browsing task actually needs. Neither HTTP200 nor
nonempty focused output establishes that the page was adequately read.

Inspect the recorded scope/reason and the complete captured source before
requesting the same page again. For an admitted complete HTML receipt, replay
with `--selector body` to inspect broader source text, or use an exact enclosing
selector found in that source. Replace the focus flag; do not combine focus and
selector. For example, after verifying the source's unique content container:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --selector "$SOURCE_VERIFIED_CONTENT_SELECTOR" \
  --format markdown --output-limit-policy text-prefix-v1 --table-rows \
  < receipt.jsonl
```

On a saved September16 Home Depot capture, article focus retained153 bytes;
whole-document extraction retained36201 bytes. A source-verified unique
`#default-layout` selector retained28240 bytes, including the same22 product
destinations, while removing outer navigation/footer. This exact selector was
tested through the native replay CLI with kernel-denied network; it is not a
universal selector or a new live request. See
`reports/content-focus-investigation-2026-09-16.md` for evidence and limitations.

Broader extraction still respects source visibility, admission and output caps;
it does not expose scripts, unlock access or complete dynamic widgets. Removing
a footer can also remove commercial qualifications. Product amounts, stock,
review authenticity and offers remain unverified captured claims. The browser
does not automatically widen scope based on output size, retry, or treat a
diagnostic response prefix as a complete replayable page.

## Conservative automatic alternative

`--content-focus main-content-v2` adds an opt-in structural safeguard for the
promotional-article case. With no main and one article, admitted visible content
outside article/ancillary contexts causes document fallback. No output-size or
domain heuristic is involved. `main-content-v1`, absent-policy extraction,
manual selectors, admission and budgets retain their existing behavior.

V2 automatically reproduces the saved Home Depot whole-document output without
the site-specific selector;11 other saved-page content outputs remain unchanged.
See `CONSERVATIVE-CONTENT-FOCUS.md` for the exact signal, metadata, limits and
remaining quality tradeoffs. This does not rewrite the earlier manual replay
measurements or turn saved-body comparisons into fresh website validation.
