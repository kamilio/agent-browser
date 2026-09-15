# Read explicit formula alternatives without a math runtime

The native research reader retains a nonblank, source-provided `alttext` on an
otherwise omitted `math` element. It emits inert inline code prefixed with
`MathML source: `. For example, source `alttext="E=mc^2"` becomes labeled literal
code containing `MathML source: E=mc^2` rather than an empty gap in the paragraph
or table cell. No extra flag, request, TeX/MathML renderer or dependency is needed.

This is the publisher's alternative text, not a computed result, an inferred
formula, an accessibility-quality assessment or visual math rendering. It may
contain TeX notation, but nothing evaluates it. Existing inline-code whitespace
normalization and extraction control-character escaping still apply; do not
advertise Markdown as a byte-for-byte TeX source export. Retain the captured HTML
when original bytes are needed.

## Boundaries

- Only an explicit, own, nonblank `alttext` attribute is retained. Missing/blank
  alternatives and unrelated `title`, ARIA or annotation content are not guessed.
- The MathML element and subtree remain omitted. Original MathML IDs/classes are
  not assigned to the generated code element; use an actual retained paragraph,
  article or section target. Source omission counters still describe that subtree.
- Alternatives inside an already omitted subtree cannot leak through: scripts,
  templates, SVG, iframes and nested omitted MathML remain omitted. No hydration
  script, annotation markup, image or external resource is executed or fetched.
- Existing tokenizer attribute decoding/duplicate handling is reused. The literal
  value is HTML-escaped before entering the inert reader document; source markup
  cannot manufacture active elements, links or executable attributes.
- All original descendants still consume their source/token/depth/text budgets
  and undergo the existing malformed-input checks. An available alternative is
  not a way to rescue an invalid or over-limit document silently.
- Documents without retained alternatives keep their existing output and report
  shape. Non-reader native parsing/rendering is not changed by this feature.

## Provenance and budgets

Reader reports with retained alternatives include the immutable optional record:

```json
{"mathAlternatives":{"elements":1,"codeUnits":6}}
```

`elements` counts retained alternatives. `codeUnits` counts their decoded UTF-16
attribute units; `E=mc^2` has six. The existing `textCodeUnits` also charges those
units, in addition to original text tokens, including omitted glyph/annotation
text. The fixed label and generated markup consume the output budget. Native DOM,
extraction and replay limits remain separate and unchanged. No cap or timeout is
widened. Both sanitized and document-attached nested records are frozen.

This is not a new execution mode: default and long-profile reader
admission retain their existing restrictions. Live research and admitted captured
HTML replay get the same bounded transformation. JSON and Markdown remain partial,
with scripts/styles/MathML DOM still omitted and no claim of rendered fidelity.
The unchanged reader notice describes those omitted structures; the literal
labels and optional report distinguish the retained alternatives.
