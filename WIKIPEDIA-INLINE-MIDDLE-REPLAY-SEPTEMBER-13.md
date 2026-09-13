# Wikipedia: inline-middle geometry replay

**Inline vertical-alignment guards decrease from 32 to 3; full portal geometry
remains unsupported.** This is one unchanged captured-page replay through the
latest audited native runtime, not a fresh Wikipedia visit or search submission.

## Input and operation

The same 119,573-byte retained `https://www.wikipedia.org/` response is loaded
once. Body SHA256:
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
The native document retains 2,708 nodes, revision 2,712, viewport 1280×900.
The old probe, runner and guards are reused with updated runtime pins and a
new authorization record. No original body, style, resource or diagnostic is
removed or rewritten.

Actual operations: one load, three queries, one formatting inspection, one
geometry request and two generated-style reads. Zero HTTP, actions, raster,
page scripts, SafeJS, credentials/devices or real TTY. No fallback geometry,
alternate browser, fingerprint disguise or challenge bypass is used.

## Observed result

| Native observation | Previous generated-table replay | Latest replay |
| --- | ---: | ---: |
| Inline vertical-alignment guards | 32 | 3 |
| CSS issue occurrences | 132 | 132 |
| All formatting issue occurrences | 231 | 202 |
| Visited DOM nodes / boxes | 2,114 / 2,250 | 2,114 / 2,250 |
| Text units / deferred subtrees | 5,016 / 3 | 5,016 / 3 |
| Counted formatting work | 18,685 | 20,971 |
| Full geometry | Unsupported | Unsupported |

The CSS counts remain 97 properties, 24 values, eight selectors, two media
queries and one at-rule. Other retained markers include overflow 7, positioned
coordination 16, unsupported element/image 1, direction 22, float coordination 14,
generic display/table coordination 2 and clearance 5. The geometry error retains
three inline-alignment guards alongside other actual CSS/layout restrictions.
Its bounded error string is not a substitute for the complete issue map.

The footer's original generated tables retain their native ownership, one-space
content and `contentMode:table`; `::after` retains physical `clear:both`.
These formatting shells do not prove whole-page table geometry. Input/button/
fieldset identities and the hidden dialog behavior remain unchanged.

The comparison starts at the older 20,398-test generated-table runtime, not an
immediately pre-middle runtime. It therefore includes intervening alias, groove,
legend and related changes; this is **not an isolated middle-only A/B**. In this
actual observation, only the inline-alignment issue count changes. Independent
new regression fixtures establish real middle geometry and pixels. This blocked
portal does not itself establish a successful whole-page raster or interaction.
The three remaining alignment occurrences still need a separate bounded native
attribution; no additional diagnostic load is implied by this replay.

## Execution and evidence

September 13, 2026, **20:57:03.836–20:57:04.157 UTC**. Process group 949743 exits
zero, with 8,052 output bytes and no watchdog, stream or output-cap failure.
`passed:true` means the diagnostic completed; `geometrySupported:false` remains.
Native document ownership closes to zero nodes; network/process guard and cleanup
error arrays are empty. Private directories are removed empty and the process
group is absent.

The single observation is 0.31s elapsed / 120,184KiB maximum RSS (117.37MiB).
It is not a repeatable benchmark, and increased counted work is not a speedup.

Runtime: `native-inline-middle-september13-round00/snapshot01/dist`, under
`node_modules/.cache/native-validation/`. Native result: **21,097 passed / zero
failed / two unchanged skips**, 412 selected files / 411 strict roots /
766 manifest entries; 354 remain unselected. Source/compiled pins are unchanged
through the replay. Native test success does not establish a website gate.

Evidence under that cache:
`native-wikipedia-middle-september13/after-RESULT.json`,
`native-wikipedia-middle-september13/after-EXECUTION.json`,
`native-wikipedia-middle-september13/EVIDENCE.sha256`, and
`inline-middle-work-september13/WIKIPEDIA-VERIFICATION.json`.
The 40-entry evidence ledger SHA256 is
`80385016da6c8b7a1e547fa1d0f4c9786ff0423b092ef10215464aa7af76cce5`.
Previous report: `WIKIPEDIA-GENERATED-TABLE-REPLAY-SEPTEMBER-13.md`.
Implementation and source evidence: `INLINE-MIDDLE.md`.

Historical paths and measurements remain unchanged. No fresh Wikipedia HTTP
request, accepted search flow or completed research topic is added. The broader
browser, performance, research and separately authorized restricted gates remain
ACTIVE in `TASKS.md`.
