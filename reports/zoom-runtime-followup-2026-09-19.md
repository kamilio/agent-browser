# Zoom runtime follow-up: initialization still incomplete

September19,2026. All observations below are offline. The latest live Zoom
attempt remains the September18 run documented in
`zoom-unicode-initialization-timeout-2026-09-18.md`:16 scripts pass and script17
times out. No usable meeting UI, legitimate admission, audio, recording,
transcription, summary or delivery has been demonstrated.

## Private-name cache experiment: not promoted

A30-second scope observer reports17,195,660 scope-root calls,62,767,169 ancestry
checks and3,427,969 private-name cache bypasses. Evidence:
`/tmp/agent-browser-scope-hotspot-57nx1zhn`;7,085inputs/20artifacts verified,
seal `ac89accf61e0e24ae95383625ea7cafa85b72519747f8ce783fbc389a90ebd06`.
This deliberately aborted observer is not a timing comparison.

The versioned private-name-map experiment in
`/tmp/agent-browser-sdk-private-name-cache-9nme0psy` initially passes49focused,
541selected tests/types/build and nine native checks. However, its later
`accessor-red01` reproduces an unfixed cache invalidation error: a changing
`privateNames` accessor can pair one map's revision with another map's roots.
That lane has49passes/1failure. Do not promote its ap7eyadg package.

Its exact vendor replay also remains a timeout:120.243seconds,828,419steps,
801,845peak data. This does not establish useful improvement over2x8YPp.
Native evidence: `/tmp/agent-browser-private-name-actual-vfl_nius`,43artifacts,
seal `8c4106940c5686c9e0866213d3eb3896b60c439310758309f30b4817b7e9f3a6`.
Vendor evidence: `/tmp/agent-browser-private-name-vendor-w5mqel29`,20artifacts,
seal `b0a1353d2572686f724c96200d0e07311b5c1db0c593021eaa485d60fde9f076`.
Both have7,087verified inputs and complete observed cleanup.

## Late vendor entries and clock observation

A new private entry observer uses qualified2x8YPp, not the rejected cache
package. Its owned control verifies actual source offsets and two deterministic
Date clock reads. A separately scoped captured-vendor run deliberately stops at
30seconds and retains a bounded ring of2,048 late entries, without retaining AST
objects, identifiers, source text or guest values.

The retained window spans steps773,036–776,487, approximately25.4–30.4seconds.
All retained root spans identify the vendor IIFE. Frequent entries belong to
repeated schema/type-normalization checks, including `instanceof`. These are
entry frequencies, not exact suspended-PC locations or CPU percentages.
The clock observer sees two Date reads advancing18,480milliseconds; the native
PageClock records zero reads. No frozen-clock explanation is established.

Evidence: `/tmp/agent-browser-zoom-entry-diagnostic-dnnk9d5m`;
7,085inputs/20artifacts verified, complete observed cleanup, seal
`d2125c9969ec4fe8baac69c8ce0bbc30ae4f766a5cf7f5bfb4d9bc78ee7c5082`.
The observer is not included in any normal package or live run.

## Released regex tickets

Source inspection finds an independent redundant traversal: regex values retain
ticket identities after the budget releases those tickets. Merely testing a
nonempty included-ticket set therefore triggers an unnecessary second graph
scan. The contribution in `contributions/safejs-released-tickets/README.md`
checks actual ticket activity while retaining all first-pass accounting.
Final13focused/250selected tests, types, build and nine native checks pass.

The new cybnsyeb package still times out on the exact vendor at120.300seconds,
827,879steps and801,524peak data. No useful end-to-end speedup is established.
Native evidence: `/tmp/agent-browser-released-ticket-actual-fzl9mopn`,43artifacts,
seal `bf245fc22928ddce4c9ae9c75614173035e6c1cbb4bf420514a11e41ffa671b0`.
Vendor evidence: `/tmp/agent-browser-released-ticket-vendor-orj6r_tw`,20artifacts,
seal `d154ee344676fe2f46a794b4e8e4fb38c4d54f48028c688b4dfb4b358549250b`.
Both have7,085verified inputs and complete observed cleanup. No default runtime
activation or live retry occurs. All previous source, time, memory, network,
filesystem and code-generation restrictions remain unchanged.

The measured bottleneck remains repeated retained-graph accounting during
vendor initialization. A narrow ordinary-primitive `instanceof` shortcut was
considered but not implemented: the dominant full-graph reconciliation occurs
after every evaluated AST node, outside that helper. Further work must address
that repeated traversal without omitting mutable descendants, arbitrary retained
providers, compile ownership, cancellation or data-depth/data-size enforcement.

Home storage temporarily filled; work continued under `/tmp`. Space later became
available without this task deleting or relocating historical evidence or user
work. Existing report paths and measurements remain intact. Zoom remains OPEN.
