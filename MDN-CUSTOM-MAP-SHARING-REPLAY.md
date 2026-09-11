# MDN custom-map-sharing replay — September 11, 2026

**Outcome: navigation still fails, now with `CSS cascade work limit exceeded`
inside the charged custom-property equality comparison. No document committed.**
The previous retention-limit error did not surface before this stop; that does
not establish that the entire page now satisfies retention limits.

## Validation and execution

Authorization: `node_modules/.cache/native-validation/mdn-custom-map-sharing-replay-prompt.md`.
The completed `native-custom-map-sharing-september11-round01` validation was
verified before launching: build/strict/format/native all exited 0, inputs stayed
stable, and **112 explicitly selected native files passed 6,687 cases**, with the
existing exclusion `exposes the separate total host-object ceiling without
claiming full-pool runtime capacity`. Validation finished at
**2026-09-11T10:01:02.259Z**. This is not a claim that the whole manifest ran.

Only the validated `snapshot01/dist/` build was used, without rebuilding.
Independent source and compiled inventories retained **1,006/1,788 files**.

| Immutable pin | SHA-256 |
| --- | --- |
| Validation summary | `58b010fe99dba30f22b067a9c682c1aa7b89904dc95b9a7aa544180830d493f8` |
| Native results | `4f6df32bcc277428c0ac5336b11d13388159eeb335bd20cd65cc6612db9e475b` |
| Source inventory | `c13b5d6ff548869d31a76582aee0f1e014f5bf7f287d41f92b919511eff4cc3e` |
| Compiled inventory | `d6b8143798829c7fbb032bf8a2a8527461dc9adf0825f1051a925607e8c753d2` |

The **sole offline native child** ran at
**2026-09-11T10:02:08.034Z–10:02:08.394Z**, PID `2416846`. Exit 0 means its
diagnostic outcome was captured, not successful navigation. No timeout, signal,
output overflow, retry, fallback navigation, or surviving process group occurred.

All **nine original captures** were served through native fixture routes, with
exact URLs/order/status/headers/body hashes: **252,295 decoded bytes, zero wire
bytes, zero redirects**, and no unrecorded resource request. Seccomp and JS
network/process/worker/native-addon guards stayed enabled; all attempt lists
were empty. No live browsing, scripts, SafeJS, TTY/PTY, credentials, or private
profile was used. Clean private HOME/TMPDIR remained empty and were removed.

The original document/query/CSS limits stayed unchanged, including the
**5,000,000 cascade-work limit**. Bounds remained 30 seconds plus five-second
grace, 6-MiB file/combined-output caps, 12 requests, 2,000,000 bytes per response,
8,000,000 aggregate bytes per counter, and configured 250-ms transport spacing.

## Exact outcome and comparison

The low-level document loader returned its tree. Session style finalization
failed before commit at stage **`session-style-finalization-and-commit`**:

```text
AgentBrowserError / resource-limit / CSS cascade work limit exceeded
dist/src/styles.js:495                 charge
dist/src/css-variables.js:461          resolveCustomProperties
dist/src/styles.js:636                 DocumentStyles.refresh
dist/src/styles.js:390                 DocumentStyles.metrics
dist/src/session.js:1227               BrowserSession.performNavigation
```

These locations belong to the new immutable snapshot. The throwing charge is
inside the resolved-versus-inherited value comparison and accounts for the
property name, both value lengths, and one additional unit. The probe does not
record the triggering variable/node, accumulated comparison-only cost, or exact
overshoot. **Next issue: investigate this charged comparison's repeated work
under the existing budget**, not by removing charges or raising limits.

The former fatal selector remains explicitly measured:
`:is(.content-section ul.specifications-list) li:has(details)` completed at call
**146**, costing **8,390 units**, with zero matches—unchanged from the previous
relative-`:has` replay. Both runs recorded **210 calls, 188 completions, and
2,915,622 completed selector-work units**, on **2,731 nodes / 1,433 elements**.
The 22 recoverable unsupported-selector failures were excluded from completed
costs; stale preceding `lastWork` values were not charged as parser failures.

Full top-20 costs and candidate metrics are preserved in `stdout.jsonl`.
The highest completed selector cost remains **958,878 units** for
`:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *`.
No wall-clock performance comparison is claimed.

The previous replay stopped at `CSS variable retention limit exceeded`; this
run stops at the comparison's cascade-work charge. **Neither run committed a
page.** Bounded native title/main-heading/text capture was not reached because
it follows successful session navigation. No rendering, click, live-navigation,
or challenge-handoff success is claimed.

## Cleanup and receipt verification

The observed document closed with zero nodes; the observed query engine closed
with zero cached selectors/indexed nodes. Instrumentation was restored.
Session/transport closed, active requests/tabs/pending loads were zero, and
cleanup errors were zero. One post-event-loop sample approximately **0.331 ms**
later, inside the 100-ms window, again observed zero pending loads. Historical
cleanup observations were neither modified nor polled.

Independent verification at **2026-09-11T10:02:20.533Z** passed **62 checks**;
all **27 receipt files** passed a separate checksum check. Source/build inputs,
the 33-file live capture, 23-file original diagnostic, and 26-file prior replay
remained unchanged. Stdout was 54,055 bytes; stderr was empty.

| New replay evidence | SHA-256 |
| --- | --- |
| `stdout.jsonl` | `9648a571169811b5880c4c346c719cf14b0c149037fe7c731b857b64f7a4ae2e` |
| `VERIFICATION.json` | `1ecab658dd63d1aa4480c9adfe3c05026f2320f22f9f0ab4c81eaa3e3d30e8ea` |
| `RECEIPTS.sha256` | `1857454480f154c4f33d74de6f299648823697cfa17ba24f8b56c9aca45f150c` |

## Changed paths

Only these new paths were written; no source/tests/`TASKS.md`, previous evidence,
dependencies, or commits were changed:

- `MDN-CUSTOM-MAP-SHARING-REPLAY.md` — this report.
- `node_modules/.cache/native-validation/native-custom-map-sharing-compiled-september11/`
  — `compiled-before.sha256`, `compiled-after.sha256`, `PINNING.json`.
- `node_modules/.cache/native-validation/native-mdn-custom-map-sharing-replay-september11/`
  — 28 files: the 27 named in `RECEIPTS.sha256`, plus that ledger itself.
  These include the supervisor/probe/verifier/guards, prompt and pins, launch
  locks, execution/output/verification receipts, and before/after source,
  compiled, live-capture, baseline, and previous-replay inventories.

The replay ledger excludes itself and this report. Compiled-reference files are
verified through preflight reference hashes and independent inventories. No
automatic retry or further native probe was performed.
