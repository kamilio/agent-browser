# Native CSS serializer microbenchmark — September 12, 2026

This measures warm declaration serialization on this machine,not page-load
latency or overall browser speed. No production optimization is added solely
from these measurements. Both runs and every tested workload are retained.

## Results

|Run|Workload|Declarations|12470 median ns/call|12650 median ns/call|New/old ratio|
| --- | --- | ---: | ---: | ---: | ---: |
|run00|static-typical|30|20683|21205|1.025|
|run00|static-custom-heavy|158|53763|55515|1.033|
|run00|pending-complete|10|5642|1663|0.295|
|run01|static-typical|30|21027|21318|1.014|
|run01|static-custom-heavy|158|53036|55695|1.050|
|run01|pending-complete|10|5562|1664|0.299|

Lower ratios mean less time for the same validated output. Small static-workload
differences should not be treated as a general speed guarantee or statistically
established regression:these are shared-machine same-process measurements,
without CPU isolation or a significance test. The complete-pending workload
benefits from the new direct preservation path,but this is a narrow result.

Each workload runs1000 warm-up calls per runtime,then9 samples of2000 calls,
alternating AB/BA order. Entries and serialized output are byte-equal across
versions before timing. Typical static declarations,128 additional custom
properties,and complete pending margin/padding shorthands are included. Raw
per-sample values,minima,maxima,source/output hashes and parameters are retained.
Cold module/parse costs are excluded from per-call timing.

Partially overridden pending shorthands are checked for correctness but not
timed across releases:the old serializer loses values,so its different output
would make a speed comparison misleading. New reconstruction limitations remain
documented in LIST-STYLE.md;no all-serialization or whole-browser claim follows.

## Provenance

Both runs use pinned Node22 and committed12470/e8375ac and12650/8b112c8 runtimes.
The parent verifies20 receipts per gate,full source/compiled ledgers and23 actual
Git input buffers each time. Child socket/socketpair calls are kernel-denied;
private HOME/TMP and a30-second execution ceiling are used. No HTTP or page
session occurs. Sources,compiled outputs and benchmark script remain unchanged.

- run00:child 2026-09-12T09:19:42.013Z through 2026-09-12T09:19:45.150Z;supervisor 2026-09-12T09:19:41.884Z through 2026-09-12T09:19:45.162Z;exit0.
  stdout SHA256:bc553ce50773a60951cc03efa3c31adc98c158ecc6455b56bf8b1cec450c41be.
  summary SHA256:e98835f3e153c6f5b9d94c2e1bdeb0393d10a2d1d099df43aceb3d49cffb5f98.
- run01:child 2026-09-12T09:21:13.906Z through 2026-09-12T09:21:17.018Z;supervisor 2026-09-12T09:21:13.776Z through 2026-09-12T09:21:17.029Z;exit0.
  stdout SHA256:2806237eb0e3391e5d69f003e95825f9032ee9c8e7ab1f0200569ffa67910f01.
  summary SHA256:c27a77e523be3ac8c5cabb3929c3caa189a6defc20007f87a4d68a7bca797eae.

Evidence lanes:`node_modules/.cache/native-validation/post-list-style-work-september12/serializer-benchmark-run00`
and`node_modules/.cache/native-validation/post-list-style-work-september12/serializer-benchmark-run01`.
Shared probe SHA256:69510d4a0d264e4d235ef12e2854e57ea8bbfb9da0e153e869ed8f72fe798280.
These measurements do not add websites or establish provider/device/TTY/realSafeJS,
challenge handling or general performance acceptance. Broader profiling remains open.
