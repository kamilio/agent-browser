# Source product descriptions

## API and scope

`loadResearchDocument(response, context, ...)` can recover a bounded Target
Next.js description companion from effective HTML, including HTML admitted by
the reader MIME policy. Ordinary `parseHtmlDocument` does not collect it.
`extractDocument(tree, { format: "markdown" | "json" })` exposes optional
`sourceProducts` metadata separately from `content`; there is no product option.
Recovery neither inserts product nodes nor changes the source response bytes.
Selecting an extraction root does not restrict this document-wide companion.

The envelope has `kind: "nextjs-target-product-descriptions-v1"`,
`scope: "document-source"`, `partial: true`, `rendered: false`, `verified: false`,
`textFormat: "html-source"`, `routeTcin`, `entries`, and `truncated`.
Each entry carries `source`, `tcin`, `relation`, `title`, `specifications`,
`highlights`, optional `description`, and its own `truncated` flag.

## Admission and identity

- The response URL must have origin `https://www.target.com` or
  `https://target.com`, no credentials, and path `/p/<slug>/-/A-<tcin>` with
  optional trailing slash. TCINs are strings of 6–12 ASCII digits, nonzero first.
  The decoded slug must contain 1–1024 UTF-16 code units and no slash, backslash,
  Unicode control, or format characters. Other hosts, paths, and ports fail.
- Only an inline `script` with exact ID `__NEXT_DATA__`, trimmed/case-folded type
  `application/json`, and no `src` attribute qualifies. Comments and scripts in
  omitted subtrees, including SVG, MathML, templates, or `noscript`, do not.
  Explicit source visibility policies honor `hidden`/`aria-hidden="true"` on
  scripts or ancestors; `source-hidden-inline-v1` also honors inline hiding.
- Only the first qualifying block is parsed, capped at 1,048,576 UTF-16 code
  units. Later qualifying blocks are ignored and mark aggregate truncation;
  they cannot rescue malformed JSON or an oversized first block.
- JSON requires own properties `page: "/p/[...subpath]"` and
  `query.subpath: [decodedSlug, "-", "A-<routeTcin>"]`. Traversal examines only
  the first 16 `props.dehydratedState.queries` and first 32 modules per query at
  `state.data.data.data_source_modules`; products are at `module_data.data.product`.
  Unrelated shapes and inherited/prototype-shaped alternatives are not searched.
- The first valid product whose `tcin` equals the route TCIN becomes
  `relation: "route-product"`. A missing, blank, non-string, or over-limit title
  rejects that product; children never substitute for an invalid/unrelated parent.
  Up to three unique direct children become `"variant-of-route-product"`, scanning
  at most 32 child positions. No grandchildren, later primaries, or recommendations
  are merged. Variant descriptions remain separate, not a selected-variant claim.

## Fields and attribution

Only `item.product_description` supplies these fields; lengths are UTF-16 units:

| Output | Source field | Limit |
| --- | --- | --- |
| `title` | `title` | Required nonblank string, 512 |
| `specifications` | `bullet_descriptions` | First 32 positions, 2048 per string |
| `highlights` | `soft_bullets.bullets` | First 24 positions, 2048 per string |
| `description` | `downstream_description` | Optional string, 8192 |

Non-string values are skipped, never stringified; missing lists become `[]`.
Markup and HTML entities remain literal, untrusted strings, not rendered text or
sanitized HTML. Unicode control/format characters except LF and tab become literal
`\u{hex}` escapes. Limits apply before and after escaping; oversized strings are
omitted whole, not clipped or replaced with cutoff prose. Unknown fields are ignored.
`source.offset` points to the opening script tag in decoded source after CRLF/bare
CR normalization to LF; `offsetBasis: "lf-normalized-utf16"` means UTF-16 indexing,
not original-byte or Unicode-code-point offsets. `source.path` identifies the JSON
product location from `$`, with `.children[index]` for variants sharing that offset.

## Budgets, truncation, and lifetime

The companion is capped at 32,768 UTF-8 bytes of serialized JSON. Fitting first
drops trailing entries, preserving the parent; if needed it removes the parent's
trailing highlights, then specifications, then description. If even the remaining
parent cannot fit, the companion is absent; an empty envelope is never returned.
`extractDocument` defaults to `maxBytes: 262144` (allowed: 256–1048576), counting
the entire serialized result in UTF-8. Products use only remaining space after
base extraction, source tables, access metadata, and feeds, including property
overhead. They do not turn a fitting base result into failure or replace content.
Reader source/text/token/depth/raw-work limits still apply; recovery bypasses none.
Aggregate `truncated` records bounded omissions, including extra blocks, traversal
caps, invalid/duplicate child IDs, field limits, and fitting. Entry truncation
marks that entry's field loss; dropping variants need not mark the parent's flag.
Wrong-type fields can be skipped without truncation: `false` never means complete.

Stored snapshots, entries, source objects, and lists are frozen. Fitting does not
mutate the stored snapshot. Tree closure removes its lookup association; already
returned snapshots remain readable and unchanged. This is load-time source data,
not live state. Absence may reflect admission, schema, or budget limits, not absence
of a product. This guide makes no claim of verified product facts, rendered
visibility, pricing/stock, interactive behavior, SafeJS execution, or full website
compatibility. It is based on implementation and fixture-test inspection only;
no tests, scripts, browsing, or live probes were run for this documentation change.
