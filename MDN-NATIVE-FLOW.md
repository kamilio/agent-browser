# Bounded native MDN link-activation probe — September 11, 2026

**Outcome: flow failed during initial native loading; link activation was not
reached. Receipt integrity verified; pending-load settlement remains unverified.**

## Scope and timing

- Authorization: `node_modules/.cache/native-validation/mdn-native-link-flow-prompt.md`.
- Owned evidence lane: `node_modules/.cache/native-validation/native-mdn-link-flow-september11/`.
- Sole native child: **2026-09-11T09:29:28.217Z–09:29:30.440Z**, 2.223 seconds;
  exit 1, no timeout, signal, spawn error, output overflow, or second live run.
- Offline independent verification: **2026-09-11T09:30:46.639Z**; 36 checks and
  a separate `sha256sum --check RECEIPTS.sha256` pass for all 32 listed files.
- Only this report and the new lane were written. No repository source, tests,
  `TASKS.md`, existing evidence, commits, installations, or pushes were changed.

## Immutable validation and build

Used only `node_modules/.cache/native-validation/native-client-challenge-september11-round01/snapshot01/dist/`.
The completed validation at `native-client-challenge-september11-round01/results/`
records build, strict, format, and native exits 0, with **6,431 passing tests and
one documented exclusion**: `exposes the separate total host-object ceiling
without claiming full-pool runtime capacity`. This was verified, not rerun.

Independent before/after inventories matched all **1,006 source files** and
**1,788 compiled files**, including the reference ledgers in
`node_modules/.cache/native-validation/native-client-challenge-compiled-september11/`.
The full paths and executable/harness hashes are in `PREFLIGHT.json`.

| Pin | SHA-256 |
| --- | --- |
| Validation `results/SUMMARY.json` | `8773f312393e69fa70ef130240d5d3f8b7d9a89b292c452d30ec3e83ae1a5e83` |
| Validation `results/native.stdout` | `f64c2c49ba4c21bedb9fd03d2d6cbdadf0e39eb0175b4fcff5763bedd1030660` |
| Source inventory | `258a70b01106a0430ae122c8b9661120cd313358f06325d38c858fee6b594dd7` |
| Compiled inventory | `508b83a69d3a8e75ec1446e34087176b432a2afc63f9eab5ac24eef4753a68dc` |

## Limits and observed stages

The guarded PyPI supervisor was adapted without altering its existing lane.
Only `https://developer.mozilla.org` was permitted. Credentials were omitted;
HOME/TMPDIR were new, empty, mode-0700 directories. No alternate browser, raw HTTP
client, web search, page scripts, SafeJS execution, TTY/PTY, account UI, private
profile, or password store was used.

Bounds: one native child, one tab, at most two document navigations, 12 network
requests, one concurrent request, 250-ms configured transport spacing,
2,000,000 encoded/decoded bytes per response and 8,000,000 aggregate bytes per
counter. Transport timeout was 15 seconds, navigation timeout 20 seconds, child
deadline 30 seconds plus five-second termination grace. Combined stdout/stderr
and individual files were capped at 6 MiB, including a kernel file-size limit.

1. Began native navigation to
   `https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector`.
2. Captured the primary HTML response and eight stylesheet responses: all HTTP
   200, same origin, zero redirects. Total: **9 requests, 31,527 encoded bytes,
   252,295 decoded bytes**. Complete decoded bodies are `response-1.body` through
   `response-9.body`; actual response headers are retained in `stdout.jsonl`
   and response events in `progress.jsonl`.
3. Entered the native document loader with scripts disabled. The first failure
   was stage **`initial-navigation:native-loader`**, `AgentBrowserError`, code
   **`resource-limit`**, message **`Query work limit exceeded`**. The outer
   navigation then reported `aborted` / `Navigation aborted`; this is not
   substituted for the first failure.
