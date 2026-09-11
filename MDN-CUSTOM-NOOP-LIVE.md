# Fresh native MDN flow — September 11, 2026

**Full flow failed before initial document commit or link activation. The stop
was the retained live probe's stylesheet-diagnostic assertion, not a new query
or cascade-work exception, HTTP failure, or demonstrated click failure.**

## Preconditions and scope

The offline report `MDN-CUSTOM-NOOP-REPLAY.md` was completed first. Its successful
native replay, committed document, bounded content evidence, and all 27 sealed
receipt files were independently verified before this live child launched.

Authorization: `node_modules/.cache/native-validation/mdn-custom-noop-live-prompt.md`.
Used only the immutable `native-custom-noop-reuse-september11-round01/snapshot01/dist/`
build and existing `native-custom-noop-reuse-compiled-september11` reference pins.
All four validation commands passed: **6,689 cases across 112 explicitly
selected native files**, with the existing excluded host-object-ceiling assertion.
Independent source/compiled inventories remained **1,006/1,788 files**.

| Pin | SHA-256 |
| --- | --- |
| Validation summary | `4c2f93489b210f82d7c0b5cf009c33272f0401a416f4ecf396fcc7ec598cea11` |
| Native results | `5494c6e330644f6061fb95aeb53dcdc04177a7fba0c9ae9b14393aa08fccadac` |
| Source inventory | `833863b7aad5cdc453851b574ace340a843d45a8d5716f8d33a616cdc79ed603` |
| Compiled inventory | `b6744eb08b70348eabaaf6488349565c3060591aee297eb8b2e385f190095408` |

Exactly one fresh native child ran at
**2026-09-11T10:16:34.143Z–10:16:36.397Z**, PID `2434101`, exit 1. No timeout,
signal, output overflow, repeated child, or surviving process group occurred.

The authorized **probe-only request cap was 24**; production defaults and all
source stayed unchanged. Other bounds remained 2,000,000 response bytes,
8,000,000 aggregate bytes per counter, 16,384 header bytes, five redirects,
250-ms pacing, two navigations maximum, one click maximum, 30 seconds plus
five-second grace, and 6-MiB output/file caps. Requests were bodyless GETs with
credentials omitted. Only `https://developer.mozilla.org` was allowed.

## Observed live stages

1. Requested `https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector`
   through native `BrowserSession` / `NodeNetworkTransport`.
2. Captured **nine actual HTTP 200 responses**, zero redirects and zero mocked
   requests: **31,527 encoded bytes / 252,295 decoded bytes**. The fresh primary
   HTML and eight stylesheet bodies match the corresponding original capture
   hashes. Every fresh body and actual response header set is retained.
3. The low-level loader and stylesheet metrics completed: **2,731 nodes**,
   **3,728,759 cascade-work units**, 395 rules, 996 declarations. They reported
   `stylesheet-resource-limit: 1`, `external-stylesheet-not-loaded: 10`, and other
   unsupported-CSS diagnostics. No image requests or image errors were reported.
4. The unchanged fail-fast assertion at
   `node_modules/.cache/native-validation/native-mdn-custom-noop-live-september11/probe.mjs:114`
   required the stylesheet-resource-limit count to equal zero. It raised:

   ```text
   stage: initial-navigation:native-loader
   AssertionError / ERR_ASSERTION
   Native stylesheet resource failure
   1 !== 0
   ```

   The outer navigation subsequently reported `aborted` / `Navigation aborted`.
   The first failure is preserved rather than replaced with that outer error.
5. **One navigation attempt, zero commits, zero clicks.** Initial session load,
   live title/main-heading validation, main-content link discovery/selection,
   destination verification, and replacement-document closure were not reached.
   Link candidate count is unknown, not zero. No direct-navigation fallback or
   geometry bypass occurred.

This stylesheet diagnostic was already recorded by the successful offline
replay. That replay allowed the native partial document to commit; the original
live probe's stricter diagnostic assertion was retained here and prevented it.
Consequently, this run demonstrates fresh native loading/style computation up to
that assertion, **not** a successfully committed live initial page or a failure
of link actionability. It is a probe acceptance-policy/resource-completeness
limitation, not missing authorization or an unsupported-layout permission issue.

The primary response had HTTP 200 and `content-type: text/html`. Header-only
challenge classification returned null for all captured responses. Native
title/text classification was not reached, so no content-level challenge-free
claim is made. No challenge workaround, other browser/client, script, SafeJS,
TTY/PTY, credentials, account UI, or private profile was used.

## Cleanup and integrity

The tracked partial document closed with zero remaining nodes; session and
transport closed with zero active requests or cleanup errors. Immediate
`pendingLoads: 1` became **0** in the single permitted post-event-loop sample
approximately **0.098 ms** later, within 100 ms. No counters were cleared and no
historical process was polled. Private mode-0700 HOME/TMPDIR remained empty.

Independent verification at **2026-09-11T10:16:46.814Z** passed **44 integrity
checks** and a separate checksum check for all **34 receipt files**. Flow status
remains false. Stdout was 22,997 bytes; stderr empty. Source, compiled build,
validation/reference ledgers, harness, completed offline replay/report, and the
original failed live lane remained unchanged.

| New live evidence | SHA-256 |
| --- | --- |
| `stdout.jsonl` | `5e301bb792309a7592a3f64f26a011790851d780d08b07e5a9bb3e9e37f0493d` |
| `VERIFICATION.json` | `f87ada264a1ebb1114c593bb8b78f05d9aca5e0040752b43b41acd05b55f0090` |
| `RECEIPTS.sha256` | `3a7db9ae526be6ac6605409387c6e2deb557f2ee1ad13e960b1566df3ebc4c96` |

## Handoff

**Next decision:** review the retained live probe's treatment of recoverable
stylesheet-limit diagnostics versus the required resource-completeness gate.
Any changed probe or further live attempt needs separate scope; this child was
not retried. Full link activation, destination verification, and rendering/
research/challenge efficacy remain untested.

Only these new live-task paths were written:

- `MDN-CUSTOM-NOOP-LIVE.md` — this report.
- `node_modules/.cache/native-validation/native-mdn-custom-noop-live-september11/`
  — 35 files (the 34 named in `RECEIPTS.sha256` plus that ledger) and empty private
  HOME/TMPDIR directories. Includes all nine fresh bodies, stage/output records,
  supervisor/probe/verifier, prompt, locks, and before/after inventories.

The ledger excludes itself and this report. No source/tests/`TASKS.md`, previous
evidence, dependencies, or commits were changed.
