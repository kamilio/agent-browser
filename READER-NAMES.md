# Authored names in the native reader

The semantic reader retains literal `aria-label` and `aria-labelledby` on
preserved anchors and preserved elements with an authored, nonblank `role`.
Each value admitted by this rule is limited to8192 UTF-16 code units, before
HTML escaping. Existing total source/output limits still apply; values above
the limit are omitted, not truncated. Both default and long-v1 profiles use
this rule without a new option.

The existing snapshot algorithm uses usable referenced text before a literal
label. This change preserves input metadata; it does not implement a new
accessible-name algorithm or claim full ARIA conformance. Raw role strings
remain unchanged, including unsupported roles and fallback-token strings.

Passive non-anchor elements without a nonblank role do not gain naming metadata.
Omitted, hidden, unwrapped and replaced elements retain their existing behavior.
Anchors without href do not become navigable. No handlers, new controls, visible
prose, script activation or pressed-state behavior is synthesized.

The existing ARIA-table metadata rule is independent and can retain larger
attributes;8192 is not a global cap on all reader naming attributes. The separate
table-source extraction limits also remain unchanged.

Google Play's saved Top charts source demonstrates why this matters: its three
category controls have authored labels, but their child labels are hidden from
the reader. Snapshots now name those existing buttons instead of returning empty
names. Ordinary Markdown stays unchanged. Numbered placeholders do not become
app rankings, and missing CNBC table rows are not invented.

See `reports/reader-names-2026-09-16.md` for native tests, retained historical and
fresh source comparisons, and the separate live-capture limitations.
