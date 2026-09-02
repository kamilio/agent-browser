# Event dispatch and interaction foundations

Status: September 1, 2026. These APIs connect our own document/control model to
synchronous host and controlled interpreted listeners. They are not a safe website JavaScript runtime,
complete DOM bindings or full input simulation. The implemented CLI subset uses
these actions; `CLI.md` and `KEYBOARD.md` describe that integration.
The later `NATIVE-SCRIPT-ACTIONS.md` checkpoint uses actual SafeJS guest callbacks
in explicit trusted-source probes. Never evaluate
website scripts in the host to populate this event system.

## Dispatch contract

The experimental controlled-listener API and `dispatchEventAsync` are described
in `CALLBACKS.md`. They await an explicit interpreter synchronous phase, not an
arbitrary async handler's eventual promise. Production native actions and guest
DOM listener registration are tracked separately: `SCRIPT-EVENTS.md` now provides
experimental function-listener bindings, and `NATIVE-SCRIPT-ACTIONS.md` connects
native actions to them through shared synchronous/asynchronous action sequences.

`DocumentEvents` is scoped to a `DocumentTree`. Targets are internal node IDs,
including detached nodes belonging to the same document. Paths are captured
before dispatch; reparenting during a callback does not alter that dispatch's
path. Propagation includes ancestor capture, both target listener groups and
optional ancestor bubbling. A third constructor argument `{ window: true }`
adds a Window event target; it is enabled by `DocumentInteractions`. Direct
`DocumentEvents` construction defaults to a document without a Window. Connected
paths include Window except document `load`; detached trees remain isolated.
Window IDs are negative internal context IDs, not document nodes or element refs.
There is no shadow-tree retargeting.

`BrowserEvent` exposes type, target/currentTarget, eventPhase, timeStamp,
bubbles/cancelable/composed, defaultPrevented, composedPath and legacy
cancelBubble/returnValue. Target values are IDs, not page DOM objects. Flags and
path state have no public mutation methods except the cancellation/propagation
operations. Events are explicitly untrusted (`isTrusted` is false).

Listener identity is type/callback/capture. Duplicate registration does not
change once/passive options. Once listeners are removed before calling them;
removal and host AbortSignal aborts take effect during dispatch. Each invocation
clones its listener list. Passive listeners cannot prevent defaults, ordinary
stopPropagation does not stop remaining listeners in the same invocation, and
stopImmediatePropagation does. A stop during target capture prevents the later
target bubble invocation. Cancellation persists if an event is reused; transient
dispatch/path/propagation state is cleared even when dispatch fails.

Exceptions from listeners are bounded diagnostic records, not automatically
printed and not implicit preventDefault calls. Messages can contain private or
terminal-unsafe page text: callers must redact/escape before presentation. Raw
thrown objects/stacks are not retained. Closing the document or dispatcher removes
listeners and abort hooks. Closing during dispatch stops further invocations.

Default limits are 10,000 listeners, 256 per node, nested depth 64, 1,000
dispatches and 20,000 listener invocations per outer dispatch turn, and 64
retained errors with 512-code-unit messages. Nested budget failures poison the
outer turn even if a callback catches the nested error. These limits do **not**
interrupt a blocking host callback. Page callbacks still require the separately
approved isolated VM, memory/deadline limits and a controlled job queue.

## Control interactions

`DocumentInteractions` owns its dispatcher as `events` and offers:

- `fill(ref, value)`: validates a supported text/number control, fires cancelable
  beforeinput, revalidates after callbacks, updates its value and fires input.
  It focuses the target and commits edited text with change on blur; it does not
  simulate individual keys. `keyboard.type` and `keyboard.press` provide that subset.
- `select(ref, values)`: updates selection, then fires bubbling input and change.
- `click(ref)`: fires a cancelable bubbling click, including checkbox/radio
  preactivation and input/change events for supported control activation.
- `setChecked(ref, boolean)`: skips already-matching state, otherwise clicks and
  verifies the result. It rejects attempts to uncheck a selected radio by click.

