# Live document name queries

September 4, 2026. `document.getElementsByName()` now uses the existing native
collection owner instead of requiring applications to build a CSS selector or
walk the DOM themselves. No runtime dependency or second document index is added.

## Shared document state

The method matches exact `name` attribute values in document tree order, including
empty values and names on non-control elements. It does not match IDs, fold case,
trim whitespace, split tokens or interpret CSS metacharacters. An absent attribute
does not match an empty name. Detached subtrees and inert template contents remain
outside the document list until inserted.

The retained result is live: name changes, parsed insertion, moves, removals and
body replacement update it through the existing revision cache. Results are the
same node capabilities returned by other DOM methods, not copied nodes. Tests
mutate a returned node and observe that change through selectors and geometry.
Different document/binding owners have separate capabilities and lifetimes.

This exposes the indexed native NodeList subset: `length`, numeric reads and
`item()`. It deliberately omits HTMLCollection `namedItem()` and radio-group
`value`. Out-of-range indexed reads return undefined; `item()` returns null.
Repeated identical queries reuse the owned capability. The method is document-only,
not an Element or DocumentFragment API.

Missing arguments throw TypeError. Explicit undefined and other supported
primitives use the existing DOMString conversion. Objects, functions and Symbols
remain explicitly unsupported; no guest conversion hook is invoked. Extra
arguments are ignored. Full NodeList prototypes/iteration/callback methods,
general Web IDL coercion and namespace-sensitive foreign-content semantics remain
open; this is the native HTML document model, not a full DOM conformance claim.

## Quotas and publication

Name queries share collection-count, query-length, item-count, aggregate cached
entry and traversal-work limits. Name comparison string lengths count toward work,
including nonmatches. Failed refreshes preserve the previous cache accounting and
can recover after mutations bring the document within budget.

Adding another public live list exposed an ownership hazard in the common factory
path. Publication now reserves both identity and a collection slot before calling
the host factory. Same-query reentry fails explicitly, and distinct pending
publications count toward the collection limit. Factory throws, invalid results,
binding/store closure and document closure cannot publish a stale collection.
Entries read during a failed publication are released, and leaked getter closures
are revoked. A separately published nested collection survives an enclosing
factory failure without corrupting the shared cache accounting.

These publication protections apply to the common collection owner, including
existing tag/class/form collections. Successful collection semantics are otherwise
unchanged. They are tested with native host factories, not a released SafeJS probe.

## Evidence and remaining gates

All 42 new cases fail on isolated prior HEAD and pass after implementation.
Focused native runs pass 147 tests / six files in both working and isolated trees.
Both trees pass types/builds, strict new-test checking and three-file lint.
Authorized full native runs pass 10,050 tests / 277 working files and 8,904 / 255
isolated files. `TASKS.md` and `SEVEN-DAY-PLAN.md` also record these results.

Read-only research on September 4 used the HTML Standard's document name-query
contract at `https://html.spec.whatwg.org/multipage/dom.html`. This was a
specification review, not an upstream test run or browser comparison.

No live website, socket, real TTY/PTY or SafeJS probe ran. The denied SafeJS probe
remains unrun. Historical reports and unrelated pending work are preserved. The
full seven-day browser objective and original compatibility gates remain active.
