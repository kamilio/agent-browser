# GnuPG paired list-style source check

This is an isolated paired parse of exact captured HTML/CSS,not a new website
visit,full page render or navigation. The old GnuPG live/replay reports remain
unchanged. No images are loaded and no formatting tree or geometry is requested.

## Observed effect

| Authoritative style diagnostic |12470 before list-style|12650 with list-style|
| --- | ---: | ---: |
|Raw unsupported properties|43|38|
|Applicable unsupported properties|14|12|
|Raw invalid/unsupported values|7|7|
|Applicable invalid/unsupported values|2|2|
|Raw/applicable unsupported selectors|2/2|2/2|

- `nav ul`: 6 matched lists;computed marker types change from disc to none;new image value is none.
- `#nav_bottom ul`: 1 matched lists;computed marker types change from disc to none;new image value is none.

Both parses contain428 DOM nodes at revision430;queries and style reads
do not mutate that revision. Both document/query owners close. These computed
values demonstrate source-level shorthand applicability,not raster/interaction
acceptance. Other diagnostics remain and no GnuPG navigation is attempted.

## Provenance and bounds

Child UTC:2026-09-12T09:18:32.196Z through 2026-09-12T09:18:32.366Z.
Supervisor UTC:2026-09-12T09:18:32.169Z through 2026-09-12T09:18:32.374Z;exit0.
HTML:8307 bytes,SHA256 cff89f6b754a9c593bfff6c4f6d1f15c68cba9ab434a4e81796b94625225b438.
CSS:11804 bytes,SHA256 48233e2b7bd1f22cca5f901465a95ff7fb8d9bb80f862378d8530b2fa422863b.
Inputs are response-1.body and response-2.body in
`node_modules/.cache/native-validation/native-gnupg-flow-september12`.
Their hashes remain unchanged. The combined source is below32KiB and each DOM
below512 nodes. HTTP requests,mocks,page sessions,navigations and clicks are zero.

Runtimes:e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3 and 8b112c85d478279fef3913e66f013d5b25a8410f. Parent reverified20 receipts
per gate,all source/compiled ledgers,and23 actual Git snapshot inputs before
execution. Source/compiled ledgers remain stable afterward. The child uses
unconditional kernel socket/socketpair denial,pinned Node22 and private HOME/TMP.

Evidence:`node_modules/.cache/native-validation/post-list-style-work-september12/gnupg-source-run00`.
Probe SHA256:a2dadb65ce4c9074965d7520bbb889919ce7e57c14c63ca596760f4582a4e983.
stdout.json SHA256:d5c26dfb0372f8c42e11e9e6c4824d86a2665b92c80f1b53d5c92d6fde642c40.
SUMMARY.json SHA256:8b48f12cf17454f13594d1c57989e3db9544aa669f644eb4f53eea1ddb88709f.
No host is added to the inventory;provider/passkey/device/TTY/realSafeJS and
challenge/human-handoff gates remain outside this check.
