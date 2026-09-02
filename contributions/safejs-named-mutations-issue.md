# SafeJS: bounded writable named host-object properties

## Request

Extend the public realm-owned host-object capability contract with optional
dynamic named setters and deleters. This builds on the intentionally read-only
named capability from #546; it is not a request to reopen that completed scope.
Please keep browser storage/DOM policy in consumers and generic metered property
operations in SafeJS. No native Proxy or JavaScript evaluation fallback is wanted.

Our independent TypeScript browser now binds session-owned localStorage,
sessionStorage and document.cookie. Explicit Storage methods work through the
existing fixed host methods. Actual interpreted code can add, toggle and delete
todos through agent input, reload the document, and restore the persisted UI.
However, web Storage also requires dynamic property assignment and deletion:

```js
localStorage.theme = "dark";
localStorage.getItem("theme") === "dark";
delete localStorage.theme;
localStorage.getItem("theme") === null;
```

Predeclaring properties cannot support arbitrary keys or preserve a saved
Storage object's identity across native updates and other tabs. Copying data to
a guest object would split browser state from the real session store.

## Current evidence and version scope

Read-only GitHub source inspection on September 2, 2026 at repository revision
`521363bf16bdc9ae63f60f7ba47d57c03f2011fc` shows
`packages/safe-js/src/interp/host-capabilities.ts` has `named.keys/get` and bounds,
but no named setter/deleter. `setHostObjectMember` writes only a matching fixed
property setter; otherwise it throws. We have not installed or runtime-tested
the newly released package and do not claim this is a regression in it.

The existing experimental v13.0.10-based browser core passes the explicit-method
workflow, but a named assignment does not reach the native Storage map. This
request is supported by the current public type boundary and that consumer need,
not by a claim of testing the current published package.

## Desired generic contract and acceptance

- Optional synchronous named `set(name, value)` and `delete(name)` providers,
  including creation of a key not returned by `keys()` before the write.
- Keep default read-only behavior for existing declarations. Define fixed-member
  and indexed-member precedence explicitly; a named mutation must not overwrite
  protected host methods or fixed accessors accidentally.
- All values pass through normal guest/host conversion and owner checks. No host
  prototype, accessor, Proxy trap or foreign-realm capability is invoked or leaked.
- Preserve normal assignment-expression return values, deletion results, key
  membership/enumeration and subsequent named/method reads after mutation.
- Keep key-count, aggregate key-size, work, retained-data and cancellation limits.
  Validate before mutation wherever SafeJS can guarantee it; document the split
  between provider-owned atomic storage quotas and interpreter-owned budgets.
- Revoke saved accessors/mutators on realm close. Reject async providers and
  observe rejected promises without an unhandled rejection.
- Test creation/update/removal, nonexistent deletion, native changes between
  reads, readonly declarations, fixed/indexed collisions, numeric and adversarial
  key names, conversion failures, provider throws, bounds and cross-realm access.
- Public root/core exports and installed consumer TypeScript/runtime coverage.

An API with an explicitly selectable mutation policy is fine; the exact field
names above are illustrative. Existing named collections must remain read-only
unless a consumer deliberately enables mutations.
