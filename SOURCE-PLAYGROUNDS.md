# Supporting playground code from documentation source

React documentation can deliver supporting playground files in an inert
`__NEXT_DATA__` payload without rendering those files as HTML code blocks. A
source reader must not equate its visible HTML examples with the complete
playground source. The captured React Quick Start has five playgrounds containing
five JavaScript blocks and three supporting CSS occurrences; the CSS is absent
from the HTML extraction, although the page's ordinary prose and code survive.

## Source-only metadata

The reader's optional `sourcePlaygrounds` extraction field carries bounded
`react-sandpack-source-code-v1` metadata. It is explicitly document-source,
partial, unrendered and unverified. It does not alter Markdown text, insert code
into the DOM, execute JavaScript/CSS, hydrate a playground or infer a filename.
The metadata also accompanies a selected section or element and must not be
mistaken for text belonging only to that selection.

Each entry retains a complete code string, optional source `className` and `meta`,
the original script's LF-normalized UTF-16 offset, and paths through the decoded
content tree. `playgroundPath` associates examples and supporting blocks with the
same serialized Sandpack owner. Occurrences are not deduplicated. Source class
labels are evidence, not guarantees of language, visibility or executable code.

Admission requires the exact HTTPS `react.dev` origin and a supported learn or
reference route, matching the payload's page/query route. Only an inline
`script#__NEXT_DATA__[type="application/json"]` outside excluded or source-hidden
contexts is eligible. The inner `props.pageProps.content` must be JSON containing
the recognized serialized element shape. Only code under a Sandpack's `pre`
element is considered; arbitrary object attributes and executable script text are
not searched or evaluated. Other sites and unknown payload schemas remain out of
scope rather than being interpreted heuristically.

## Bounds and lifecycle

- One eligible block, at most1,048,576 outer and524,288 inner UTF-16 source units.
- At most10,000 visited nodes, depth64,32 retained entries and65,536 code units.
- Each complete code block is limited to16,384 units; class/meta labels to256/512.
- Metadata fits a64KiB JSON-UTF8 ceiling and the existing extraction byte budget.
  Only complete entries are retained; code is never clipped to fit. Bounds that
  discard entries are marked truncated, and no fitting entry means no metadata.
- Reader cancellation checkpoints bracket decoding and bound traversal work.
  Metadata is frozen and released from document association on close.

The implementation does not solve the SafeJS scheduling contract, verify source
instructions, prove interactive rendering or bypass website access controls.
Validation and any remaining limitations belong in the dated evidence report;
the full browser goal remains in TASKS.md.
