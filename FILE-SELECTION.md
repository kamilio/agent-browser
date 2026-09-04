# Owned native file selection and forms

September 4, 2026. A shared document file-selection owner now connects native
file state to validation, safe value getters, accepted form reset and submission.
Private-file reads and bounded transfer helpers are prerequisites, not yet proof
of a production upload command or real network upload.

## Ownership and state

documentFiles(tree) supplies one owner shared across interaction and form entry
points. Selection commits validate a captured document/reference/version before
copying bytes and atomically replacing the previous selection. Disabled inputs,
multiple-file restrictions, removal/type transitions, reset and owner closure
are checked. Failed validation preserves the old selection. Input/change action
events occur after the state commit; later event failure does not roll it back.

Default ceilings are 64 retained files, 128 populated controls, 8 MiB per file,
32 MiB selected bytes per document, 255 filename code units and 256 content-type
code units. Owner limits can only be lowered. Names are bounded basenames, never
server paths. Metadata-only lookup returns frozen records without file-byte
copies, including for detached retained inputs. Native disconnected getters do
not grant permission to upload to a disconnected target.

The owner provides bounded invalidation hooks, stable identity and target checks
for the separate transfer service. Presentation revision changes invalidate
cached validity and visual/semantic consumers after selected state changes.
Closing the document clears selections, listeners and the registry entry, and
prevents owner resurrection. Detached files remain bounded but are not submitted.

## Forms and page bindings

Required-file validity and native checkValidity use current owned selection.
Retained guest validity objects update after selection/clear. Existing :valid
and :invalid selector support remains absent; this work does not enable it.
File value getters expose only the first basename prefixed by `C:\fakepath\`.
No real path or file contents are stored in DOM attributes. Nonempty guest value
assignment still throws; empty assignment silently clears the owner, including
on detached inputs, without input/change events.

Accepted reset clears the same file state and invalidates pending targets across
synchronous/async/native reset-button paths. Canceled reset and unsupported-reset
preflight failures preserve files and capture validity. Submission uses a fresh
owned file map at entry construction, after submit handlers have run; changing
or clearing selection in a handler changes the submitted bytes. Multipart and
GET filename preparation share this state. Existing explicit library-provided
file-map options retain their separate API semantics; they are not client upload
authority and must not be accepted from remote command metadata.

The existing default submission limit remains 1 MiB including encoding/framing,
even though selection permits larger files. Explicit library options can choose
a bounded larger limit up to the existing 64 MiB ceiling. Submission copies are
separately bounded by the 32 MiB selected-state ceiling and encoding limit; they
are not included in the future transfer manager's buffer reservation. A rejected
submission retains selected files. No process-RSS or forced-GC claim is made.

## Native evidence

The initial private-file helper has 28 native tests, and the final selection owner
has 26. Sixteen parent integration tests cover shared ownership, no-copy getters,
cached validity, multipart/GET preparation, post-submit mutation, reset failure/
cancellation, reset-button defaults, guest value clearing, detached controls,
byte limits and closure. Both focused runs pass 188 tests / eight files. Source
types/builds, strict new-test checking, twelve-file formatting and six-new-file
Biome checks pass. Two test-only type issues in the delivered fixtures were
corrected without changing their assertions.

Authorized full native validation passes 10,106 tests / 294 isolated files.
Working validation reports 11,237 passes and the same 15 failures / 316 files:
fourteen obsolete positioning/capability expectations in preserved pending work
plus the known pending Window.onload assertion. The same 22 preexisting
uncommitted test files remain absent from the HEAD archive, not removed from the
native allowlist. None of those pending failures is claimed fixed by this work.

The worker's original foundation, transfer, connected-reference metadata and
final numeric-owner artifacts retain their original paths and measurements.
The earlier connected metadata handoff is historical; current metadata accepts
a native node ID, and clear additionally accepts native IDs for detached setters.
Parent evidence uses file-selection-integration-* in the native-validation cache.

## Outstanding gates

`UPLOAD-COMMANDS.md` now connects the production CLI/protocol/host code with native
cross-boundary tests; actual socket authentication remains unverified.
`FILE-CONTROL-RENDERING.md` now supplies bounded visible
layout/painting and fresh evidence. Guest File/FileList/DataTransfer, a native file
chooser and full upload UI semantics remain absent.
Snapshots keep
file inputs protected rather than publishing their selected value. No live-site,
socket, real TTY/PTY, SafeJS or released-runtime probe ran. Native private temporary
files and injected transports do not establish those gates.
