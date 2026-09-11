# Implied table-end depth accounting

The semantic reader previously recognized an omitted table cell/row end only
when the cell or row was at the top of its input stack. Ordinary descendants
such as a paragraph, span or bold element prevented that recognition. Repeating
valid rows could therefore exhaust the reader's depth budget even though the
native HTML tree builder produced a shallow table.

## Change

`closeImpliedTableEnds` in `src/research-loader.ts` now scans backwards through
non-table descendants before applying the existing contiguous
cell/row/section/table-chain checks. A new cell, row or section closes the
appropriate previous scope, including that scope's descendants.

For example, repeated rows shaped like this no longer accumulate false depth:

```html
<table><tbody>
<tr><td><p>first<td><p>second
<tr><td><p>third<td><p>fourth
</tbody></table>
```

The sanitizer still emits the same HTML bytes. The existing native tree builder
performs actual implied-end construction; this change corrects the reader's
preliminary stack accounting rather than rewriting the page into another tree.

## Boundaries

- Backward scanning stops at the nearest cell, row, section, table, caption or
  colgroup. It does not search past an inner table to close an outer cell.
- The recognized table-chain prefix is still required. Unrecognized/malformed
  structures, caption/colgroup boundaries and out-of-table tags retain
  conservative accounting.
- Only incoming `td`, `th`, `tr`, `tbody`, `thead` and `tfoot` starts use this
  path. Other paragraph/list/form accounting and explicit-end handling are
  unchanged.
- The scan is bounded by the already admitted reader stack, at most 128 entries;
  it does not reparse a subtree or increase a budget.
- Source, token, retained-text, output, omitted-raw and real depth limits remain
  intact. The native document parser independently enforces document depth.
  Omitted SVG/template/script subtrees keep their existing strict handling.

## Reproduction and validation

The isolated pre-fix run on September 11, 2026 spans
**06:33:57.204Z–06:35:07.800Z UTC**. Build, strict checking and scoped lint pass;
tests report **3,416 passed / five failed** across 33 explicit native files.
All five new fixtures first establish that the native parser builds 140 shallow
rows and 280 cells, then reproduce the reader-depth failure with cell descendants
`p`, `div`, `span`, `b` or `code`. All 996 snapshot source inputs remain stable.
Evidence: `node_modules/.cache/native-validation/native-reader-table-scope-baseline-september11/`.

The final isolated run spans **06:39:06.478Z–06:40:16.022Z UTC** on the same
date. Build, strict checking of 33 selected roots, scoped lint and **3,463/3,463
tests** pass. The new file contains 47 cases covering cell/row/section transitions,
implicit sections, nested tables, explicit ends, conservative boundaries, depth
and other resource limits, and omitted content. Of the 3,416 previous cases,
3,415 retain their names and passing outcomes. One intentionally changed case
now accepts implicit table closure across cell descendants instead of expecting
a resource-limit error. All 996 source inputs remain stable.
Evidence: `node_modules/.cache/native-validation/native-reader-table-scope-september11/`.

These are selected native tests with network guards, not the complete manifest
or evidence for website, real credential, device, TTY or SafeJS acceptance.

## Fresh WHATWG recovery

A separate fresh native request to
`https://html.spec.whatwg.org/multipage/parsing.html` spans
**06:40:54.770Z–06:40:55.134Z UTC** on September 11, 2026. It receives HTTP 200,
decodes 787,795 bytes and successfully extracts 140 headings without truncation.
One actual request, zero redirects and zero mock responses are recorded; the
native client closes with zero active operations. The reader handles 40,888
tokens and emits 554,274 code units without raising any budget. The explicit
`long-v1` profile and `separate-omitted-raw-v1` policy remain unchanged.

The response body SHA-256 is
`311d356f10fcb9fbeedfa90964845568575f1802e2d7f34eba1f8fbc95c86e99`, identical to
the original depth-failing capture. This is recovery on the same captured HTML
bytes, with independently recorded fresh request evidence. The successful
receipt SHA-256 is
`0a2df06bff72bd2c8eb5e6d177ed5afc2a635b229c45286cc7ca1c59c7bc8eeb`.
The original failed receipt is preserved and is not promoted to admitted replay.

Source and compiled inventories match the validated build before and after the
request (996 source files and 1,784 compiled files); private HOME/TMPDIR remain
empty. This one page recovery is not general HTML conformance or a performance
benchmark. Evidence:
`node_modules/.cache/native-validation/native-whatwg-table-recovery-september11/`.

## Offline specification follow-up

The successful fresh capture also supports one bounded offline section replay
at **06:48:39.795Z–06:48:40.165Z UTC** on September 11, 2026, exit 0. Its unique
observed heading is `e23343`, level 5, titled
`13.2.6.5 The rules for parsing tokens in foreign content`. The replay selects
801 nodes plus three context nodes and emits 47,631 JSONL bytes. It makes zero
network requests or attempts against the installed process-level guards; those
guards are not an OS network sandbox. Source/build identities and capture pins
remain unchanged. The original failed capture is not used for this replay.

The result remains `extracted-unverified`, `partial: true`, `contentSuccess: null`.
The bounded source findings identify namespace-sensitive insertion, HTML
breakout and end handling, and external integration-point/attribute-adjustment
dependencies. The selected section does not contain a CDATA rule. No script
execution, complete specification traversal, SVG implementation or rendering
acceptance is claimed. Evidence and native-reference annotations:
`node_modules/.cache/native-validation/native-whatwg-table-recovery-september11/foreign-section/SOURCE-FINDINGS.md`.
The JSONL SHA-256 is
`6182df1a95329928bb9796cc2beaee31adb8795c276199a0ee3b4ef40b638e92`.

This change does not implement SVG tree construction, malformed-attribute
recovery, CAPTCHA solving, or a full HTML tree-builder specification inside the
reader. Those broader compatibility and research goals remain open.
