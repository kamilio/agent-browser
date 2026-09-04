# HTML document-closing recovery

Checkpoint: September 4, 2026. Native TypeScript implementation only.

## Reference and behavior

Reviewed the WHATWG HTML parsing standard, last updated September 3, 2026:
`https://html.spec.whatwg.org/multipage/parsing.html`, particularly in-body,
after-body and after-after-body processing and the table-start quirks condition.

Document closing changes insertion mode without discarding the open-element
stack. Subsequent body content resumes at the retained insertion point, including
open formatting elements or a node detached by a native hook. A body/html end
cannot cross an intervening scope boundary. The dedicated body check includes
the scaffold body root; ordinary scope searches and fragment-root popping retain
their existing restrictions.

After-body and after-after-body are separate modes. Whitespace is processed in
the body without changing the closing mode. Comments after a body end belong to
the html element; comments after an html end belong to the document. Other content
resumes body processing. Repeated html/body starts merge missing attributes
without replacing open ancestors. Fragment document-closing restrictions remain
in effect, including the special html-context fragment path.

A document in quirks mode retains an open paragraph when a table starts. A
no-quirks or limited-quirks document closes it through the existing button-scope
path. This is a tree-construction distinction, not quirks layout support.

## Text adjacency and native mutation

External trailing comments no longer break otherwise adjacent body text into
separate nodes. Cached text coalescing now validates the actual preceding sibling
at the intended insertion location, with the document owner included in the
cache key. Moving the old text, appending an element, or appending another text
node during native comment notification cannot redirect later parser text into
the stale cached node. Foster text uses the same adjacency path.

This does not normalize all pre-existing adjacent text nodes or claim complete
conformance for every possible reentrant native mutation. The tests exercise
specific move/append cases and retain the existing parser-hook ownership model.

## Bounds and lifecycle

Body-end stack visits share the existing immutable scope-work budget and check
cancellation on every visit. Cached/foster text adjacency scans use the existing
table/insertion work budget. Both caps remain the smaller of 1,600,000 visits
and 64 times the configured node limit. These are operation bounds, not complete
wall-clock or RSS evidence.

Closing markup is not early parser completion: remaining writes, script hooks,
the parsed callback, cancellation and trailing-node quotas still apply. Failures
close candidate documents through the existing cleanup path. No page runtime or
additional dependency is introduced.

## Remaining work

Before-html/before-head, after-head and head-noscript distinctions still need
broader insertion-mode work. Full EOF diagnostics, fragment inheritance of a
host document's quirks mode, parser-created form-owner overrides and modern select
behavior remain open. Foreign construction, framesets, DOM adoption, cross-owner
observer/runtime breadth and framework compatibility are not established here.

No SafeJS, live website, socket or real TTY/PTY probe ran. The previously denied
SafeJS probe remains unrun. These native results do not close independent
runtime, live-site, terminal, portability or release acceptance gates.

## Validation

Eleven initial closing/quirks regressions fail before implementation. Three
external-comment text-coalescing cases and three native mutation adjacency cases
also fail before their respective fixes. The final 61 new tests cover document
modes, comments, attributes, scope boundaries, fragment contexts, formatting,
tables, templates, writes, native reparenting, cancellation and resource limits.
The focused run passes 391 tests across nine files.

On September 4, 2026, the explicit native suite passes 8,515 tests / 237 files in
the working tree and 5,755 / 176 available files in an isolated HEAD plus owned
patch. The smaller isolated set excludes pre-existing untracked tests. Production
and new-test typechecks, builds and three-file Biome checks pass in both trees.
Existing pending work remains outside this checkpoint; historical reports retain
their original paths and measurements.
