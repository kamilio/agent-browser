# Guarded terminal tab integration

September 4, 2026. This checkpoint integrates native terminal tab controls with
the command identity guards in `TAB-IDENTITY.md`. It does not establish real
TTY/PTY, socket, physical-input or live-site acceptance.

## Interaction and ownership

- `T` opens the tab menu; `j`/`k`, arrows and paging keys move its cursor.
- Enter selects the displayed tab using its index and opaque expected key.
- `x` starts closure confirmation; `y` sends a guarded close. `n` or Escape
  cancels confirmation. `q` detaches without closing tabs.
- `t` starts a new-tab prompt. Empty input creates a blank tab; other input must
  normalize to an HTTP(S) URL without credentials.
- `u` refreshes menu metadata. Cursor selection follows the tab key rather than
  its old index, and refreshed metadata cancels pending close confirmation.
- Escape leaves the menu and refreshes the active page. Background page polling
  pauses while the menu is open, including during confirmation or URL entry.

Menu rows are bounded, validated and copied into immutable records. Duplicate
identities, sparse rows, inconsistent blank-tab metadata and invalid selection
are rejected. Existing terminal-control escaping and frame bounds apply to URLs,
session names and confirmation text. Busy requests and bracketed paste cannot
turn menu input into unintended tab mutations.

The menu is a projection, not a lock: another client may change tabs or navigate
while it is open. The command host checks the displayed key inside its serialized
operation. Stale operations fail without retargeting or automatic retries.
Successful closure refreshes the menu from the command result. Blank/empty tabs
clear old page data without requesting a nonexistent snapshot; failed new-tab
navigation also clears the old page and does not retry navigation.

## Failed-refresh correction

The pending integration checked tab identity before and after snapshot retrieval,
but only cleared the old projection for `stale-reference` errors. Network,
resource, missing-target and metadata-validation failures could leave old page
content and actionable references visible after refresh failed.

The controller now clears the document projection, inspection scope and page
drafts whenever page refresh fails, regardless of the error code. It still reports
the bounded error category without exposing backend details. Enter cannot act on
the discarded page; a subsequent successful refresh restores page actions. A
successful same-tab refresh retains the existing selection behavior. Menu and
command failures are not reclassified as page-refresh failures.

## Evidence

Fifteen new native tests cover all three refresh boundaries (initial tab lookup,
snapshot retrieval and final tab verification), recovery, malformed metadata,
changed keys despite identical document references, unchanged-page behavior and
detach during pending guarded selection/closure. Eleven fail before the correction;
four existing identity/lifecycle checks already pass. All fifteen pass afterward.

The existing 29-case terminal-tab suite and four command-host/session-backed
terminal scenarios are promoted unchanged. Focused validation passes 117 tests
across six working-tree files and 113 across six isolated files. The four-test
difference is unrelated pending targeted-key terminal coverage, not missing tab
coverage. Both trees pass build, typecheck, strict checking of three affected test
files and six-file lint.

Full native runs pass 9,545 tests across 266 working-tree files and 8,275 across
240 isolated-commit files. Initial
sandboxed full runs fail 28 state-file/CLI-state checks in two files: the sandbox
maps `/` ownership to UID 65534, which the existing private-file policy correctly
rejects. Validation uses authorized native reruns instead of weakening that
policy or treating these failures as terminal regressions.

The new transport fixture uses only injected responses and PassThrough streams.
The existing native-session scenarios use a synthetic HTTP transport. Detach tests
verify abort signalling, restored stream state, removed handlers and suppression
of late replies; they do not prove cancellation of a remote mutation already
committed by a service.

## Remaining gates

Guarded playground integration remains next. Human/agent input arbitration,
real-device terminal behavior, sockets, public sites, runtime execution and the
full compatibility ledger remain open. No new dependency or alternative browser
engine is introduced. No gated probe ran, and the denied SafeJS probe remains
unrun. Historical `TERMINAL-TABS.md` measurements retain their original context.
Unrelated pending source is preserved, and the full seven-day goal stays active.
