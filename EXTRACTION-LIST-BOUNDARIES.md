# Markdown source-list boundaries

When two source list containers would otherwise run together in Markdown,
the native extractor now inserts this generator-owned block:

```markdown
**Native list boundary (source groups only)**
```

For example, two separate unordered lists containing invented items become:

```markdown
- First group item

**Native list boundary (source groups only)**

- Second group item
```

The boundary preserves source grouping. It does not identify advantages,
disadvantages, endorsement, correctness, icon meaning or visual styling.
Consumers should not treat the generated marker as publisher-authored text.

## Contract

- Applies to consecutive lists reaching the Markdown block serializer, whether
  ordered, unordered or mixed, in the same quote/list-item prefix context.
- Generic block wrappers, omitted nodes and non-emitting empty containers do not
  prevent a boundary. A boundary is delayed until the next list emits content.
- Actual intervening output resets adjacency. An empty heading still emits a
  heading marker under the existing contract and therefore resets adjacency.
- A single list, ordinary items within that list and empty lists with no output
  gain no marker. Empty list items retain their existing visible item markers.
- Nested sibling lists within one item share an appropriately indented boundary.
  Different item/quote contexts do not share adjacency, even when their rendered
  indentation is identical. Closing a nested list does not itself insert a marker
  between that child and its ancestor.
- Ordered starts, item numbering and link text are unchanged. Generated boundaries
  do not inherit a surrounding link URL. Ordinary source text resembling the
  marker is escaped by the existing Markdown text encoder.
- The JSON representation retains the original distinct list nodes; no boundary
  node is inserted into the document or extraction tree.
- Marker bytes count toward both the Markdown generation limit and serialized
  extraction output limit. The explicit `text-prefix-v1` fallback remains a
  separately labeled, bounded plain-text representation, not lossless Markdown.

This is not a general fix for source structures flattened through the existing
inline-wrapper path, CSS-only semantics, adjacent blockquote identity, icon-only
values or script-generated chart data. No page script or stylesheet inference is
introduced, and no new runtime dependency is required.

## Evidence

The defect was observed in a native-captured PCMag review: two three-item source
lists became one six-item Markdown run. Saved-body replay now inserts one neutral
boundary between the original groups; all other text and extraction metadata
remain identical. The artifact grows from38130 to38177 UTF-8 bytes. Missing chart
values and the icon-only specification remain explicitly unresolved.

The selected native gate passes955 cases in15 files, including51 new cases.
Running those same51 cases against the prior implementation gives11 passes and40
failures. Build, strict type checking, formatting and lint pass.

A kernel-network-denied differential covers99 existing captures:96 complete
responses from the100-entry corpus plus three article targets. Ninety-six pairs
extract successfully; three non-HTML pairs retain the same admission failure.
Eleven pages gain24 boundaries in total. All successful outputs and metadata are
otherwise identical, with all created documents closed. This is not a new live
website run, a full native-suite pass or a speed benchmark.

See `reports/extraction-list-boundaries-2026-09-16.md` and its companion JSON for
pins, per-page results, unsuccessful initial test assumptions and remaining gates.
