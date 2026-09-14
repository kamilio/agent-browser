# Native text justification

`text-align: justify` now has an actual bounded native layout implementation,
rather than merely accepting the CSS value. This addresses the remaining
alignment-value diagnostic in the captured Python documentation homepage.
That motivation is not evidence that the whole website works.

## Supported profile

- The existing inherited text-style registry admits `justify`, including
  variables, CSS-wide handling, cascade priority, inline overrides and computed
  styles. Used layout expands eligible separators on intermediate soft-wrapped
  lines. Block-final and forced-break lines remain start-aligned.
- Positive remaining space is distributed equally over internal eligible
  separators, using fractional cumulative endpoints without per-gap rounding.
  The available width comes from the current line interval after indentation
  and existing float constraints, not a viewport-wide approximation.
- The classifier includes space, NBSP, Ethiopic wordspace, the two Aegean word
  separators, Ugaritic word divider and Phoenician word separator. A separator
  must have positive advance. NBSP need not be a wrap opportunity to be an
  expansion opportunity. Classification does not add fonts, line-breaking or
  shaping for these writing systems; existing unsupported-glyph flags remain.
- Native policy does not expand preserved `pre`/`pre-wrap` text. For mixed
  lines containing preserved tabs, only the eligible suffix after the last tab
  expands; the tab-anchored prefix keeps its original positions and advances.
  This deliberately bounded policy does not implement every mixed tab/spacing
  case, nor promise that every such line fills the available width.
- Expansion updates the shared entries before glyph positions, inline fragment
  enclosures, backgrounds, borders, hit regions and caret consumers use them.
  Font size and glyph ink are not stretched. Source offsets and UTF-16 lengths
  remain attached to the original text, including supplementary separators.
- Intrinsic sizing returns before expansion. Overflowing, exact-fit and
  no-opportunity lines retain their existing behavior. Non-justify alignments
  do not perform the new scans. Every added traversal charges the existing
  layout-work budget; the resource-limit failure remains enforced.

## Limits

This is a horizontal native inter-word policy, not complete CSS Text conformance.
`text-justify`, `text-align-last`, `text-align-all`, `justify-all` and `match-parent`
remain outside this change. There is no compression, inter-character/CJK
distribution, cursive elongation, bidi implementation or new font shaping.
Visible unsupported separator ink, typographic half-spacing, all hanging/edge
separator rules, and general preserved/mixed-tab justification are not claimed
conformant. Existing line-edge trimming/hanging behavior is not redesigned.
Accepting this value does not bypass other formatting or actionability guards.

## Focused validation

The final isolated snapshot `text-justify-work-september13/fixed03` passed
**569 tests, zero failures and zero skips** across 13 selected native test files
on September 13, 2026, 23:53:50.931–23:54:09.532 UTC. It includes 34 new cases
and 535 existing cases. One existing negative CSS fixture intentionally changes
from newly supported `justify` to still-unsupported `match-parent`; its purpose
and assertion count are retained. Other adjacent test sources remain unchanged.
Compilation, strict test compilation, formatting and source integrity pass.

The identical-test parser-only/fixed comparison is retained separately:
`parser01` has 546 passes and 19 genuine layout failures; `fixed01` has 565
passes and no failures. This demonstrates that parser admission alone was not
the fix. The final four cases additionally cover preserved whitespace and tab
alignment. The intermediate `fixed02` failed because those tests compared
document-specific glyph references across different trees; `fixed03` compares
alignment mutations on the same tree, with unchanged production code.

The earlier NBSP test failure also remains recorded: the initial test wrongly
excluded nonbreaking spaces. The native-read primary source explicitly includes
NBSP among word separators, so the expectation was corrected rather than
removing valid expansion from production.

## Broader native gate

`native-text-justify-september13-round00` passed **21,551 tests, zero failures
and two unchanged skips** on September 13, 2026, 23:54:35.196–23:59:36.704 UTC.
There are 420 selected files and 419 strict test roots in the 774-entry explicit
manifest; 354 manifest files remain unselected. The host-object-ceiling and
advisory-media exclusions remain skips, not newly passed acceptance gates.

Production compilation, strict test compilation, formatting and source/runtime
inventories pass: 1,322 source files, 2,152 compiled files and 1,317 unchanged
tracked inputs. AUDIT SHA-256:
`669bd7bc0895fcdff403bcb3abac4a5e473b394459ab82675c39f623cb139518`.
The 20-entry receipt ledger SHA-256 is
`d011af41da297714fd064170fd94261e25bc464ab591d87aa8601e286364160e`.

The isolated snapshots do not incorporate unrelated working-tree changes.
Pre-existing manifest, TASKS and CSS reorder edits are preserved separately.
Neither native test gate establishes live website, credential/provider/device,
passkey, SafeJS, real-TTY, socket or performance acceptance.

## Primary-source provenance

One bounded native-browser GET of `https://www.w3.org/TR/css-text-3/` returned
HTTP 200 on September 13, 2026, at 23:42:24.402 UTC. The returned document
identifies the **August 14, 2026 Candidate Recommendation Draft**. This is the
returned edition, not a claim to have checked which edition is latest.

The native offline extraction retained 23,343 code units in 80 blocks from the
unchanged 540,326-byte response. Body SHA-256:
`17c26f1b41455947f106dac81736944b12da328ee4892c7c5b601f5b65ced55a`.
Source lane: `native-text-justify-source-september13`; final evidence ledger:
`13f65f903d38bf455de868d62dd2ec51e537966f14a77e4db20faf004efb4522`.

Its `REQUIREMENTS.md` distinguishes retained rules from native policy and lists
omissions. In particular, final/forced-line behavior, NBSP eligibility, current
line width, whitespace preservation, hanging participation, tab alignment and
work-sharing requirements inform this change. Bounded extraction omitted other
rules; neither the source read nor the synthetic tests certify those gaps.
