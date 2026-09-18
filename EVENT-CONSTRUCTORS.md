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

This is partial Event support, not full DOM event conformance. A public
EventTarget constructor and specialized event constructors are not supplied.
Bounded generic legacy event support is described below. Existing
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

The next filtered live run executes sixteen scripts and the native CSRF request.
The previous script16 now passes. An exact captured SDK error span identifies
`document.createEvent` in script17 as the next failure; this diagnosis does not
reexecute publisher code. See `reports/zoom-event-progress-2026-09-18.md`.
Event support alone is not proof of usable Zoom UI, legitimate admission,
incoming audio, permitted recording, transcription or delivery.

## Legacy generic events

The document exposes a guest-owned `createEvent` factory for ASCII-case-insensitive
`Event`, `Events`, `HTMLEvents` and `CustomEvent`. Unsupported interfaces reject
with an error named `NotSupportedError`; no specialized event is impersonated.
The owning document capability and publication guard are validated. Window and
elements do not gain a `createEvent` method.

Created events have genuine Event/CustomEvent prototypes, native timestamps and
empty, uninitialized event state. Both native dispatch paths reject them until
initialization; guest dispatch rejects before crossing the host boundary with
`InvalidStateError`. Ordinary `new Event("")` remains initialized and dispatchable.
`initEvent` resets type, bubbles, cancelable, cancellation/stop flags and target
without replacing the timestamp or composed flag. It is ignored during dispatch.
`initCustomEvent` additionally updates guest-owned detail without host traversal;
inherited `initEvent` does not erase custom detail. Both guest methods return void.

The factory retains one bounded guest reference, accounted separately by
`legacyFactoryReferences` and released on close. Initialization uses existing
native event capabilities without repeatedly retaining guest receivers. Invalid
factory and construction arguments are released on rejection.

Core47 passes5,088 tests across122 explicit native files in58.639 seconds.
Build/types/format pass; only the historical ranges lint finding remains.
The baseline native implementation fails all24 new initialization cases, retained
as failure-first evidence. Core46's exact-registration mock and tuple-spread type
errors are preserved; final expectations remain strict. A new eight-case actual
SDK gate fails in its first original scenario: the appended initialization
boolean falls inside the SDK's retained-argument suffix and arrives as an opaque
reference, not a boolean. All resources close; seven scenarios do not execute.
This failure is retained at
`/tmp/agent-browser-legacy-event-actual-september18-8lxy3o/HANDOFF.md`.
Native source/build for that checkpoint:
`/tmp/agent-browser-event-union10-zsMU0K/candidate`.

Core48 corrects that boundary without an SDK change. Ordinary construction keeps
its original five-argument operation; a separate legacy allocator retains only
the receiver and selects uninitialized state natively. Primitive flags are never
placed after a retained receiver. The native opaque-reference fixture now also
wraps primitive suffix values, matching the actual SDK contract. Core48 passes
5,089/122 native tests in58.141 seconds, with build/types/format0 and the same
baseline lint finding. Source/build:
`/tmp/agent-browser-event-union11-aj5A7H/candidate`.

The fresh actual SDK check passes **all eight unchanged scenarios in12.138
seconds**, including both legacy cases and full observed closure. Forged object,
null, Window and element factory receivers produce catchable guest TypeError;
successful creation and dispatch still work afterward. No speculative
data-copy failure or test relaxation is needed. Factory references, all other
event references, pending work and SDK data reach zero; processes are absent.
Parent verifies7,093 input pins and53 artifact hashes/sizes/modes. Evidence:
`/tmp/agent-browser-legacy-event-boundary-september18-9hkHyf/HANDOFF.md`.
One new bounded live Zoom load is released; its outcome remains separate.

The first core48 live entry request times out before receiving a response or
executing scripts; see `reports/zoom-legacy-event-load-timeout-2026-09-18.md`.
Also, identical event/performance clock origins are not qualified: the actual
factory case observes a6.827-second offset under its coarse bounded clock check.
Timestamp preservation across initialization is exact; clock alignment remains
an explicit limitation rather than being inferred from the eight-case PASS.
The one authorized retry receives the document and fails later in script17 at
a Unicode regexp compilation quota, not the previous createEvent call. See
`reports/zoom-unicode-regex-budget-2026-09-18.md`; full application execution
and all meeting/notetaking gates remain open.
