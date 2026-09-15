# Website testing: September 15, forty-first update

## Fresh native observations

Two new public navigations use the pinned `72f153e` native reader: two GETs,
two hosts, no redirects, retries, subresources, scripts or alternate clients.
The Python capture used below is older evidence, not a third new navigation.

| Page | HTTP | Encoded / decoded bytes | Whole Markdown bytes | Verified content |
| --- | --- | --- | --- | --- |
| MLCommons Inference: Edge | 200 | 31,798 / 145,674 | 17,132 | 17 headings; methodology and submission/power explanations |
| Hugging Face Transformers bitsandbytes documentation | 200 | 61,802 / 293,130 | 22,969 | 19 headings, eight table cells, 15 code blocks with indentation |

MLCommons was received at 01:08:28 UTC. Its unique `main` supplies 5,380 bytes
without menus. Numerical benchmark results reside in an omitted Tableau iframe:
no scores or rankings were recovered. “V3.1 Results” in the captured title is
not confirmation of the latest release. `MLCOMMONS-BENCHMARK-READING-SEPTEMBER-15.md`
records the useful distinctions and remaining research limits.

Hugging Face supplies substantive installation, hardware-compatibility and
quantization tradeoff documentation. These are publisher claims, not hardware
measurements or a buying recommendation. The original extraction retains 5,097
bytes before the article, 18 empty heading links and 15 “Copied” labels. Its
eight-cell table expands to 67 Markdown lines. A missing-doctype diagnostic is
also reported despite a doctype in captured source. These are remaining issues,
not evidence that the content was absent.

Both original reports remain `extracted-unverified`, `partial: true` and
`contentSuccess: null`. Encoded counts come from the transport; compressed wire
bodies were not retained for independent encoded-body hashing.

## Reader fix: keep article targets as inert attributes

Reader sanitization previously discarded useful source classes and non-table
roles. It now retains raw `class` and `role` on unchanged, preserved tags.
Unwrapped/remapped tags do not copy these onto synthetic elements. Scripts,
styles, active attributes, hidden-content behavior and omitted subtrees remain
disabled/omitted. Existing source/output/document budgets still apply. Raw role
selection does not introduce ARIA fallback semantics or relax table metadata.

The bounded replay comparison uses the original captured bodies and actual
native API/CLI, with sockets denied. It does not request either site again.

| Captured target | Baseline | Patched reader | Selected Markdown bytes |
| --- | --- | --- | --- |
| Python `.body[role="main"]` | No match | One match | 43,583 |
| MLCommons `.hero-benchmark__content` | No match | One match | 468 |
| MLCommons `.callout__content` | No match | One match | 243 |
| Python `#more-control-flow-tools` | One match | One match | 43,583 |
| MLCommons `main` | One match | One match | 5,380 |
| Hugging Face `.prose-doc` | No match | One match | 16,092 |

Python's new wrapper selection yields byte-identical Markdown to the previously
verified article: 57 code blocks, 24 headings and 128 paragraphs. MLCommons main
and both whole-page Markdown outputs remain byte-identical. No iframe results
are invented. The Python/MLCommons comparison's four API children and ten CLI
children finish with zero HTTP
requests; seven CLI selections succeed and three baseline not-found failures
remain. A first orchestrator assertion wrongly expected detailed CLI diagnostics;
that failure is retained, and only unfinished children ran in the continuation.
A separate verifier initially compared process-local reference IDs across
different processes; its correction permits only those two ID differences while
requiring identical Markdown and all remaining report fields. That initial
verifier is retained too.

Retaining attributes costs bounded reader memory/output: sanitized UTF-16 output
increases from 90,872 to 132,930 code units for Python and from 27,470 to 48,016
for MLCommons. Markdown text remains unchanged at equal scopes. This is better
targeting, not a claim of faster parsing or smaller source acquisition.

