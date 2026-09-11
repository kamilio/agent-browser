# W3C omitted-list reader replay — September 11, 2026

**Incomplete: baseline failure reproduced; a harness assertion stopped the single child before candidate navigation.** The candidate's successful native validation remains valid, but its captured-page reader behavior and specification-section extraction were not tested here. No additional child or request was attempted.

## Validation gate

Independently verified `native-reader-omitted-list-september11-round01` before launch: build, strict, format and native all exited zero; validation ran from `2026-09-11T11:54:41.981Z` to `11:56:19.831Z`. Actual results are **6,805 passed, zero failures, one existing excluded assertion**, 112 selected manifest-listed files and 111 strict roots. The strict-only omission remains `src/snapshot.test.ts`; the existing skipped assertion remains the total-host-object-ceiling case in `src/focus-provisioning-pressure.test.ts`.

The original compound-availability build separately verifies **6,786 passes**, zero failures and the same exclusion/selection counts. Each build's **1,006 source / 1,788 compiled files** match its stable inventories. The candidate compiled-reference directory was created only after successful complete validation. `GATE.json` records file-only approval at `11:59:41.917Z`; `PREFLIGHT.json` rechecks the gate and pins immediately before the child. No native child ran while validation was pending.

## Exact outcomes

| Operation | Recorded result |
| --- | --- |
| Baseline native research navigation | One mocked response, HTTP 200; `outcome: failure`, `failure: { category: unsupported, stage: loader }`, `partial: true`, `contentSuccess: false`. No classified barrier, heading outline or reader/extraction result. This reproduces the original live reader failure. |
| Harness post-navigation check | `AssertionError` / `ERR_ASSERTION` at `probe.mjs:116`, checking transport counters after closure. Baseline receipt was already serialized and saved. |
| Candidate navigation | **Not called.** This is not a candidate reader failure or regression. |
| Section extraction | **Zero calls.** No observed candidate selectors or section identifiers were available. |

The harness incorrectly required `transport.requests === 0` for an offline routed response. The actual metrics were **requests 1, mockedRequests 1, encodedBytes 0**. In the pinned native transport, `src/node-transport.ts:614` increments the total request counter before route resolution; `src/node-transport.ts:633` additionally increments the mocked counter. Therefore the total includes mocked requests and is not a wire-only count. Other closure checks succeeded: transport closed, active requests zero, session closed, tabs/pending loads/cleanup errors zero.

This was an error in this task's harness, not in the production reader. The original `probe.mjs`, assertion stack, result, streams and exit status are preserved unchanged. A future separately authorized attempt should check the native total/mock counter semantics correctly; this task does **not** alter and rerun the failed child or promote its exit to success.

## Capture, settings and containment

Original immutable input: `native-grid-spec-research-september11/response-1.body`, requested URL `https://www.w3.org/TR/css-grid-1/`, status 200, complete normalized original headers and **957,488 decoded bytes**. The sole baseline request was bodyless GET with credentials omitted. A harness-only request wrapper delegates to native `requestWithRoutes`, serving the identical captured bytes/headers/status/URL. Replay encoded bytes are zero; the original live **139,592 encoded bytes** remain historical evidence, not replay traffic.

The invocation retains `long-v1`, native semantic reader, capture body, heading outline, `separate-omitted-raw-v1` and 250 ms pacing. Original admission bounds remain unchanged: 4,000,000 response/capture/source code-unit ceilings as applicable, 2,000,000 reader text code units, 200,000 reader tokens, depth 128, 50,000 document/heading nodes, 256 heading entries, 256,000 extraction bytes; transport timeout 15 seconds, navigation timeout 20 seconds. No limits were raised.

The child inherited seccomp network denial (`NoNewPrivs: 1`, `Seccomp: 2`) plus JS network, subprocess, worker and native-addon/SafeJS denials. **Zero wire requests, zero guard attempts, zero process-guard attempts.** No socket self-probes, live sources, page scripts, credentials, alternative browsers or TTY execution occurred. Reader omission counts and section partialness cannot be measured without a successful reader result; they are not inferred from the fix or focused tests.

## Cleanup and preservation

Single process-group leader **2545243** ran from `12:04:05.551Z` to `12:04:05.712Z` UTC, exit **1**. Output was 1,066 bytes, stderr empty; no timeout, signal, output-cap breach, stream error or spawn error. The group was absent afterward. The outer policy was 30 seconds plus five-second grace, 6 MiB combined output/per-file caps, clean environment and non-TTY pipes.

Session/transport were closed with zero pending loads immediately, so no settlement sample was needed. No document was returned and no document-close hook was observed; no successful document inventory is claimed. All observed method descriptors were restored. Private HOME/TMPDIR remained empty and were removed.

Both build inventories and validation pins remain stable. All **28 original research receipt entries and 15 diagnostic receipt entries**, including the parent's separate file-only cleanup correction, remain unchanged. Nothing in this task rewrites that earlier failure or diagnosis. Independent file-only checks and new receipt ledgers verify these facts, not completed browser acceptance.

## Source-derived findings

**None.** No specification section was extracted. Track-list grammar, named areas/placement, `minmax`/`fr`, and track sizing remain unverified in this task. Prior knowledge is not substituted for native source evidence.

## Artifacts and pins

Replay lane: `node_modules/.cache/native-validation/native-grid-reader-omitted-list-replay-september11/`.
Compiled reference: `node_modules/.cache/native-validation/native-reader-omitted-list-compiled-september11/`.

| Artifact | SHA-256 |
| --- | --- |
| Original captured body | `53a47980a217f0b976e1ab8fa0b56944421f7e6311deef96a6aa591ddc693317` |
| `baseline.jsonl` | `aa1a3877015eab36c0babb4d0e230e0bba07068e21504075686e31da80dcc1ed` |
| Original executed `probe.mjs` | `7eee045f37a096ef0a70e286f32d5a917fb945c9f7746c7c501ff22b21804104` |
| Candidate source inventory | `f3fa19912f69ce0bd627278b57d6ba6bce930e329c789aeb7f073247464c91df` |
| Candidate compiled inventory | `d737c0d571b69ce5c6a1162757ff24c3d4bbde14c448983915f356848f9c09b9` |

Only the assigned new lane/reference/report are written. No source/test/TASKS or older evidence edits, commits, dependencies or integration-note changes. Candidate replay, normative section research, grid implementation and live MDN click acceptance remain outstanding.
