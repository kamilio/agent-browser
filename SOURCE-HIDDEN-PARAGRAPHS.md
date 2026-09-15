# Redundant paragraph ends inside source-hidden subtrees

The source-hidden reader policies omit subtrees declared hidden by source
attributes, plus supported inline `display:none` under the inline policy. HTML
paragraph starts can implicitly close preceding paragraphs. A hidden container
with `<p><p>omitted text</p></p>` therefore contains a redundant final paragraph
end, rather than another container closure.

While already omitting a source-hidden subtree, the reader ignores an end `p`
only if neither its visible-open nor skipped stack contains `p`, `svg` or `math`.
The ignored end emits no content, changes no stack and cannot close the hidden
root. Subsequent text remains omitted until the actual root end. Paragraphs open
across the boundary, foreign content, other mismatched tags and unclosed hidden
roots retain strict rejection. Default/non-hidden behavior remains unchanged.

This is deliberately narrower than full HTML error recovery. It mirrors the
empty paragraph created and closed by the native parser for a stray HTML end `p`
without allocating an invisible node. Existing implied paragraph/list ends,
raw/template omission, token/text/depth/output/raw-work limits and partial-reader
disclaimers remain intact. The ignored token is still counted and budgeted.

## Observed failure

On September 15, 2026 the native browser received HTTP 200 and 643745 decoded
bytes for the llama.cpp build document on GitHub. Both source-hidden policies
failed in a hidden fallback container containing redundant paragraph ends. The
default policy sanitized that same capture successfully but intentionally did
not filter source-hidden content. The fix does not disable visibility filtering
or select that less restrictive policy as a fallback.

Offline development comparison reconstructs only the exact saved response and
runs the native research workflow. The original live failure receipt remains
unchanged and is still rejected by ordinary successful-capture replay admission.
This is not a second live GitHub request, a rewritten successful receipt or a
general authorization to replay failures. No scripts, credentials, runtime
dependencies, new limits or access-barrier bypass are introduced.

Validation and original/candidate results are recorded in
reports/llm-reference-content-2026-09-15.md and its JSON companion. The overall
browser goal and separate SafeJS/provider/interactive acceptance gates remain open.
