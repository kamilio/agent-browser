# Native object-valued event handlers

September 4, 2026 continuation of `TOGGLE-HANDLERS.md` and `SEVEN-DAY-PLAN.md`.

## Corrected conversion and invocation

The shared native handler setter previously treated every non-function value as
null. That incorrectly removed an existing handler when assigned an object,
changed listener ordering when a function was assigned later, and returned null
instead of the assigned object.

Handler properties now retain object identity. Noncallable objects occupy their
original listener position but are not invoked; replacing them with functions
reuses that position. Assigning a non-object primitive, including undefined,
null, strings, numbers, booleans, bigint or symbols, still clears the slot.
Clearing and reactivating a slot still places it at the end.

Invocation checks the current callback, so an earlier listener can replace a
function with an object or an object with a function during dispatch. Object
checks do not read properties, call `handleEvent`, inspect prototypes, coerce
values or invoke proxy traps. Noncallable revoked proxies are retained without
invocation; callable proxies follow the existing callback path. Ignored object
handlers do not publish event capabilities or enter the callback runtime.

This fixes the shared registry, not just disclosure handlers. The native tests
cover details/document/window toggle slots, document/window scrolling, window
resize, image load/error and media-query change handlers. Objects still consume
existing listener quotas, replacement does not grow registrations, rejected
registration leaves the slot unchanged, and close releases registrations and
revokes retained property access. Ordinary `addEventListener` object callbacks
remain explicitly unsupported: their callback-interface semantics differ from
these object-valued handler properties.

## Evidence and pending-work conflict

The 31 new cases produce 30 failures and one pass on isolated prior HEAD.
After the fix, all 31 pass. Both working and isolated trees pass type checks,
builds, strict checking of the new test and two-file Biome checking. The explicit
`native-tests.json` manifest includes the new file.

Matching focused tests pass 145 / six isolated files. The working tree reports
150 passes and one failure / six files. The failure is the object case in the
pre-existing, uncommitted `src/page-bindings.test.ts` Window-onload test: it
expects assigning `{}` to clear the handler. That expectation contradicts the
corrected behavior. The pending Window-onload implementation/tests are not in
prior HEAD and are not included or rewritten in this checkpoint. They remain
byte-for-byte intact for their own integration. A working-tree all-green claim
would therefore be false. Authorized full native runs pass 9,195 tests / 262
isolated files. The working suite reports 10,340 passes and that one failure /
284 files, with no additional failures. The isolated snapshot contains only
this checkpoint on prior HEAD.

Read-only primary research on September 4 used HTML's EventHandler definition
and Web IDL's callback conversion, nullable conversion and invocation rules:

- `https://html.spec.whatwg.org/multipage/webappapis.html#event-handler-idl-attributes`
- `https://webidl.spec.whatwg.org/#es-callback-function`
- `https://webidl.spec.whatwg.org/#es-nullable-type`
- `https://webidl.spec.whatwg.org/#invoke-a-callback-function`

This is native callback-lifecycle evidence, not a SafeJS execution or retained
guest-graph measurement. Realm/incumbent-settings fidelity, complete handler
source/attribute synchronization, global/prototype interfaces and cancellation
semantics remain open.

## Generated-control follow-up

Inspection of the disclosure gap shows that a missing-summary control needs
distinct generated-control identity across layout, semantic snapshots, focus
and activation. Reusing the host details reference for an entire clickable
region would confuse the header with the open body. Adding a light-DOM summary
would instead alter page queries, children, text and mutation observations.
Neither shortcut is implemented here. The next fallback work must establish
owned generated-control targets, header-only action geometry, retargeted page
events and invalidation when an authored summary appears or disappears.

Missing-summary fallback, broader event interfaces, complete UA/shadow/
accessibility, released-runtime and original browser acceptance gates remain
open. No live-site, socket, real TTY/PTY or SafeJS probe ran; the denied SafeJS
probe remains unrun. Historical evidence and unrelated pending work stay
separate. The full seven-day browser objective remains active.
