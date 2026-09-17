# Explicit ARIA source headings

`source-aria-heading-v1` is an opt-in interpretation of authored heading roles.
It improves text structure and section selection without executing page scripts,
consulting a computed accessibility tree, or changing normal native headings.
It is not a rendering, accessibility-conformance or website-success claim.

## Native API

Pass `sourceHeadingPolicy: "source-aria-heading-v1"` to `extractDocument` or
`discoverDocumentHeadings`. Heading discovery returns unique selectors under the
existing selector budgets. Pass a discovered element reference as `section` to
`extractDocument`, with the same policy, to select through the next admitted
heading of equal or lower numeric level. Native and source headings participate
in the same section boundaries.

The reader exposes the same optional policy as the eighth argument of
`loadResearchDocument` and the twelfth argument of `sanitizeResearchHtml`.
Ordinary callers do not need these positional APIs; the research command wires
retention and extraction together.

## Research command

Use the policy with reader document, selector, section, content-focus, JSON or
heading-outline output:

```sh
node dist/scripts/research-browser.js \
  --reader --source-heading-policy source-aria-heading-v1 \
  --reader-visibility-policy source-hidden-inline-v1 \
  --reader-raw-policy separate-omitted-raw-v1 \
  --headings https://en.wikipedia.org/wiki/Main_Page
```

The visibility policy still excludes its covered hidden subtrees. Source heading
interpretation does not reveal them. Alternatively, deliberately omit the
visibility flag to inspect the existing legacy source view:

```sh
node dist/scripts/research-browser.js \
  --reader --source-heading-policy source-aria-heading-v1 \
  --reader-raw-policy separate-omitted-raw-v1 \
  --reader-fallback-encoding utf-8 \
  https://www.bestbuy.com/
```

That second command may include hidden streamed HTML and navigation. Its reader
report retains `hiddenContentSemantics: false`; it is not visible-page output.
The September 17 source check contained useful promotional copy and links, but
also unresolved template text. Source prices, offers and availability are not
verified. A future capture may differ or be blocked.

For source section navigation, run the first command without `--headings` and
with `--section '<unique selector from the outline>'`. For repeatable selection,
capture the outline and replay that same body: selectors are not guaranteed
stable across new website responses. No policy is enabled by
default. Invalid/duplicate flags and use without `--reader` are rejected. Literal
line/JSON-pointer selections and link discovery cannot use this option; actual
non-HTML sources are refused. Existing explicit MIME interpretation can admit
effective HTML, but does not turn arbitrary literal text into heading content.

## Capture and replay

Add `--capture-body` to preserve a bounded native response receipt. Standard
research replay honors the policy recorded in that receipt; there is no new
replay override flag and no implicit upgrade of historical captures. The
top-level capture policy must agree with reader and present extraction/outline
declarations. Replay retains the captured outcome and policy in its source
provenance and repeats the policy in selection/output metadata.

Each source-derived heading carries `sourceHeading` metadata:

```json
{
  "policy": "source-aria-heading-v1",
  "level": 2,
  "levelBasis": "aria-level",
  "rendered": false,
  "verified": false
}
```

## Deliberate limits

- Generic HTML tags only: `div`, `span`, `p`, `section`, `article`, `header`,
  `footer`, `main`, `aside`, `hgroup`. Controls, links, tables, list items, code
  and foreign namespaces retain their existing semantics. Native `h1`–`h6`
  retain precedence and unchanged default behavior.
- An own, single lower-case `heading` role is required; surrounding ASCII
  whitespace is permitted. Role and level source strings are bounded to 64
  UTF-16 code units. Multiple-role fallback interpretation is not implemented.
- Missing `aria-level` gives level 2. Explicit levels use strict positive
  decimal spelling from 1 through 2,147,483,647, without signs, leading zeros,
  fractions or exponents. This is the policy's bounded grammar, not full ARIA
  integer parsing. Markdown caps markers at six; metadata and section ordering
  preserve the original admitted numeric level.
- Malformed explicit levels do not become missing-level defaults. The reader
  retains bounded malformed spelling for rejection; oversized levels suppress
  the candidate role rather than fabricate a level.
- Heading titles use admitted DOM text, not `aria-label`, image alternatives,
  control values or optional source-link-label substitutions. Existing
  visibility, traversal, title, selector and output budgets remain applicable.
- Layout, page JavaScript, streamed-template activation, CAPTCHA handling and
  real authentication are not added by this policy.

Evidence and observed limitations: `reports/source-aria-headings-2026-09-17.md`.