Hugging Face adds two CLI children and one API child, also socket-denied. The
baseline selector failure is retained; the patched selector matches one source
`div.prose-doc`. It preserves all 18 article headings, eight table cells and 15
code blocks with indentation. Actual CLI Markdown is 16,092 bytes, 29.9% below
the original 22,969-byte whole extraction. A same-format compact-table API control
is 15,780 bytes (31.3% below whole); the ordinary CLI table markers account for
the 312-byte difference. These are output-size measurements, not transfer savings.
The 5,097-byte pre-article prefix falls to 11 bytes. Empty heading links, copy
labels, verbose table layout and the doctype diagnostic remain. Reader output
grows from 27,091 to 60,162 UTF-16 code units while original whole compact
Markdown stays byte-identical. A host verifier's incorrect script-argument index
is preserved and corrected without repeating any native child.

Across these three captured pages: seventeen guarded children, twelve actual
CLI invocations, eight CLI successes, four preserved baseline selector failures,
and zero replay HTTP requests. No process/group or transport is left running.

## Large receipt test cost, not browser serialization cost

The fortieth inventory's 11–13-second synthetic cases prompted an isolated
measurement. Serializing the three large payloads took approximately 12.5,
20.8 and 20.3 milliseconds. Vitest's deep comparison of their byte arrays took
12.35, 12.72 and 11.30 seconds. This corrects the interpretation of that lead;
it does not rewrite the original timings or claim a production speedup.

Commit `0a9ad55` replaces only the two large-byte assertion sites with exact
length-and-span `Buffer.equals` checks. Four regression cases cover changed
bytes, lengths, subarray offsets and empty spans. The 128-case file passes twice
under its original 5-second allowance, with summed test durations of 616.77 and
617.95 milliseconds. All 2,208 compiled production artifacts stay unchanged.

## Validation and limitations

The reader candidate builds successfully; strict typechecking covers 25 selected
native roots. Five changed TypeScript files pass formatting. Four pass lint;
the ARIA-table test file retains two existing lint diagnostics, independently
reproduced in the baseline. No unrelated lint edits are bundled.

The initial focused 20-file run passes all 2,679 tests. Five supplementary files
expose 24 baseline failures and one newly stale class-stripping assertion. The
class assertion now checks retained ID/class/role targets. Final combined
validation reports **3,054 passes and 24 failures across 25 files**: exactly the
same failing case names as the baseline supplement, with no newly failing case.
Those 24 cases comprise 21 table-depth tests, one definition-depth test and two
selector output-limit provenance tests. They are not silently excluded or fixed.
The retained table-output expectation also predates source-ID retention; its
failure output now includes the intended class retention.

The two previously reported body-capture failures are outside this selection
and remain unresolved; this run does not replace earlier failure inventories.

There are 32 additional reader cases, including the new role selection row.
No harness timeout is raised; the allowance stays 5,000ms. The canonical native
manifest contains 852 file entries. This is not a full native release pass.

## Evidence

Original lanes under `/dev/shm/`:

- `agent-browser-reader-targeting-september15`: initial/final frozen source and
  compiled ledgers, 20/25-file runs, baseline comparisons, lint diagnosis and
  parent evidence/staging audits.
- `agent-browser-reader-selector-proof-september15`: all fourteen offline child
  receipts, original orchestrator failure, source pins and semantic verification.
- `agent-browser-receipt-comparison-september15`: baseline/diagnostic/repeated
  timings, exact assertion patch, unchanged production pins and commit audit.
- `agent-browser-mlcommons-edge-september15` and
  `agent-browser-huggingface-quantization-september15`: fresh native receipts,
  captured source, extraction, HTTP events, content checks and integrity ledgers.
- `agent-browser-huggingface-focus-september15`: the two actual CLI attempts,
  one API child, same-format control, selected source checks and verifier history.

Hash-checked durable copies use the same lane names without `agent-browser-`
below `node_modules/.cache/native-validation/`. Historical receipts, measurements,
paths, dirty work and original partial verdicts are preserved. No push.

The broader browser goal remains active: more sites and research, cleaner output,
iframe/JS-only content, rendering/interaction, old failures and a full release
remain open. Restricted sites stay stopped. No CAPTCHA solver, credential access,
real passkey device, SafeJS probe, service listener or real TTY/PTY is exercised.
