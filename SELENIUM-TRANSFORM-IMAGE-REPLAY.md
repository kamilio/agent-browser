# Selenium image-loaded offline layout diagnosis

## Finding

A separate native component replay on committed `ae098bf77c19d626a8f54561da8bc3b496cbc308`
isolates the remaining **source-less, alternative-less image** as an unsupported
element in this captured document. This does not change the failed live result
in SELENIUM-TRANSFORM-FLOW.md or establish a successful click.

The native parser retains the original197nodes. The native image owner consumes
one127byte GIF through an exact-URL memory callback, not HTTP. Native GIF87a
decoding succeeds at18x18 with one initial frame and1296 decoded bytes:

| Native element | State after hydration | Formatting result |
| --- | --- | --- |
| e168, invalidImgTag, no src or alt | empty, complete, zero natural dimensions | element-layout-not-supported |
| e170, validImgTag, src icon.gif | complete,18x18,image/gif | no longer deferred |
| e151, wrappingtext table | native intermediate table representation | display-layout-not-supported marker |

The table marker is an intermediate representation handled by the coordinated
table-width callback, not by itself evidence of a table bug. The single native
used-layout attempt still throws `unsupported`: **Document width resolution
requires an issue-free supported formatting profile**. The remaining element
guard is e168. No markup, CSS, image or guard is removed to obtain a pass.

This isolates a native compatibility limitation in the replay; it does not
prove complete equivalence to the live loader/session, cross-browser behavior,
or the absence of further issues after that limitation is implemented.

## Inputs and execution

Private lane:
`node_modules/.cache/native-validation/native-selenium-transform-image-replay-september12/`.
The two input bodies come from the fresh sealed native Selenium run:

```text
response-1.body:3123bytes
97179c187a27e230036f15ee8615213366ebd1ec8cc93ac70ef8afb8737331f3
response-2.body:127bytes
8ec2eb6e73b004c576c2dbd1ead57f4bb017aa7d8436418419d6380fd0cb29aa
```

On September12,2026 the process runs17:43:03.203–17:43:03.436UTC; native work
runs17:43:03.346–17:43:03.424UTC. Process exit0 means the diagnostic completed;
**used-layout acceptance remains false**. One HTML parse, one memory-only image
fetch and one layout attempt occur. There is no new HTTP, navigation, click,
hit-test, rasterization, page script, credential/provider, SafeJS or device/TTY.
Response timing/transport metadata is synthetic and explicitly not live evidence.

Image decode work is21261; image scan work394. Revision198 advances to199 after
native image hydration. After cleanup the query is closed, image elements,
resources, active/queued work, decoded bytes and waiters are zero. Historical
cumulative request/decode counters are not represented as active resources.

The existing release verifier checks1176source/1992compiled files and21linked
snapshot inputs before/after, against the release whose isolated native gate
passed14922/0/2. Those native tests are not rerun by this diagnostic. Both captured
bodies remain unchanged. Kernel socket/socketpair denial, private empty HOME/TMPDIR,
sanitized environment, stdin DEVNULL and the30second/256KiB bound apply. The
CONTRACT.md records the lowered image/formatting limits; no cap is raised.

## Earlier exploratory evidence

The first unhydrated formatting diagnostic parsed once but failed its own revision
assertion after setting a viewport. Its original failure remains in
`native-selenium-transform-formatting-diagnostic-september12`.
Separate followup01 succeeds on the default viewport and observes one table plus
two unhydrated image deferrals. Separate followup02 reads only bounded native
DOM attributes, confirming e168 lacks both src and alt. These are three separate
earlier parses, not one retroactively successful attempt. Their directories share
the `node_modules/.cache/native-validation/` parent. No raw-HTML regex or alternate
parser was used. The image-loaded replay here is a fourth separate parse.

BROKEN-IMAGE-SOURCE.md preserves the earlier native WHATWG rendering extraction:
missing alternatives select a replaced branch, and absence of intrinsic image
dimensions is not permission to discard authored boxes. Its unextracted image
semantic/current-pending-state algorithms remain explicit source gaps. Existing
image fallback intentionally excludes missing alternatives and empty/unselected
resources. The next change requires a defined sizing/state policy and dedicated
tests; silently dropping e168 or inventing a universal300x150 fallback is not a fix.

## Verification limits

`verify.mjs` checks recorded observations, stable release/capture bytes, cleanup
and the post-run ledger without importing the page runtime or repeating parsing,
decoding or layout. It is a separate read-only check by the same implementation
author, not independent implementation review. The ledger pins harness bytes
after execution, not a retrospective pre-execution attestation. Main's earlier
independent24-object Git recapture belongs to the release/live verification and
is not misreported as another Git retrieval by this replay.
