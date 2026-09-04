# Public contract request: owned, lazily created awaited host methods

Draft prepared September 4, 2026. Not posted, implemented or runtime-validated.
This requests a reusable SafeJS host capability, not browser code inside the
interpreter or an alternative extension framework.

## Source evidence

Read-only inspection of `poe-platform/poe-code` at
`e4e23699e696d320363da662d1d74475bb098d28` found:

- `packages/safe-js/src/realm.ts`: `nestedOperation` requires setup-time
  registration and `source:nested` authorization. Awaited host results are
  recognized by the registered function's identity.
- `packages/safe-js/src/interp/host-bridge.ts`: host functions are called with an
  undefined receiver; an unregistered async host function returns a guest Promise.
- `packages/safe-js/src/extensions.ts`: the public context exposes nested
  operations and separate callback-prefix/result phases, but not an owned lazy
  host-method factory or equivalent receiver-aware declaration.

These are pinned source observations, not claims about a published package's
installation, provenance or consumer-test results. No runtime probe ran.

## Browser integration problem

The browser publishes node capabilities lazily, including nodes created after
extension setup. Each publication wraps methods with owner/publication guards.
Consequently, a per-node closure is both created too late for setup registration
and different from a previously registered generic function. Registering a shared
function alone also does not identify the node through a host receiver.

Some DOM methods must remain synchronous to guest code while their host
implementation waits for nested guest listener prefixes. For example,
`element.click()` must finish click propagation and the applicable default action
before the following guest statement observes checkedness. The method returns
undefined, not a Promise. The listener's asynchronous tail is separate and must
not keep the DOM call waiting after its synchronous prefix finishes.

Plain async or fire-and-forget wrappers change these semantics. Preallocating
closures for every possible node, rewriting guest source, using native eval,
private interpreter hooks or bypassing publication guards are not acceptable
integration strategies.

## Required public behavior

Please provide an owned lazy-method/factory contract, or an equivalent supported
composition of existing APIs, with these properties. No API spelling is assumed.

1. The extension declares/authorizes the operation family during setup; it can
   later publish methods for newly created host capabilities without arbitrary
   late elevation of an unrelated function.
2. The declared operation retains its awaited-result semantics after the intended
   owner/publication guard is applied. The actual invoked function, its owner and
   its lifetime remain explicit rather than inferred from function shape.
3. The operation receives a safe receiver or an explicit bound target. Foreign,
   forged, unpublished and revoked targets cannot select a different node/realm.
4. Nested callbacks preserve their receiver and retained argument identities.
   Waiting for the synchronous callback phase does not await its async tail.
5. Nested/reentrant calls share the realm's scheduling and budget ownership.
   Suspended operations cannot evade call-depth, work, retained-data or pending
   operation limits. Creation and release of bound methods must be bounded too.
6. Cancellation/closure interrupts pending prefixes, unwinds cleanup once and
   revokes saved methods. Failure during publication leaves no callable orphan.
7. Ordinary async host methods remain ordinary Promise-returning operations.
   Source evaluation permission is not silently expanded merely to dispatch a
   previously retained callback. Document any required grant explicitly.

## Consumer acceptance cases

Run these against the selected public SDK artifact, not only a fake factory or
host-originated invocation. Browser tests can separately prove native activation.

```js
const checkbox = document.createElement("input");
checkbox.type = "checkbox";
document.body.appendChild(checkbox);
const result = checkbox.click();
record(result === undefined, checkbox.checked);
```

Expected: both values are true, including when the element was first published
after setup. A host-side `await checkbox.click()` is not equivalent evidence.

Additional cases must establish:

- Listener/default order precedes the next guest statement; preventDefault
  restores checkbox preactivation before that statement executes.
- A listener changes state before an unresolved await; click returns after that
  prefix, while its async tail remains pending and may resume independently.
- Nested clicks on another node and a same-node recursive click preserve the
  browser's per-element activation guard and the runtime's shared budgets.
- Lazy methods work for original, cloned and imported node capabilities without
  receiver substitution, duplicate registration or loss of revocation checks.
- Saved/borrowed methods follow the documented receiver policy; wrong-owner and
  post-close calls fail without mutation or invocation of another realm's code.
- Abort during a pending listener prefix releases the owning dispatch and method
  resources without waiting for the listener's unresolved async tail.
- Host-method failure, callback-prefix failure and fatal budget exhaustion retain
  their proper diagnostics and do not leave the realm/job queue wedged.
- Repeated create/publish/invoke/close runs demonstrate bounded method ownership
  and exact-once cleanup; both Node and Bun public consumers retain these rules.

## Status and boundaries

This document is a local request draft only. No issue, PR, SDK patch, dependency
installation or capability grant is created by it. Actual SDK execution still
requires separate authorization. The browser's guest click, dispatch/focus/reset,
full event-loop and runtime/site acceptance gates remain open; native tests do
not satisfy them.
