# Document fragments and node cloning

September 1, 2026. The independent document model and SafeJS DOM adapter now
support document fragments and shallow/deep node cloning. This is browser-side
work using the existing experimental public core; no interpreter patches or
additional dependencies are introduced by this checkpoint.

## Implemented

- `document.createDocumentFragment()` creates a detached, owned node with type
  11, name `#document-fragment`, stable capability identity and `ownerDocument`.
- Fragments support child mutation, text content, ordinary bounded selectors,
  `getElementById`, event-listener registration and `getRootNode()`.
- Insertion transfers the children in order and empties the fragment. It does
  not insert or connect the fragment itself; existing child capabilities and
  element references retain identity. `appendChild` returns the fragment.
- All transferred subtrees are checked for depth before any children move.
  Invalid references, cycles, foreign capabilities and invalid parents reject
  before mutation. The script adapter also rejects document text children or
  multiple document elements before consuming a fragment.
- `cloneNode()` creates a detached shallow copy; `cloneNode(true)` copies the
  subtree, attributes, character data and stored control state. Copies have new
  node identities and do not copy registered listeners or host capabilities.
  Fragment clones retain their fragment kind without consuming the original.
- Control indexes now use the actual tree root, including detached fragments.
  Detached radio groups and cloned controls do not accidentally consult another
  document-connected group. Moving a focused element into a detached fragment
  clears focus instead of resurrecting it upon reinsertion.

## Resource and isolation boundaries

Cloning preflights aggregate node and text budgets, including attribute names,
attribute values and stored control values, before allocating copies. Failed
budget checks leave node count and revision unchanged. Existing limits apply to
detached nodes too; removal is not a quota refund while node identities survive.

Fragment insertion batches the child-array transfer rather than repeatedly
shifting its first entry or spreading unbounded function arguments. A trusted
model test transfers 150,000 children using explicitly enlarged limits; this is
not the default limit or a browser-performance claim. Native work remains bounded
by configured tree limits, not charged precisely to interpreter instruction
steps. The owned-process supervisor remains necessary for untrusted page code.

Closing the document revokes original, cloned and fragment capabilities.
Cross-document adoption/import and fabricated node objects are not permitted.

## Remaining compatibility work

- The later `HTML-CONTENT.md` checkpoint adds contextual fragment parsing and
  innerHTML replacement/readback. OuterHTML replacement, insertAdjacentHTML,
  template contents and full contextual parser conformance remain open.
- Document cloning explicitly reports unsupported. Doctypes, namespaces,
  custom-element reactions, shadow roots and full DOM hierarchy/exception types
  are not implemented. The internal `DocumentTree` remains a general document
  model; stricter document-child validation is applied at the script boundary.
- Child collections remain snapshot arrays rather than live DOM collections.
  Detached native-state selectors and detached label associations remain
  explicitly unsupported even though ordinary fragment queries work.
- Copying stored control state is not a claim of full HTML cloning semantics.
  Complete dirty-flag behavior, derived radio/option state at clone time, shallow
  textarea value semantics and specialized element cloning steps still need
  conformance work. Inserting/cloning script nodes does not execute them; general
  dynamically inserted scripts remain unsupported.
- Books to Scrape and Quotes to Scrape still fail dynamic-site compatibility at
  the separately reported SafeJS function-object/prototype limitation (#541).
  The extension/realm request (#540) remains pending. Fragment fixture success
  must not be counted as either site's dynamic acceptance.

## Evidence

`reports/unit-node-2026-09-01-fragments.json` records 1004 passing tests across
57 files.
`reports/fragments-process-sites-2026-09-01.json` records owned-process HTTP
fixtures (18 passing checks) and separate public-site reporting checks (two
passing checks, neither representing dynamic-site acceptance). The fixture's actual page
script creates, queries, clones and inserts fragments, then native CLI clicks
exercise independent original/clone listeners. Additional evaluation commands
inspect state rather than injecting the tested implementation.

Build and focused test files are also checked with strict TypeScript, and the
configured Biome check passes across 134 package source/script files. These
results are also recorded in `TASKS.md` and the report index.

Primary references checked for this checkpoint:

- https://dom.spec.whatwg.org/#concept-node-pre-insert
- https://dom.spec.whatwg.org/#concept-node-clone
- https://html.spec.whatwg.org/multipage/input.html#the-input-element

These references define the intended behavior; this partial implementation does
not claim complete conformance or a passing web-platform test suite.
