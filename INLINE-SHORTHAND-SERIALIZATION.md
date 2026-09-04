# Native shorthand serialization

September 4, 2026. This continues `INLINE-ORDER-ALL.md` by using the supported
shorthand set consistently when serializing inline declarations. No runtime
dependency, remote renderer or alternate browser engine is added.

## Behavior

The serializer builds a bounded reverse index from the existing native property
set to its shorthand candidates. Candidates covering more longhands precede
smaller candidates, with lexical ordering for ties. Border, border sides,
border width/style/color, flex, flex-flow and gap now participate alongside the
existing margin, padding, background, overflow and native `all` reset profiles.

Only complete, not-yet-emitted groups with a serializable value and compatible
importance can compact. Fallback longhands are also marked emitted, preventing
overlapping candidates from repeating or replacing a previously emitted component.
Incomplete pending groups retain their original provenance and empty-value
serialization; they no longer prevent unrelated ordinary groups from compacting.

The document-owned projection introduced by the previous checkpoints preserves
observable declaration order even when compact text would reparse into a different
order. Component setters/removals still update shared native layout and style
state. A second CSSOM owner observes the same order after the first owner closes.

## Parser-admission boundary

Individually valid longhand calculations can combine into a shorthand longer than
the existing native shorthand parser accepts. Emitting that shorthand would lose
declarations on explicit replacement or cloning. The serializer now checks that a
candidate expands to its complete native component count before emitting it,
otherwise preserving longhands. This also corrects the pre-existing margin and
padding version of that loss. Parser, declaration and retention quotas are not
increased or bypassed.

Four size-boundary cases cover border-width, margin, padding and gap using valid
longhand calculations with a combined shorthand above the parser's source bound.
They verify reparsing and cloned property values, not merely successful setters.

## Clone and import boundary

Read-only specification research informed the decision not to copy private CSSOM
projections into clones. The existing clone/import implementation copies serialized
attributes, while a newly created style declaration reads its new owner's attribute.
Tests pin that boundary: the copy adopts serialized declaration order, does not
share retained metadata and remains independent under later mutation. The source
retains its original ordered slots. No clone/import implementation changes are
needed for this checkpoint; full DOM cloning parity remains open.

Primary sources consulted on September 4:

- `https://drafts.csswg.org/cssom/#serialize-a-css-declaration-block`
- `https://drafts.csswg.org/cssom/#css-declaration-block`
- `https://dom.spec.whatwg.org/#concept-node-clone`

## Evidence and limitations

`src/inline-serialization.test.ts` adds 30 native host-object cases. Against
isolated prior HEAD, 26 fail and four pass. The first implementation also exposed
four oversized-shorthand regressions before the parser-admission guard was added.
Focused coverage combines this file with ordering, pending state, priorities,
inline styles, background, flex and border tests. Focused runs pass 253 tests /
eight files in both trees. Full authorized native runs pass 9,739 tests / 272
working files and 8,593 tests / 250 isolated files. Both trees pass typecheck,
build, strict new-test checking and two-file lint. Final counts are also recorded
in `TASKS.md` and `SEVEN-DAY-PLAN.md`.

The isolated tree comes from committed HEAD plus this checkpoint only. Its
unchanged historical reports directory references the previous isolated snapshot
to avoid duplicating 117 MiB on the nearly full scratch filesystem; source files
and generated build outputs are separate. Reports are not modified. Working-tree
and isolated counts differ because unrelated pending files remain only in the
working tree.

This is still the supported native subset, not complete CSSOM serialization,
logical-property mapping, border-image reset support, CSS grammar or reference
browser parity. No live website/browser, socket, real TTY/PTY or SafeJS probe ran.
The denied SafeJS probe remains unrun. Released-runtime and original compatibility
acceptance gates remain open, and the full seven-day browser objective stays active.
