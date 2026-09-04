# Native template ownership

September 4, 2026 continuation of `HTML-DOCUMENTS.md`, `PARSED-DOCTYPES.md`
and the seven-day browser plan. This checkpoint implements native ownership,
copying and serialization, not page-facing template or parser conformance.

## Ownership and traversal

Native `DocumentTree.createElement("template")` creates an associated empty
fragment in a separate about:blank document. `templateContent(id)` returns its
stable frozen `{ tree, id }` reference. A document reuses one contents owner;
templates created inside that owner reuse the owner itself, not another document.
`isTemplateContentsDocument` marks this native role. `templateHost(fragmentId)`
returns the inverse host reference, or null for ordinary fragments.

Contents are not ordinary template children. DOM ancestry, connectivity,
queries, textContent and ordinary `walk()` do not cross the host edge. Content
mutations affect the contents owner's revision. The explicit
`walkIncludingTemplateContents()` traversal includes both ordinary children and
associated fragments, with owner references and depth for every entry.

Insertion rejects host-inclusive cycles before detaching nodes. Host edges count
toward native depth limits, including when a complete template subtree moves or
an incoming fragment is imported. This is a resource bound, not a claim that DOM
parentNode follows template hosts. Fragment insertion drains children normally;
it never transfers the associated fragment's host identity.

## Bounded allocation and copying

The first template joins its document and contents owner to one resource pool,
using the initiating document's node/text limits. If a pool already exists, it
is reused. Creating templates cannot multiply aggregate quotas. The shared pool
retains its document-count bound; each document retains its own local limits.
`nodeCount` and `resourceUsage()` remain local counters, not graph totals.

The initial empty template consumes four aggregate nodes: the original root,
template element, contents document root and contents fragment. Allocation
preflights host/fragment/root capacity and safe global IDs before creating nodes.
Detached contents remain charged. Explicitly closing a contents owner fails
future access and template creation closed rather than replacing identities.

Deep cloning/import traverses the complete graph and creates independent target
contents. Shallow template clones receive empty contents. Importing a contents
fragment does not carry its external host link. Native control payload and
selection/checkedness/input state are copied from each actual source owner.

Complete-copy preflight checks shared capacity and distributes nodes/text to the
correct local destination documents. A larger supplied pool does not bypass a
smaller local limit, nor does the implementation incorrectly charge the entire
graph to the primary document. Each later payload rechecks allocation budgets.
As with existing native copy callbacks, reentrant allocations can make a copy
fail after partial detached copies were allocated; those copies stay charged.

Closing the initiating native document closes its associated contents owner
before invoking parent close callbacks. Cleanup continues and aggregates failures.
Closing imported contents does not close the independent source document.

## Serialization

HTML serialization emits a template's associated contents, not its ordinary
DOM children. Traversal carries the actual owner for each node, preserves nested
templates and raw script text, and uses one output budget across every owner.
No script is executed by native creation, copying or serialization.

## Remaining integration gates

- ScriptDom `.content` is not exposed. Its owner needs identity-stable bindings,
  inert defaults, publication guards and teardown before guest access is enabled.
- Template parsing and template fragment contexts still reject explicitly. Real
  insertion modes, formatting stacks and owner-aware insertion are required;
  removing the rejection or pretending the context is a body is insufficient.
- Inert parser owners must suppress resource and policy side effects, not just
  JavaScript evaluation. Native ownership alone does not establish this gate.
- Creation through a contents owner's `implementation` must share family quotas
  while inheriting the actual caller's origin, not accidentally the main page's.
- Cross-document adoption remains unsupported; foreign-node movement rejects.
  Explicit import is a distinct operation, not an adoption substitute.
- Declarative shadow roots, content patching, XML/namespaces, broader quirks
  behavior and full browser template compatibility remain open.

No SafeJS, live website, socket or real TTY/PTY probe ran. The previously denied
SafeJS probe remains unrun. Native checks do not close runtime, live-site,
terminal, portability or release acceptance gates.

## Validation

Three initial ownership/serialization/copy regressions fail before integration.
Three later local-quota regressions also fail before their preflight fix.
The final 40 new tests pass, along with 262 focused checks across seven files.
On September 4, 2026, the explicit native suite passes 8,192 tests / 231 files
in the working tree and 5,432 / 170 available files in an isolated HEAD plus
owned-patch snapshot. Missing pre-existing untracked test files account for the
snapshot's smaller available set; neither run includes gated probes.

Production and new-test typechecks, builds and three-file Biome checks pass in
both trees. The isolated patch preserves the pre-existing pending source delta.
Historical reports remain unchanged; these are new native measurements only.

## Research

Reviewed the WHATWG HTML template-element ownership and cloning algorithms on
September 4, 2026. A read-only comparison of Blink's `EnsureTemplateDocument`
confirmed its reuse of an associated about:blank owner; no Chromium dependency,
runtime or reference-browser probe was introduced. Page-facing template-owner
origin/contentType behavior is not inferred from that implementation detail.
