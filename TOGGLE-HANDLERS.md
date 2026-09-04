# Native disclosure handler properties

September 4, 2026 continuation of `DETAILS-TOGGLE.md`, `DISCLOSURE-MARKERS.md`
and `SEVEN-DAY-PLAN.md`.

## Owned handler slots

Event-enabled script elements and documents now expose an `ontoggle` property;
the page window exposes the corresponding window-owned slot. Text and fragment
objects do not acquire the property. A body element retains its own handler
rather than forwarding it to the window.

The properties use the existing `ScriptEventBindings` handler registry, not
parallel callback storage or a second event dispatcher. Functions replace the
current handler while preserving its original listener position. Clearing and
reactivating a slot moves it to the end. Non-function primitive assignments clear
the slot without compiling source text. `addEventListener` registration remains
independent even when it uses the same callback.

Real document-owned disclosure tasks deliver the existing coalesced old/new
state, source, target and event capability. Callback `this` and `currentTarget`
identify the relevant element, document or window. Normal details notifications
do not bubble to ancestor handler slots; capture listeners still observe them.
Reentrant handlers can change disclosure state and receive the later queued
notification. Replacement/removal during dispatch uses the current handler.

Existing controlled callback phases let later listeners proceed without awaiting
a returned promise. Synchronous exceptions and asynchronous rejection use native
error reporting. Immediate propagation stops apply to later listeners. Handler
slots count against existing listener quotas, and replacement does not consume
additional slots. Failed registration leaves the slot unset. Clone/import does
not copy listeners. Closing bindings revokes retained getters/setters, unregisters
callbacks and prevents queued tasks from invoking them.

## Native evidence

The final 24-case new file produces 21 failures and three passes on isolated
prior HEAD. After wiring the properties, matching focused runs pass 178 tests /
six working files and 172 / six isolated files. Both trees pass type checking,
builds, strict new-test checking and three-file Biome checking. The explicit
`native-tests.json` manifest includes the new file. Authorized full native runs
pass 10,310 tests / 283 working files and 9,164 / 261 isolated files. The isolated
snapshot contains only this checkpoint on prior HEAD, not unrelated pending work.

The fixture supplies native host-object and callback-lifecycle implementations.
It does not execute SafeJS or establish released-runtime callback retention or
performance. Tests exercise actual document mutation, toggle scheduling and
native event dispatch rather than manually calling assigned handlers.

Read-only primary research on September 4 used the HTML event-handler IDL,
global-handler and processing rules, and Web IDL callback conversion rules:

- `https://html.spec.whatwg.org/multipage/webappapis.html#event-handler-idl-attributes`
- `https://webidl.spec.whatwg.org/#es-callback-function`

## Remaining acceptance gates

This is property wiring for the existing native event model, not complete
GlobalEventHandlers or ToggleEvent conformance. Inline handler source compilation
and attribute-mutation synchronization, realm-correct exotic callback conversion,
bare global handler bindings, full prototype/constructor and trust semantics,
and return-value cancellation for synthetic cancelable events remain open.
The native details notifications covered here are noncancelable.

Continue missing-summary fallback controls and remaining event interfaces;
general lists/counters, complete UA/shadow/accessibility and released-runtime/
browser acceptance remain open. No live-site, socket, real TTY/PTY or SafeJS probe
ran; the denied SafeJS probe remains unrun. Historical evidence and unrelated
pending work stay separate. The full seven-day browser objective stays active.
