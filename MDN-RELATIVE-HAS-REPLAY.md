# MDN relative-`:has` replay — September 11, 2026

**The previous fatal selector now completes in 8,390 work units. Navigation
still fails, later, with `CSS variable retention limit exceeded`. No page was
committed; this is not rendered, click, or live acceptance.**

## Authorization and validation

Authorization: `node_modules/.cache/native-validation/mdn-relative-has-replay-prompt.md`.
Only the new replay lane, compiled-reference directory, and this report were
written. No source, tests, `TASKS.md`, previous evidence, dependencies, or commits
were changed.

The replay waited for
`node_modules/.cache/native-validation/native-relative-has-september11-round01/results/SUMMARY.json`.
Validation finished at **2026-09-11T09:51:56.326Z**: build, strict, format, and
native commands all exited 0, with stable inputs. The **111 explicitly selected
native files** contained **6,614 passing cases and one existing exclusion**:
`exposes the separate total host-object ceiling without claiming full-pool runtime capacity`.
The 111-file selection is a subset of the explicit manifest, not a claim that
every manifest file ran.

Two independent inventories pinned the completed immutable
`native-relative-has-september11-round01/snapshot01/dist/` build. Source/compiled
counts remain **1,006/1,788**. No rebuild was performed. Reference inventories in
`node_modules/.cache/native-validation/native-relative-has-compiled-september11/`
were created before replay and checked against independent post-run inventories.

| Pin | SHA-256 |
| --- | --- |
| Validation summary | `b982ed771f762305db184d2a4c4f56c34f9f39e27d9ede47a71adf614457dd18` |
| Native validation results | `10f88e7489f7603e8ac973d2cb55710aa6021a0af34e07251793345fb1864693` |
| Source inventory | `4311707c7e339e2529c3566824faa216b46ae88f64de7a4388f095904fd45b90` |
| Compiled inventory | `db3cb2e3b6bb9956a7b8110b24f7931ecd9cc32b65e1f47f1b2e5a66c9c77e04` |

## One bounded offline run

- Sole supervised child: **2026-09-11T09:54:37.657Z–09:54:37.983Z**, PID
  `2409331`, exit 0 meaning the diagnostic outcome was captured. No timeout,
  signal, output overflow, retry, fallback navigation, or surviving child group.
- Exactly one native `BrowserSession` navigation. All **nine captured responses**
  were served through native fixture routes with original exact URLs, order,
  status, headers, decoded bodies, and hashes. These URLs contain no queries;
  no redacted-query reconstruction was needed. No missing resource was requested.
- Native transport: **9 mocked requests, 252,295 decoded bytes, 0 encoded wire
  bytes, 0 redirects**. Seccomp socket/network restrictions, JS network guards,
  subprocess/worker denial, and native-addon denial remained enabled. Guard
  attempt lists were empty; no socket/network self-test was performed.
- No scripts, SafeJS execution, credentials, private profile, TTY/PTY, alternate
  browser, or live website access. New private HOME/TMPDIR stayed empty and were
  removed after execution.
- Unchanged limits: 30-second child deadline plus five-second grace; 6-MiB
  combined output and per-file caps; 12 requests, 2,000,000 bytes per response,
  8,000,000 aggregate bytes per counter; 250-ms transport spacing configured.
  Document limits remained 50,000 nodes, depth 256, and 2,000,000 text code units.
  Query/cascade work remained 5,000,000; stylesheet source/rule/declaration/sheet
  limits remained 524,288/4,096/16,384/32. No budget was raised.

## Corresponding selector comparison

Both profiles processed the same **2,731 nodes / 1,433 indexed elements**.
The explicitly tracked selector is:

```css
:is(.content-section ul.specifications-list) li:has(details)
```

Its original CSS occurs in the preserved live capture's `response-6.body`, at
UTF-16 code-unit offset **14,368**, from
`https://developer.mozilla.org/static/client/styles-content-section.1eb240d1720d8ac3.css`.

| Measurement | Original diagnostic | Improved-build replay |
| --- | --- | --- |
| Selector call | 146 | 146 |
| Available work before call | 3,270,729 | 3,571,132 |
| Observed call work | 3,270,736; interrupted at limit | **8,390; completed** |
| Result | `Query work limit exceeded` | 0 matches; no selector failure |
| Structural index builds | 1 | 1 |
| Candidate index builds / entries | 2 / 1,837 | 2 / 1,837 |

This is direct bounded work-counter evidence of advancement on the old blocker,
not a wall-clock speed comparison. The old call never completed, so its work
count is not a full baseline cost.

