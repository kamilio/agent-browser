# Compact table output in offline replay

The replay API and CLI now expose the existing native extraction compact-table
mode. This shortens repeated enclosed row/cell begin markers; it does not infer
headers, cell associations, rendered layouts or missing data. Defaults remain
unchanged, and no document, extraction, transport or timeout budget is raised.

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" --body-bytes "$BODY_BYTES" \
  --recover-output-limit --section "$OBSERVED_HEADING_SELECTOR" \
  --format markdown --compact-tables < authorized-receipt.jsonl
```

Use the source selector returned by a separately admitted heading outline, not
an invented selector. Recovery is optional for ordinary successful source
captures and remains mandatory for eligible output-limit failures. `--selector`
also supports compact output. Failed HTTP/challenge/loader receipts do not gain
admission; this is not an automatic fallback or another network request.

The API option is `compactTables: true` in selector/section selections passed to
`extractResearchReplayJson`, `recoverResearchOutputLimitSelector`, or
`recoverResearchOutputLimitSection`, with explicit `"markdown"` format.
False/omitted options preserve default output and omit compact metadata. True
emits `extraction.compactTables: true`. Link/heading discovery and literal
find/line modes do not accept this table option. JSON/table metadata, duplicate
flags, malformed options and incompatible combinations are rejected.

`--compact-tables --table-rows` may be combined. Existing row-list rendering
takes precedence where eligible; compact markers apply to remaining enclosed
table structures. The longest valid replay CLI combination now has 15 arguments
because it contains one extra flag; content/resource limits do not change.

## Preserved safeguards

Replay still requires host-verified receipt and decoded-body pins. Explicit
output-limit recovery retains the original failure and
`originalRequestRetried: false`. Compact options reach both selected extraction
and the same-budget unfiltered visibility-operation check, so source filtering
does not silently change the requested diagnostic operation. Classifiers remain
bounded heuristics, not universal challenge detection. Owned documents close on
success/failure; source captures are not modified or promoted into new live reads.

## Saved-source evidence

The September 15, 2026 native follow-up read of the source-linked arXiv Llama 2
HTML returned HTTP200 and 1,071,548 decoded bytes, then hit the 256,000-byte
whole-page extraction limit. Existing explicit offline outline recovery finds
130 headings. Recovering its observed `2 Pretraining` section produces:

| Explicit output mode | Markdown bytes |
| --- | ---: |
| Default table markers | 36,118 |
| Row lists | 29,542 |
| Compact table markers | 28,448 |
| Compact markers with row lists | 24,758 |

These are alternative serializations of the same selected source structure,
not new paper versions, validated benchmark conclusions or rendered tables.
The baseline extraction API already supports them; this change makes compact
forms accessible through pinned offline replay and recovery. The whole paper
still exceeds the extraction limit even in compact mode. Select bounded sections
rather than silently enlarging the budget.

RFC9309 supplies a normal successful-capture control. Its default whole-body
replay is 39,405 bytes, compact 39,197, and either row-list combination 38,930.
Body/receipt identity, default and row-only output, and direct native compact
output are comparison controls; actual CLI proof is recorded separately.

The same coverage round attempts eight public pages plus two explicit
source-linked follow-ups. Phoronix's original `/review`404 stays a failure;
its authored `/reviews` link separately returns content. Reuters401 is retained,
not bypassed. The saved top-100 shell audit finds no demonstrated lost article
text in its 13 empty results and does not claim to repair script-dependent apps.
See `reports/reader-fallback-content-2026-09-15.md` for the full URL/result list.

## Validation and limitations

Clean-archive validation runs 19 explicitly selected native files: 1,311 assertions
pass and one unchanged baseline assertion fails. All 158 new assertions pass,
and all 1,154 baseline statuses match. The stale
`src/research-table-rows-cli.test.ts:186` expectation rejects selector recovery
that the baseline already supports; it is retained, not hidden or rewritten.
Build, selected types, scoped formatting and lint pass. This is not an all-green
full native release.

Actual offline CLI output matches API/direct native extraction for compact
Pretraining, compact-with-rows Pretraining and RFC9309. The 15-argument combination
is exercised. Whole-body compact replay still fails at the unchanged output
limit. Fourteen guarded offline children include expected usage/output rejection
controls and preserved initial helper failures; all close with no network attempts.
Initial test expectation, object-prototype, direct-extraction-default and CLI
exit-code assumptions are documented rather than erased. Independent review pins
both production files and reports no actionable defect in that static scope.

Machine-readable evidence is in `reports/reader-fallback-content-2026-09-15.json`.
Private local records are under
`node_modules/.cache/native-validation/reader-fallback-content-september15/`.
Full runtime, interaction, credential/passkey, service/socket and TTY acceptance,
large-document completeness and broader research conclusions remain open.
