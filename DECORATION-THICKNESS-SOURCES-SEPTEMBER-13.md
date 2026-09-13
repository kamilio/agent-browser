# Native decoration-thickness source comparison — September 13, 2026

Two separately bounded native GETs and two native reader loads establish the
implementation contract. Both return HTTP 200 HTML without redirects, retries,
subresources or challenge handling. This is source-reading coverage, not full
website layout or interaction acceptance.

| Native source | Document's stated date | Decoded / encoded bytes | Reader nodes | Complete selected sections / text units |
| --- | --- | ---: | ---: | ---: |
| `https://www.w3.org/TR/css-text-decor-4/` | May 4, 2022 Working Draft | 288,319 / 44,482 | 10,062 | 12 / 22,881 |
| `https://drafts.csswg.org/css-text-decor-4/` | August 17, 2026 Editor's Draft | 391,569 / 67,844 | 8,095 | 12 / 24,774 |

The publication endpoint serves a 2022 draft; it is not relabeled as a 2026
publication. Its thickness table says percentages are N/A and the computed value
is a keyword or absolute length, while its prose says percentages inherit
relatively. The editor URL is discovered in that native title section and fetched
in a separate authorized lane to compare the contract, not to hide a failed GET.
No claim is made about an edition later than the observed August 17 draft.

## Contract used

The editor's thickness section defines a non-inherited longhand, initial `auto`,
participating in the `text-decoration` shorthand. It applies to underline,
overline and line-through strokes originating on the decorating element;
descendant thickness changes do not alter an already propagated ancestor line.

It admits `auto`, `from-font`, length-percentage values and line-width keywords.
Lengths compute to fixed values; percentages stay relative and use the decorating
element's used font size. Explicit inheritance consequently copies fixed lengths
but preserves the relative behavior of percentages. The used explicit thickness
should round to the nearest device pixel and remain at least one device pixel.
`from-font` uses preferred width metrics where available, otherwise the UA's
automatic choice. The shorthand resets omitted components and orders its
components as line, thickness, style and color.

The editor's property table still says percentages N/A; that residual table
inconsistency is retained, not silently corrected in the source. Its explanatory
percentage prose and computed length-percentage rule supply the operational
contract. The grammar has no nonnegative range qualifier on length-percentage;
accepting signed lengths and applying the used-value minimum is an implementation
interpretation of that grammar, tested explicitly rather than presented as a
separately quoted negative-value clause.

The line-position section explicitly identifies itself as copied from early
Level 3 drafts, under review and not yet integrated with thickness/offset. It is
not evidence for a complete modern positioning implementation. This feature
preserves the documented native font/placement policy and does not implement
averaging, underline offsets, vertical writing, new stroke styles or skip-ink
controls. The native single-device-pixel raster profile and keyword widths are
implementation choices, not universal CSS values.

## Method and evidence

The W3C capture runs `16:30:14.816–16:30:14.977 UTC`; its reader runs
`16:30:20.928–16:30:21.183`. The editor capture runs
`16:31:24.585–16:31:24.793`; its reader runs `16:31:24.907–16:31:25.155`.
Every phase exits zero with an absent process group, unchanged complete runtime
pins, closed owners and removed empty private HOME/TMP directories. Credentials
are omitted and cookie jars stay empty. No scripts, SafeJS, raw-source search,
alternate browsers, geometry/raster, real TTY/PTY or socket probes run.

All selected sections are complete; this does not mean the whole document was
extracted. Reader query/walk work is 162,134 / 49,131 for the publication and
136,257 / 47,243 for the editor source. All work fits its declared native bounds.

Lanes under `node_modules/.cache/native-validation/`:

- `native-decoration-thickness-source-september13/`: body SHA-256
  `be6b9a7763ec76ae648f527cca1866ddf107f8f1dc3a607d5aeb24911252c421`;
  48-entry lane-relative ledger
  `3c751068f5d058e03602c66a4695081e8adf4c71a8b86f1c58cc7f00b5ee8a8a`.
- `native-decoration-editor-source-september13/`: body SHA-256
  `2a9976c77376cdc0254fa3122dc5ded8f68c85e56c65aecdb5d0657d53546f6f`;
  49-entry lane-relative ledger
  `3961d288418da55be7a484b1035dc5ff5c222a7a6b7ad972b14621fe522e3fd9`.

Both use the earlier `native-css-nesting-september13-round02/snapshot01/dist`
runtime, with 19,960 native passes / zero failures / two unchanged skips. The
later thickness implementation needs its own native and actual-page replay
validation; these source observations do not substitute for those gates.
