# SafeJS: expose realm-owned callback synchronous-prefix completion

## Request

Please expose a public, realm-owned way to distinguish a guest callback's
synchronous execution boundary from settlement of its final asynchronous result.
This is an extension API request following #540, not a request to reopen it or
move browser DOM/event policy into SafeJS.

One possible shape, with naming left to the maintainers:

```ts
context.startCallback(callback, { thisValue, args }): {
  synchronous: Promise<void>;
  result: Promise<unknown>;
}
```

The same operation could also be available on the owning realm, subject to the
existing ownership, invocation, cancellation and budgeting rules.

## Public contract inspected

At commit `3192ef3c52ea16f7b31704a70e75497049516787`,
`packages/safe-js/src/extensions.ts` and `packages/safe-js/src/realm.ts` expose
`invokeCallback` with a single `Promise<unknown>` result. The implementation waits
for the guest result to settle and uses an internal async-prefix mechanism, but
the inspected public API does not expose that separate boundary.

This is source-level contract evidence. We have not independently executed the
new published package, so this issue is not a claim of a failing released-package
test. If the existing public API already supports this distinction, a supported
consumer example would resolve the integration question.

## Why the host needs both phases

Our TypeScript browser's event dispatcher must observe a listener's synchronous
effects, including cancellation and propagation changes, before advancing to the
next listener and deciding default actions. It must not wait for an async
listener's final result, which can remain pending indefinitely.

- Treating the final result as both phases can stall dispatch on a pending fetch
  or let late async effects incorrectly influence an already-decided action.
- Treating the synchronous phase as immediately complete can let the dispatcher
  advance before the interpreted listener has performed its synchronous work.
- A fixed number of host microtask turns cannot define this contract, especially
  when the interpreter yields cooperatively or invokes nested host operations.

The boundary should distinguish genuine guest suspension from interpreter
implementation awaits and cooperative budget yields. The host remains responsible
for DOM event rules and action policy.

## Local behavioral evidence

A bounded, in-memory probe against our existing experimental public-core candidate
passes eight checks on September 2, 2026:

1. Synchronous effects are visible at prefix completion.
2. The final result remains pending after that boundary.
3. Another listener completes while the first listener remains suspended.
4. Releasing the host wait preserves async-tail ordering and the return value.
5. A synchronously throwing ordinary listener rejects both handles.
6. An async-tail failure does not retroactively reject the completed prefix.
7. Closing the owner rejects suspended results without releasing the host wait.
8. The closed owner reports terminal lifecycle state.

This shows the behavior our consumer currently relies on, not conformance of the
new public extension API. The probe uses no HTTP server, real website, external
browser engine or additional dependency.

## Acceptance criteria

- A normal public/core consumer can obtain both boundaries using only exported
  extension/realm APIs. No private interpreter imports or native evaluation.
- Stable callback/receiver/argument identity, including retained guest references,
  stays within the current owner and grant boundaries.
- Ordinary synchronous throws and async-function rejections retain their distinct
  semantics, including rejection before an async function's first await.
- Pending callbacks, nesting, invocation work and retained values remain bounded.
  Cooperative yielding must not falsely finish the synchronous guest phase.
- Nested dispatch and overlapping callbacks cannot bypass realm reentry rules.
- Close, abort, fatal budget errors and revoked/foreign callbacks settle or reject
  all applicable handles without leaking ownership or unhandled rejections.
- Public Node/Bun consumer tests cover prefix effects, pending tails, later
  callbacks, synchronous/asynchronous failures, nesting, cleanup and budget yields.

Keeping `invokeCallback` as the convenient final-result API is useful; callers
that do not need phases should not need to manage extra handles.
