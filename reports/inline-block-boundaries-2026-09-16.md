# Generic inline-wrapper block boundaries — September 16, 2026

## Fix and actual source recovery

The admitted Car and Driver homepage contains four source paragraphs in nested
generic spans followed by date spans. Markdown formerly joined each final period
directly to its date. The final serializer preserves the paragraph boundaries,
while continuous inline runs cross transparent wrapper edges without invented
spaces or paragraph breaks. All four joins are corrected in saved API and actual
native CLI replay. This retrieves source structure, not linked article bodies,
rendered layout or new access. See GENERIC-INLINE-BLOCKS.md.

The existing iterative structural pass identifies eligible generic wrappers;
grouping expands them iteratively until actual block boundaries. True text sinks,
linked destinations, quotes/lists/tables, image-source labels and literal code keep
their rules. No DOM mutation, dependency, quota increase or error swallowing.

## Validation, including review failure

- Final release03: **3716 passed/0 failed across43 selected native files**;
  build/types/format/lint pass. This is not the full954-entry canonical manifest.
-99 new wrapper cases plus2 wrapper-annotation cases. The exact final99-case file
  yields37 passed/62 failed on pre-change production; final production passes99/0.
- Release01 passes3681 and fails2 old flattening expectations. Release02 passes3683,
  but independent review finds a real word-splitting regression at wrapper edges;
  its initially updated whole-document expectation also encoded that mistake.
- Final cross-edge tests reproduce the reviewed defect: the initial production
  candidate passes74/fails25 of the exact99 final cases. The edge fix plus corrected
  expectations and annotation preservation pass the final gate. Both prior attempts
  and the P2 report are retained; final independent static review resolves the P2
  and finds no new actionable regression in the exact five final overlay hashes.
-1539 source/config/test inputs and2316 compiled artifacts are pinned. Only
  extraction.js and its declaration/source maps change among compiled artifacts.
  Native/replay/CLI children close with empty HOME/TMP and no network attempts.

## Saved-response fidelity

120 pinned saved responses:117 successful pairs and3 matching non-HTML failures.
Native serialized DOM fingerprints and all extraction metadata match, including
reader accounting and source/access qualifications. Structured JSON matches in113
successful bounded pairs;4 other pairs match JSON output-limit failures. No DOM
projection or mutation forces agreement. All returned documents close.

A separate guarded four-case probe verifies the JSON failures are unchanged
extraction.output limits at256000 bytes, not new unsupported-content failures.
Its result and closed-process evidence are embedded in the report JSON supplement.

105 successful Markdown outputs are byte-identical. Twelve change: nine only in
whitespace, while Walmart, Reviewed and IGN regain source heading markers. The
comparison checks classification and substantive-content predicates separately;
Markdown-derived diagnostic strings may change with formatting. Historical site
verdicts are not rewritten and these replays are not new live visits.

For all twelve changed outputs, removing only line-leading heading markers and
whitespace leaves every other character identical. This supplemental comparison
does not substitute for the source-structure and inline-continuity tests.

| Capture | Before bytes | After bytes | Change |
| --- | ---: | ---: | --- |
| entry-3 | 49481 | 49485 | Whitespace only |
| entry-5 | 3207 | 3209 | Authored headings restored |
| entry-8 | 37217 | 37226 | Whitespace only |
| entry-12 | 17014 | 17026 | Whitespace only |
| entry-28 | 2063 | 2064 | Whitespace only |
| entry-39 | 914 | 916 | Whitespace only |
| entry-42 | 22300 | 22305 | Whitespace only |
| entry-46 | 22154 | 22162 | Whitespace only |
| entry-79 | 8955 | 8954 | Authored headings restored |
| entry-95 | 14767 | 14780 | Authored headings restored |
| entry-98 | 17645 | 17666 | Whitespace only |
| deep-businessinsider | 7001 | 6991 | Whitespace only |

Three actual compiled native CLI replays cover Car and Driver, Rust and PostgreSQL.
Complete extraction matches the final API result after normalizing only opaque
node references. Each uses one explicitly routed saved response and zero real
requests under kernel and JavaScript denial. The fresh reference/SQLite workflow
and source caveats are recorded separately in agent-reference-workflows report.

## Evidence and remaining work

Evidence: /home/kjopek/project/agent-browser/node_modules/.cache/native-validation/inline-block-boundaries-september16; sealed2026-09-16T17:24:47.072Z,211 files/16021745
bytes. ARTIFACTS SHA256 f140e3a2b52b6290ad74691be719f6158e69604e96045f5439544bd120366ac6. Inventory excludes itself
and SEALED.json. All23 recorded feature validation process groups are absent;
quality TMP emptiness is not claimed. Earlier42 dirty tracked/697 untracked files
remain preserved; completed changes are isolated from that backlog.

This is a functionality fix, not a measured speedup or remote-block/CAPTCHA fix.
Rust source-code qualifications and PostgreSQL code emphasis remain follow-ups.
Static SafeJS contract investigation confirms the scheduling mismatch and existing
diagnostic repairs, not runtime acceptance; it runs no SDK. Broader62 test failures,
22 missing committed tests, rendering, credentials/passkeys/devices, TTY and access
gates remain open. The full browser goal remains active; no push is performed.
