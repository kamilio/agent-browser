# Bounded plain-text extraction recovery

Markdown research can encounter a complete response whose content exceeds the
extraction output budget. The default remains strict: an `extraction.output`
resource limit is an error. An explicit policy can instead return readable,
clearly labeled partial source text without increasing any resource limit.

## Usage

```sh
node dist/scripts/research-browser.js --reader --output-limit-policy text-prefix-v1 --format markdown https://example.com/
```

`ResearchExecutionOptions.outputLimitPolicy` accepts `"text-prefix-v1"`.
The research CLI requires reader Markdown extraction, not JSON, headings or
find/discovery mode. The core API is:

```ts
extractDocument(tree, {
  format: "markdown",
  outputLimitPolicy: "text-prefix-v1",
  maxBytes: 256_000,
});
```

Omit the policy for the existing strict behavior. Unknown policy values and
policy/JSON combinations are rejected before extraction. The research report
records the requested policy; a request alone does not mean fallback occurred.

## Contract

- Normal Markdown that fits is unchanged and has no `contentFallback` metadata.
- Recovery applies only to a typed `extraction.output` diagnostic from Markdown
  serialization or the final serialized extraction size. Other errors remain
  errors: response size, loading, metadata, intermediate size, structural limits,
  unsupported constructs and selection failures are not converted to text.
- The fallback projects text from the same already admitted semantic tree. It
  does not revisit raw HTML, fetch another page, increase a cap, run scripts or
  reveal omitted script/form/hidden content. Root, section and line selection
  are applied before the projection. Existing visibility limitations still apply.
- The result is four-space-indented plain text in a Markdown code block, not
  partially serialized rich Markdown. Links, raw HTML and fence-looking input
  remain literal. Formatting, active links and table associations are not kept.
- The entire `JSON.stringify(extraction)` remains within `maxBytes`, including
  metadata, Unicode encoding, JSON escapes, indentation and the fallback marker.
  Existing surrogate pairs are never split at the retained prefix boundary.
- Research reserves any positive JSON-byte growth from its final URL redaction
  before fitting. For example, replacing `?x` with `?redacted` reserves seven
  bytes. The trigger records the effective pre-redaction extraction limit;
  the published extraction still fits the original 256,000-byte research cap.
- If metadata plus meaningful text cannot fit, the original error is retained.
  Optional source-data metadata uses only the existing remaining-budget path.

`extraction.contentFallback` records:

| Field | Meaning |
| --- | --- |
| `policy` | `text-prefix-v1` |
| `representation` | `indented-plain-text` |
| `sourceCodeUnits` | Length of the logical plain-text projection, not response bytes |
| `retainedCodeUnits` | Prefix length retained from that projection |
| `truncated` | Whether any projected text was omitted |
| `trigger` | Original typed output-limit diagnostic with kind, unit, limit and observed size |

The projection can fit fully after rich formatting is dropped; in that case
`truncated` is false, but the representation change and original trigger remain
explicit. Prefixes may end mid-sentence or before important qualifications.
Do not treat them as complete articles, validated prices or reliable summaries.
Use section/line selection to retrieve relevant bounded parts when needed.

## Evidence and access restrictions

HTTP errors and detected access challenges keep their outcomes. A recovered
HTTP200 body remains `extracted-unverified` with unknown content success, not
verified website functionality. Captured response bytes and their hashes are
unchanged. Admission serialization retains the marker and content; existing
selection replay stays strict and does not automatically inherit this policy.

This feature does not activate SafeJS, authenticate, solve CAPTCHAs, retry a
blocked request or recover an oversized/incomplete network response. The latest
100-entry sweep supplies a saved response for offline reproduction, not new live
acceptance of the changed browser. Historical measurements remain unchanged.

Literal HTML in a declared Markdown/text document remains literal text. A
mislabelled response can therefore produce a prefix dominated by HTML, scripts
or CSS rather than useful page content; none of that text executes. The saved
Kateminimalist response demonstrates this distinction. MIME interpretation needs
a separate explicit policy with controls for genuine Markdown code examples;
it is not silently changed by output recovery. See the measured results in
`reports/extraction-prefix-2026-09-15.md`.
