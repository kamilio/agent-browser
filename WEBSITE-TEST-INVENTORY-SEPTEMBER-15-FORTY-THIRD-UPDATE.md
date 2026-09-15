# Native website testing: forty-third update

This September 15, 2026 increment prioritizes useful text over rendering polish.
It supplements the forty-second inventory and original captures; it does not
relabel them as new visits. The native engine remains independent of Firefox,
Chromium and remote browsers. No extra page-runtime dependency is introduced.

## GitHub README reading

One native GET to `https://github.com/daijro/camoufox` at 02:11:21–02:11:22 UTC
returns HTTP 200 with zero redirects: 555,509 decoded bytes, 89,446 compressed
bytes reported by the transport, and 57,921 whole-page Markdown bytes. The decoded
body SHA-256 is
`371c2afcf3dc70ea64f760a97d68a66c503931cedda7fe9c4059ae16c3ae34d9`.
Compressed wire bytes were not retained for independent hashing.

One socket-denied native API child selects the unique `article.markdown-body`.
Its 37,867-byte compact-boundary Markdown excludes menus/file listings but still
contains sponsor copy. Captured-source comparisons verify forty heading texts
and levels, sixteen preformatted blocks, 66 paragraphs, four tables, 25 rows and
57 cell texts. Code indentation is preserved; Markdown adds a terminal newline
to thirteen code blocks. Source table counts do not establish visual or header
associations. Structured extraction retains 114 links, including 42 without a
visible label; empty Markdown destination wrappers are absent.

`article#readme` is not a valid target for this capture. Source `itemprop="text"`
is removed by the reader, so that attribute selector does not match either.
Preserved classes supply a usable article target. Images, SVG diagrams, video,
Mermaid rendering and collapsed-content semantics are not visually validated.

The README describes a Firefox fork and tooling/configuration around it. It also
contains readiness and maintenance warnings. Claims about fingerprint consistency,
undetectability, execution speed, memory or compatibility remain source claims:
no Camoufox installation, execution, dependency adoption, repository-code reading
or independent capability measurement occurs. The useful compatible lessons are
explicit browser/page-state separation, bounded resources and candid contracts,
not adding another engine or a challenge solver.

Native output remains `extracted-unverified`, `partial: true`,
`contentSuccess: null`. The evidence verifier retains two failed whole-workspace
immutability checks caused by concurrent parent development. Pinned browser/input,
source comparison and cleanup checks pass; those narrower successes do not turn
the failed global audit into a pass. `HASH-CHECK.json` checks 41 artifacts without
rewriting the failed verdict. Evidence is in
`/dev/shm/agent-browser-camoufox-github-september15/`.

## SQLite query-plan documentation

One new native GET to `https://www.sqlite.org/eqp.html` at 02:30:09 UTC returns
HTTP 200, with zero redirects or retries. The decoded body is 17,415 bytes,
SHA-256 `9bcf6cac4798d8cacd5418da19c8151f7ad613956a51ee1e52a85618fdc590aa`.
Encoded and decoded transport counters are equal; that does not independently
hash TLS/wire bytes. Whole-page Markdown is 13,512 bytes. One socket-denied
native API child selects the unique source-backed `div.fancy`, yielding 12,727
Markdown bytes, SHA-256
`e54f7988f9659381d77365ef36f8afd1cfb8624e89e3561df0bdc89afd044777`.

Source comparisons verify all five headings, 26 paragraphs and fifteen code
blocks. The preformatted blocks match byte-for-byte, including terminal newlines,
trailing spaces and ASCII query-tree indentation. All 26 anchors remain: 25
navigable links and one empty named anchor without a destination. No SQL example
is executed and no link is followed. There are **no HTML tables**: the database
query plans are ASCII examples, so this site is not table-format acceptance.

Useful text is preserved, but Markdown flattens two bold warning labels and an
italic footer. The selected container still includes the title, TOC and update
footer. The source doctype is present; reader-derived missing-doctype/quirks
diagnostics describe transformed HTML, not necessarily the original response.
These remain explicit limitations, not reasons to discard useful content or
silently remove whole content classes. An omitted `antiRobotDefense` script is
not executed and does not itself establish a blocking challenge.

The verifier's initial assumption that every anchor has a URL is preserved and
corrected locally; neither browser child is repeated. All seventeen final evidence
checks pass, both children exit/reap cleanly, and all 68 final sealed artifacts pass
hash checks. A review-only source-line correction retains the original 66-file
seal record. Shared-workspace drift is recorded separately from pinned executable
and
input integrity. Native partial/unverified flags remain unchanged. The source's
May 31, 2025 footer is not this visit's date or a current-release claim. Evidence:
`/dev/shm/agent-browser-sqlite-query-plan-september15/`.

## Readable table format

Simple tables can now use `tableRows: true` / `--table-rows` in native Markdown
extraction, live research and admitted captured replay. The presentation numbers
physical rows and cells instead of emitting begin/end markers around every cell.
It does not infer headers, reconstruct spans, create logical columns or drop
empty cells. Captions and complex cells fall back to the existing boundary format;
eligible nested tables can be converted independently. JSON/source/discovery
remain unchanged. See `TABLE-ROWS.md` for API and CLI boundaries.

