# Preserve guest argument identity across deferred native-host callbacks

Related to #540. While adding browser timers using only the experimental public
realm/host-object/callback APIs, an actual public-core probe exposed this boundary:
ordinary guest objects passed to a host function are copied. Passing that copy
back through `startCallback` creates a different guest object. Timer arguments
must retain identity and observe mutations made after scheduling.

Reproduction through the browser adapter on the v13.0.10-based local candidate:

```js
let argument = { value: 1 };
let identity;
setTimeout(function(value) {
  identity = value === argument;
  value.value = 2;
}, 0, argument);
```

After the timer, `[identity, argument.value]` was `[false, 1]`, not `[true, 2]`.
The browser must not import private interpreter objects or fake this with copies.

## Requested public extension capability

- Opt an explicitly granted host operation into opaque retained guest arguments
  starting at an argument index. Leading arguments can retain ordinary conversion.
- Permit returning a handle or passing it to a callback only in its owning realm.
- Preserve objects, cycles, closures, primitive values and live DOM capabilities.
- Keep native handles opaque; do not expose interpreter fields or host globals.
- Explicit release plus realm-close revocation, collection and data budget
  accounting, and rejection across replay, foreign-realm and error-data boundaries.
- Preserve existing deep-copy behavior unless the trusted host explicitly opts in.

A local candidate uses `retainGuestArguments(operation, from)` and
`releaseGuestReference(handle)` from the public core. Live host methods preserve
the declaration. Synchronous host failure releases newly captured handles.
Default conversion is unchanged. This is a proposed extension primitive, not a
request to put browser timers or DOM implementations inside SafeJS.

Focused tests cover mutation/identity, cycles, closures, methods, foreign/stale
handles, retained-data and collection budgets, release and native exceptions.
No package is installed or published; no upstream PR is opened. The wider SDK
validation still has known missing-tooling/fixture failures, reported separately.
