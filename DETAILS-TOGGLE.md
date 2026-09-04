# Native disclosure toggle notifications

September 4, 2026 continuation of `DETAILS-CORE.md` and `SEVEN-DAY-PLAN.md`.

## Document ownership and ordering

Details `open` presence transitions now queue asynchronous native `toggle`
notifications. The queue belongs to `DocumentTree`, not a script binding or a
second DOM. It records changes before mutation collectors run, including initial
attributes, ordinary/toggle/attribute-node mutation, cloning and import. Template
clones keep notifications with their existing template-content document owner.

Tasks run after the current synchronous stack and its microtasks. Replacing a
pending notification preserves its first old state, takes the newest state and
moves it behind other pending disclosure tasks. A round trip still emits an
event even when old and new states are equal. A running task keeps its tracker
through dispatch; listener-induced changes queue a later task using that old
state. Notifications wait for active controlled event dispatch to become idle
before choosing the next coalesced task.

The existing primary native interaction dispatcher receives notifications.
Constructing a secondary native action helper does not duplicate or steal them;
cross-document dispatchers reject. Tasks without a dispatcher expire rather than
replaying when an owner is created later. Document or primary-dispatcher shutdown
cancels queued work and aborts controlled in-flight delivery. Closing an unrelated
secondary dispatcher does not stop the primary owner's queue.

## Event capabilities

Notifications use a frozen native event with `oldState`, `newState` and null
`source`. They do not bubble, cancel or compose; ancestor capture and normal
target listeners use the existing event path. Listener errors remain bounded
dispatcher diagnostics and do not discard later tasks. Native script event
capabilities expose the state fields with shared target identity and the existing
binding/realm revocation checks. Summary click defaults and reflected `open`
assignment feed the same attribute boundary, not a separate event path.

This does not add the global ToggleEvent constructor/prototype or inline/IDL
`ontoggle` handler support. Native generated-event trust still follows the
existing BrowserEvent profile, not complete browser trusted-event semantics.
No complete browser event-loop task-source priority or inactive-document
suspension model is claimed by the host timer-backed native scheduler.

## Bounded work

The document queue admits at most 512 pending tasks and 4,096 scheduled tasks
over its lifetime, including replacements. Attribute transitions check capacity
before changing state; initial creation and subtree/template cloning preflight
the additional open elements before allocation. A resource-limit failure keeps
the previous accepted attributes, pending task and document revision intact.
Draining pending work frees concurrent capacity, not the lifetime task budget.

`tree.detailsToggleTasks.metrics()` exposes pending/active work, scheduled,
delivered, coalesced, canceled and failed counts plus limits and closed state.
There is no new runtime dependency, guest callback owner, document query index or
unbounded notification log. Native tests exercise queue/lifetime saturation,
failed attribute attachment, deep/template clone preflight and shutdown during
a controlled listener that never resolves.

## Evidence and remaining gates

The 36-case new file produces 33 failures and three passes on isolated prior
HEAD. Focused runs pass 219 tests / seven files in both working and isolated
trees. Both pass types/builds, strict new-test checking and six-file Biome checks.
The explicit `native-tests.json` includes the new file.

Authorized full native runs pass 10,208 tests / 280 working files and 9,062 /
258 isolated files. The isolated tree contains only this checkpoint over prior
HEAD; unrelated pending work is excluded rather than bundled into the evidence.

Read-only primary research used
`https://html.spec.whatwg.org/multipage/interactive-elements.html` and
`https://html.spec.whatwg.org/multipage/interaction.html` on September 4. This is
specification review, not a WPT or reference-browser execution.

Next: named details-group exclusivity, including parser/insertion/name-change
semantics, then generated summary/marker and remaining event/UA/accessibility
gaps. Released SafeJS, live-site, socket, real TTY/PTY and original browser parity
gates remain open. No gated probe ran; the denied SafeJS probe remains unrun.
Historical evidence and unrelated pending work stay separate. The complete
seven-day browser objective remains active.
