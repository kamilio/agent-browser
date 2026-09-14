# Bounded nested pointer actionability

September 14, 2026. The native session already routes click, double-click and
hover through nested scroll-into-view. Its capability advertisement incorrectly
retained `nestedScroll:false`; this correction advertises the tested behavior.
It does not add force, stable-animation-frame waiting or complete CSS support.

Nine new native cases exercise actual session actions rather than geometry
alone. They cover auto/scroll/hidden inner ports, outer and root reveal, scroll
events before pointer events, hover without button presses, non-scrollable clip
boundaries and disabled-state revalidation after an inner scroll listener.
Each fixture accepts one synthetic initial URL only; it makes no real request,
executes no page script and performs no credential, device or real-site action.

The retained pre-fix focus records **222 pass/1 fail**. All behavior cases pass;
only the capability assertion fails. Final focus records **223 pass/0 fail**
across six files. The selected release gate records **22,074 pass/0 fail/2
unchanged exclusions** across 438 files, with 437 strict roots and 790 manifest
entries; 352 entries remain unselected. No test is weakened or newly skipped.
Build, strict checking, scoped formatting, exact existing case/name/status
comparisons and source/compiled inventories pass.

Evidence: `node_modules/.cache/native-validation/nested-actionability-work-september14/`.
The `before00`, `focused00` and `release00` lanes retain their original
outcomes. The final snapshot has 1343 source files and 2172
compiled files; it derives from the ownership release with only the capability,
new test and manifest changes.

- `release00/AUDIT.json` SHA256: `4a2e8e4243656876bcdaa25112f66c531a6d5bddb8406ce19ae52fadd686d5e9`.
- `release00/RECEIPTS.sha256` SHA256: `248f8b84f370557b4af377f7b8d6e63bd8448055fd1db0007ee5e2de5a9d3c0b`.

This is synthetic native action evidence, not another website replay. The
separate captured Python comparison remains pinned to ownership commit 23e988d,
not this newer capability metadata. Historical reports and unrelated dirty work
remain unchanged; overall browser and research acceptance gates remain open.
