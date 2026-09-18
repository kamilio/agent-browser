# Native page Event and CustomEvent

Page runtimes advertising trusted page initialization receive guest-owned `Event`
and `CustomEvent` constructors. Setup does not require a fetch transport. Legacy
runtime adapters without initialization support keep their previous bindings.
No additional runtime dependency or browser engine is used.

## Boundary

Guest code owns the prototypes, constructor coercions and CustomEvent detail.
Arbitrary detail values, accessors and prototypes are not copied to the host.
The native owner retains the constructed receiver once through the public SDK
bridge, creates a native BrowserEvent, and gives callbacks that original guest
receiver. A private guest WeakMap selects the native facade for dispatch; repeated
opaque guest-reference handles must not be compared as host identity.
Native event state supplies targets, phases, cancellation and propagation.
Constructed events are untrusted; `isTrusted` is an own nonconfigurable getter.

Window and DOM expose one shared guest dispatch function. It sends native target
and event-facade capabilities to a setup-registered nested host operation, without
retaining either dispatch argument as a guest reference. Native target registration
and publication guards reject forged, foreign, unpublished or revoked targets.
The existing DocumentEvents dispatcher runs those guards before and after dispatch.
Native host callers receive a Promise; guest callers require the SDK's controlled
synchronous-result bridge. Window handles travel through a private port method,
not a getter that the classic-global adapter would remap to the guest global.

Bounds per page owner:1,024 constructions,8,192 dispatch attempts,4,096 bound
targets,256 UTF-16 code units per type. Close cancels pending dispatch, revokes
constructed-event facades and releases retained constructor/receiver/dispatcher
references.
Metrics expose pending releases and cleanup failures rather than hiding them.

## Scope and gates

This is partial Event support, not full DOM event conformance. Legacy
`document.createEvent`, `initEvent`, `initCustomEvent`, a public EventTarget
constructor and specialized event constructors are not supplied. Existing
native-generated event facades are not newly guaranteed to satisfy guest
`instanceof Event` checks.

Native owner tests are separate from guest-bootstrap syntax tests, actual SDK
acceptance and website execution. Core44 passes **5,059 tests across121 explicit
native files** in76.093 seconds. Build/types/format pass. Scoped lint retains the
independently reproduced, pre-existing ScriptDom.ranges assignment finding.
Process/group are absent and execution HOME/TMP are empty. Qualification source:
`/tmp/agent-browser-event-union07-EZ0CzC/candidate`.

The actual ClrIn4 SDK gate passes its first three scenarios, including complete
observed closure: constructors/coercions, guest event/detail/receiver identity,
native capture/bubble/cancellation, and direct Window/document dispatch with path
aliases. Scenario four, propagation/reuse, still fails with SDK `reentry` during
immediate callback reuse. The final two scenarios are not executed. **The overall
SDK gate is FAIL**, not partial acceptance relabeled success. See
`/tmp/agent-browser-event-actual-core44-1rZR4k/HANDOFF.md`.

Earlier failures remain preserved: native node-publication wrapping, old mock
initialization expectations, a harness listener-owner lookup, opaque guest-reference
identity, and document-close listener retention. Listener ownership now clears
before external teardown; a native early-close regression demonstrates the former
failure. Same-event recursion is rejected locally with an error named
`InvalidStateError` before host suspension and its guard resets in `finally`;
this does not supply a general DOMException implementation. The remaining SDK
callback scheduling issue requires separate public-API reproduction/correction
and a fresh complete SDK gate before the prepared live Zoom run.

Zoom's previous filtered run executes fifteen scripts and the real native CSRF
request. The next captured script uses event APIs, but its original exception is
not recovered. Event support alone is not proof of usable Zoom UI, legitimate
admission, incoming audio, permitted recording, transcription or delivery.
