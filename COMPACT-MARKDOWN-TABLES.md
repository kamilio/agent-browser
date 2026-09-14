# Compact native Markdown table markers

September14,2026. `--compact-tables` makes table-heavy research output smaller
without dropping text, cells, links or table boundaries. It is opt-in: default
Markdown and JSON output remain unchanged.

```sh
node dist/scripts/research-browser.js --reader \
  --reader-raw-policy separate-omitted-raw-v1 --capture-body \
  --compact-tables --min-request-interval-ms 250 \
  https://github.com/ggml-org/llama.cpp
```

The extraction API accepts `compactTables:true`; research navigation passes it
through `ResearchExecutionOptions`. The resulting Markdown extraction discloses
`compactTables:true`. Nonboolean API values, JSON output and discovery modes are
rejected; omitted/false preserves the existing behavior and metadata shape.

## What changes

Inside an emitted table, row/cell begin markers omit their repeated
`(selected structure only)` phrase. The enclosing table warning still states
that structure is partial and associations are unspecified. All end markers,
empty cells, text, links, ordering and nesting remain. Independently selected
rows/cells without an enclosing emitted table retain their original warning.
This is not a conversion to rectangular Markdown tables or inferred header/span
associations. The renderer tracks actual emitted table context.

No output, intermediate, node, depth or network limits increase. Fewer marker
bytes leave more of the existing output allowance available for content. This
does not guarantee that every oversized page fits; bounded section recovery is
still available separately. The zero-network recovery CLI returns JSON and does
not take this Markdown-only option.

## Measured output

The same saved HTML/DOM is extracted with default and compact formatting. Default
Markdown exactly matches its original captured output; compact output differs
only by the documented marker substitutions, with identical boundary counts.

| Saved page | Default bytes | Compact bytes | Reduction |
| --- | ---: | ---: | ---: |
| GitHub llama.cpp README |54,291|45,087|16.95%|
| Hugging Face optimization overview |18,431|17,599|4.51%|
| GitHub llama.cpp build guide |61,791|60,621|1.89%|
| Apple Mac Studio specifications |23,689|23,689|0%|
| NVIDIA RTX5090 product page |88,105|83,217|5.55%|
| Lobsters front page |20,977|20,977|0%|

These are UTF-8 Markdown-content bytes, not full receipt sizes or a speed
benchmark. Comparisons run with socket syscalls denied; original receipts remain
unchanged and reconstructed documents close with zero remaining nodes.

A separate fresh native CLI visit at18:28:03–18:28:04UTC retrieves the GitHub
README with the option enabled: one HTTP200 request,612ms reported page elapsed,
45,087 Markdown bytes. Its actual live output equals compact extraction from
those same captured bytes. Default extraction offline is54,291 bytes, so9,204
bytes are saved without a second request. No access barrier is observed.

## Verification

- 795 native tests pass across eight explicitly manifested files. Production
 compilation and strict checks for all eight selected test roots pass.
- 17 new extraction cases cover validation, default stability, standalone/nested
 table context, prefixes, literal marker text, empty cells and exact UTF-8 quotas.
 Worker red has15failures/70passes, then85passes. Corrected CLI regression red
 has11failures/204passes; final combined validation includes all215 workflow cases.
- Initial combined validation records792passes/3failures: two newly authored
 variadic fixtures are corrected, and an older reader assertion is updated to
 require the structured output diagnostic introduced by576acf5. Failure logs and
 the subsequent corrected-red run are retained, not erased.
- Formatting and whitespace pass. Full scoped lint retains one pre-existing
 extraction import-order error; unrelated imports are not rearranged.
- No full native release rerun or SafeJS/credential/device/visual acceptance is
 claimed. Original dirty work and prior observations remain separate.

Evidence: `node_modules/.cache/native-validation/compact-tables-september14/`
and `node_modules/.cache/native-validation/compact-live-september14/`.
The source candidate starts from audited6009ebe runtime sources and overlays the
five owned files. `OVERLAY-FINAL.json` and compiled hashes pin the tested inputs.
