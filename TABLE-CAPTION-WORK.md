# Bounded caption-table indexing

Formatting construction records table nodes when they are created rather than
rescanning the complete formatting graph whenever a caption is present. Actual
and anonymous tables use the same index. It holds existing node objects, so
whitespace compaction's ID/parent/child remapping does not leave stale indices.

Index insertion and enumeration are charged to the existing work budget. Tables
without captions incur one index-insertion charge per table; pages with captions
avoid the previous all-node scan. This is not a claim that every page uses less
work, nor that fewer work units establish a wall-clock speed improvement.
Ownership, wrapper/grid/caption geometry, supported profiles and diagnostics are
unchanged. No cache, runtime dependency or new resource ceiling is introduced.

Nine cases exercise top/bottom caption work scaling against unrelated page nodes,
no-caption/hidden-caption paths, graph ownership, anonymous/nested tables,
compaction, unsupported profiles, and bounded failure/recovery. The two scaling
cases fail against the previous full-graph scan and pass with the index. Checks
compare visible-versus-hidden caption work deltas, not timing or a magic total.

These cases participate in the 815-case focused validation documented in
READER-POINT-ANCHORS.md. Original table-caption feature evidence and measurements
in TABLE-CAPTIONS.md remain historical and unchanged. A new exact-byte TestPages
replay is reported separately in the thirteenth September 13 website inventory;
it must not be described as a fresh visit or a full website rendering pass.
