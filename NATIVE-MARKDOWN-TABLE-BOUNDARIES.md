# Native Markdown table boundaries

September8,2026. Native rendering change with239 passing selected tests.

Native Markdown extraction represents admitted table, row and cell boundaries
explicitly instead of silently flattening them into ordinary paragraphs. It uses
six fixed labels:

```text
**Native table begin (selected structure only; associations unspecified)**
**Native table end**
**Native row begin (selected structure only)**
**Native row end**
**Native cell begin (selected structure only)**
**Native cell end**
```

These delimit selected native structure, not a rectangular grid. They do not
establish column alignment, headers, caption associations, rowspan/colspan,
complete rows or original source layout. Empty/ragged/nested structures retain
their admitted order and boundaries. Scoped rows/cells do not fabricate missing
table ancestors. Source text that resembles a marker remains normally escaped.

## Traversal and compatibility

The renderer uses its existing iterative task stack and shared list/quote prefix
state. A closing task is queued below each structural node's children. It emits
through the existing accounting path, including empty structures, rather than
constructing a second renderer, recursive cell routine or rectangular matrix.

A private indexed postorder pass over the already-admitted extracted tree marks
generic inline wrappers whose subtrees contain structural nodes. Those identities
traverse transparently through both normal scheduling and direct-node dispatch.
This supports native default thead/tfoot and generic span wrappers without
changing display styles, JSON types, refs or the HTML reader. Structure propagates
through ordinary block ancestors too. No tag-name whitelist or original DOM scan
is used. The call-local identity set is not public provenance or cached state.

Heading, paragraph, preformatted and semantic inline sinks still reject admitted
structural descendants with the fixed unsupported error. Generic inline wrappers
cannot clear an inherited sink. Preflight completes before any Markdown emission;
there is no partially successful output on failure. Hidden/excluded/pruned nodes
remain outside the admitted tree and cannot affect the marks.

Without structural descendants, generic inline wrappers retain their old grouping
and direct rendering, including wrappers containing ordinary blocks. Text-only
caption/colgroup wrappers still concatenate according to existing inline behavior;
no extra block or caption relationship is invented. Mixed text/structure wrappers
can acquire block separation through the existing scheduler, not preservation of
source whitespace or visual layout. Formatted inline sinks are not silently
stripped to make otherwise unsupported structure render.

JSON extraction, section selection/context, reader provenance, escaping and
public options remain unchanged. Existing node/depth/intermediate/output limits
remain unchanged. New markers count toward output limits, so a payload that fit
before may now fail rather than omit labels or return incomplete structure.
The preflight is linear in admitted nodes/edges with depth-sized frames and at
most node-sized identity storage; it does not repeatedly scan each wrapper.

## Evidence boundaries

`NATIVE-MARKDOWN-TABLE-DIAGNOSTIC.md` remains a historical two-fixture diagnostic
of the old renderer. Its concatenated table header and false raw-token verdicts
are not rewritten as new output or old test passes. The failed ROCm source gate
remains failed: new renderer tests cannot authorize a GET, establish a hardware
recommendation or recover unretained old failed-control output.

This change is native rendering, not source authenticity, complete reader
semantics, live table compatibility, browser fingerprint evasion or challenge
clearance. No dependency, remote browser, source endpoint, secret provider,
passkey device or SafeJS execution is introduced. All separate gates remain.

## Validation

An isolated committed-e606 snapshot with four selected overlays passes production
build, strict selected-test types and scoped lint. The committed package and
522-entry manifest are unchanged. **239tests pass across three explicit files:**
68extraction,68section,103reader, comprising63new and176retained old cases. There
are no failed, pending or todo cases. This is not the full native suite.

Original format succeeds11:31:02.474Z–11:31:04.112Z; checks succeed11:32:20.450Z–
11:32:30.335Z. First native-action preflight fails11:33:46.412Z–11:33:47.221Z:
the parent prepared a correctly hashed ledger under the wrong required filename.
Membership admission stops before any subprocess or test, preserving that failure.
Its absent before-ledger/report are not manufactured or relabeled as passes.

Fresh native-only round02 uses the exact corrected filename, unchanged formatted
candidates and individually compared copies of all2725built snapshot files. No
new compilation or formatter run is claimed. Actual native subprocess11:45:24.274Z–
11:45:26.301Z exits0 with complete output and no signal; helper11:45:23.409Z–
11:45:27.135Z exits0. Expected/before/after4406-input inventories match:
`5c23b5fc9c34e55529ec0098c6f1e647210135bd367d146f5f2cc300fcceb615`.
Parent also rehashes all4406 afterward. Independent preparation review checks all
13bootstrap/1682authority/4406expected inputs and both complete copied snapshots.

Static review initially finds that ordinary thead/tfoot are generic inline nodes,
not block containers. The explicit profile amendment fixes traversal rather than
styling the fixture to conceal the defect. Three span rejection cases migrate to
positive transparent-wrapper cases;27true-sink rejections remain. Text-only
compatibility, shallow/deep wrappers and unstyled reader coverage add four cases
to the original59. Original drafts/reviews remain historical, not passing runs.

Each gate has separate approval. Original format and round02 native each have
one approval-service timeout followed by one identical approved retry; original
checks and failed native preflight approve first try. No actual test is rerun.
Native180+5s, inner210+5s, external225+5s and6MiB output bounds remain; outer shell
startup/redirections/final status lie outside its timer. Installed file pins do
not establish runtime symlink-topology or full OS-loader attestation.

Evidence remains in `node_modules/.cache/native-validation/native-table-boundaries/`
and `native-table-boundaries-round02/`. Parent metadata-inspection ENOENT mistakes
are recorded separately from action statuses; no guessed result file is created.
Independent integration review finds no actionable defect. Both lanes are sealed
with regular-file inventories excluding only themselves and successful audits:

- Original2947entries/2948files:
  `40e3630a217dccdb6781bac22123127becb429293adabd6b6c2852097c3c0330`.
- Round022785entries/2786files:
  `e5658fe05f709e272ec2095e341777fe1e38ee4e3a49b2ed3641ba4e34bc2d51`.

Neither lane contains symlinks. Read-only retention is not OS immutability or a
signed attestation; no action is rerun for sealing. The mixed root package/styles
and unrelated pending work are not claimed to be the tested isolated snapshot.
