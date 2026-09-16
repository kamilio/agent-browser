# Formatting-owned SVG clip references

`buildFormattingTree` shares one lazy document ID index among all embedded SVG
scenes in a formatting pass. This avoids repeatedly scanning the same document
under the smaller standalone scene reference-search budget. The native engine
remains independent of external browser engines and page scripts.

## Resolution and bounds

- The first connected element with an exact, case-preserved ID wins in document
  order, including hidden elements and other namespaces. Detached nodes and
  separate template-content trees are not candidates. SVG namespace and
  `clipPath` checks happen after ID resolution; an earlier incompatible element
  shadows a later valid definition.
- Known IDs use the shared map. Unknown IDs resume the same traversal; a missing
  ID requires exhaustion, not a partial search. Each new formatting pass gets a
  fresh index, so mutations between passes do not reuse stale results.
- Index work, including requested fragments and encountered ID lengths, is
  charged to the existing formatting work budget. Existing defaults are 50000
  owned nodes, 256 depth and 2000000 work; caller-supplied narrower limits still
  apply. Exhaustion throws rather than silently dropping a clip or resetting the
  index. Existing source, node, depth, shape and segment geometry guards remain.
- This intentionally changes formatting-context admission and accounting. The
  standalone SVG fallback still uses its existing 4096-node/64-depth reference
  search. Document index charges are no longer separately assigned to every
  embedded scene's source accounting. This is not byte-identical accounting.
- The index and walk can use O(N) storage, bounded by document ownership.
  Existing node snapshots and wide-child traversal allocations remain; the
  counters are not exact allocation or wall-clock bounds.

## Trusted host callback

The fourth options argument to `documentSvgScene` accepts an optional synchronous
`clipReference(fragment): number | undefined` callback. This is a trusted native
host integration point, not a page-runtime or agent-provided script hook.

The scene decodes valid percent escapes before calling the resolver, preserving
case. Malformed escapes do not invoke it. The owner must return the first
connected element with that ID in document order, across all namespaces and
visibility states. Return `undefined` only when the complete bounded search proves
absence. A missing result is final: the scene does not retry its standalone scan.
The owner must charge its own indexing budget, propagate limits and errors, and
not mutate the document while resolving.

The scene validates a defined option's function type and requires a positive safe
integer result or `undefined`. The returned node must exist, be an element and
have the requested ID. Callback exceptions propagate. These checks do not prove
connected membership or first-ID selection for an arbitrary host callback; that
remains the owner's responsibility. The formatter supplies the bounded resolver
described above. Async callbacks are unsupported: Promise/thenable results fail
the integer check, are not awaited, and any incorrectly started asynchronous work
is not cancelled or observed by the scene API.

Omitting the callback preserves standalone resolution. Existing formatter error
handling still reports unsupported/invalid scenes as deferred where applicable;
resource-limit and unexpected errors are not converted into missing references.

## Evidence and remaining work

See `reports/formatting-svg-references-2026-09-16.md` for native regression,
old-production controls and captured-source results. On the saved CNET source,
formatting gets past the clip-reference limit and constructs all 32 SVG scenes.
The resulting tree is still partial: full-source native clicking fails on
unsupported CSS/layout, including unloaded external stylesheets. This is not a
new live website validation or a successful full-page interaction.

The original 100-page results remain in
`reports/agent-citation-revalidation-v2.md`. That list is a citation-derived proxy,
not measured global agent page visits. Historical outcomes are not rewritten by
this saved-source repair. Overall browser work and its remaining acceptance gates
are tracked in `TASKS.md`.