The replay CLI requires explicit `--format markdown`; its JSONL provenance
envelope and default JSON mode remain. Invalid combinations fail before input is
consumed. The initial integrated test caught a missing preference forwarding in
CLI output-limit section recovery. That path now preserves the same preference
as ordinary replay without relabeling or retrying the original failed request.

Eight actual offline CLI children compare the same four captured articles and
selectors: baseline explicit Markdown versus candidate explicit Markdown plus
`--table-rows`. Both use normal, not compact, table boundaries. Two additional
offline native API children verify source structure and unchanged structured
extraction. All ten children exit/reap cleanly under socket denial, with zero
HTTP requests, unchanged caps and empty IO-guard attempt lists.

| Article/selector | Baseline Markdown | Row-list Markdown | Converted / fallback tables |
| --- | ---: | ---: | --- |
| Hugging Face `.prose-doc` | 14,437 bytes | 13,724 bytes | 1 / 0; all 8 cells converted |
| PyTorch `article.bd-article` | 15,917 bytes | 14,436 bytes | 1 / 0; all 20 cells converted |
| GitHub `article.markdown-body` | 39,999 bytes | 38,339 bytes | 1 / 3; 21 converted, 36 fallback cells |
| Python `.body[role="main"]` | 43,583 bytes | 43,583 bytes | No tables; byte-identical control |

Every converted cell retains its exact original inline Markdown; physical row
order matches captured source and no headers are invented. The three complex
GitHub tables keep their exact boundary output. All non-table Markdown is
byte-identical for every article. Source checks retain 18/12/40/24 headings,
15/7/16/57 code blocks and 37/52/66/128 paragraphs respectively, plus all source
anchors and their meaningful destinations. These are content/size comparisons,
not network savings, rendering acceptance or measured runtime acceleration.

The earlier PyTorch and GitHub scoped byte counts (15,267 and 37,867) used
compact boundaries and remain unchanged historical evidence. They are not the
baselines in this matched-mode comparison. Row-list output can coexist with
compact fallback formatting in the core/live API, but replay does not expose
compact tables. Do not claim the normal-boundary comparison beats every other
format for every article.

Selected structured JSON is byte-identical between the paired native API
children for HF, PyTorch and GitHub. Python's full selected JSON still fails the
unchanged 256,000-byte limit with the same 350,525-byte observation in both
engines; no cap is widened. Explicit bounded element inspections verify content
without substituting a reconstructed oversized JSON document. Output bytes and
hashes are in `/dev/shm/agent-browser-table-row-proof-september15/`.

The two fresh website visits total two HTTP GETs. Their source inspections add
two offline API children; together with the row-format proof that is twelve
offline native children, not twelve fresh visits. The HF/PyTorch/Python captures
are reused, not fetched again. The new GitHub capture is also reused locally.

## Native validation

Separate test-only commit `15a87a6` repairs 24 stale expectations across reader
table-depth, definition-depth and selector tests. The same 329 cases change from
305 passed / 24 failed to 329 passed / zero failed, with all 2,208 compiled
production files unchanged. Assertions now reflect established implied-end,
inert attribute and exact resource-diagnostic contracts. Historical failures and
an intermediate fixture correction remain in the evidence lane.

For the row-format feature, clean baseline `15a87a6` produces **2,714 passed /
10 failed across 23 files**. The final candidate produces **2,839 passed /
10 failed across 26 files**, including all **125 new tests passing**. Every old
case keeps exactly its baseline status; the ten failures are older table-source
reader-attribute allowlist expectations, not a new feature regression. They are
not repaired or hidden by this increment. Build, strict checking of all 26 roots,
and formatting/lint for seven changed source/test files pass. No caps or timeout
allowances increase. The canonical native manifest adds three files, reaching
856 entries; the three original uncommitted manifest entries stay separate.

The initial core candidate has 34 passing new cases and three lint issues. The
first integrated candidate has one newly failing recovery case and three test
type errors. Those snapshots, logs and the diagnostic rerun are retained. The
recovery forwarding bug, typed test executor array and lint fixes are validated
in the final candidate; prior evidence is not overwritten. Only the four intended
runtime modules change production output. Source and compiled-file ledgers remain
separate from source-control staging and live acceptance.

## Outstanding work

The browser goal remains active. Hardware/benchmark/Astra/Poe research is not
complete. More websites, copy-label/boilerplate handling, doctype provenance,
JS-only and iframe content, interaction/rendering and full native-release checks
remain. Older body-capture test failures and ARIA-test lint diagnostics are outside
this selection. Service/socket, SafeJS runtime, real TTY/PTY, credentials and
passkey-device acceptance gates remain separate. No restriction is bypassed, no
credentials are used, and these content checks are not CAPTCHA/fingerprint tests.
Original uncommitted work and historical reports remain preserved. No push.

## Evidence locations

The frozen build/test candidates, initial failures, final case comparison and
source/compiled ledgers are in
`/dev/shm/agent-browser-table-reading-september15/`. The separate legacy-test
repair is in `/dev/shm/agent-browser-reader-legacy-checks-september15/`.
The website and offline-proof lanes are named in their sections. After the
focused commit, byte-checked durable copies are stored under
`node_modules/.cache/native-validation/` with the matching lane suffixes;
`table-reading-september15/PERSISTENCE.json` records the copy manifests.
