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

The historical ClrIn4 SDK gate passes its first three scenarios, including complete
observed closure: constructors/coercions, guest event/detail/receiver identity,
native capture/bubble/cancellation, and direct Window/document dispatch with path
aliases. Scenario four, propagation/reuse, still fails with SDK `reentry` during
immediate callback reuse. The final two scenarios are not executed. **The overall
SDK gate is FAIL**, not partial acceptance relabeled success. See
`/tmp/agent-browser-event-actual-core44-1rZR4k/HANDOFF.md`.

September18,22:27UTC: a fresh actual SDK gate passes **all six unchanged
scenarios** in7.597 seconds using the same core44 native build and an explicitly
selected experimental SDK correction. This includes propagation/reuse/rejection,
nonclassic aliases and close-mid-dispatch in addition to the first three cases.
All observed owners close, pending/references/cleanup failures and SDK data/
retained values reach zero; processes are absent and execution HOME/TMP empty.
Parent verifies7,079 input pins and19 execution artifacts. No website/socket,
credential, TTY or media access occurs in this synthetic integration gate.
Evidence: `/tmp/agent-browser-event-actual-prefix-sdk-1AyC4V/HANDOFF.md`.

The SDK now releases a completed ordinary synchronous callback's running lock
before publishing prefix completion. Still-active bodies and asynchronous/
thenable results retain their existing protections. Scoped SDK tests pass149/149
after a clean four-failure baseline; strict types and fresh build pass. Only
`realm.js` differs in the2,863-file experimental package. This is not an installed
SDK upgrade, default-release acceptance or full SDK union. The incremental patch
and exact ancestry are retained in `contributions/safejs-callback-prefix-reuse/`.

Earlier failures remain preserved: native node-publication wrapping, old mock
initialization expectations, a harness listener-owner lookup, opaque guest-reference
identity, and document-close listener retention. Listener ownership now clears
before external teardown; a native early-close regression demonstrates the former
failure. Same-event recursion is rejected locally with an error named
`InvalidStateError` before host suspension and its guard resets in `finally`;
this does not supply a general DOMException implementation. With the separate
SDK reproduction/correction and six-case gate now passing, one fresh bounded
live Zoom run is released. Its outcome remains separate from synthetic success.

Zoom's previous filtered run executes fifteen scripts and the real native CSRF
request. The next captured script uses event APIs, but its original exception is
not recovered. Event support alone is not proof of usable Zoom UI, legitimate
admission, incoming audio, permitted recording, transcription or delivery.
