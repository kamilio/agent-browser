# GitHub server-rendered source blocks

Native extraction recognizes a bounded GitHub SSR code layout and returns its
rendered source rows as one preformatted block. This preserves indentation,
tabs, blank rows, numeric literals, entities and backticks instead of flattening
the code into Markdown paragraphs. It does not execute source or page scripts.

## Recognition and output

- Require an HTML `div.react-code-file-contents` containing the ordered gutter
  and code-row branches. Row wrappers and cells must have the expected HTML
  tags/classes, and cells must have contiguous IDs `LC1` through `LCN`.
- Require matching canonical gutter labels `1` through `N`. One trailing empty
  HTML span is allowed per label, matching reader-visible alert markers. Extra
  text, nested decoration, controls, additional decorations and foreign elements
  decline the whole block rather than silently dropping their content.
- Cell contents may be text and nested HTML spans. Exactly LF represents an
  empty SSR row; other embedded LF/CR declines recognition. Structural whitespace
  outside cells is not code. Comments remain omitted under ordinary extraction.
- Emit a `pre` node with text children carrying the original cell references.
  Separators between rows are inferred LF. No terminal newline is invented in
  the structured source text. Markdown adds normal fence syntax around that text.

Extraction reports aggregate `sourceCodeBlocks` metadata:

```json
{
  "kind": "github-ssr-lines-v1",
  "blocks": 1,
  "lines": 180,
  "gutterLabels": 180,
  "lineEndings": "inferred-lf",
  "terminalNewline": "unknown"
}
```

Whole-document and explicit file-root/code-lines-root extraction are supported.
For a `.react-code-lines` root, `gutterLabels` is zero because its gutter is
outside the selected subtree. Individual line/gutter roots retain ordinary
semantics. Heading/text-range selections do not apply this reconstruction.
The DOM, source text, revisions and existing references are unchanged.

## Bounds and visibility

Recognition allows at most 10,000 rows, 50,000 inspected-node operations, 128
levels and 1,000,000 inspected text code units, including structural whitespace.
Recognized structural class attributes are limited to 1,024 code units. Depth
and in-scope work also respect the remaining extraction allowance. A code-lines
root may inspect the sibling gutter for validation, but total proof work is
bounded by four times the remaining node allowance plus two, still capped at
50,000. Iterator frames avoid allocating a stack entry for every cell child.

Omitted gutter, scaffold and text descendants still consume their ordinary
source node/depth budgets. Output limits include metadata; no budgets are raised.
Failed recognition retains ordinary extraction behavior. Native hidden/inert,
ARIA-hidden and CSS visibility rules are not bypassed. Default reader source
completeness can expose SSR markup that those native rules omit; explicit reader
visibility policies retain their separate meaning. No new attributes or page
runtime dependencies are needed.

## Complete files versus rendered rows

**A recognized block is not proof that the whole file is present.** The observed
GitHub `models.py` HTML rendered only 1,000 of 1,184 source lines. The extractor
does not read embedded JSON to infer this omission, and its metadata counts
rendered rows only. Original line-ending bytes and the terminal newline remain
unknown for reconstructed SSR blocks.

For a complete file, follow the publisher's actual **Raw** link, retaining normal
transport/origin/security policy checks. Do not invent a raw URL, execute the
file, or retry access challenges. The validated native workflow followed the
GitHub link's HTTPS redirect to `raw.githubusercontent.com`, received the complete
UTF-8 text document, and preserved its observed terminal LF. That separate raw
capture is stronger byte-level evidence than the SSR view.

See `reports/github-source-lines-2026-09-15.md` for native tests, saved-body
comparisons, partial-view detection, raw-source recovery and local timing limits.
