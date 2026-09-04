# Bounded native tracing integration

September 4, 2026. This integrates the native semantic recorder, owned JSON
artifact, portable reader and private-file CLI export. It does not integrate the
pending local trace-review UI or establish live browser/runtime acceptance.

## Commands and ownership

```sh
agent-browser -s=research tracing-start
agent-browser -s=research tracing-status
agent-browser -s=research tracing-stop --filename=trace.json
```

Start records an initial observation and rejects an existing recording or sealed
trace awaiting export. Settled per-session commands record their name, duration
and returned/threw/interrupted outcome. Tracing/artifact inspection commands do
not recursively record themselves. Global commands are not a continuous event
stream. Stop seals an export and returns a session-owned artifact through the
command API; the CLI downloads it to a private JSON file without overwriting.

The recorder retains at most 128 frames and 2 MiB of serialized export data, with
smaller per-frame snapshot and request limits. Status reports retained bytes,
frames, omissions and truncation. These are retention bounds, not measured peak
RSS or runtime-throughput claims. Exported frames are immutable observations,
not references to later-mutated documents. Closing a named session releases its
recorder and artifacts without affecting another owner.

A full artifact store refuses stop without discarding a recording. Once sealed,
a failed artifact allocation retains the sealed export for retry rather than
resuming collection. Successful allocation releases the recorder. Failed local
trace persistence retains the artifact and reports its ID for recovery; PNG/PDF
cleanup behavior remains distinct. A successful save reports both local temporary
and remote cleanup confirmation under `CAPTURE-PUBLICATION.md`.

The public entry point exports `SessionTrace`, its limits/capabilities, trace types
and `readTrace`. The reader validates bounded metadata/chunks, UTF-8/JSON, matching
frame counts and ordered action records before delivering bytes. It is not a
complete validator of arbitrary nested third-party snapshot content.

## Observability must not replace action results

The pending implementation serialized frames outside its collection error
boundary. A non-serializable diagnostic payload could therefore make a completed
fill appear failed, replace a real navigation error or prevent tracing startup.

Serialization/encoding failures now count as omitted frames and return without
changing the action result. Collection can recover on the next action; sequence
gaps and truncation expose the missing observations rather than inventing empty
frames. Native component failures continue to use bounded error codes. Tests
inject bigint, cyclic and throwing-serializer metadata to verify both successful
actions and preservation of original action errors, plus startup recovery.

`readTrace` also rechecks cancellation after its asynchronous consumer settles.
An abort during delivery no longer reports a successful completed read. Already
delivered bytes or consumer side effects cannot be undone, and a consumer that
never settles is not forcibly interrupted. The caller retains artifact ownership;
the reader does not silently delete a failed/cancelled download.

## Privacy and evidence

Frames contain bounded semantic page text and URL paths, which may be sensitive.
Command arguments, explicit snapshot value fields, request bodies and headers are
omitted; diagnostic URLs redact credentials, queries and fragments. This is not
a guarantee that page text or accessible names contain no secrets. Protect exported
files accordingly. Returned means the command returned, not that every nested
page script or network request succeeded.

Ten new native cases cover the failure/cancellation fixes and public exports.
Nine reproduce failures before correction; the existing public exports already
pass in the working tree. The 45 pending recorder/export cases are integrated,
along with the existing injected-CLI JSON export case. Focused runs pass 147 tests
across seven files in both working and isolated trees. Strict checking of the three
affected test files and production typecheck/build pass in both trees.

Full authorized native runs pass 9,603 tests across 268 working-tree files and
8,409 across 244 isolated-commit files. Twelve-file lint also passes. The unchanged
explicit native manifest already lists the two now-integrated trace test files;
no live validation run is inferred from these results.

The capture probe source receives only the PNG discriminator required by the
broader export return type. It is compiled, not executed; historical artifact
paths, reports and measurements are unchanged. No public site, socket, real
TTY/PTY, live browser or SafeJS probe ran. Filesystem tests use separately
authorized native execution under actual ownership.

## Remaining gates

Next integrate bounded local trace review and its inert display boundary. Video,
pixel reconstruction, continuous events, Playwright ZIP compatibility, full
human/agent arbitration and the broader compatibility ledger remain open. Native
fixtures are not proof of released-SDK behavior or real-site performance. Pending
review/layout work is preserved, the denied SafeJS probe stays unrun, and the
complete seven-day browser objective remains active.
