# CLI browser-state transfer

September 3, 2026. The CLI now connects the native transaction in
`BROWSER-STATE.md` to private files from `STATE-FILES.md`, using bounded,
session-scoped chunks rather than passing an entire state document in a command
or response. This remains the native TypeScript browser, with no new dependency.

## User workflow

```sh
agent-browser -s=demo state-save /private/owned/directory/login.json --json
agent-browser -s=demo state-save /private/owned/directory/login.json --overwrite --json
agent-browser -s=demo state-load /private/owned/directory/login.json --json
```

The named session must already exist. The CLI operates on local files; neither
the browser owner nor its service resolves client filenames. Cookie and local
storage state are replaced together, not merged; tab session storage is retained.
The native state schema is versioned and is not general Playwright state-file
compatibility (including IndexedDB or unsupported cookie attributes).

`state-save` accepts zero or one positional filename. The default is a unique
`agent-browser-state-<UUID>.json` in the current directory. Relative explicit paths
are resolved there. Files are private and parents must pass the strict Unix policy
in `STATE-FILES.md`; a group-writable project directory can therefore be refused.
Use an existing protected directory instead of weakening its permissions. Existing
files require explicit `--overwrite`. `state-load` requires one filename.

Both commands print a metadata-only JSON result, with or without `--json`: filename,
byte count, and load status or cleanup confirmations. Save reports local temporary
cleanup and remote snapshot cleanup independently; unconfirmed cleanup is not
silently reported as success. A lost final import reply is reported as unconfirmed,
never retried automatically: the state may already have changed. Invalid input
files are rejected before any transfer begins; invalid state content never partially
changes either owner. A server-side failure after commit starts is reported
conservatively as an unconfirmed load, with its error code retained.

Generated default filenames and temporary state parts are ignored by this repo.
Explicit custom filenames are not automatically ignored: keep them out of Git,
logs, screenshots, traces and public reports. Files are not encrypted. The transport
client's JSON strings and raw transfer payloads contain credentials; only the
normal file-command results are credential-free.

## Transfer protocol

The shared command host implements six extension commands:

- `state-export`: capture a detached cookie/local-storage snapshot and return its
  opaque identifier, direction and byte counts, not the state itself.
- `state-import-begin <bytes>`: reserve an import buffer without changing either owner.
- `state-import-append <id> <offset> <base64>`: append exactly at the next offset;
  out-of-order/duplicate writes and noncanonical base64 are rejected.
- `state-import-commit <id>`: validate complete UTF-8 JSON, replace both owners
  atomically, and consume the import even on semantic validation failure.
- `state-transfer-read <id> <offset>`: read an export chunk with exact progress,
  encoding, total-size and end-of-file metadata.
- `state-transfer-delete <id>`: delete an owned transfer and zero its byte buffer.

These are sensitive transport operations, not page-JavaScript capabilities or
ordinary capture artifacts. No artifact listing exposes state data. File workflows
construct their transfer arguments in memory; credential chunks are not inserted
into the operating-system argv used to launch a child process.

The store reserves at most 128 MiB across four transfers per command host. Import
reservation counts the entire declared size immediately, including incomplete
uploads. Each chunk is at most 32 KiB before base64 encoding, fitting the actual
64 KiB HTTP request ceiling as well as the 256 KiB process-command and 2 MiB response
ceilings. Clients require exact chunk sizes except at EOF, bounding full-size
transfers to 4,096 chunks. Transfer commands still count toward existing host
command limits; those limits were not increased to hide transfer cost.

Identifiers include a host identity and monotonic sequence and are bound to the
actual browser owner, not only its reusable session name. Closing a session revokes
and clears its transfers. Five-minute lifetimes are not extended by reads or writes;
access checks and cleanup timers release expired buffers. Timers do not keep Node
alive and are canceled on deletion. As with other JavaScript timers, a blocked host
event loop can delay cleanup; these are not hard realtime deadlines.

Clients check command/session identity, size, offsets, encoding and acknowledgements.
Cleanup is attempted on transfer failure when a valid identifier was received;
otherwise expiry/session closure bounds retained data. No automatic append/commit
retries or post-timeout rollback are attempted. JSON parsing/serialization still
buffers snapshots; retained-byte limits are not a measured peak-RSS guarantee or
forensic erasure promise. `--timeout` is forwarded to each backend request; it is
not a new whole-file-operation cancellation API.

## Native evidence and open gates

Native tests exercise byte/count/lifetime limits, idle expiration, owner isolation,
session recreation, frozen exports, canonical chunks, lost/corrupt acknowledgements,
incomplete/invalid imports, cleanup failure and no replay after an ambiguous commit.
The actual CLI entry point saves and reloads a state exceeding 2 MiB using real
private temporary files and an injected in-memory service. The actual process-host
dispatcher is tested with an injected actor; real process runtime execution is not
claimed. Synthetic protocol serialization checks use the existing frame encoder.

On Node v22.22.0, **41 new tests** pass. Focused regressions pass **225 tests across
seven explicit files**; the full working tree passes **5,930 tests across 183
explicit native files**. Production build, strict checking of both new test files,
seven-source lint and eight-source formatting pass. Private-file tests run with
authorized real Unix ownership rather than weakening checks for the UID-mapped
sandbox. Results are terminal-only; historical report artifacts are unchanged.

An isolated checkout containing only this change also passes production
typechecking and **3,170 tests across 122 available allowlisted files**, without
the pre-existing unfinished features.

An early implementation used 64 KiB binary chunks and only checked the larger
process limit. Inspection of the HTTP client/server found the stricter 64 KiB
request-body ceiling; chunks were reduced to 32 KiB and the CLI/frame tests now
assert that HTTP ceiling, including a maximum-length session name. No wire limit
was widened to make the implementation pass.

Real authenticated loopback transport, real child-process/SafeJS execution,
Windows portability, upstream CLI parity and real authentication reuse remain
open. No live website, socket, real TTY/PTY or SafeJS probe is run here. P12 is
partial, not complete. Separately, pre-existing import ordering in the modified
working-tree command host still fails whole-file organize-imports checking; those
unrelated imports were preserved rather than swept into this change.
