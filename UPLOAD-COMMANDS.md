# Native upload client and command service

Current lifecycle hardening: `UPLOAD-LIFECYCLE.md` adds post-begin acknowledgement
target validation and reentrant manager/retained-owner activation guards. Its
fresh regressions and combined validation are separate from the original upload
captures and measurements below; external transport/runtime gates remain open.

September 4, 2026 integration on `e9616a2`. This connects the existing owned file
selection and visible file controls to the real CLI, canonical transfer protocol,
BrowserCommandHost queue and BrowserSession. Native injected-transport validation
is not actual socket, service-process, authentication or released-runtime acceptance.

## CLI use

With an existing command-service connection and an open selected document:

```sh
agent-browser -s=work upload '#file' ./private/report.txt --json
agent-browser -s=work upload e17 ./private/first.txt ./private/second.bin --timeout=30000
```

The CLI accepts a target and one through 63 local filenames. It does not start a
service or subprocess as a fallback. Relative paths resolve locally; selectors
resolve once on the server into a versioned document/reference target **before
any private-file stat/open**. Subsequent chunks cannot silently retarget after a
navigation or tab change. Files must satisfy the existing owner/private-ancestor,
no-follow, regular-file and single-link policy; public or substituted files are
denied rather than weakening that policy. Local paths never enter transfer argv.

The CLI preserves the session in the request envelope, validates matching response
command/session/target identities, and sends bounded basename/type/size metadata
plus canonical base64 chunks. The configured timeout covers the operation; cleanup
has a separate bounded cancellation request and still waits in the host queue.

## Portable protocol and ownership

Internal positional commands are upload-target, upload-begin, upload-write,
upload-commit and upload-cancel. Begin metadata is exactly:

```json
{"target":{"documentId":"captured-id","reference":"e17","version":1},"files":[{"name":"report.txt","type":"text/plain","bytes":12}]}
```

Document/transfer identities are validated opaque values, not arbitrary client
session overrides. Writes identify the document, transfer, file index, contiguous
byte offset and base64 chunk. Unknown fields, invalid arity/options and malformed
acknowledgments fail closed. Zero-byte files work; low-level begin with an empty
files array supports clearing. The public CLI still requires at least one filename.

One manager belongs to each host, one selection owner to each document. Every
non-cancel operation resolves the selected document; native event yields recheck
session/tab/page/job/signal ownership. Tab switches invalidate captures/staging
without removing unrelated inactive-tab selections. Navigation initiation, reset,
clear, type changes, removal and disposal invalidate affected work. Absolute TTL
does not extend on writes. Closing sessions/host releases associated resources.

Commit installs owned copies and releases staging before native input/change
dispatch. Lost ownership during input can suppress change after selection already
changed. **Cancellation is not rollback.** Lost begin replies may make cleanup
unconfirmed; lost commit replies may hide a successful selection. Errors instruct
callers to inspect document state before retrying. Cancel confirms staging cleanup,
not removal of an already committed selection, and does not bypass blocked jobs.

Upload arguments are redacted before tracing, error text is generic, and metrics
contain counts/reservations rather than names, payloads or local paths. Files are
consumed by the same native validity/reset/multipart path as `FILE-SELECTION.md`.

## Bounds

- Selection owner: 64 files, 128 controls, 8 MiB per file and 32 MiB total bytes;
  filename/type limits remain 255/256 code units. CLI argument count limits each
  invocation to 63 files. No MIME filtering or full filename-font coverage is claimed.
- Protocol: 32 KiB decoded chunks and 65,536 metadata code units; contiguous
  canonical encoding is required. Manager TTL is five minutes by default.
- Host manager: at most eight sessions, sixteen documents, eight transfers,
  32 MiB staging and 128 MiB binary-buffer reservations by default.
- Per-session reservations: 64 MiB selected-owner capacity, 32 MiB staging and
  eight transfers. Conservative owner-capacity reservations can reject admission
  before nominal document/session limits are reached.
- Selected reservations cover full registered-owner capacity even after reset;
  staging/copy reservations are separate. The codec reserves another 32 KiB.
  These are not process RSS, string/metadata, caller-copy or multipart-output bounds.
  Existing form-submission size limits remain independent and unchanged.

## Current integration evidence

Both final focused runs pass **348 tests across ten files**. Source types/builds,
strict checks for seven affected test files, fourteen-file Biome checks and
two-source-file lint/format checks pass. Existing import ordering in the two larger
modules remains untouched. Parent preserves the earlier private-client const-tuple
typing fix and corrects a worker schema table to pass complete argv arrays rather
than only their first element; all 66 command-adapter tests then pass.

Six cross-boundary tests execute actual CLI entry, private-file client, request
envelope/decoder, host queue, session and document owner with only HTTP transport
injected. The fixture checks bearer/header/frame/session contracts and guards
server creation/process spawning against use. It covers private small/empty/
70,000-byte files, capture-before-read, another named session, stale navigation/
tabs, queued and in-event interruption, lost successful commit reply, redaction
and an actual generated multipart POST. Parent promotes the file input to visible
native layout rather than retaining the worker's hidden-input prerequisite.

Final explicit native validation passes **10,748 tests across 315 isolated files**.
Working validation reports **11,879 passes and the same fifteen pending assertion
failures across 337 files**. The preexisting twenty-two extra working test files
and positioning/capability/onload assertion differences remain unbundled.

Four fresh v2 command-host PNGs were inspected: 400x220, fixed file rectangle
(31,63,338,28), root scroll (0,120), with empty/single/three-file/reset states.
Sizes are 7,817 / 7,456 / 7,669 / 7,817 bytes; empty/reset pixels are identical.
Uploads include an empty file and 70,000-byte multichunk data. Staging/copy counts
return to zero and input/change order is asserted. These captures use synthetic
bytes through real host commands, not private files, CLI, page scripts or a socket.
The reset button was widened in v2 after inspection; initial clipped-label evidence
is retained separately rather than overwritten.

Evidence uses the `upload-production-integration` prefix in the native-validation
cache, including capture-v2 script/JSON, native-final-isolated and native-working logs.
Original protocol/server/client/cross-boundary worker handoffs and results remain
under their original isolated paths. No old migration or live report is relabeled.

## Open gates

Native chooser, guest File/FileList/DataTransfer, drag/drop, actual service/socket
authentication, real subprocess permissions, terminal/PTY, released-SafeJS and live
website/framework acceptance remain open. No such probe ran or denied probe was
retried. The native engine and runtime dependency policy are unchanged.
