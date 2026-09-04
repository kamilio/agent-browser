# Bounded DOM querying

Status: September 1, 2026. `DocumentQueries` queries our own `DocumentTree`
without an external selector package or browser engine. It is a building block
for the future page DOM bridge and agent extraction API, not a functioning
browser, CSS layout engine or complete selector implementation.

## Host SDK

- `querySelector(selector, root?)` returns the first matching node ID or null.
- `querySelectorAll(selector, root?)` returns a frozen, static array of matching
  node IDs in document order, without duplicates. It never silently truncates.
- `matches(elementId, selector)` tests an element with itself as `:scope`.
- `closest(elementId, selector)` tests the element and its ancestors, retaining
  the original element as `:scope`.

Query roots default to the document. Element-rooted queries return descendants,
not the root itself. Ancestors outside the query root can participate in matching
a selector. Document `:scope` refers to its first element; `:root` is the document
element. Returned IDs can be converted to stable refs with `tree.reference(id)`
and passed to the interaction layer. Invalid inputs and unsupported syntax throw
typed errors rather than returning misleading empty results.

Node indexes are cached by tree root and document revision. Attribute, text,
structure and control mutations invalidate them. Only one tree index is retained;
closing the document or query object releases it and the compiled-selector cache.
Detached subtree structure can be queried, but native control-state pseudos in
detached trees currently fail explicitly because the underlying control model's
index is connected-document-only.

## Implemented subset

- Type/universal, ID and class selectors; lists and descendant, child, adjacent
  sibling and general sibling combinators.
- Attribute existence, equality, token, language-prefix, prefix, suffix and
  substring matching; explicit ASCII `i`/`s` flags. HTML's specified insensitive
  attribute names use ASCII folding; data attributes, IDs and classes otherwise
  remain case-sensitive. This assumes an HTML/no-quirks document model.
- Identifier escapes, hexadecimal code points and escaped strings, including
  line continuation, NULL/replacement handling and escaped EOF replacement.
- `:is`, `:where`, `:not` and relative `:has`, including child/sibling relations.
- First/last/only child and of-type pseudos, An+B nth variants, and filtered
  `:nth-child(... of selector-list)` / `:nth-last-child(... of selector-list)`.
- `:scope`, `:root`, `:target`, `:empty`, `:focus`, `:focus-within`, link/any-link and native checked, indeterminate,
  enabled/disabled and required/optional states. `:visited` never exposes history.

`:empty` treats whitespace-only text as content, matching the established
browser behavior rather than claiming the newer whitespace-ignoring draft rule.
Native state uses the existing control model, including first-legend disability
exceptions, radio groups and select options. Generic ARIA attributes do not turn
arbitrary elements into native CSS controls.

`:target` reads stored document target state, not a fresh URL-to-ID lookup on
every query. Push/replace URL rewrites do not implicitly retarget it; fragment
navigation does. `HISTORY.md` documents the distinction and missing scrolling.

## Deliberate gaps

No namespaces, XML/SVG case rules, quirks mode, pseudo-elements, shadow roots,
layout/hover/focus-visible state, validity pseudos, language/direction pseudos or complete
Custom Elements state. Unknown/unsupported pseudos fail even inside `:is` or
`:where`: forgiving selector-list recovery is not implemented. Explicit `:scope`
inside `:has`, nested `:has` and full tokenizer error recovery are not supported.
`NTH-TOKENS.md` adds token-aware An+B comments/escapes and filtered-child `of`
identifiers with shared query/style/feature-query behavior. This is not a WPT
conformance claim.

These SDK methods are not yet exposed as page DOM methods or CLI handlers.
Constructed-tree queries do not prove that website scripts or real-site selectors
work end to end. No Kitesurf/Playwright parity row is complete from this module.

## Bounds

Defaults, configurable per `DocumentQueries` instance:

| Resource | Default |
| --- | ---: |
| Selector source | 8,192 UTF-16 code units |
| Selector components | 256 |
| Functional nesting | 16 |
| Indexed document nodes, including text/comments | 50,000 |
| Match work units per operation | 5,000,000 |
| Returned matches | 10,000 |
| LRU compiled selector entries | 32 |
| Filtered-sibling memo tables and entries | 100,000 |
| Absolute An+B coefficient/offset | 1,000,000,000 |

Work units count matching/traversal and relevant string lengths; they are not
milliseconds or heap bytes. Index building has its own node bound and happens
before matching. Structural sibling positions are shared; filtered sibling
positions are memoized within an operation. Expensive relational/backtracking
queries fail on quota exhaustion. No user-provided regular expression or host
JavaScript source is evaluated. Fixed parser regular expressions operate on
bounded input. Full page execution still requires the isolated-runtime boundary.

## Evidence

- `src/selectors.test.ts`: now 110 cases, including relational/filtered nth queries,
  escaping, malformed input, quota failures, mutation invalidation, detached
  structure, native state, target selection and delegated event handling.
- `reports/unit-node-2026-09-01-history.json`: latest full package run, 383 Node
  tests passing across 16 files. The relevant 172 history/URL/event/query checks
  also pass on Bun in `reports/history-core-bun-2026-09-01.json`.
- `reports/unit-node-2026-09-01-queries.json`: earlier 335-test Node checkpoint;
  zero failed/pending tests. Includes the new selector suite and earlier suites.
- `reports/queries-bun-2026-09-01.json`: all 104 selector cases also pass on Bun.
  This does not override the separate Bun networking/TLS incompatibility.
- `reports/query-resources-node-2026-09-01.json`: constructed fixtures of 100,
  2,000 and 10,000 elements pass matching, work-denial and cleanup checks.

The 10,000-element fixture took about 25 ms to construct; its first ID query,
including cold indexing, took about 22 ms. Cached filtered-nth and relational
queries took about 8 and 3 ms. The process RSS sample was about 98 MiB at that
point, including Node and earlier fixtures. These are individual observations,
not peaks, isolated per-document allocations or full-browser performance. No
HTML parsing, page VM, rendering or network was involved. Closing drops references
but does not promise an immediate RSS decrease; no GC was forced.

Reproduce after building:

```bash
bun run --cwd packages/browser-agent check:query-resources
```

Primary references consulted:

- `https://www.w3.org/TR/selectors-4/`
- `https://drafts.csswg.org/css-syntax-3/`
- `https://html.spec.whatwg.org/multipage/semantics-other.html#case-sensitivity-of-selectors`
- `https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall`

No third-party source or dependency was copied or installed for this work.
