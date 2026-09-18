# Pending isolated qualification

This proposal is not activated in agent-browser. The released SDK's historical
callback-overlap failure is unchanged. Source review and semantic checking do
not establish that a scheduler, cleanup path or memory budget works at runtime.

## Next bounded execution gate

Obtain explicit approval for isolated SDK execution of the reviewed candidate,
with no websites, sockets, credentials, devices, real TTY or meeting actions.
Pin the final patch, source tree, compiler, test runner, generated SDK inputs and
launcher before execution. Use the existing offline kernel/JavaScript guards,
empty task-owned HOME/TMP, finite heap/output/time limits and process-group
cleanup. Do not install packages, mutate the upstream checkout or replace the
browser's installed SDK. A failed or timed-out lane is spent, not auto-retried.

Stage distinct unmodified and patched copies of the pinned upstream source.
First run the authored scheduling and budget regression cases, then the existing
default callback-phase, lifecycle, budget and module regression cases needed to
cover the changed ownership paths. Record actual selections and counts before
calling any group complete. Keep expected old-API failures separate from
candidate failures; do not change assertions merely to obtain a pass.

Require explicit evidence for these behaviors:

- After the real callback prefix, later source progresses while its tail waits;
  unchanged default mode still denies that overlap.
- Guest declarations, object identity, FIFO jobs and source ownership survive
  source/callback interleaving. Suspended source is not concurrently admitted.
- Ordinary unhandled guest rejection in a callback rejects its result, prevents
  later work and starts exactly-once cleanup without waiting on unrelated tails.
- Live callback locals and compiled work remain accounted; finite data/step
  budgets cannot be reset or reclaimed early by another source's completion.
- Modules preserve namespace identity, resolver ordering and separate completion
  ownership; late work after abort cannot mutate a closed realm.
- Abort, failure and external close settle queued/pending results and terminate
  the task-owned process. Reentrant host close does not create a self-await cycle.

## Separate browser integration gate

Only after source qualification, stage an explicit opt-in browser adapter using
the public `callbackScheduling: "after-prefix"` option. Do not change the
production default or access private SDK state. The nineteen browser core
expectations retain their original semantics, including ordinal12's successful
later-source evaluation. Preserve separate default-denial regression coverage.
The ten page-extension and seven module checks remain separate acceptance groups.

Passing any of those groups is not a Zoom join. Captured-client execution,
native realtime media reception and decoding, legitimate host admission,
permitted recording, transcription and verified summary delivery each need
their own evidence. No alternate browser engine is part of this proposal.
