# CharacterData and text-node normalization

Page scripts can now edit native text/comment data through CharacterData methods,
split text nodes and normalize subtrees. These operations change the same document
used by agent snapshots, selectors, layout and explicit captures. They add no
dependencies and do not substitute string-only snapshots for live nodes.

## Page API

Text and comment capabilities expose:

- `data`: a live string getter/setter; assigning `null` uses the empty string.
- `length`: readonly UTF-16 code-unit length, not code-point or glyph count.
- `substringData(offset, count)`.
- `appendData(data)`, `insertData(offset, data)`, `deleteData(offset, count)` and
  `replaceData(offset, count, data)`.

Text capabilities additionally expose `splitText(offset)` and readonly
`wholeText`. Comments do not acquire these text-only APIs. Every supported Node
capability has `normalize()`, including documents, fragments and elements. Calling
it on a text or comment node does not normalize that node's outside siblings.

Required arguments are checked separately from explicit `undefined`. Numeric
arguments support primitive unsigned-long conversion, including modulo wrapping,
truncation, nonfinite-to-zero conversion and negative counts wrapping to large
positive counts. Counts clip at the end of the data. Offsets beyond the UTF-16
length throw `IndexSizeError` without mutation. Numeric object/function/symbol/
bigint coercion is explicitly unsupported; the existing bounded primitive
DOM-string conversion applies to data arguments. Method `null` data becomes
`"null"`, unlike the `data` setter. No callback-driven object coercion is invoked.

## Native behavior

`DocumentTree.substringData` and `replaceData` use validated unsigned integer
arguments. Replacement preflights the existing text budget before constructing
the result or changing a node. Live `data`, `nodeValue`, `textContent` and length
reads stay consistent with native writes.

`splitText` preserves the original identity and inserts a new text node directly
after it when attached. A detached original produces a detached result. Boundary
splits produce an empty piece. Splitting within a surrogate pair preserves the
two UTF-16 halves rather than rewriting Unicode. The node quota is checked before
changing the original. Text accounting transfers the suffix between nodes rather
than requiring temporary quota space for two copies of it.

`wholeText` joins the receiver's contiguous text siblings, stopping at comments
and element boundaries. It is recomputed from the live tree; detached receivers
report only their own data. It does not concatenate every descendant of a parent.

`normalize` removes empty descendant text nodes and merges adjacent runs into the
first nonempty node. It recurses through containers and preserves boundaries,
surviving node identities and observable data on removed nodes. Removed nodes
remain valid detached capabilities until the owner closes. A second call on an
already normalized subtree is a no-op with no revision change.

The implementation scans child lists and collects bounded normalization plans
before committing. Runs are joined once, and each changed parent's child array
is rebuilt once, avoiding repeated front-splices and successively growing string
concatenation for long runs. No node-array argument spreading is used.

## Limits and lifetime

Existing `DocumentTree` node/depth/text limits apply; this feature raises none of
them. Normalization does not allocate new nodes, but copied text in the survivor
and retained data on detached nodes both count toward the document text quota.
All required text growth across the subtree is preflighted, so a quota rejection
does not leave a partly normalized document. Detached original data is not erased
to make accounting look smaller. This can reject a merge even when the connected
document's visible text length is unchanged.

Planning/traversal is bounded by the existing document arena and its text limit.
Splitting consumes one node; normalization does not reclaim node slots. Changes
invalidate the existing revision-based snapshot/style/layout caches. There is no
new persistent text cache or timer. Owner close revokes saved script properties
and methods, and the existing document close clears the native arena.

This is not a full CharacterData/Text prototype implementation: constructors,
CDATA/processing instructions, live Range/Selection adjustment and MutationObserver
records/delivery remain absent. The existing compact document change journal is
not advertised as standards-compliant mutation records. Unicode data editing
also does not imply broader Unicode font rendering. Agent `capabilities` reports
the supported methods and these explicit partial boundaries.

## Verification — September 3, 2026

The explicit safe regression selection passes 2,209 tests across 98 files,
including 22 new character-data cases. Build, strict changed-test typechecking,
focused lint and formatting pass. Live socket/server/PTY and restricted timer
probes are not included in this selection.

`src/character-data.test.ts` covers native and owned-capability semantics, UTF-16
halves, conversion and error behavior, live identity, node/text quota atomicity,
detached retention, comments, fragment normalization, idempotence and closure.
A 5,000-node text run normalizes to one connected survivor while retaining every
native node identity; this is a correctness/resource-bound fixture, not a Worker
performance measurement.

`scripts/check-character-data.ts` exercises production page bindings on the
explicitly selected existing experimental SafeJS core. Fifteen assertions pass:
real guest edits change measured width, agent snapshots and capture size;
splitting and normalization preserve every captured pixel; saved detached nodes,
UTF-16 halves, readonly lengths and errors behave as asserted. The probe uses
in-memory HTML, not public websites, live sockets or a browser service.

The first probe attempt stopped before any assertions because the fixture used
unsupported CSS `background` shorthand. Its failed report is retained. The
corrected fixture uses the already-supported `background-color` property; no CSS
capability was silently added or claimed.

The final-build repeat passes all 15 assertions. Existing actual-core frame,
element-size and computed-style probes pass 11, 11 and 13 checks respectively.

See `reports/character-data-focused-2026-09-03.json`,
`reports/character-data-safejs-2026-09-03.json` (initial fixture rejection) and
`reports/character-data-safejs-final-2026-09-03.json` (15 passes). Full site,
released-SDK, frontend, reference-parity and low-memory deployment gates remain
open. This checkpoint is not a claim that framework-driven public sites now pass.

## Design reference

WHATWG DOM's CharacterData, Text and Node normalization algorithms guide this
subset: https://dom.spec.whatwg.org/#interface-characterdata,
https://dom.spec.whatwg.org/#interface-text and
https://dom.spec.whatwg.org/#dom-node-normalize.
