# Guarded tab command integration checkpoint

September 4, 2026. This integrates the pending command-level tab identity guards
without adopting unrelated tracing, terminal or playground changes. It is a
native agent-workflow safety checkpoint, not a real socket/TTY acceptance run.

## Command contract

Tab rows now include the existing session-owned opaque key from `viewport`.
`tab-list`, named-session `list` and command results that include tab rows use
the same identity. Empty tabs have keys too. A key remains stable across
navigation and resizing, but is not reused when a tab or named session is
recreated. The ordinary `tab-N` identifier alone does not distinguish recreated
sessions; an array index also changes when earlier tabs close.

`tab-select INDEX --expected-key=KEY` and
`tab-close [INDEX] --expected-key=KEY` compare the supplied key with the resolved
tab inside the named session's serialized command, immediately before mutation.
Without an index, close resolves the selected tab at execution time. A changed
tab/selection/session produces `stale-reference` rather than selecting or closing
the replacement. A disappeared index can still produce `not-found`. Invalid
indices and empty/over-256-code-unit keys remain rejected.

Help and capability output advertise the guard option. Existing unguarded forms
remain supported for compatibility; clients that need stale-target protection
must supply the displayed key. The guard is not an authorization token, a lock
on page navigation or a snapshot of the document/viewport dimensions. It does
not silently retarget or retry an operation after failure.

## Ownership and queue behavior

Identity validation occurs after earlier queued commands finish. Closing an
earlier tab therefore cannot cause a later guarded command to act on whichever
tab moved into its old index. A changed selected tab similarly cannot redirect
an implicit guarded close.

Rejected guarded operations preserve the current tabs, selected tab, loaded
document owners and cached snapshots. A matching close still disposes its tab
and drops that tab's snapshot cache without closing an unrelated tab. Existing
deadline/cancellation handling prevents an expired queued close from executing
when an earlier navigation resumes.

These keys identify tabs across named-session boundaries too: two sessions can
both have `tab-1`, but a key from one cannot pass the guard for an operation on the
other. Session identity comes from the existing browser owner; no new entropy,
global registry, runtime dependency or persistence format is introduced.

## Regression evidence

The explicit native list adds 24 `src/tab-identity.test.ts` cases and four
`src/cli-tab-identity.test.ts` cases. Coverage includes row identity, blank tabs,
help/capabilities, cross-session and recreated-session rejection, serialized
index shifts, changed implicit selection, snapshot/document preservation,
matching cleanup, navigation/resize stability, input bounds, expired queued
actions and unguarded compatibility.

The four CLI cases load the actual CLI entry and check matching/stale select
and close behavior, argument preservation and error output. The command-service
connection and HTTP transport are injected in memory. They do not open a socket,
perform real HTTP navigation or use a terminal device.

Prior isolated HEAD fails nineteen of the 28 new checks; nine existing input
validation/compatibility checks already pass. All 28 pass with the integration.
Three existing pending command-host guard tests are promoted unchanged. Focused
runs pass 182 tests across seven working-tree files and 180 across seven isolated
files; the difference is pending unrelated CLI parser coverage. Full native runs
pass 9,530 tests across 265 working-tree files and 8,227 across 238 isolated-commit
files. Both trees pass build, typecheck, strict checking of the three affected
test files and five-file lint. Original working source/test bytes remain intact;
only the scoped tab changes are integrated into the isolated snapshot.

## Next steps and retained gates

Integrate guarded terminal/playground tab clients next, preserving their separate
human-input, polling, socket and real TTY/PTY acceptance gates. The current
command integration does not claim those clients or full human/agent arbitration
are complete. Historical `TERMINAL-TABS.md` and `PLAYGROUND-TABS.md` measurements
retain their original context.

`contributions/safejs-lazy-nested-methods-request.md` now records the precise
owned lazy-method runtime requirement and consumer acceptance cases. Commit
`2c06897` is a local documentation draft, not a posted issue, SDK implementation
or permission to run a probe. Guest synchronous activation and full runtime/
site/layout compatibility remain open. No gated probe ran; the denied SafeJS
probe remains unrun. Unrelated pending source and historical evidence are
preserved, and the full seven-day browser goal remains active.
