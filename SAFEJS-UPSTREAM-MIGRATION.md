# Upstream SafeJS migration

Status: September 2, 2026. Implementation and released-package verification are
pending. This is a migration contract, not a claim that the browser already uses
the resolved upstream APIs.

September 2, 15:35 UTC: poe-code #547 now requests an explicit public callback
phase contract. The issue is verified open and its body matches
`contributions/safejs-callback-phases-issue.md`. It is an API enhancement/guidance
request supported by source inspection and the local experimental-core probe,
not a claimed defect reproduced against the released package.

## Inspected evidence

The authenticated GitHub API confirms that poe-code issues #540 through #546 are
closed. The #546 release comment reports `@poe-platform/safe-js@0.1.29`; its
published-consumer tests are upstream evidence, not tests performed here.

Public source inspected at `3192ef3c52ea16f7b31704a70e75497049516787`:

- `packages/safe-js/src/core.ts`
- `packages/safe-js/src/extensions.ts`
- `packages/safe-js/src/realm.ts`

The locally installed global poe-code is still 13.0.10. The workspace poe-code is
4.0.48. Neither is evidence of the newly released extension implementation. No
package was downloaded or installed for this inspection.

## Contract changes

| Boundary | Existing browser expectation | Inspected upstream API | Required change |
| --- | --- | --- | --- |
| Package loading | Experimental `@poe-code/safe-js` or `poe-code` exports | Released scoped SafeJS package and public core entrypoint | Verify the published manifest and public export before accepting it. |
| Host objects | Global `createHostObject` before realm creation | `context.createHostObject` during an owned extension lifecycle | Construct DOM, Window, timers and fetch bindings inside extension setup. |
| Extension setup | Preconstructed bindings | `defineExtension`, declared globals/capabilities and explicit grants | Declare the browser-owned globals and only the capabilities actually needed. |
| Guest argument retention | Global retention helpers | Setup-time `context.retainGuestArguments`, `guest:retain` grant and owner release | Register retained host operations during setup and release references on cancellation/close. |
| Evaluation result | Return value with thrown interpreter failures | Tagged `RealmResult`, including `ok: false` | Check failure before reading a value; preserve failure diagnostics and ownership cleanup. |
| Result conversion | Exported `deepCopyFromSandbox` | Realm exports the evaluated value | Keep the browser's bounded JSON-result validation; do not import interpreter internals. |
| Errors | Exported `SandboxError` constructor | Not exported by the inspected core | Use the public result/error contract rather than a private class identity. |
| Cancellation | Per-evaluation signal and `realm.closed` | Realm lifetime signal; no public `closed` field or evaluation signal | Track browser-owned closure and abort the lifetime for fatal timeout/cancellation. |
| Limits | Browser-specific realm source/evaluation options | Explicit supported realm options and resource collection limits | Keep source/run limits in the adapter; pass only upstream-supported options. |
| Callbacks | Separate synchronous-prefix and final-result promises | `invokeCallback` returns one completion promise | Resolve the dispatch-phase contract before replacing the existing event adapter. |

Indexed and named host-object declarations now exist upstream. Preserve live
identity, bounds, ownership and revocation tests when moving those declarations
into extension setup; closure of #545/#546 is not browser-integration evidence.

## Callback migration gate

`ScriptCallbackRuntime.startCallback` exposes both `synchronous` and `result`.
The event dispatcher needs to finish the listener's synchronous work before
deciding default actions, without waiting for an async listener's final result.

The inspected upstream implementation uses an internal async-prefix mechanism,
but its public `invokeCallback` returns the final result after awaiting the guest
value. Its public types expose no separate prefix-completion handle. This source
inspection establishes a contract mismatch, not a tested defect in the release.

Do not adapt the API by resolving the prefix immediately, by awaiting the final
result for both phases, or by assuming a fixed number of microtask turns. Those
approaches can change event ordering, cancellation or liveness.

Before choosing an adapter or claiming the released API fails our contract, run
a public consumer probe against the actual release that covers:

1. Synchronous `preventDefault()` before the listener's first suspension.
2. A listener that remains pending while later listeners and default actions run.
3. Late cancellation after an async suspension not retroactively changing an action.
4. Nested dispatch, listener ordering and synchronous listener failures.
5. Close/abort while a callback is pending, with no retained guest handles.

The explicit phase capability is requested in #547, with an invitation for a
supported existing-API example if one already expresses the boundary. Completed
issues were not reopened; the host-constructor proposal remains separate.

## Experimental-core contract probe

`scripts/check-callback-phases.ts` runs through the existing declared experimental
public core with in-memory host waits. The report
`reports/callback-phases-safejs-fixture-2026-09-02.json` contains eight passing
checks: prefix effects, a still-pending final result, progress of another callback,
ordered async settlement, synchronous failure, async-tail failure, cancellation
of suspended results, and terminal owner closure. Each wait and cleanup is bounded.

The probe establishes the behavior our adapter currently relies on; it does not
test the newer extension API, native DOM dispatch conformance, public websites
or a live terminal. No package download, SDK edit or dependency was involved.

After building the package, use an explicitly selected existing compiled candidate:

```bash
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/absolute/path/to/candidate/packages/safe-js node packages/browser-agent/dist/scripts/check-callback-phases.js --trace
```

## Implementation and acceptance order

- [ ] Obtain permission for the previously denied released-SDK download; inspect
  the exact package without dependency installation or lifecycle scripts.
- [ ] Verify actual package exports and runtime behavior with public consumer
  tests; do not substitute repository source for the published artifact.
- [ ] Resolve callback phases through the public API and the probes above.
- [ ] Move browser capability construction into one owned extension setup.
- [ ] Adapt results, limits, cancellation, guest retention and cleanup together.
- [ ] Test distinct documents/realms, stale and foreign capabilities, setup
  failure, repeated closure, budgets and interrupted evaluation.
- [ ] Re-run DOM/events/timers/fetch/CORS and owned-session integration tests.
- [ ] Re-run approved actual terminal and public-site gates; preserve failures.
- [ ] Remove dependence on the experimental core only after the release passes
  these gates, without weakening safety or narrowing the original browser goal.

The prior denial of package download and live terminal/site execution is not
overridden by upstream issue closure. No such action was retried for this audit.
