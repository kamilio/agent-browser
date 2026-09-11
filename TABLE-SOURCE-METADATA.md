# Native table source metadata

The native reader retains a finite set of table-related attributes so later
extraction does not lose the information before an agent can inspect it. Request
that information explicitly with JSON extraction:

```sh
agent-browser extract --format=json --table-metadata
agent-browser extract '#results' --format=json --table-metadata
```

The corresponding native API is
`extractDocument(tree, { format: "json", tableMetadata: true })`.
Default JSON and Markdown retain their previous shapes. False disables the
option; true requires JSON. Nonboolean API values and true with Markdown reject
as invalid-input instead of silently losing the requested metadata.

## Data contract

Selected visible table-related elements carry an optional `tableSource` record:

```json
{
  "kind": "native-table-source-v1",
  "tag": "th",
  "attributes": {
    "id": "release",
    "scope": "col",
    "colspan": "02"
  }
}
```

The tag distinguishes header/data cells and section/column/caption elements
without changing existing extraction node kinds. Attributes are admitted native
document strings, including empty and unusual values. HTML tokenizer decoding
has already occurred; these are not verbatim source bytes or a source-authenticity
guarantee. Later document mutations are reflected in later extractions, not in
already returned metadata objects.

| Native tags | Retained attributes |
| --- | --- |
|table, caption, thead, tbody, tfoot, tr|id|
|col, colgroup|id, span|
|td|id, headers, colspan, rowspan|
|th|id, headers, colspan, rowspan, scope, abbr|

The reader and extractor share this allowlist. It does not admit table event
handlers, CSS, arbitrary data attributes or URL-valued fields. Existing reader
link/base/image/list attributes retain their existing behavior.

## Bounds and meaning

Each retained table attribute is limited to4096 UTF16 code units in opted-in
extraction. An over-limit value fails with resource-limit; it is not truncated.
Metadata counts toward the existing extraction output and intermediate byte
limits, with existing node/depth limits unchanged. The reader still enforces its
own source/output/token/depth limits. Retained attributes consume that reader
output budget even if later extraction does not request table metadata; a page
previously fitting only because these values were discarded can now reject.

Hidden or excluded native nodes and section context-only ancestors do not acquire
metadata. This does not add CSS or visibility semantics to the research reader,
whose existing partial/no-styling/no-hidden-semantics limitations still apply.
Root and section selection can omit referenced headers or other related nodes.

**No table grid or support relationship is computed.** Numeric-looking strings
are not parsed or clamped; scope values are not normalized; headers tokens are
not resolved, deduplicated or validated against IDs. Duplicate IDs, absent targets,
nested tables and incomplete selections remain unresolved. Neither attribute
presence nor matching labels proves GPU/release/OS compatibility.

This increment addresses the information-loss prerequisite identified in
`ROCM-COMPATIBILITY-SOURCE.md`. Compact structured output and bounded, correctly
qualified relationship interpretation remain further work. Historical AMD
exports and their47.16% marker-label measurement are not rerun or rewritten by
this feature, and no new live validation or overall browser completion is claimed.

## Validation status

Implementation and focused synthetic cases pass the isolated six-file native
gate on September 11, 2026. The exact staged table feature plus committed pacing
also passes combined production build, eight-root types and all 477 selected
native cases at 03:27 UTC. Live validation and the unrelated dirty workspace
remain outside this result. The earlier check and execution history follows.
On September 10, 2026, six isolated formatter children pass with stable input
hashes. FORMAT03-RESULT.md in the native-table-source-metadata validation lane
preserves the external bootstrap warning; the verified runner checks the correct
full input authority internally. These are not build or native-test results.

The first reviewed build/types/lint request is denied; CHECKS-DENIED.md preserves
that history. After explicit user reapproval, checks01 runs at22:29 UTC on
September 10, 2026. Production build and six-root no-emit TypeScript checks pass.
Eight-file lint fails: two new-test style errors and unchanged committed host
import ordering. The overall check fails despite stable2658-input authority.
CHECKS-RESULT.md records actual statuses and the separate authorization history.

The two owned test issues are corrected without weakening default serialized
output equality. A fresh round02 snapshot changes only those test repairs from
the previously executed source. At22:41 UTC on September 10, 2026, production
build, six-root no-emit types and scoped lint pass with stable2629-input authority.
Lint is unrestricted for seven files; the host-only check disables only import
organization while enforcing the exact committed host plus two feature hunks.
This is not an unrestricted eight-file lint pass. Unrelated imports stay intact.

On September 10, 2026, the separate six-file native-test approval is explicitly
denied as outside the user's build/type/lint authorization. No native tests
launch then. NATIVE-DENIED.md and NATIVE-RESUME-DENIED.md in the round02 lane
retain the original denial and subsequent authorization-withdrawal history.

On September 11, 2026, resumed development runs the bounded isolated table
native gate and integration. After runner/authority pin verification and checks
that execution artifacts are absent, the unchanged reviewed native01 runner
executes at 03:15:20.033–03:15:23.073 UTC. All 418 tests across the exact six
manifest-listed files pass, with zero failed, pending or todo tests. Child and
outer exit codes are 0, both retained stderr streams are empty, and all 4414
authority inputs, including 2739 snapshot files, remain stable. The clean
six-key environment, strict bootstrap, network guard, one worker, bounded
timeouts and exclusive receipts are retained. Actual receipts and per-file
counts are documented in
`node_modules/.cache/native-validation/native-table-source-metadata-round02/NATIVE-RESULT.md`.

The inspected integration helper is applied through apply_patch, changing only
formatting in table-source.ts, table-source.test.ts and table-source-command.test.ts.
All six integration-scope source files match the tested snapshot byte-for-byte
afterward. Shared command-host.ts already differs from that snapshot and is
left untouched, so this isolated pass does not validate the combined current
workspace. No broad suite, old denied native-route suite, live website, socket,
TTY/PTY, SafeJS, credential or device probe runs. Original snapshots and historical
receipts remain unchanged; the subagent makes no commit or push.

The main agent separately validates the exact staged source with committed
pacing in `node_modules/.cache/native-validation/native-browser-integration-september11-round02/`.
Production build, strict eight-root types and all 477 native cases pass from
03:26:56.282 to 03:27:07.521 UTC, with all 978 source inputs unchanged. Each
snapshot source matches the Git index afterward. This covers the two new
features together, not unrelated unstaged host/runtime changes. The preceding
combined attempt fails because its build omitted an explicit dist directory;
its emitted adjacent JavaScript and six failed spy cases remain preserved.
The corrected run changes only the validation harness, not runtime or tests.
Live acceptance, relationship interpretation, compact output, compatibility
research and the broader browser goal remain outstanding. No push runs.
