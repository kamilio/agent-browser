# Omit empty hyperlink wrappers from Markdown

Markdown extraction no longer emits `[](<destination>)` for links whose rendered
label is empty or whitespace-only. This removes reader-stripped permalink icons
without adding guessed labels or altering the source document.

For example, a heading containing an empty link followed by `Title` now renders
as `# Title`, rather than a URL-only empty link before the title. A link containing
`Read`, image alternative text or rendered code still keeps its Markdown wrapper.
Existing destination filtering and URL/Markdown escaping are unchanged.

## What stays intact

- Whitespace between neighboring words and explicit line breaks remain; an
  empty anchor does not invent a space between otherwise adjacent characters.
- Nonempty links, including paragraph-sign permalinks, remain. No glyph, copied
  status label, navigation menu or arbitrary page text is blacklisted.
- The existing visible escaped representation of control/format characters
  remains a label; this change does not silently strip those characters.
- Source anchors, references, document revisions and JSON link records remain.
  `extractDocument(tree, { format: "json" })` still exposes an empty link's URL.
  `discoverDocumentLinks(tree, "example.org")` can still find it by matching URL.
- List/table structure remains even when a list item or cell contains only an
  empty link. Unsupported Markdown structures are still rejected before rendering.
- Source, document, structure, intermediate and output limits remain in force.
  Removing URL syntax reduces output; it does not bypass intermediate accounting.

Labels are checked after native inline rendering. Nested links still produce
only the outer Markdown link, and an unlabeled outer link disappears without
discarding whitespace. The iterative renderer does not recursively rescan every
nested anchor or construct a second full label string just to check emptiness.

This is a Markdown presentation change, not general accessibility-name
computation, visual fidelity, navigation automation or challenge solving. No
page script or network request is involved. Reader output remains partial.
See the forty-second website inventory for captured-page checks and limitations.
