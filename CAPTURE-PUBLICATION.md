# Private capture publication checkpoint

September 4, 2026. Native PNG/PDF file export now applies the same private-file
ownership and directory policy as state persistence. The shared helpers are
extracted into `src/node-private-files.ts`; state limits, error wording and
read/write behavior remain unchanged.

## Publication checks

The previous writer protected final names with exclusive hard-link installation
and checked temporary identity during cleanup, but did not verify the pathname it
was about to publish. Replacement, symlink, permission, size or extra-link changes
before publication could therefore go unnoticed.

The capture writer now:

- Requires a canonical bounded path and Unix ownership/no-follow support, with
  equal real/effective user IDs. Unsupported environments fail explicitly.
- Rejects symlinked directory ancestors, foreign ownership and writable-by-others
  directories. Root/user-owned ancestors and trusted sticky intermediate
  directories remain supported; the direct parent must belong to the caller and
  not be writable by others. A normal mode-0755 parent is valid.
- Creates a private sibling with exclusive, no-follow flags and records bigint
  device/inode identity. Its descriptor must be an owned regular file with one
  link and no group/other permissions.
- Syncs the bytes, then checks descriptor identity, privacy and expected length.
  Before installation, it rechecks directory identities/modes/owners and the
  temporary pathname's identity, privacy and length.
- Installs with the existing no-replace hard link. Existing destination files
  and symlinks are not overwritten. Cleanup removes only the matching owned
  regular temporary path, never a substituted pathname.

This aligns capture publication with the existing trusted-directory policy; it
is not a new race-free filesystem primitive. Same-UID or privileged processes can
still interfere between path-based checks and operations. Same-size in-place
modification by such a process is not cryptographically detected. Directory
metadata durability across power loss and cross-platform equivalence remain
unproven. Use trusted directories; no unsafe overwrite or ownership bypass is
introduced for unsupported filesystems/environments.

## Independent cleanup results

Successful `saveCapture` results now include `temporaryCleanupConfirmed` alongside
`remoteCleanupConfirmed`. The former confirms that the known temporary pathname
was removed or was already absent; replacement or unconfirmed filesystem failure
returns false. It is not proof that an external actor retained no other copy.

A complete local capture remains successful even if cleanup fails. JSON preserves
both flags, and ordinary CLI output warns separately about unconfirmed local
temporary cleanup and remote artifact cleanup. Errors while writing still fail
the operation. Existing PNG/PDF artifact release behavior is retained.

## Native evidence

Thirteen new filesystem cases cover temporary replacement/symlink/size/permission/
hard-link changes, unsafe and symlinked parents, a changed parent, cleanup failure,
post-publication pathname substitution and a valid ordinary parent. Five new
injected-CLI cases cover the independent cleanup flags and plain/JSON reporting.
The corrected isolated prior-HEAD run fails fifteen of the eighteen new cases;
three CLI compatibility expectations already pass. Existing capture cases also
pass in that baseline. No unhandled fixture failures remain in that run.

Focused validation passes 125 tests across seven working-tree files and 101 across
six isolated files. The difference is pending trace-export/CLI coverage, not
missing PNG/PDF or state-file validation. Both trees pass build, typecheck, strict
checking of four affected/related test files and seven-file lint. The existing
PNG fixture also supplies the current zero-valued image/control/border paint
counters for strict checking. The native manifest adds only the new CLI test file.

Full authorized native runs pass 9,593 tests across 268 working-tree files and
8,353 across 242 isolated-commit files. The shared state-policy extraction is
covered by the existing state-file and CLI-state suites without changing their
tests or weakening ownership checks.

Tests use local temporary files, controlled filesystem faults and injected command
connections. They do not open a socket, real terminal or live browser and do not
run a public-site or SafeJS probe. Authorization is for native tests under actual
filesystem ownership, not for those separate acceptance gates.

## Remaining work

The pending JSON trace extensions remain outside this commit. Their working-tree
regressions pass, but that does not make tracing/observability integrated or close
its validation gates. Continue that integration next. Historical capture reports
and measurements retain their original context; unrelated pending work is
preserved. The denied SafeJS probe remains unrun, and the full seven-day browser
goal, compatibility, live-site/runtime/socket/device and portability gates stay
active and incomplete.
