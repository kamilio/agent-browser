# Experimental guest DOM listeners

September 1, 2026 checkpoint. `ScriptDom` can now expose guest
`addEventListener` and `removeEventListener` on its bound nodes through the local
SafeJS public callback API. This is not automatic page-script loading or a complete
browser event loop. No dependency is added and the installed SDK is unchanged.

The later native control/session/CLI integration is in `NATIVE-SCRIPT-ACTIONS.md`.
The evidence in this file records the earlier guest-listener adapter checkpoint.

## Host integration

The optional third `ScriptDom` constructor argument contains:

- `events`: this document's `DocumentEvents` dispatcher. A different document's
  dispatcher is rejected.
- `callbacks.startCallback`: the extended SafeJS public callback-phase function.
- `callbacks.isClosed`: a trusted host function reading the owning realm's actual
  closed state. It is not inferred from guest-thrown error names or codes.
- `window`: an optional explicit opaque Window capability when the dispatcher
  includes a Window target. An unbound Window in `composedPath` fails explicitly;
  it is not silently dropped or substituted with the document.

Create the DOM capabilities first, then the realm with `document: dom.document`.
The host can dispatch a `BrowserEvent` using `events.dispatchEventAsync`. The guest
registers listeners using the normal node methods, not a custom host `register`
binding. Native click, keyboard, focus and form actions now have async paths using
that pipeline (`NATIVE-SCRIPT-ACTIONS.md`). Synchronous dispatch still refuses
controlled listeners.

**Ownership:** the script adapter borrows the document dispatcher. `dom.close()`
removes only its guest listeners, revokes event capabilities and interrupts its
pending callback prefixes. It does not close native listeners or native actions.
The document/interaction owner still closes the dispatcher on document disposal.
Closing the realm must close the adapter, but readable HTML and native navigation
remain usable after a script error or timeout (`SAFEJS-COOPERATION.md`).

## Implemented behavior

- Function listeners, null/undefined no-ops, boolean capture and explicit
  capture/once/passive option records. Deduplication and removal preserve guest
  function identity across separate source evaluations.
- The callback receiver, event target and current target map to the same live
  node capabilities used by normal DOM lookup. Capture and target listeners share
  a cached event capability; retained event properties reflect dispatch cleanup.
- Live type, bubbles, cancelable, composed, timeStamp, eventPhase, defaultPrevented,
  isTrusted, target and currentTarget; cancelBubble/returnValue setters; bounded
  composedPath and propagation/cancellation methods. Existing events remain
  untrusted; this does not spoof native-user input.
- Explicit InputEvent data/inputType/isComposing, KeyboardEvent key/code/modifiers/
  repeat/location/isComposing, FocusEvent relatedTarget and SubmitEvent submitter
  bindings. Arbitrary host event properties/prototypes are not reflected.
- Once registrations are forgotten before invocation, allowing later registration
  without retaining obsolete records. Native listener quotas still apply.
- Synchronous guest listener errors remain dispatcher errors. Asynchronous errors
  are observed and retained once in `dom.eventBindings.drainErrors()`, bounded by
  the dispatcher's error count and 512 code units per message, with overflow counts.
- Actual realm closure interrupts the current controlled dispatch before later
  listeners/default-action decisions, without destroying the document dispatcher.
  Later native actions remain usable after guest listeners are removed. A guest
  error merely claiming a fatal code does not trigger this interruption.

Listener objects with `handleEvent`, guest AbortSignal bindings, constructors,
on-event properties, guest `dispatchEvent`, specialized prototype relationships
and complete Web IDL coercions are not implemented. Guest option accessors remain
unsupported by the explicit data boundary. No full DOM-conformance claim is made.
The DOM dispatch/listener algorithms are the design reference:
`https://dom.spec.whatwg.org/#interface-eventtarget`.

## Validation

- `reports/unit-node-2026-09-01-script-events.json`: 885 passing tests in 48 files,
  including fifteen new adapter cases. Build, strict checks for the new test file
  and the existing configured linter pass. Unit adapter tests use a transparent
  host factory; the separate actual-SDK probes below verify the interpreter boundary.
- `reports/safejs-dom-events-fixture-2026-09-01.json`: eighteen compiled-public-core
  checks pass. Includes real guest registration/removal, persistent event identity,
  pending callbacks, once/passive semantics, ordinary/async errors and fatal budgets.
- `reports/safejs-dom-events-sites-2026-09-01.json`: forty checks pass at
  21:45:35 UTC. The fixture checks plus eleven each on actual read-only Example
  Domain and Books to Scrape HTML loads. Scripts modify local document trees only;
  no website-authored scripts or server mutations run. The final 120279040-byte
  RSS value is a whole-process sample, not peak usage or a complete browser benchmark.
- `reports/safejs-dom-events-fixture-initial-2026-09-01.json` retains the initial
  50-second timeout with a default large budget in the deliberate infinite-loop
  test. It produced no final JSON/trace, so its exact suspension point is unproven.
  The functional exhaustion test now explicitly requests 5000 steps; that is a
  test-fixture budget, not a fix or performance claim for large realms.
- `reports/safejs-dom-events-budget-2026-09-01.json` records separate synthetic
  callback budget measurements with a two-second cooperative deadline and an
  enclosing process timeout. These measurements do not establish fast site execution.

Reproduce with the source-build command in `SCRIPT-DOM.md`. Add `--trace` to show
completed checks on stderr; add `--budget-profile` for the separate bounded
synthetic measurements. The in-process probes execute explicit trusted test source,
not untrusted public JavaScript. They are not the production process boundary.

The bounded profile at 21:43 UTC recorded these single-run samples:

| Context | Step ceiling | Steps used | Elapsed | Stop reason |
| --- | ---: | ---: | ---: | --- |
| Bare callback | 5000 | 5001 | 50.9 ms | Steps |
| Bare callback | 50000 | 50001 | 447.4 ms | Steps |
| Bare callback | 1000000 | 222208 | 2007.0 ms | Deadline |
| DOM listener failure fixture | 1000000 | 22528 | 2008.4 ms | Deadline |

The DOM fixture includes registration, ordinary and async failure checks before
the runaway callback; the bare context does not. These are not an apples-to-apples
per-instruction benchmark or a diagnosis of the original untraced timeout. They
do show that a large step ceiling alone is not a responsiveness guarantee. The
process watchdog and bounded callback deadlines remain necessary. Interpreter
cost with retained DOM capabilities needs profiling/optimization before claiming
fast dynamic-site execution; lowering a test budget does not solve that cost.

## Next integration gates

The native action/default-action migration is covered in `NATIVE-SCRIPT-ACTIONS.md`.
Add a page realm/document owner within the process boundary, load inline/external scripts in
document order, and test actual dynamic websites. Already-settled promise ordering,
nested guest synchronous dispatch and full microtask checkpoints remain unresolved.
The normal CLI/server/playground continue reporting website JavaScript as disabled.