The replay recorded **210 selector calls: 188 completed and 22 recoverable
unsupported-selector failures**, with **2,915,622 completed selector-work units**.
The original profile recorded 1,661,648 completed units before its earlier stop;
these totals cover different prefixes and must not be treated as a regression
or end-to-end performance comparison. Failed parser calls were excluded from
completed costs; stale preceding `lastWork` values were not charged again.

Full top-20 records, before/after candidate metrics, explicit tracked-call data,
and source occurrences are in the replay's `stdout.jsonl`. The largest completed
call was 180, `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *`,
at **958,878 units**, with zero matches. This later selector was not reached in
the original profile. Corresponding completed calls such as
`[data-current-area=learn]:root *` remained at 289,655 units.

## Later failure and evidence limitation

`loadBrowserDocument` returned a tree, but **session navigation did not complete**.
`BrowserSession.performNavigation` then invoked `DocumentStyles.metrics()`, whose
refresh failed while accounting for retained custom-property maps:

```text
AgentBrowserError / resource-limit
CSS variable retention limit exceeded
dist/src/styles.js:643 → DocumentStyles.refresh
dist/src/styles.js:390 → DocumentStyles.metrics
dist/src/session.js:1227 → BrowserSession.performNavigation
```

These paths are inside the pinned `snapshot01` build. The retained harness stage
label is still `native-loader`; the actual stack locates the failure in session
style finalization **after** the low-level loader returned and **before** commit.
Likewise, `loaderCompleted: true` and the comparison's loader-success flag denote
only that lower-level return, not a successfully navigated page.

The source guard at
`node_modules/.cache/native-validation/native-relative-has-september11-round01/snapshot01/src/styles.ts:909`
checks cumulative newly retained custom-property maps against **16,384 bindings**
or **2,000,000 code units**. This probe did not instrument those counters, so it
does **not** identify which threshold or node triggered the failure.

There were **zero document commits**. Bounded native title/headings/text capture
was scheduled after successful session navigation and was therefore not reached.
No such content evidence is claimed, and no extra read/replay was substituted.

**Next bounded issue:** inspect custom-property retention counters and inherited
map allocation/sharing at this guard, preserving both retention limits. The
relative-`:has` work blocker advanced; the retention failure is now the next
observed gate. No retention fix was implemented here.

## Cleanup and integrity

The one observed document closed with zero remaining nodes. The observed query
engine closed with zero cached selectors/indexed nodes; instrumentation was
restored. Session/transport closed, active requests/tabs/pending loads were zero,
and cleanup errors were zero. A single post-event-loop sample, approximately
**0.301 ms** later and within the 100-ms window, again showed zero pending loads.
This does not rewrite the historical live run's immediate `pendingLoads: 1`.

Independent verification at **2026-09-11T09:54:48.633Z** passed **60 checks**.
All **25 files listed by `RECEIPTS.sha256`** passed a separate checksum check.
Independent source/build inventories, all 33 original live-lane files, and all
23 previous diagnostic-lane files were unchanged. Stdout was 49,897 bytes;
stderr was empty. Only the new child's process group was checked; no historical
child was polled.

| New replay evidence | SHA-256 |
| --- | --- |
| `stdout.jsonl` | `e58b39d3445201c4c3bbc1ddb7b36c51cfa34968002a949070490eda3aace706` |
| `VERIFICATION.json` | `5e0882e1b7adcf0e229b100406d0de146863caf258b7f5175e0ef05cfbfde84e` |
| `RECEIPTS.sha256` | `9aa6df1d6c3cdbba3e911cb9f3c99abc5599c2065032d03c492ffeac899afb67` |

The ledger excludes itself and this root report. Compiled-reference files are
covered by preflight reference hashes and independent compiled inventories.
No rendering, click, live navigation, or challenge-handoff acceptance is claimed.

## All changed files

New root file: `MDN-RELATIVE-HAS-REPLAY.md`.

New directory `node_modules/.cache/native-validation/native-relative-has-compiled-september11/`:

```text
compiled-before.sha256  compiled-after.sha256  PINNING.json
```

New directory `node_modules/.cache/native-validation/native-mdn-relative-has-replay-september11/`:

```text
run.mjs                 probe.mjs               verify.mjs
network-guard.mjs        sealed-exec.py          PROMPT.md
PINS.json               RUN-ONCE.lock           NATIVE-LAUNCH.lock
PREFLIGHT.json          INVOCATION.json         EXECUTION.json
INTEGRITY.json          VERIFICATION.json       RECEIPTS.sha256
stdout.jsonl            stderr.txt              progress.jsonl
source-before.sha256    source-after.sha256
compiled-before.sha256  compiled-after.sha256
parent-before.sha256    parent-after.sha256
baseline-before.sha256  baseline-after.sha256
```
