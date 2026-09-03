# Native element traversal

September 3, 2026 continuation of the JavaScript-application work in the seven-day
plan. Native DOM capabilities now support element-only child and sibling traversal
through the existing document tree, without another engine or runtime dependency.

## Interfaces and shared state

- Documents, document fragments and elements expose readonly `firstElementChild`,
  `lastElementChild` and `childElementCount`. These inspect only immediate children,
  skip text/comments and return null or zero when there are no element children.
- Elements, text nodes and comments expose readonly `previousElementSibling` and
  `nextElementSibling`. They skip non-element siblings, return the existing native
  element capability, and return null when no matching sibling exists.
- Sibling properties are not added to documents or fragments. Parent traversal
  properties are not added to text or comment nodes. Attr capabilities remain
  separate and do not acquire these mixins.
- Insertions, reordering, removal, fragment moves, parsed HTML replacement and
  normalization update traversal through saved node capabilities. Detached and
  cloned subtrees remain locally traversable without becoming connected documents.
- Binding or tree closure revokes retained DOM accessor calls. The binding closes
  its traversal owner and drops retained cache entries.

## Work and retention

`ElementTraversal` builds the direct-child element count, endpoints and neighbor
index in two linear passes. Subsequent reads at the same document revision reuse
that index instead of searching from the beginning of a sibling list. Any document
revision change conservatively discards the cached indexes; selective structural
invalidation is not claimed.

Default limits are 256 cached parents, 65,536 cached child records in aggregate,
and 100,000 child visits per index build. A build preflights its two-pass work
before allocating records. Over-budget access throws without publishing a partial
index or changing the tree. It can recover after the parent shrinks.

Cache pressure evicts least-recently-used parents, not native node capabilities.
A parent larger than the cache capacity can still be answered within the work
limit, but its index is not retained. Repeated access to such a parent requires
rebuilding; mutation-heavy traversal also rebuilds after each revision. Cache
limits therefore do not promise constant-time traversal for every workload.

## Native evidence

Eight initial behavioral reproductions failed; five initial readonly/scope checks
already passed. The expanded thirty-one-case suite covers mixin scope, identity,
mixed node kinds, mutation, detachment, cloning, normalization, closure, limits,
cache reuse/eviction and recovery. Sixty deterministic moves/removals are compared
against a separately computed tree-order oracle.

An instrumented unchanged-parent test contains 3,000 children, including 1,000
elements. Reading count/endpoints and both element-sibling directions for every
element builds one index with 6,000 child visits. A spy independently counts
10,003 total native tree reads, including accessor/parent reads, with 2,002 cache
hits. These are operation counts, not timing, RSS or real-site measurements.

The first focused command used a nonexistent CharacterData test filename and
therefore ran four files. The corrected command includes the existing explicit
`character-data.test.ts` entry and passes 119 tests across five native files.

Final validation on September 3, 2026: the full working tree passes 6,299 tests
across 194 explicit native files, with no unhandled errors. The isolated
HEAD-plus-owned-patch snapshot passes typechecking and 3,539 tests across 133
available allowlisted native files. Production build, strict new-test types and
targeted source/test lint and formatting pass. These isolated results exclude
the pre-existing unfinished browser work rather than bundling it into this change.

## Remaining gates

This is native DOM and cache evidence only. SafeJS execution, framework/site
compatibility, socket transport and terminal/playground interaction remain open
and separately authorized. It does not implement live `childNodes` NodeLists,
namespaces, CDATA/doctype node modeling, shadow trees or full DOM prototype parity.
The broader browser outcome in `TASKS.md` is unchanged.

Primary reference reviewed September 3, 2026:
`https://dom.spec.whatwg.org/#interface-parentnode` and
`https://dom.spec.whatwg.org/#interface-nondocumenttypechildnode`.
