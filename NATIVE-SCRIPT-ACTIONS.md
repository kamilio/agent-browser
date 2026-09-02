# Native actions with interpreted listeners

September 1, 2026, 22:01 UTC checkpoint. Native controls, form actions and session
link navigation now await SafeJS listener synchronous phases before deciding their
default actions. This extends `SCRIPT-EVENTS.md`; it does not enable automatic
website JavaScript, install the modified SDK or add any dependency.

## Shared action sequences

`event-actions.ts` drives a generator of explicit event-dispatch steps. The sync
runner uses the existing host dispatcher; the async runner uses controlled
dispatch. Both execute the same control/focus/form code, including nested actions,
rollback catches and cleanup that itself emits events. Dispatch failures are thrown
back into the generator, not treated as permission to execute the default action.

The existing synchronous methods remain available for host-only consumers. New
async entrypoints are:

- `DocumentInteractions.fillAsync`, `selectAsync`, `setCheckedAsync`, `clickAsync`.
- `DocumentFocus.focusAsync`, `moveAsync`.
- `DocumentKeyboard.typeAsync`, `pressAsync`.
- `DocumentForms.resetAsync`, `requestSubmitAsync`.

The internal action generators let keyboard activation, label forwarding, focus
changes and reset-button defaults compose without falling back to synchronous
event dispatch. Existing ordinary host listeners are not implicitly awaited just
because they return promises. Only explicitly controlled listener phases are.

Session `click`, `press` and `requestSubmit`, and the CLI/shared-command handlers
for fill/type/check/uncheck/select, now use these async paths. No CLI command syntax
changed. Navigation signals and navigation-job identity are rechecked after event
work, before any resulting outbound navigation. This does not promise immediate
preemption of a pending interpreted phase; page-process cancellation remains a gate.

## Preserved defaults and cancellation

- Fill dispatches beforeinput before applying the value and input afterward.
  Canceled input does not apply the replacement; stale target/focus checks remain.
- Focus commits edited text before blur/focusout, then emits focus/focusin for the
  new target, with transition checks around yielded phases.
- Checkbox/radio preactivation happens before click. Cancellation or fatal
  dispatch failure runs the existing preactivation rollback before returning.
  Input/change are emitted only through the existing successful-activation rules.
- Reset re-reads controls/defaults after its listener phase. A pending async
  listener promise does not hold the default reset open past its first suspension.
- Submission validates, emits invalid/submit as appropriate, and serializes the
  current controls and action only after the submit phase. Repairing an invalid
  control during its invalid event does not retroactively validate that attempt.
- Keyboard keydown/keypress/beforeinput/input/keyup, Tab focus movement, Space
  activation and Enter submission use the same yielded action machinery. Keyup
  cleanup still runs on supported exceptional paths; closed dispatchers stay closed.

These are not atomic document transactions. Existing listener mutations and
already-applied defaults are not generally rolled back when a later action fails.
No complete DOM-event-loop, input-device or browser-conformance claim is made.

## Stopped-page recovery

The first real-site run exposed a lifecycle bug: closing a script adapter closed
its native events, which also prevented the session from archiving history to
navigate away. The failed report is retained, and five regression cases preceded
the fix.

History snapshot/revision/archive reads now require a retained, URL-consistent
document, not an active event dispatcher. History mutations still require active
events. Document disposal clears history and revokes those reads. Navigation from
a stopped runtime loads a fresh document instead of taking same-document fast
paths; normal navigation, reload and history restoration retain the bounded archive.
Stopped POST history does not silently fall back to a GET or resubmit: an explicit
unsupported-resubmission error is retained when an in-memory traversal is unavailable.

## Evidence

- `reports/unit-node-2026-09-01-native-actions.json`: 908 tests pass in 49 files at
  22:00 UTC. Adds fourteen controlled-action cases, four session/CLI cases and five
  stopped-history recovery cases to the preceding 885-test checkpoint.
- `reports/safejs-native-actions-fixture-2026-09-01.json`: nine checks pass against
  the actual compiled public SafeJS core. Includes preactivation cancellation,
  reset/default ordering across an unresolved await, native submission preparation,
  keyboard cancellation, selection, label forwarding and no swallowed guest errors.
- `reports/safejs-native-actions-sites-2026-09-01.json`: seventeen checks pass at
  21:59:33 UTC: the nine fixture checks plus four each on Example Domain and Books
  to Scrape. Native clicks on real parsed anchors are canceled by guest handlers,
  then guest-rewritten fragments are followed with no additional HTTP request.
  Snapshots and the persistent realm observe the mutations/navigation.
- `reports/safejs-native-actions-sites-initial-2026-09-01.json`: retained failing
  attempt, after thirteen successful checks, with the stopped-history error.
- `reports/cli-sites-node-2026-09-01-native-actions.json`: all nineteen checks pass
  at 22:00:44 UTC using separate actual CLI processes and a temporary owned server.
  It verifies public text/JSON/HTML/CSS subsets and link navigation, not page scripts.
- Build, strict TypeScript checking of the new action test file and the configured
  113-file lint scope pass. The prior eighteen-check DOM fixture probe also passes
  after sharing its explicit source-core loader with the native-action probe.

The real-site action probe executes explicit trusted test scripts, not downloaded
website-authored JavaScript. Forms are prepared but never sent. Server data and
accounts are not mutated; no credentials or raw responses are retained. Its
126107648-byte RSS sample is whole-process, not peak usage or a complete browser
resource benchmark. This in-process harness is not the production isolation boundary.

After compiling the package and the separate source SDK:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/tmp/agent-browser-safejs-13.0.10/packages/safe-js \
  timeout 45s node --max-old-space-size=192 \
  packages/browser-agent/dist/scripts/check-script-actions.js --sites --trace
```

## Remaining work

Create the page realm/document owner inside the process boundary, integrate its
watchdog and cancellation with native actions, discover/load page scripts in order,
and test genuine dynamic websites. Window EventTarget bindings and history event
producers need controlled scheduling; guest synchronous dispatch and complete
microtask-checkpoint fidelity remain unresolved. The earlier callback performance
gap also remains open. CLI/server/playground still report website JavaScript disabled.