4. No document was committed. Native title/main-heading inspection, content
   classification, DOM link discovery/count/selection, `BrowserSession.click`,
   destination verification, and old-document replacement closure were **not
   reached**. Candidate count is unknown, not zero. No direct-navigation
   fallback, budget expansion, or retry occurred.

The actual primary headers specify HTTP 200 and `content-type: text/html`.
Header-only native challenge classification returned null for every captured
response. Native title/text classification was unavailable because loading
failed; this is **not evidence that the content was challenge-free**.

## Cleanup and evidence integrity

The abort signal was set and the session/transport closed. The single tracked
partial document had zero remaining nodes; active network requests and tabs
were zero. The supervisor and independent verifier both found the child process
group absent. HOME/TMPDIR remained empty; stdout was 21,151 bytes and stderr empty.

However, the immediate final session snapshot recorded **`pendingLoads: 1`**,
`navigations: 1`, and `commits: 0`. No later in-process settlement observation
exists. The original offline `verify.mjs` therefore failed its stricter cleanup
assertion. Its pinned bytes and the original live receipts remain unchanged;
`OFFLINE-VERIFIER-FAILURE.md` records that failure. A separate offline-only
`verify-observed.mjs` verified inventories, hashes, caps, and the observed failure
without converting the open cleanup gate into a pass. `VERIFICATION.json`
explicitly records `passed: false`, `flowPassed: false`, `integrityPassed: true`,
and `settlementObserved: false`.

The following hashes refer to files inside the owned lane:

| Evidence | SHA-256 |
| --- | --- |
| Primary HTML `response-1.body` | `445d19f6e0445f9bf393b8710f5843727d7d0ea674943d0f9cc4498035e0bdaa` |
| Native report `stdout.jsonl` | `b6328137a5f59a5a442cb7b12bc65251d5f6a78ffe9e8882fca42f917f3d6da8` |
| `EXECUTION.json` | `7b81f736245139f0eef9965793259d1584c788d7ef1efe148f817674f1e407ca` |
| `VERIFICATION.json` | `7a2ea797e541dcaaa920214ab9f51a4c5256d4e1d4bd42679d5a0f3f5e2a9a4e` |
| `RECEIPTS.sha256` | `21fbf337ec6a4f1f4a1313e4a2e0c626acfd69ec3948326b9b72cb7d3a429141` |

The ledger covers lane files other than itself; this root report is outside its
scope. No historical evidence was rewritten.

## Next issue and open gates

**Next: localize the native loader's query-work exhaustion against the captured
MDN HTML/CSS in a separately scoped offline investigation.** The pinned selector
implementation emits this error at `snapshot01/src/selectors.ts:1505`; the
receipts do not identify the responsible selector, stylesheet, or call stack.
Also establish pending-navigation settlement after abort/close rather than
inferring it from process exit.

Successful initial native title/heading inspection, deterministic main-content
link selection, native click actionability, destination title/heading, and
old-document replacement closure remain open. This one-shot lane is exhausted;
follow-up runs require a separately scoped plan under applicable authorization,
not automatic retries. This evidence does not establish full rendering, research
workflow success, challenge detection/handoff efficacy, or the separate SafeJS,
socket, and real TTY/PTY acceptance gates. Main's research challenge handoff work
is outside this lane's ownership and was not validated here.

## Main follow-up: settlement semantics

Main independently checks the lane's 32-entry receipt ledger from the lane working
directory. Read-only inspection of `src/session.ts:1433` and
`src/session.ts:1467` shows that navigation jobs remain counted until the underlying
task's finally handler runs, even when the outer abort race already rejects.
The existing deferred-loader cases in `src/session.test.ts:854` explicitly expect
an immediate pending count of one after stop/close and eventual zero after loader
settlement. Those source tests were inspected, not newly executed for this report.

Consequently, the immediate live count is not proof of a leak, and clearing the
job set on close would conceal unfinished work rather than verify settlement.
The live settlement gate remains unverified. A separate offline profile will
inspect the captured CSS failure and, if within its predeclared run scope, sample
post-event-loop settlement without changing the historical live observation.
