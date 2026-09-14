# Bounded CSS rejection details

September 14, 2026. Native diagnostics now expose actionable rejection samples
without changing accepted CSS, existing issue counts, layout guards or budgets.
This addresses the missing attribution identified by the captured MDN check in
`MDN-GENERATED-ITEMS-REPLAY.md`; it is not itself a new website result.

## API and meaning

Call `documentStyles(tree).diagnostics()` on the same native document used for
layout. It refreshes through the ordinary cascade path and returns a frozen
snapshot with its cascade-build identity, full raw/applicable count maps, bounded
samples, retained/omitted occurrence counts and explicit coverage flags. Repeated
reads reuse the snapshot rather than reparsing or rerunning selectors.

The initial instrumented sites cover malformed declarations, unsupported
properties, invalid/unimplemented declaration values and selector-matching
failures. Declaration samples retain bounded authored/canonical property names,
authored values including known `!important`, selector ancestry and source
identity. A malformed declaration does not receive an invented property name.
Scanner damage and uninstrumented global categories remain in the existing count
maps without fabricated declaration details. Existing suppressed supports and
computed-variable behavior remain unchanged.

Samples distinguish rule/inline scope, applicable versus nonapplicable counts,
matched/unmatched/unresolved/not-evaluated selectors and active/inactive/uncertain
media. Matched samples contain target-kind counts, not an unbounded node list.
Inline samples identify their owner. Source identity is a build-local sheet
ordinal and import depth, including selector failures with accepted declarations
only; it is not a persistent stylesheet URL. Import depth is independent of CSS
parser nesting depth.

Applicability remains conservative: hidden, overridden, uncertain and global
issues are not necessarily visible winning declarations. Do not interpret a
sample as a unique bug or weaken a capability guard because samples are absent.

## Bounds and lifecycle

- At most **128 retained occurrence samples** across the complete cascade,
  including imported sheets and inline styles.
- Text limits in UTF-16 code units: code 96, authored/canonical property 128
  each, value 256, selector chain 512 total and at most 17 segments.
- Retained text is independently copied; snapshots retain no raw stylesheet,
  import graph, parser closure or DOM object. Native rule provenance is frozen
  primitive metadata within the existing rule budget and ends with the build.
- Saturation preserves full counters, reports omitted events and does not
  imply absence of later applicable declarations. Sampling is deterministic
  parse order, not an exhaustive or prioritized list.
- `exhaustive` is always false: not every diagnostic category is instrumented.
  `truncated` also identifies omitted events or shortened retained text/chains.
- Genuine cascade invalidation replaces the snapshot; benign cached reads and
  control-value changes reuse it. Earlier returned snapshots stay immutable.
  Failed rebuilds do not publish partial snapshots, and close releases the
  owner's retained snapshot.

Existing cascade/rule/declaration/source/sheet limits and charged work counters
are unchanged. Bounded diagnostic bookkeeping is additional work; unchanged
counters do not claim zero CPU/memory overhead or a browser speedup.

## Validation

Work directory:
`node_modules/.cache/native-validation/css-diagnostic-details-work-september14/`.

There are **96 new native cases**: 18 collector, 49 parser and 29 native-style
cases. The final focused round passes **443 cases**, including existing parser,
cascade, nesting and generated-item coverage. Tests cover saturation, detached
text, immutability, legacy parse/count/budget parity, media/matching scope,
imports/grandchildren/cycles, source provenance, failure recovery and cache reuse.

The final broader gate, `release01`, passes **22,392 cases with zero failures
and two unchanged exclusions** across 444 selected files. Build, strict checking
of 443 test roots and scoped formatting pass. All prior selected case identities
and outcomes are unchanged. The 796-entry manifest leaves 352 entries unselected;
this is not an all-manifest or whole-working-tree claim.

The audit verifies 1,350 source files, 2,176 compiled files, 113 receipt entries,
exact owned source changes, stable execution inputs and the prior native gate.
Audit SHA-256:
`0d7b81fb9de95b600d1779d79036a5f20da88e3236beb56e6aec21ea90ebe3e7`.
Receipt ledger SHA-256:
`76933bc3487be151ed7262de0787fb23b0d0d5819ed5c674daef7c377ea02e96`.

The unchanged parser/styles baseline includes only the new unconnected collector
module and new test files: 372 passed/66 failed. Two baseline/initial focused
failures were incorrect new assumptions about when variable syntax is rejected;
fixtures were corrected without changing existing variable behavior. The first
focused round passes 436/fails 2, followed by 439/0. An intermediate broader gate
passes 22,388 with two unchanged exclusions before the source-provenance review
correction and four additional integration cases. All rounds remain separate.
An initial preflight rejected a nonexistent test before creating a lane.

Source review found missing sheet/import provenance for selector failures. That
path is corrected, and follow-up review finds no concrete new blocking defect.
Review alone is not execution evidence. The clean validation snapshots exclude
pre-existing parser/styles reorder changes and three unrelated manifest entries;
those working changes must remain uncommitted.

Next: separately pin this runtime and read the bounded snapshot through the
native browser on the existing MDN capture. No captured body is interpreted
outside the browser. Website interaction, live-site research, credentials,
passkey devices, SafeJS, socket, real terminal and challenge gates remain open.
The overall browser goal stays active. No push.
