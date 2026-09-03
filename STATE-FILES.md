# Private browser-state files

September 3, 2026. The Node-only `agent-browser/node-state-file` entry point adds
file-backed round trips for the state owners described in `BROWSER-STATE.md`.
The native engine does not import filesystem code or a new runtime dependency.

## API and behavior

- `saveBrowserStateFile(owner, filename, options?)` snapshots cookies and local
  storage, then saves their JSON. It returns filename, byte count and
  `cleanupConfirmed`, never credential values.
- `loadBrowserStateFile(owner, filename, options?)` reads and checks the file,
  then atomically replaces both owners. It returns filename, byte count and
  `loaded: true`. Bad encoding, JSON, schema, quota or owner-lifetime checks do
  not partially restore state. Session storage is not persisted or replaced.
- `readStateFile` and `writeStateFile` provide the lower-level JSON-text file
  boundary for later CLI transfer integration. They validate JSON syntax, not the
  browser-state schema; only the owner-level loader performs semantic validation.
  The read result contains secrets and must not be logged or exposed to pages.
- Filenames must be canonical absolute paths without control/format characters,
  at most 4,096 UTF-16 code units. Parent directories must already exist.
- `options.maxBytes` can lower, but not raise, the 128 MiB UTF-8 ceiling. Input is
  checked before output-file creation; reads inspect the size before allocating,
  perform bounded 64 KiB I/O and check for growth, truncation and replacement.
  JSON strings and snapshots are buffered, not streamed with constant memory.

## File and path policy

The implementation requires Unix real/effective UID agreement and no-follow and
nonblocking open flags. Reads require a private regular file owned by that UID,
with exactly one hard link and no group/other permissions. Symlinks, directories,
public files and multiply linked files are rejected. Nonblocking opens prevent a
special file from hanging the process before its type can be checked.

Every directory component is checked, including ancestors. Components must be
directories rather than symlinks, owned by root or the current UID, and not
group/world-writable. Trusted sticky ancestors such as `/tmp` are allowed, but
the immediate parent must be owned by the current UID and not writable by others.
An ordinary owned `0755` parent is allowed; a group-writable `0775` project folder
is not. Create a private destination directory rather than weakening this policy.

Writes create a fresh exclusive `0600` sibling, finish and sync its bytes, recheck
its identity and the directory chain, and then publish it. Default publication
uses a no-clobber hard link. `options.overwrite: true` explicitly permits atomic
rename over an existing private owned single-link file; identity/timestamp checks
reject a destination changed before that final check. This does not truncate the
old file before a replacement is ready.

Temporary cleanup only unlinks the inode created by this operation. A substituted
temporary file is not deleted. If post-publication cleanup cannot be confirmed,
the successful result has `cleanupConfirmed: false`; a retained temporary hard
link means strict reads will refuse that published file until the extra link is
removed. Failure cleanup is best effort, so private partial files can remain after
an OS cleanup error or directory substitution. Filesystem and parse diagnostics
do not echo filenames, JSON fragments or credential values.

## Evidence and remaining work

Forty-six native cases exercise real temporary-file round trips, permissions,
symlinks/hard links, strict directory chains, exclusive creation, explicit atomic
overwrite, Unicode, byte limits and multi-chunk I/O. Injected failures cover short
reads/writes, write/sync/rename failure, concurrent publication, file changes,
directory/temporary substitution and cleanup refusal. Cookie/storage regressions
pass **135 tests across four explicit files** on Node v22.22.0.

The full working tree passes **5,889 tests across 181 explicit native files**.
Production build, strict file-test typechecking, focused lint/formatting and the
new package subpath import pass. Results are terminal output, not rewritten or
new historical report artifacts.

The isolated change also passes production typechecking and **3,129 tests across
120 available allowlisted files** without the pre-existing unfinished features.

The first sandbox run had sixteen file-policy failures because its root and `/tmp`
appear owned by UID 65534, not root. The authorized outside-sandbox native run
passes with real Unix ownership. The policy was not weakened or mocked to hide
that environment mismatch. One short-write test double initially lacked the
required returned buffer; strict test typing identified it and it was corrected.

This is a library/file boundary, not completed CLI `state-save`/`state-load` support.
Next, add bounded session-scoped transfer over the existing command/process
protocols without putting credentials in diagnostics or exceeding frame limits,
then connect the CLI. Keep compatibility row P12 open until those workflows pass.

No website, socket, SafeJS, real TTY/PTY or real-account probe is run. Tests use only
synthetic state and disposable temporary paths; special-file behavior is checked
through flags/type rejection rather than a live FIFO probe. Power-loss durability
of the directory entry is not guaranteed: parent directories are not fsynced.
These checks assume trusted current-UID processes and administrators on a local
Unix filesystem. They are not an `openat`-based sandbox against hostile same-UID
actors, privileged remounts or hostile filesystem servers. Windows, actual process
transport, CLI output and real authentication reuse remain separate gates.
