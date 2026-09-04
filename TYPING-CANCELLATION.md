# Typing cancellation and event-action boundary checkpoint

September 4, 2026. Native typing now shares the cancellation behavior of held
keyboard and mouse actions. This is an input/event ownership correction, not
SafeJS execution evidence or completion of the seven-day browser goal.

## Failures and corrections

`DocumentKeyboard.typeAsync` previously accepted no abort signal, and the command
host did not forward its cancellation/deadline signal to typing. The host could
reject the caller while a controlled listener prefix kept the named-session
queue blocked. Once that prefix settled, the old action could continue typing.

The native method now accepts an optional signal, rejects pre-aborted calls
before starting, and passes the signal through the character/press generators
and asynchronous event dispatcher. Command `type` forwards its existing signal.
Cancellation unwinds owned key cleanup without releasing independently held
modifiers or dispatching later key events. Successful typing and its result
shape remain unchanged; no new session wrapper or dependency is introduced.

A second failure existed in the shared asynchronous event-action runner. An
event listener could queue an abort microtask that ran after dispatch returned
but before the action generator resumed. The runner would still advance the
generator, allowing a control default to mutate the value, or a final keyup to
return success, despite cancellation. The runner now checks cancellation before
starting and immediately after awaited dispatch, before calling `action.next`.
The post-dispatch rejection is thrown into the generator so its existing
`finally` cleanup runs. Already-aborted generators are never started.

## State and queue semantics

Cancellation is not rollback. Characters committed before interruption remain,
including the current character when its `input` or `keyup` event is reached.
An abort during `beforeinput` prevents that character's edit. No subsequent
characters are typed after cancellation, even if the interrupted listener's
prefix later settles. Native raw keydown/up retain their observed held/released
state; compound typing releases its own keys while preserving an already-held
Shift modifier.

The named-session queue can recover before the interrupted prefix settles. A
queued fill completes, pending command/dispatch counts return to zero, and the
old typing action cannot overwrite the recovered value when its prefix resumes.
External cancellation reports `aborted`; command deadlines retain the existing
`timeout` error. This interrupts the browser's dispatch/default continuation,
not arbitrary user code inside a listener; it does not forcibly stop or roll
back that listener's independent side effects.

## Regression evidence

The explicit native list adds `src/typing-cancellation.test.ts`, using native
owners and an injected in-memory command/session transport. Its 31 cases cover
pre-aborted printable/empty text, all five keyboard/edit event phases, controlled
prefixes, synchronous and queued aborts, retained earlier characters/modifiers,
no late typing, command abort/deadline queue recovery, raw held-key cancellation,
and direct event-action startup/unwinding.

The initial 24-case run reproduces 22 failures; the two raw held-key cases
already pass and require no source change. Signal forwarding fixes those 24.
Adding seven boundary cases then reproduces four remaining failures with signal
forwarding present: a late edit, false successful completion, pre-aborted
generator startup and missing post-dispatch unwinding. The final 31-case suite
fails 29 cases on isolated prior HEAD and passes all 31 with both corrections.

Focused validation passes 443 tests across sixteen working-tree files and 440
across the same sixteen isolated files. The difference is unrelated pending
command-host test coverage, not altered assertions. Full native runs pass 9,455
tests across 261 working-tree files and 8,104 across 233 isolated-commit files.
Both trees pass build, typecheck, strict checking of the new regression file and
four-file lint. The committed command-host change is only signal forwarding;
its pre-existing tracing/tab/DOM edits remain outside the isolated snapshot.

## Remaining scope

Guest programmatic activation exposure is next. Full event-loop/runtime
compatibility, physical input, pointer dispatch/capture and the independently
authorized live-site, socket, real TTY/PTY and SafeJS gates remain open. No gated
probe ran; the previously denied SafeJS probe remains unrun. Unrelated pending
tracing/tab/DOM changes and historical reports retain their original contents.
The overall browser goal and seven-day continuation remain active.
