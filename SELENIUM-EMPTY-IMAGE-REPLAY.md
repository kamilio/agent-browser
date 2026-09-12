# Selenium cached image replay after empty-image support

## Result — September 12, 2026

One offline native parse plus one exact-URL memory image response now reaches a
successful used-layout result with63contexts. The earlier native14922 replay's
failed result remains unchanged; this new result uses committed native15421,
`5164b28a6480c2748a18534ac7799ad0e215bfd1`.

Native operation:18:33:06.674–18:33:06.762UTC. Parent supervisor:
18:33:06.542–18:33:06.773UTC, exit0, no signal/error, empty stderr and private
HOME/TMPDIR afterward. No live HTTP request, native click, navigation, raster or
hit-test acceptance is exercised. This is a cached page layout improvement, not
fresh website-wide support or a successful live navigation claim.

## Same captured inputs, new native layout

Original capture remains at
`node_modules/.cache/native-validation/native-selenium-transform-flow-september12/`.
The HTML is3123bytes, SHA256
`97179c187a27e230036f15ee8615213366ebd1ec8cc93ac70ef8afb8737331f3`.
The GIF is127bytes, SHA256
`8ec2eb6e73b004c576c2dbd1ead57f4bb017aa7d8436418419d6380fd0cb29aa`.

The new replay parses197nodes. Revision198 becomes199 after image hydration,
without changing node count. e168/invalidImgTag still has no source or alternative
text: its native owner remains empty/complete, with zero natural dimensions and
empty currentSrc. It is no longer an unsupported element-layout blocker.
e170/validImgTag loads the identical GIF87a initial frame,18x18/1296decoded bytes.
No image source, DOM content, CSS declaration or author geometry is stripped.

The standalone formatting decomposition retains one display-layout-not-supported
marker for e151's table. That is an intermediate coordinator handoff, not a
failed used-layout result: the actual layoutDocument call succeeds with63contexts.
This report does not rewrite the marker or equate an issue-free standalone tree
with whole-document acceptance.

Image accounting:2elements,1resource,1memory request,127received bytes,
1296decoded bytes,21261decode work and394scan work. The memory callback accepts
only the exact originally observed icon.gif URL. After closure, query indexes
are empty and the image owner has0elements/resources/active/queued/decoded bytes.
The owner's existing partial/profile labels remain unchanged.

## Isolation and provenance

Private lane:
`node_modules/.cache/native-validation/empty-image-work-september12/selenium-replay00/`.
The probe reuses the earlier bounded replay logic with a new release verifier,
not its earlier result. It runs under the existing kernel socket denial with a
sanitized environment, empty stdin, pinned Node22.22.0,30-second parent deadline
and262144-byte output bound. Native parse/query/image limits are unchanged from
that replay; no HTTP transport callback or cap increase is added.

Source and compiled inventories and all20gate receipts are verified before and
after the native operation. The explicit release proof had already compared
13actual committed snapshot inputs at18:32:49.785UTC. The release gate is
15421passed/0failed/2unchanged exclusions,1181source/1992compiled files.
Runtime source/compiled files and both original capture bodies remain unchanged.

The lane's post-run receipt seal is evidence preservation, not retroactive
pre-execution harness attestation. A separate read-only verifier checks recorded
outcomes, release/capture hashes and the seal without importing page modules,
parsing HTML, decoding GIF data, laying out or sending requests. This is Main's
own replay/verification, not independent implementation review. Fresh native
navigation and broader website/provider/passkey/SafeJS/challenge gates remain
separate in TASKS.md.
