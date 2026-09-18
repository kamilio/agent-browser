# Synchronous callback prefix reuse

Incremental SafeJS contribution for native browser Event dispatch, not an
installed SDK update or a working Zoom meeting. Apply only after checking the
exact experimental ClrIn4 source ancestry, not blindly to moving upstream main.
No browser substitute or additional runtime dependency is introduced.

## Correction

`Realm.executeCallback` previously published synchronous-prefix completion while
the completed callback still held its running-state lock awaiting queued result
settlement. A second dispatch from the same active parent script could therefore
fail with `reentry` even though the callback body was no longer running.

The existing `requiresPromiseResolution` classifier distinguishes ordinary
completed values from promises and potential thenables. Only ordinary completed
callbacks release their idempotent running lock before prefix publication.
The existing final release remains. Active-body recursion, asynchronous tails,
callable/accessor/proxy thenables, budgets and reconciliation are not bypassed.
There is no timer padding, arbitrary async-tail wait or public API change.

## Ancestry and validation

Base source: `/tmp/agent-browser-sdk-empty-module-ClrIn4/candidate`.
Base `packages/safe-js/src/realm.ts` SHA256:
`8b0bd5a6ade51ff0193d08a0132d4319b62b6af1f6d7b1ed817295f248c2663a`.
The new `realm-callback-prefix-reuse.test.ts` must be absent in the base.
`sdk-callback-prefix.patch` SHA256:
`bc7d48004b4d7d81596c44e01e3b6a2e24ad7ba730b6b213009c51ab191402ee`.
`git apply --check` passes against that exact base. Only `realm.ts` and the new
249-line test differ; only `realm.js` differs among684 emitted SDK files.

September18,2026 isolated SDK qualification:

- Clean baseline red03:9 passing/4 failing, identical final test against base.
- New focused tests:13/13 passing; selected eight-file regression:149/149.
- Strict test types and fresh core/node build pass; not a full SDK union.
- Actual native Event integration:all six unchanged scenarios pass in7.597s.
- Process/group absent; test HOME/TMP empty; compiler TMP caches retained.
- Native integration references, pending work and SDK accounting close to zero.

Parent independently verifies candidate/build pins and all qualifying execution
input hashes. Historical red01 retains an obsolete preparation-script hash after
test preparation changed; it is not used to qualify this contribution. Red02
also retains preliminary assertion failures. Neither is rewritten as success.

Source/build/test evidence:
`/tmp/agent-browser-sdk-callback-prefix-zspAIs/HANDOFF.md` and `QUALIFICATION.json`.
Self-contained experimental package:
`/tmp/agent-browser-sync-callback-sdk-K9Y732/package` (2,863 files; dependencies
unchanged). Actual integration evidence:
`/tmp/agent-browser-event-actual-prefix-sdk-1AyC4V/HANDOFF.md`.

The six-case gate is synthetic and does not prove live Zoom, admission, native
incoming audio, permitted recording, transcription or verified delivery. This
patch is retained for reproducibility; no upstream application or push occurs.
