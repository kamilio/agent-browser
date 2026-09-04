# Adjacent DOM insertion integration checkpoint

September 4, 2026. This integrates the pending `insertAdjacentElement` and
`insertAdjacentText` bindings with the committed native DOM and corrects their
template-boundary preflight. The earlier `ADJACENT-INSERTION.md` and its original
measurements remain historical evidence, not a new runtime validation run.

## Integrated behavior

Element bindings support the four adjacent positions, with case-insensitive
position matching, same-owner element identity and ordinary native movement.
Text insertion creates distinct literal text nodes, including empty strings;
it does not parse markup or merge neighboring text. Parentless outside insertion
retains its no-op result without allocating an unreachable text node.

Argument, hierarchy, lifetime and resource checks remain explicit. Foreign-node
adoption and object string coercion remain unsupported. Capability reporting
adds only the two adjacent methods and their positions; unrelated command-host
tracing, tab guards and capability expansion remain pending.

The bindings use the existing document mutation owners. Live queries, form/radio
ownership, styles, geometry, semantic snapshots, raster output and event ancestry
therefore follow moves rather than relying on a separate DOM. Native observer
records preserve removed/added node identity and sibling boundaries. Observer
fixtures are injected host capabilities, not SafeJS or full guest event-loop
acceptance. Inserting text into a template element's own child list does not
overwrite its separate inert content.

## Template preflight correction

The pending text preflight counted only ordinary parents. Native insertion also
counts template hosts across content-document boundaries. At the depth limit,
preflight could allocate a text node and then have insertion reject it, leaking
an orphan and consuming the document's shared resource budget on each attempt.
Empty text had the same problem.

The preflight now follows ordinary parents and template-host links using native
document references. It rejects excessive depth before text allocation. Element
cycle checks use the same host-inclusive ancestry, reporting
`HierarchyRequestError` before movement rather than leaking an internal
`invalid-input` error from the later native check. Exact-boundary sibling
insertion remains allowed. Existing hierarchy validation and post-mutation hook
errors retain their behavior; the correction does not add a broad error rewrite
or pretend that already-committed trusted-hook effects are rolled back.

## Evidence

The unchanged 45-case pending adjacent-insertion suite is promoted. A new
25-case `src/adjacent-core.test.ts` adds template depth/cycle checks, mutation
record identity/order, literal/empty text, template host/content separation,
radio/form-owner updates and precise capabilities. All 25 fail on isolated prior
HEAD. With pending bindings present but before the correction, twelve fail:
eight repeated-allocation checks and four host-inclusive cycle checks. A fixture
initially omitted the required command-host factory; that fixture was corrected
before recording the twelve-failure baseline.

Both integrated suites pass all 70 cases. Focused runs pass 327 tests across
eight working-tree files and 324 across eight isolated files. Both trees pass
build, typecheck, strict checking of the three affected test files and five-file
lint. Full native runs pass 9,502 tests across 263 working-tree files and 8,196
across 236 isolated-commit files. The command-host test difference remains
unrelated pending tab-guard coverage, not altered assertions.

The DOM Standard adjacent-insertion algorithms were reviewed on September 4,
2026 at `https://dom.spec.whatwg.org/`. Native regression results are not WPT or
external-browser conformance evidence.

## Runtime gate and next work

Read-only authenticated source inspection found upstream
`poe-platform/poe-code` main at
`e4e23699e696d320363da662d1d74475bb098d28` on September 4, 2026. In that revision,
`packages/safe-js/src/realm.ts` still requires nested-operation registration
during setup, authorizes it through `source:nested`, and recognizes awaited
results by registered function identity. `interp/host-bridge.ts` calls host
functions with an undefined receiver. The browser's publication guard also wraps
per-node methods, changing their function identity.

Consequently, merely forwarding the currently declared nested-operation hook is
not sufficient for lazily created guest `click()` methods. A supported owned
method/factory contract must preserve receiver/target identity, awaited nested
callbacks, publication checks and closure without executable-source rewriting,
preallocating methods for hypothetical nodes or bypassing runtime ownership.
Next record that precise public-contract requirement and continue independent
JavaScript DOM coverage. Source inspection did not execute or install SafeJS,
and does not establish released-package acceptance.

Guest statement-order, released-runtime lifecycle/performance, live-site,
socket, real TTY/PTY and physical-input gates remain open. No gated probe ran;
the previously denied SafeJS probe remains unrun. Historical reports and
unrelated pending edits are preserved, and the full seven-day browser goal
remains active.
