# MDN no-op custom-declaration replay — September 11, 2026

**One offline native navigation committed successfully and captured bounded
native content. Styling remains partial; this is not rendering, click, or live
acceptance. No further probe was launched.**

## Validated exact build

Authorization: `node_modules/.cache/native-validation/mdn-custom-noop-reuse-replay-prompt.md`.
The replay waited for `native-custom-noop-reuse-september11-round01` validation,
which finished at **2026-09-11T10:07:38.847Z**. Build, strict, format, and native
commands all exited 0 with stable inputs: **112 explicit native files, 6,689
passing cases, one existing exclusion** (`exposes the separate total host-object
ceiling without claiming full-pool runtime capacity`). The selected files are a
subset of the explicit manifest, not the entire manifest.

Only that validation's immutable `snapshot01/dist/` was used. Independent source
and compiled inventories retained **1,006/1,788 files**, unchanged after replay.
The exact validated `styles.ts` overlay was used, not working-tree source or a
fresh rebuild; no unrelated import/property ordering changes were incorporated.

| Pin | SHA-256 |
| --- | --- |
| Validation summary | `4c2f93489b210f82d7c0b5cf009c33272f0401a416f4ecf396fcc7ec598cea11` |
| Native results | `5494c6e330644f6061fb95aeb53dcdc04177a7fba0c9ae9b14393aa08fccadac` |
| Source inventory | `833863b7aad5cdc453851b574ace340a843d45a8d5716f8d33a616cdc79ed603` |
| Compiled inventory | `b6744eb08b70348eabaaf6488349565c3060591aee297eb8b2e385f190095408` |
| Snapshot `src/styles.ts` | `e74ae21d778108ae6d9ca8ca95fe3ffdd0b62e8a0fedcbdbd68fef7e936172c4` |
| Snapshot `dist/src/styles.js` | `70bbb21ee65e4119e3e5a4c6e87ac996c2177b09c80d5034954d4e93ee933af5` |

## One guarded execution

The sole child ran at **2026-09-11T10:08:23.811Z–10:08:24.171Z**, PID `2425460`,
exit 0. Navigation separately returned `kind: document` and recorded **one
commit**; exit status alone is not the success evidence.

All **nine original fixtures** were served with exact URLs/order/status/headers
and decoded-body hashes: **252,295 decoded bytes, zero wire bytes, zero redirects**.
There were no unrecorded resource requests or JS network/process guard attempts.
Seccomp, process/worker/native-addon denial, and clean private HOME/TMPDIR were
retained. No live site, scripts, SafeJS, credentials, TTY/PTY, or alternate browser
was used. Empty private directories were removed afterward.

Limits stayed unchanged: 30-second deadline plus five-second grace, 6-MiB
file/combined-output caps, original document/query/CSS limits, 12 requests,
2,000,000 bytes per response, 8,000,000 aggregate bytes per counter, and configured
250-ms transport spacing. No retry, fallback navigation, timeout, or budget
increase occurred.

## Native result and remaining limits

- URL: `https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector`.
- Native title: **Document: querySelector() method - Web APIs | MDN**.
- Main heading: **Document: querySelector() method**, reference `e1444`.
- One main element; **15 headings** and **6,469 main-text code units** captured,
  within limits of 20 headings, 512 code units per heading, and 12,000 text units.
  Text is native DOM `textContent`, including any unexecuted script text; it is
  not a visible-text/rendering or research-extraction validation.
- One cascade completed at **3,728,759 work units**, below the unchanged
  **5,000,000** limit. The preceding replay instead stopped in the charged
  custom-property comparison with `CSS cascade work limit exceeded` before
  commit. No corresponding fatal error surfaced here.
- The old fatal selector, `:is(.content-section ul.specifications-list) li:has(details)`,
  again completed at call **146**, costing **8,390 units**, with zero matches.
  Selector accounting remains **210 calls / 188 completed / 22 recoverable
  unsupported failures**, with 2,915,622 completed selector-work units. Top-20
  records are retained; stale parser-failure `lastWork` was not counted again.
  No incomplete-total or wall-clock comparison is claimed.

**The committed page is still partial.** Native style metrics report eight
external sheets, `stylesheet-resource-limit: 1`, and
`external-stylesheet-not-loaded: 10`, plus unsupported property/at-rule/value/
selector/media-query issues. HTML metrics also declare a partial parser, six
unexecuted scripts, unsupported template extensions, and one unloaded iframe.
The native style report explicitly has `layout: false`. Serving all recorded
fixtures therefore does not mean all page styles/resources loaded successfully.

The observed work blocker no longer prevents this captured document's commit.
Resource completeness, rendering, link activation, live navigation, and research
or challenge-handoff acceptance remain unvalidated. Main must review these
limitations before deciding any separately authorized live action.

## Cleanup and integrity

The document closed with zero remaining nodes. Both observed query engines
closed with zero cached selectors/indexed nodes; instrumentation was restored.
Session/transport closed, with zero active requests, tabs, pending loads, or
cleanup errors. One post-event-loop sample approximately **2.824 ms** later,
inside the 100-ms bound, also showed zero pending loads. The new child's process
group was absent; no historical child was polled or historical observation edited.

Independent verification at **2026-09-11T10:08:36.197Z** passed **63 checks**;
all **27 receipt files** passed a separate checksum check. Exact overlay source
and compiled hashes were additionally rechecked. Source/build inputs, the
33-file live capture, 23-file original diagnostic, and 28-file preceding
custom-map-sharing replay stayed unchanged. Stdout was 62,546 bytes; stderr empty.

| New replay evidence | SHA-256 |
| --- | --- |
| `stdout.jsonl` | `e21f2ca1d6a7731e53b0ceae0a83976af09d604e39382f3ec5e9a796d3d8a9fa` |
| `VERIFICATION.json` | `5d2ac4fbd9c4758fb364f1d7566fade314b06232f148dbfb5c5121bab41e5e6e` |
| `RECEIPTS.sha256` | `69772de20efd221e7670723e1b646b9c2b02348b1dddf187d03e118616d106d3` |

## Changed paths

Only these new paths were written; no source/tests/`TASKS.md`, old evidence,
dependencies, or commits were changed:

- `MDN-CUSTOM-NOOP-REPLAY.md` — this report.
- `node_modules/.cache/native-validation/native-custom-noop-reuse-compiled-september11/`
  — `compiled-before.sha256`, `compiled-after.sha256`, `PINNING.json`.
- `node_modules/.cache/native-validation/native-mdn-custom-noop-reuse-replay-september11/`
  — 28 files: the 27 named in `RECEIPTS.sha256`, plus that ledger itself.
  These contain the harness/guards, prompt/pins, launch locks, native output,
  verification receipts, and before/after input/provenance inventories.

The replay ledger excludes itself and this report. Compiled-reference files are
checked through preflight reference hashes and independent inventories.
