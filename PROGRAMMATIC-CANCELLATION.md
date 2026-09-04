# Programmatic activation cancellation checkpoint

September 4, 2026. This checkpoint makes the native asynchronous activation
owner abortable and records the unresolved guest-method boundary. It does not
expose an async substitute for synchronous `HTMLElement.click()`.

## Native correction

`DocumentInteractions.programmaticClickAsync(id, signal?)` now forwards its
optional signal to the shared event-action runner. Previously, callers could
not abort a pending controlled click/reset listener prefix. An already-aborted
extra argument was ignored, allowing events, preactivation and defaults to run,
or a disabled/recursive activation to resolve as a no-op success.

The shared runner rejects before starting the generator and checks cancellation
around asynchronous event dispatch. The activation generator's existing cleanup
restores checkbox checkedness/indeterminate state and the previous radio when
click preactivation has not committed. It releases per-element click guards,
including both the label and its forwarded control. A pre-aborted recursive call
does not disturb another activation's guard.

An abort during click prevents later input/change/default actions. A reset-prefix
abort preserves edited values instead of applying defaults, and interrupted link
or submit activation does not return a navigation/submission intent. No network
request is implied by native intents. Once the checkbox's click has committed,
an abort during `input` or `change` preserves the already-observed checkedness;
this is cancellation, not transactional rollback of the entire interaction.

Focus, held keyboard modifiers and mouse state remain unchanged by programmatic
activation. Interrupted listener prefixes may settle later without resuming the
aborted browser action. The browser does not forcibly stop arbitrary listener
code or undo that code's independent effects. A subsequent activation can run
normally after cleanup.

## Guest activation audit

The current `ScriptDom` still has no guest `click` method. The browser's
`ReleasedContext` type declares `nestedOperation`, but `extensionPageRuntime`
does not currently pass that operation into `PageBindingContext`; its declared
extension grants remain `guest:retain`, not nested-source execution.

Read-only review of the locally retained upstream extension/realm snapshots
labeled `dde2f655` confirms setup-owned nested-operation registration, a
`source:nested` authorization check, and awaited results keyed by the actual
registered host function. These are pinned source observations, not a claim
about the latest published or locally installed SDK. The actual-release probe
and guest statement-order gate were not run.

Lazy DOM method creation must preserve registered function identity, callback
receiver/argument ownership, reentrancy and closure. Returning an ordinary
Promise from a host `click` method or firing activation in the background would
let the next guest statement observe unfinished listeners/defaults. Neither
approach satisfies the synchronous DOM call boundary. This checkpoint therefore
adds no such wrapper, new capability grant, private runtime hook or dependency.

The WHATWG HTML activation algorithm was reviewed on September 4, 2026 at
`https://html.spec.whatwg.org/multipage/interaction.html#dom-click`: disabled
controls, the per-element click guard and synthetic untrusted activation.
That review is not an executed browser-conformance test. Integration must still
prove `element.click(); readState()` ordering, not only an awaited host call.

## Regression evidence

The explicit native list adds `src/programmatic-cancellation.test.ts` with 22
cases: eight pre-aborted target types, nine interrupted event/forwarding stages,
four queued-abort boundaries and protection of an already-active recursive
guard. Every case fails on both the pre-fix working tree and isolated prior HEAD;
all pass after signal forwarding. Fixtures use native owners only, no interpreter
or external transport.

Focused checks pass 312 tests across the same eleven working-tree and isolated
files. Full native runs pass 9,477 tests across 262 working-tree files and 8,126
across 234 isolated-commit files. Both trees pass build, typecheck, strict checking
of the new test file and two-file lint. The isolated source change is only the
optional signal adapter; existing activation algorithms and tests are preserved.

## Outstanding scope

Next resolve setup-owned nested method registration and receiver semantics in
the public runtime adapter before exposing guest activation. Keep the actual
released-runtime statement-order/closure tests as an independent authorization
gate. Full pointer dispatch/capture, physical input, event-loop/layout fidelity,
live sites, sockets and real TTY/PTY remain open. No gated probe ran; the denied
SafeJS probe remains unrun. Existing pending work and historical reports remain
intact, and the original browser goal and seven-day continuation stay active.
