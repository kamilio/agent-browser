# Literal Markdown and CSV documents

Native and reader loading now admit exact `text/markdown` and `text/csv` MIME
types through the existing bounded literal-text loader. The native CLI advertises
both formats. This fixes successful public responses that previously failed at
MIME admission, without a Markdown renderer, CSV parser or new dependency.

- Source lives in the existing registered `pre` text document. Headings, tables,
  delimiters, quotes, links, images, HTML and prompt-looking text remain source.
- No scripts, stylesheet/image requests, link following, Markdown interpretation,
  spreadsheet formula evaluation or instruction execution is introduced.
- `--find` and `--lines` operate on physical source lines, not rendered headings,
  Markdown tables, XML paths or CSV records. Quoted multiline CSV fields can span
  more than one physical line; source selection does not assemble a record.
- Full Markdown extraction fences source using the existing collision-safe code
  fence. JSON preserves literal text with existing control/line normalization.
  Response capture remains the byte-exact archive.
- Existing charset/BOM handling and network, source, document and output limits
  remain. `long-v1` remains HTML-only. No missing/ambiguous Content-Type guessing,
  `text/*` wildcard, `application/markdown`, `application/csv`, SVG or executable
  MIME admission is added.

Ollama's successful `llms.txt` response explicitly links its hardware Markdown
page. The earlier `.md` response is HTTP200 with 12,570 decoded bytes but fails
local MIME admission. After this change it yields 12,580 bytes of fenced source.
An academic `text/csv` response similarly goes from loader refusal to 329 bytes of
fenced output containing its complete 321-byte source. These are content-recovery
measurements, not a speed comparison with HTML or proof of GPU compatibility.

Both native/reader same-body comparisons and separate fresh post-fix native
requests verify the formats. Original failures remain unchanged. The selected
20-file native run passes 1,429 tests, including 53 new Markdown and 11 CSV cases;
build, 20 strict test roots, formatting and lint pass. The initial six failures
were older Markdown-refusal assertions, now replaced by positive literal-source
tests; their first-run log and source ledger remain available.

See `WEBSITE-TEST-INVENTORY-SEPTEMBER-14-THIRTY-EIGHTH-UPDATE.md` for the exact
recorded UTC timeline across September 14–15 and scope/evidence paths. Broader
research, full native release, interactive rendering, SafeJS, credential/device
and real-service acceptance remain separate gates.
