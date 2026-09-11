# Captured native CSS budget diagnostic — September 11, 2026

## Exact measurements

The unchanged captured stylesheet contains **367,810 transport-decoded bytes**,
decoded by the existing native `decodeResponseText(...).text` as UTF-8 into
**367,810 code units**, below the unchanged **524,288-code-unit ceiling**.

| Parameters | Final `budget.rules` | Final `budget.declarations` | Returned style rules | Outcome |
| --- | ---: | ---: | ---: | --- |
| Original 4,096 / 16,384 | 4,097 | 7,026 | Not returned | `resource-limit`: `CSS rule limit exceeded` |
| Analytical 8,192 / 32,768 | 5,929 | 9,698 | 5,446 | Parser completed |

The first error is exactly `AgentBrowserError`, code `resource-limit`, message
`CSS rule limit exceeded`. The rule counter increments before comparison, so
4,097 records the over-budget rule, not 4,097 admitted rules. The failed call
returns no rule array; its returned-rule count is unknown, not zero.

**Declarations are not the next ceiling for this standalone stylesheet:** the
complete native declaration count is 9,698, already below the original 16,384.
The source requires at least 5,929 counted rules in this parser. The tested
higher rule ceiling is 8,192; no separate 5,929-cap experiment was run. Aggregate
document stylesheet/inline contributions remain the parent's investigation.
The conditional 16,384 / 65,536 attempt was unnecessary and was not run.

These larger parameters are **isolated offline analytical parameters**, not new
production or live caps. No rule/declaration/code-unit/work/security guard was
changed or softened, and no failure was reclassified as website acceptance.

## Native counters versus retained output

Counts come directly from the immutable native `parseCssRules` budget object,
not a regex estimate. The rule counter includes encountered block rules and
grouping/unsupported at-rules according to that parser's traversal. The
declaration counter charges encountered colon-bearing declaration statements
before property/value support filtering. It is not a count of every declaration
inside unsupported bodies that this parser does not traverse.

The successful returned rule array contains **5,446 retained style rules** and
**11,365 returned declaration records**. Native shorthand expansion can create
multiple output records from one charged declaration statement, so the returned
declaration-record count is not the budget counter. Returned rules are not
selector matches, active cascade rules, computed styles or layout results.

Bounded issue aggregation retained all observed kinds (cap 128 kinds, 256 code
units per kind, 500,000 callbacks; none reached):

| Issue | Original-cap failure prefix | Complete analytical parse |
| --- | ---: | ---: |
| `css-import-not-loaded` | 1 | 1 |
| `unimplemented-css-property` | 877 | 1,058 |
| `unimplemented-or-invalid-css-value` | 71 | 93 |
| `unimplemented-css-at-rule` | 12 | 14 |
| Total callbacks | 961 | 1,166 |

The import was not fetched, and unimplemented CSS remains unimplemented. No
active matching, full cascade/layout, pointer action, checkbox interaction or
website success was measured by this sidecar.

## Immutable input and build provenance

Captured bytes remain at
`node_modules/.cache/native-validation/native-testpages-stylesheet-flow-september11/response-2.body`,
SHA-256 `b6e9b375a3bd8971467d89a8ee0e92ff1f9cfaa5aa6cee2c33f25d8af82fb30d`.
The original lane's `stdout.jsonl` supplies the original native-loader response
headers, HTTP-200 provenance and body digest. Content type is `text/css` without
a charset, using the native decoder's UTF-8 fallback. The UTF-16LE encoding of
the decoded JavaScript string has SHA-256
`b879e9c0898e88ba8c75582c5fc766a72671cab55fd4768ecd8fd872780f0b38`.
The entire original `FINAL-RECEIPTS.sha256` ledger and historical failure report
remain unchanged. This sidecar did not make another request.

The APIs are imported directly from the existing
`native-stylesheet-integration-september11-round03/snapshot01/dist/src/css-parser.js`
and `network.js`; `decodeResponseText` returns `{ text, encoding }`. No source
file was edited, no build was rebuilt and no build tree was copied. Before/after
inventories match the gate's **1,024 source files / 1,832 compiled files**:

- Source inventory SHA-256:
  `d599b08a005f1c50cbada100783bf5184bd2ffa52ad9ea69133d622ad033b809`.
- Compiled inventory SHA-256:
  `91490461255c1a5f0b1ba32880e44b83d20941aed14826972bc077a7505552de`.
- Existing gate provenance: **9,060 passing tests / 2 documented exclusions**;
  no gate was rerun here and exclusions were not promoted to passes.

## Timing, failures and evidence

Successful diagnostic child: **17:34:13.251–17:34:13.468 UTC**, September 11,
2026, exit zero, absent process group, empty stderr, **1,859 combined output
bytes**. Two native parser calls were made; the first preserves the resource
failure and the second completes with analytical parameters.

Elapsed native-call/result-counting intervals were **55.013 ms** and **51.341 ms**.
Heap-used samples were respectively **13,718,856 → 21,542,000 bytes**
(delta **7,823,144**) and **21,558,440 → 22,818,176 bytes** (delta **1,259,736**).
Samples are sequential in one child, without forced GC; successful timing also
includes summing returned declaration lengths. They are not peak-memory,
allocation-total or comparative-performance guarantees.

Two earlier harness preflights failed before any parser call: the first matched
`/proc/self/limits` too strictly against trailing whitespace; the second treated
the decoder's result record as a string instead of using its `.text`. Neither
was a stylesheet code-unit failure. Their original stdout/stderr, execution and
input pins remain in the lane root and `retry01/`; exact earlier harness source
bytes are retained in each `failed-preflight-harness.json`. The corrected
measurement is in `retry02/`. There were three child launches total, but only
two actual parser attempts, both in the final child.

The supervisor reuses existing inventory/ledger helpers and the network guard;
the child also guards process spawning, workers and native-addon/SafeJS loading.
Existing socket-denying seccomp runs on the child, with private HOME/TMP,
ignored stdin, stripped environment, a **30-second total child timeout plus
5-second kill grace**, and **6 MiB output/file caps**. Final child network/process
guard counters are zero; all supervisors' network counters are zero. No owned
document/session/transport resources were created, private HOME/TMP remain empty,
and all process groups are absent. No credentials, devices, alternate browser,
SafeJS or live probes were used.

Evidence lane:
`node_modules/.cache/native-validation/native-css-budget-diagnostic-september11/`.
Named checks are sealed in `VERIFICATION.json`; `RECEIPTS.sha256` pins the report
and all retained sidecar artifacts. The parent owns production cap choices,
aggregate accounting/security guards and independent regressions or live gates.
