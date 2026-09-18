# Native XMLHttpRequest

The extension page runtime supplies a bounded, text-only XMLHttpRequest with a
guest-owned constructor/prototype and native network ownership. It is intended to
support ordinary request middleware, including prototype wrappers that call the
original open/send methods and synchronous response reads during CSRF setup.
It does not skip security scripts or manufacture authentication responses.

## Execution and policy

- Synchronous send uses the existing public SafeJS setup-time nestedOperation
  registration: the guest waits while native asynchronous I/O continues. It does
  not block Node, insert await into publisher source or return a guest Promise.
- Asynchronous requests expose buffered ready-state transitions and owned guest
  listener/handler dispatch. Reentrant open/abort invalidates earlier completion.
- Both paths use PageFetch.requestText, sharing ordinary fetch's CORS/preflight,
  CSP connect policy, mixed-content rejection, redirect checks, cookie context,
  header filtering, cancellation and resource accounting. Forbidden request
  headers cannot override native policy; response cookies are not exposed.
- Native response leases retain their byte charge until release. Reopening,
  aborting or closing the document cancels owned work and revokes response views,
  including previously obtained native header views. Cumulative charges are not
  refunded. Native lease objects are never published to guest or agent APIs.
- The constructor and event receivers live in SafeJS; request listeners are not
  retained as native callbacks. Constructor ownership is released on close.

Runtime factories opt into bootstrap support with supportsPageInitialization.
The extension factory advertises it; legacy fetch-only runtimes retain fetch
without receiving unsupported initialization source. document.domain exposes
the document URL's hostname read-only; origin relaxation is not implemented.

## Supported subset and bounds

String request bodies and empty/text responseType are supported. GET/HEAD omit
the body. statusText remains empty, matching native fetch, and decoding is UTF-8.
responseXML is null. Binary/blob/document responses, upload events, MIME overrides,
credential arguments to open and listener AbortSignal options are unsupported.
No streaming progress or byte-count fidelity is claimed. Listener exceptions are
not reported to Window; their values are neither logged nor retained by the host.

The document allows 64 XHR objects. Each has 32 registered listeners plus fixed
handler slots and 8,192 dispatches per lifetime. Headers are capped at 128 entries/
16 KiB. Requests share fetch's pending/request/body/response/retention limits.
Configured asynchronous timeouts cannot exceed 5,000ms; synchronous XHR requires
the default timeout and response type. A zero XHR timeout does not remove the
native fetch deadline. These are resource ceilings, not full browser parity.

## Validation levels

The core37 native union passes 4,954 tests across 114 explicit native test files;
build, strict selected-test types and formatting pass. Scoped lint retains one
pre-existing assignment-in-expression finding in ScriptDom.ranges, independently
reproduced on core33. The unrelated code and lint rule are unchanged.

Native evidence: `/tmp/agent-browser-xhr-union04-9Dlsxu/execution/EXECUTION.json`.
The first union preserves its legacy-fetch regression; the corrected capability
selection passes that same test without weakening it. Worker native text tests,
bootstrap static tests and native owner tests are not actual guest execution.

The separate actual SafeJS gate passes all four synthetic scenarios in 6.778
seconds: synchronous request/middleware and host-vs-guest timer ordering,
asynchronous events/credentials/failures, reentrant abort/open, and closing a
pending request. All four realms finish with zero retained values/data. Native
work, timers, request owners and child/group close; private HOME/TMP are empty.
Evidence: `/tmp/agent-browser-xhr-actual-core37-p7dBOq/execution/REPORT.json`.
Parent independently verifies 14 execution artifacts and 7,069 input pins.

Earlier actual initialization failed because the bootstrap accidentally returned
the guest global for host data export. Its terminal void expression fixes that
completion without weakening SafeJS descriptor/prototype restrictions. The failed
gate and diagnostic remain preserved. Five native reentrancy regressions also
reproduce before the reset/admission fixes and pass afterward.

Live Zoom validation remains a separate gate. This document does not claim usable
meeting UI, admission, audio or notetaking, or qualification of a different SDK
release. The actual gate uses the pinned experimental ClrIn4 SafeJS package.