Checkbox preactivation clears indeterminate state; canceled activation restores
checkedness and indeterminacy. Radio cancellation restores the old selected
member only if it still belongs to the current group. Same-element recursive
clicks are suppressed. Exhausted event budgets stop activation and attempt to
restore its preactivation state; other listener mutations are not transactional.

Direct actions reject explicit hidden/inert ancestors, disabled controls and stale refs.
Label forwarding can activate an associated explicitly hidden control, but never
an inert/disabled control or an input of type hidden. See `FORM-ACTIONS.md`.
The disabled-fieldset first-legend exception is retained. There is no computed
CSS visibility, hit testing, geometry, scrolling, actionability auto-wait,
full native focus/selection, pointer/mouse sequence or keyboard/IME implementation yet.
`KEYBOARD.md` documents the bounded focus/caret model and cancelable key actions.
`BrowserInputEvent` describes replacement, insertion and deletion; it is not the
complete page InputEvent constructor/API.

## Defaults that are still pending

An `InteractionResult.defaultAction` is an **intent**, not a completed side
effect. It can describe HTTP(S) link navigation, form submission or a file picker.
Label forwarding and form reset now execute in the interaction layer and return
separate `label`/`reset` results. Callers must not report success for pending intents
until a browser controller executes them. In particular, submit intents have not
run constraint validation, submit/formdata events or request execution. Links
resolve against base href/target after callbacks; downloads, link auditing and
non-HTTP(S) navigation fail explicitly rather than executing host capabilities.
The separate `DocumentHistory` can now execute same-document fragment intents;
`HISTORY.md` defines that boundary. It does not fetch another document.
`BrowserSession.click` now follows supported same-tab link intents through its
explicit loader. The supplied loader handles text/JSON only. Supported submit
intents now run through `FORM-NAVIGATION.md`; picker and other-target intents remain
pending. See `SESSION.md`.

Raw `DocumentEvents.dispatchEvent` performs DOM-style propagation only. HTML
activation hooks are currently in `DocumentInteractions.click`; direct synthetic
click dispatch is not yet equivalent to page `dispatchEvent(new MouseEvent(...))`.
There are no inline handler compilation, on-event properties, CustomEvent,
Shadow DOM events, complete Window/page lifecycle handling, asynchronous page
jobs or page-to-host bridge yet. History uses a bounded host queue, not a complete
browser event loop. Legacy Window load target overrides remain unimplemented.

## Evidence

- `reports/unit-node-2026-09-01-events.json`: complete Node package suite at
  16:34 UTC, 231 passed, zero failed/pending across 13 files.
- `src/events.test.ts`: now 23 event propagation/lifecycle/budget tests, including
  Window paths. The latest full suite is `unit-node-2026-09-01-cli.json`
  under `reports/`, with 564 Node checks passing.
- `src/interactions.test.ts`: 16 event/control/default-intent tests.
- `src/label-actions.test.ts` and `src/form-actions.test.ts`: 26 association,
  activation, reset, cancellation, mutation and resource-regression tests.
- `reports/form-actions-node-2026-09-01.json`: two public demo POSTs at 17:20 UTC
  verify label forwarding, reset defaults, event order, refilled payloads and cleanup.
- `src/node-form-transport.test.ts`: four independently decoded local HTTP
  roundtrips now populated through event-driven interactions.
- `reports/form-events-node-2026-09-01.json`: two public demo POSTs at 16:31 UTC.
  Both confirm event order, an input-handler-updated field and serialized values;
  the multipart case also confirms file contents. There were no listener errors.

All documents above are constructed fixtures, not parsed live website HTML.
Host callback execution is not evidence that website JavaScript runs. The full
Kitesurf/Playwright compatibility and real-browser acceptance gates remain open.

Specification references used for this implementation:
`https://dom.spec.whatwg.org/#concept-event-dispatch` and
`https://html.spec.whatwg.org/multipage/input.html#the-input-element`.
This is a tested subset, not a standards-conformance claim.

The radio state-change gate also follows the behavior inspected in Blink's
`RadioInputType::RunInputActivationBehavior`: unchanged checkedness does not
emit input/change. Reference source only, not code incorporated or an engine
dependency: `https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/html/forms/radio_input_type.cc`.
Cross-engine runtime comparison and full WPT conformance remain pending.
