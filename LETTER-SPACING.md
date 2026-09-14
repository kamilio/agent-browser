# Native letter spacing

## Supported behavior

The native horizontal text pipeline supports `letter-spacing: normal`, unitless
zero, and finite nonnegative `px`, `em` and `rem` values. Relative values resolve
against the appropriate computed font size; descendants inherit computed pixels.
Normal computes to `0px`, while computed zero resolves to `normal` through
`getComputedStyle()`. Inline CSSOM retains authored/canonical declaration values.
Cascade priority, custom properties, CSS-wide keywords, style mutation and
font-shorthand independence are covered.

Tracking applies between rendered grapheme units after text transformation,
including ordinary inline/text/generated-node boundaries. Adjacent different
spacing values contribute their average; no outside-line spacing is retained.
For the native 8px mono font, `ABC` with 4px tracking measures 26px, with glyph
starts at 0/10/20. Glyph bitmaps are moved, not stretched.

Actual wrapping, intrinsic widths, inline rectangles, whole-text ranges, pixels
and hit ownership share these advances. Tests cover mutations, root-relative
values, collapsed/preserved whitespace, hard breaks, tab stops, discretionary
hyphens, generated tables and normal pointer-driven link navigation. Covered,
hidden, inert, disabled and canceled links do not gain a navigation fallback.

Source semantics are verified through this native browser's W3C section 7.2
extraction: `W3C-TEXT-SPACING-RESEARCH-SEPTEMBER-14.md`. That research exposed the
computed-zero/CSSOM distinction and corrected the first implementation candidate.

## Explicit limits

Negative tracking, other units, percentages and CSS math remain unsupported.
Existing font coverage, shaping/bidi and zero-font range limitations remain.
Nonzero tracking for native control labels, independent image-alternative labels,
numeric markers and affected atomic-inline boundaries is rejected explicitly.
Consecutive atomic-inline tracking is not implemented. Detached atomic boxes may
still use supported tracking within their independent text context.

Suppressed-only text cannot hide an unsupported atomic boundary. The guard tracks
effective neighbors across soft hyphens and invisible formatting units, while
respecting whitespace collapse, CRLF, preserved breaks and tabs. No formatting,
visibility, hit-testing or pointer-admission guard is weakened.

Feature detection examines only the active inline context, not the entire shared
formatting-node array for every positioned subtree. This fixes a quadratic-work
regression caught by existing 100/1,000-sibling tests. New tests also verify equal
charged work and indexed reads with 20 versus 1,000 unrelated nodes. Limits are
unchanged; no elapsed-time speedup claim is made.

## Validation — September 14, 2026

Final isolated gate: **23,097 passed, zero failed, two unchanged exclusions**,
459 explicitly selected files and 458 strict test roots. Production build,
strict types and scoped formatting pass. The manifest has 811 entries; 352 are
not selected by this gate. Execution runs 10:41:37.626–10:47:11.314 UTC. All 2,885
snapshot input files remain unchanged; the compiled inventory has 2,188 files.
This input inventory includes repository documents, not only production source.

There are 106 additional passing cases. All 22,993 previous test occurrences,
including two exclusions and duplicate labels, retain their statuses. Six scan
test labels/assertions change from one global scan to zero global scans, with
stronger local-read/work checks. The existing unsupported table-spacing fixture
now uses unsupported negative tracking; a new positive case checks actual table
geometry and pixels. No exclusion is promoted to a pass or work cap increased.

The final focused gate passes 1,151 checks across 26 files. Earlier failures are
retained: the original runtime fails 15 of 19 geometry/click checks; the zero-value
follow-up initially fails ten cases; restoring the old atomic guard fails 17 of
102 checks. Initial full candidates fail the obsolete table rejection and three
positioning-work regressions. Intermediate formatting/default-sharing/test-
instrumentation failures remain recorded rather than overwritten.

Only synthetic native tests run in these gates, with private HOME/TMP, non-TTY
pipes, socket-denying supervision, JavaScript network guards and explicit test
selection. They do not establish live websites, SafeJS, real socket/TTY,
credentials/providers/passkeys/devices or challenge acceptance. Existing unrelated
uncommitted work is excluded from the validated candidate and preserved on adoption.

Original evidence: `/dev/shm/agent-browser-letter-spacing-september14/`.
Final gate: `release02/`, including `AUDIT.json`, `CASE-VERIFICATION.json`, exact
source/compiled inventories, selection and original command outputs. Durable
archive and uncompressed final snapshot:
`node_modules/.cache/native-validation/letter-spacing-work-september14/`.
Copying evidence preserves original paths and timestamps; it is not another run.

## Next checks

Revisit captured MDN diagnostics/clicking on the committed implementation, using
the original corpus and fail-closed missing-destination policy. The previous MDN
ordinary click still fails native width admission; this feature alone does not
claim to fix that page. Wikipedia geometry, original four-topic research, broader
live interactions and separate provider/passkey/device/script/challenge gates
remain open. The overall browser goal stays active; no push is performed.
