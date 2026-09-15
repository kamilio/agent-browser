# Optional paragraphs inside omitted reader content

The native semantic reader now closes one directly open HTML paragraph when a
new paragraph starts inside an omitted subtree. This prevents an optional `</p>`
inside a template from aborting the surrounding readable page. It does not expose
template content or execute anything from the page. No option or dependency is
added; the change applies to the existing reader under both raw policies.

## Scope and limits

- Only a new `p` start directly above an open `p` triggers this repair.
- SVG/MathML ancestry does not use this HTML repair.
- The final paragraph still needs its explicit close before the omitted parent
  ends. Unrelated mismatches, malformed raw text and incomplete omission
  boundaries continue to fail. This is not complete HTML tree construction.
- Repeated paragraph siblings no longer accumulate artificial depth. Real nesting
  still consumes the existing depth budget. Source, text, token, output and
  omitted-raw-work accounting remain in force; no numeric limit is increased.
- Template/script/style/iframe/foreign DOM stays omitted. Styling, hidden-content
  semantics, interaction and runtime execution remain unverified.

## Captured website evidence

The top-100 sweep's rank-60 navigation began at `https://zoom.us/` and followed
one redirect to `https://www.zoom.com/` on September 15, 2026. The HTTP-200
response contained 300,329 decoded bytes. Its original live receipt reports an
unsupported loader failure and remains unchanged.

An earlier static tag trace suggested repeated paragraphs in an omitted template.
That trace was not native execution. This increment reproduces the exact failure
with the native loader: `Malformed omitted reader subtree`. After the fix, the
same pinned captured body loads and produces useful public-page text:

| Check | Baseline | Fixed reader |
| --- | --- | --- |
| Native captured-body load | Unsupported error | Loads |
| Injected-response research pipeline | `failure` | `extracted-unverified` |
| Whole-page Markdown | No extraction | 29,997 bytes |
| Unique `#main` Markdown | No extraction | 9,888 bytes |
| Selected H1/H2 elements | Unavailable | 6 |
| Template elements in resulting DOM | No document | 0 |

The main-section proof checks source-backed heading phrases before and after the
problematic template. It is not an exhaustive source-fidelity, rendered-visibility
or interactive-site assessment. Five tokenizer issues remain reported. Both
template subtrees remain omitted; the reader reports 816 omitted tokens and no
scripting or styling. Nonempty output stays partial/unverified, not site success.

The proof uses **two offline native children**: direct captured-body loader calls
and one explicitly injected transport response per child through the research
pipeline. No HTTP requests occur. This is not a fresh website visit, real
transport validation or broader admission of failed receipts to the replay CLI.
Kernel/preload guards deny sockets and alternate network clients; both children
exit cleanly, trees/transports close, and original receipt/body hashes remain
unchanged. The historical top-100 counts are not rewritten as a new live pass.

## Regression validation

Clean baseline: **1,498 passed, zero failed, 22 selected native files**.
Final candidate: **1,546 passed, zero failed, 23 selected native files**.
All 1,498 prior case statuses are identical; all 48 added cases pass. The explicit
canonical native manifest gains one entry, bringing it to 858 files. This is a
selected regression run, not a full native release.

Build, strict types, formatter and lint pass. The first candidate already passed
all 1,546 tests but failed new-test formatting; that report is retained. The final
change is formatting-only relative to that candidate, with byte-identical
production compilation. Only three compiled artifacts for `research-loader`
change relative to the baseline; no other production module changes.

## Evidence and continuation

Machine-readable results: `reports/zoom-reader-recovery-2026-09-15.json`.
Evidence lane: `node_modules/.cache/native-validation/omitted-paragraphs-september15/`.
The original temporary lane is
`/dev/shm/agent-browser-omitted-paragraphs-september15/`; its paths are retained in
the evidence rather than presented as a new run after copying.

Body SHA-256: `d847ded317bf9eac596a45ff0da02f6f342c8f950a849ca6e542646b96e322dd`.
Original receipt SHA-256: `9b67f6b506570f30a0af335bf03645dc6f692ebc7ed522025241822b89cbb7d8`.
Main Markdown SHA-256: `400dd35629b8d74a6741e593efa4370d88688af27f00a0784d84bdb56c9e37cb`.
Whole Markdown SHA-256: `9aebf29205b47e3aa9f9ed17bd75efd6c498a63a82bbe530ee47aa8923fbbb7e`.

The overall browser goal stays active. Other top-100 gaps remain, including the
missed LinkedIn browser-check barrier, empty/compatibility shells, hidden startup
configuration, redirect/response-limit diagnostics and CNN's empty-403 provenance.
