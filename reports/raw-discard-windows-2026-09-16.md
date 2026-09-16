# Adaptive raw-discard capacity — September 16, 2026

## Change and demonstrated recovery

HtmlTokenizer.discardRaw now starts each raw element at1024 units, grows by4x after
MORE steps, and stops growing at the unchanged65536-unit maximum. The same scanner,
prepaid window debits, per-operation debits,32M aggregate cap, source caps, closing
tokens, cancellation/issue handling and non-execution policy remain in force.

A76397-byte synthetic document with600 one-character scripts and a65536-character
paragraph previously fails reader.omitted-work at32056376 charged units against32M.
The new implementation completes at625800 units, matches legacy sanitized HTML,
and retains the entire65537-byte Markdown paragraph. Excessive work still fails;
no quota is raised and no resource error swallowed. This fixes internal capacity,
not a remote crawler block or CAPTCHA. See RAW-DISCARD-WINDOWS.md.

## Validation

- Base:03c04322138b78a9c2ca168559851b54eb33e0dc; final release02:/tmp/agent-browser-raw-windows-aQ0PI5/candidate-release02.
-1538 source/config/test inputs and2316 compiled artifacts verified. Compared with
  baseline,3 compiled artifacts change and none are
  added/removed. Core01 and final compiled artifacts are byte-identical, so the
  core capacity/timing diagnostics exercise the same production implementation.
- Final selected native gate:**3615 passed/0 failed across42 files**,22.2591 seconds.
  Build, selected types, format and lint exit0. Canonical manifest953/workspace956;
  this does not establish a full-suite pass.
- The new96-case file is87 passed/9 failed on pre-change production and96/0 on final
  production. Existing exact cancellation cases are expanded from4 to9; adaptive
  window/prepayment/committed-progress assertions replace fixed-window expectations.
- Release01 also passes3615 native cases/build/types/format, but one test string
  concatenation fails lint. Release02 changes only that equivalent test literal.
  Initial failure evidence remains. Core01 had quality checks only, no native run.
- Independent static review finds no blockers in release01. Production and the
  existing-test corrections match final release02 exactly; only the new-test lint
  expression differs. Review is not independent executed acceptance.

## Saved-response fidelity and work

Final117-body comparison:114 successful extraction pairs and3 identical non-HTML
failures. Entire previous extraction, diagnostics and classifications match after
excluding only reader.omittedRaw workUnits/steps and normalizing reference identity.
No content projection or DOM mutation is used; all returned documents close.
These are zero-request replays, including three new article captures from the
prior runtime. All three final native CLI full-output replays and two focused
selectors preserve content and access qualifications. Historical verdicts stay put.

| Capture | Before charged work | After charged work | Before steps | After steps |
| --- | ---: | ---: | ---: | ---: |
| deep-businessinsider | 2769044 | 934914 | 40 | 66 |
| deep-yahoo | 11424540 | 3854575 | 132 | 203 |
| deep-reviewed | 7267280 | 499389 | 128 | 148 |

Across separate successful invocations, aggregate work falls358720303→129469488
units. Seventeen pages increase slightly; the largest observed increase is21510.
More short initial windows can add overlap/preparation work on some inputs. There
is no claim of universal lower work or identical admission at every hypothetical
near-cap boundary. Existing resource limits still govern each invocation.

## Timing, not a speedup claim

Three warmup pairs and12 alternating measured pairs per captured article time only
sanitizeResearchHtml. Equality is checked outside the timed interval; source bodies
are pinned and no network occurs. Millisecond medians:

| Capture | Before | After | Median change |
| --- | ---: | ---: | ---: |
| deep-businessinsider | 7.3729 | 7.4220 | 0.67% |
| deep-yahoo | 10.4958 | 10.6256 | 1.24% |
| deep-reviewed | 6.1893 | 6.2627 | 1.19% |

Ranges overlap and JIT/GC/host scheduling are uncontrolled. **No wall-clock speedup
is established**; small higher medians do not justify a faster-page-load claim.
All samples, orders and ranges are in JSON. Transport, visibility preflight,
extraction, actual SDK and rendered-browser performance are not measured here.

## Evidence and remaining gates

Evidence:/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/raw-discard-windows-september16. Sealed 2026-09-16T16:52:11.475Z,172 files/16089520 bytes;
ARTIFACTS.json SHA256:f0d7679796fa8026d73d4fa02539c34e4eead3e0ed29f91709be4a61d27f6ae6. Inventory excludes itself and
SEALED.json. All22 recorded process groups are
absent with no timeout/signals, including expected red/initial failed attempts.
Native/probe HOME/TMP are empty; quality TMP emptiness is not claimed. All validation
writers/subagents are closed and prior42 dirty tracked/697 untracked files preserved.

The full performance/functionality goal remains active:62 broader failures across26
files,22 missing committed tests, actual SafeJS/rendering/credential/passkey/device/
TTY/access gates and remote crawler barriers still require work. No push is performed.
