# Equal-output extraction byte accounting — September 15, 2026

## Result

Replace temporary UTF-8 byte-array allocation in native extraction length checks
with an exact, constant-space byte counter. **All 1,337 selected native tests
pass**, including 59 new regressions. Two separate ten-page saved-response runs
retain identical Markdown content and matching normalized JSON/metadata. Every
page has a lower candidate median in both local runs: **9.6–18.0%** first run and
**9.2–19.4%** reverse-page-order repeat.

These are same-tree extraction-only measurements, not a network, page-load,
startup or end-to-end browser speed claim. No new website request occurs in this
lane, and no historical live status is upgraded. The full browser goal remains
active, with dynamic content, source noise, access barriers and separate SDK/
interactive/credential/passkey gates still open.

## Evidence-led change

Baseline is `e07cee3f8ad23138bacb41a56037961ccb2c860f`. Its 1,493 committed runtime
source/script/package/tsconfig inputs match the pinned clean runtime used for
profiling. Dirty root output is not used. A V8 profile of 1,500 whole-document
extractions across five saved articles records 8,549 samples over 9.005 seconds.
TextEncoder `encode` and `encodeUtf8String` account for approximately 1.411 seconds
of sampled self time. This is sampling evidence, not an exact allocation count.

The initial source-layout-probe hypothesis is smaller in that profile and is
deferred. The focused change instead replaces the extractor's own
`TextEncoder.encode(...).byteLength` calls with `utf8ByteLength(...)`. JSON
serialization remains in place where budgets apply to serialized results.
Other modules, including source-companion and prefix helpers, may still encode
and allocate. No dependency, Buffer requirement, option, default or access policy
changes. See `EXTRACTION-BYTE-ACCOUNTING.md` for the internal string contract.

## Correctness and bounds

- ASCII, two/three-byte characters, valid surrogate pairs and unpaired surrogate
  replacement agree with TextEncoder. Tests cover all 65,536 individual UTF-16
  code units, 144 boundary pairs, 512 deterministic mixed sequences and long
  inputs. These are checks inside tests, not 65,536 separately reported tests.
- Ordinary Markdown and JSON accounting spies observe zero TextEncoder calls
  after the change. Old extraction fails those two assertions with the same new
  test files. Other formatting, content, source-node and revision behavior stays
  unchanged.
- Serialized byte boundaries, Unicode tables, explicit text-prefix fallback,
  node/depth rejection and existing intermediate-limit regressions pass. Limits
  are not raised by production code. Exact-cap calls reproduce full results.
- One-byte-below comparison calls must either reject or independently fit that
  smaller cap. Existing optional source metadata may shrink or disappear; not
  every such call is expected to throw. The scope's initial shorthand is clarified
  in the retained capacity-check note rather than rewritten as stricter evidence.

Selected baseline: **1,278 passed / 0 failed** across 19 manifest files. Candidate:
**1,337 / 0** across 21 files. Red control: **1,335 / 2** with old extraction plus
the new standalone helper and identical tests; both failures are allocation-spy
checks. Build, strict types, configured format and lint pass. No exclusions.
This is not the full 921-file manifest, actual SafeJS or interactive acceptance.

## Same-input website comparisons

Ten existing captures cover CNET and Consumer Reports articles, RunRepeat and KBB
reviews, IGN, Target and Ulta product details, an App Store listing, Cambridge
Dictionary and GitHub source. Exact URLs, original receipt/body hashes and sample
arrays are in the JSON report. Markdown, JSON with table metadata, main focus and
main-focus-plus-row-list outputs are compared. JSON normalization changes only
per-runtime node-reference fields, not source content or policy metadata.

The comparison explicitly permits up to 1,048,576 output bytes to compare full
structured outputs, with 50,000 nodes and depth 128. This is a harness setting,
not a new default. Source loader limits remain unchanged. Product descriptions,
access declarations, source tables and GitHub code/gutter metadata are retained.

After ten warmup calls per runtime/page, each process records 20 alternating
batches of five calls. Listed medians are milliseconds per extraction. Equality
checks happen after the timer. The second process reverses page order; neither
run measures load/network/startup, and the environment is not a controlled lab.

| Saved page | Markdown bytes | Run 1 baseline → candidate ms | Run 2 baseline → candidate ms |
| --- | ---: | ---: | ---: |
| CNET cellular-internet explainer | 48500 | 4.79 → 4.12 | 5.17 → 4.44 |
| Consumer Reports induction cooktops | 43825 | 9.91 → 8.67 | 10.11 → 8.93 |
| RunRepeat Brooks Revel 9 | 48718 | 7.52 → 6.16 | 7.85 → 6.33 |
| KBB Subaru Ascent article | 19297 | 3.48 → 3.07 | 3.64 → 3.15 |
| IGN Steam Frame review | 27713 | 1.98 → 1.78 | 2.04 → 1.85 |
| Target product detail | 3370 | 1.46 → 1.26 | 1.50 → 1.26 |
| Ulta product detail | 55162 | 9.92 → 8.66 | 10.54 → 8.65 |
| App Store NFL listing | 39459 | 8.02 → 6.64 | 8.26 → 6.84 |
| Cambridge “enormous” entry | 35523 | 8.63 → 7.25 | 8.77 → 7.81 |
| GitHub Requests `api.py` source | 16070 | 3.46 → 3.13 | 3.43 → 3.06 |

This optimization does not fix those sources' existing missing or duplicated
content, verify publisher claims or grant access. Consumer Reports' missing
ranked recommendations remain missing; scoped outputs remain partial.

## Audit and remaining work

The profile closes five native documents; the two successful comparison processes
close 20 each, **45 total**. Tree resource usage and revisions remain unchanged.
All successful child/process-group and JS/kernel guard checks pass, with zero
network/process attempts from the guarded runtime. Profiling and comparison use
192MiB child heaps, empty HOME/TMP and bounded outer deadlines.

The first comparison failed before loading a capture because two report paths
were resolved relative to the isolated working directory. Its original scripts,
invocation and failure remain intact. Separately named corrected scripts resolve
paths from their own lane and record successful results in new directories. No
production mismatch or speed result is attributed to the failed attempt.

Evidence is under
`node_modules/.cache/native-validation/extraction-probe-cost-september15/`.
The JSON report pins source/compiled manifests, native results, profile data,
comparison scripts, receipts and timing evidence. Existing working changes and
historical reports remain untouched; no push. Other allocation hot paths,
broader website coverage and actual browser acceptance gates remain open.
