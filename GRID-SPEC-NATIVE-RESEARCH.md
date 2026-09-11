# Native W3C Grid research — September 11, 2026

**Primary response captured; native reader failed. Research stopped.** No grid specification sections were extracted and no normative findings are claimed.

## Actual outcome

The sole source was `https://www.w3.org/TR/css-grid-1/`, reached through the immutable repository's compiled `research-browser.js` CLI. Exactly one bodyless, credentials-omitted GET returned **HTTP 200**, without redirects. No CSS, images, scripts, external links, retries or alternative clients were requested.

- Native interval: `2026-09-11T11:33:54.031Z`–`2026-09-11T11:33:54.127Z` (96 ms).
- Original response: **957,488 decoded bytes**, **139,592 encoded bytes**, Brotli; original transport-decoded body and full normalized transport headers retained separately.
- Exact native outcome: `outcome: "failure"`, `contentSuccess: false`, `partial: true`; `failure: { category: "unsupported", stage: "loader" }`.
- No classified challenge was reported (`classification.barrier: null`). That does not establish readable semantic content: loading failed before a heading outline or extraction was emitted.
- CLI exit **1**. No heading selectors were available; **zero offline section extractions** were attempted. The four-section allowance was not used after reader failure.

The CLI receipt does not expose the underlying loader exception message or failing HTML construct. Attribution beyond the recorded category/stage would be speculation. No raw-HTML substitute extraction, replay diagnosis, cap increase or further live request was used to overcome the failure.

## Source-derived findings

**None.** Track-list grammar, named areas and placement, `minmax`/`fr`, and track-sizing sections remain unverified through this browser. Prior knowledge is not presented as evidence from this capture. No section identifiers or algorithms are inferred from unextracted content.

## Method and immutable inputs

Artifact lane: `node_modules/.cache/native-validation/native-grid-spec-research-september11/`.

- Adapted the existing quantization one-source native research pattern. Exact prompt, method, invocation, request audit, response, streams and integrity records are retained in that lane.
- Before the live child, verified `native-compound-availability-september11-round01`: **6,786 native passes, zero failures, one documented skipped assertion**, 112 manifest-listed suites and 111 strict roots. The strict-only omission is `src/snapshot.test.ts`; the skipped assertion is the existing total-host-object-ceiling case in `src/focus-provisioning-pressure.test.ts`. No test suite was rerun or exclusion promoted to a pass.
- All **1,006 source / 1,788 compiled files** matched stable pre/post reference inventories before and after execution. Node `v22.22.0`, validation records and compiled CLI/replay hashes are pinned in `live-PREFLIGHT.json` and `live-INTEGRITY.json`.
- Explicit `long-v1`, `--reader`, `--capture-body`, `--headings`, and `--reader-raw-policy separate-omitted-raw-v1`; this is semantic-reader mode, **not CSS layout acceptance**.
- Unchanged long-v1 transport bounds: 15-second timeout, 4,000,000 response/capture bytes, 16,384 header bytes, 8,000,000 total bytes, concurrency one; native navigation timeout 20 seconds and pacing 250 ms. The harness restricts the configured request ceiling to one request. Manual redirects stop even same-origin redirects rather than making a second GET. Native public-address checks remain intact.
- Clean environment, private empty HOME/TMPDIR, non-TTY pipes, 30-second outer deadline plus five-second grace, hard **6 MiB** file and combined-output caps, no core files. Fetch alternatives, child processes, workers and native-addon/SafeJS execution were guarded in the live child; guard attempts were zero. An offline seccomp launcher was prepared but never invoked, so no offline execution or denial test is claimed.

## Preservation and cleanup

One earlier **local preflight** stopped before any child or request because the independently owned integration notes changed concurrently. It also exposed a shell limit-setting-order error. Both are preserved in `PREFLIGHT-INTERRUPTION.md`; corrected preparation did not retry a network request or change a cap. The immutable browser-validation gate remained intact. This task did not edit `MDN-GRID-INTEGRATION.md`; its observed hash was stable across the actual child run, and the earlier external change was not reverted.

Child process-group leader `2517444` ran from `11:33:53.953Z` to `11:33:54.141Z` UTC and exited 1; its group was absent afterward. Combined output was 1,278,824 bytes, stderr empty, with no timeout, output overflow, stream error or spawn error. Native transport reports **one request, zero redirects, zero active requests, closed true**. Private HOME/TMPDIR stayed empty and were removed.

Artifact-only verification checks receipt/body/header agreement, immutable inventories, exact failure/stop behavior, request counts and cleanup. `VERIFICATION.json` and `RECEIPTS.sha256` record the checks and artifact hashes. These checks verify evidence integrity, not successful research or browser compatibility.

| Retained artifact | SHA-256 |
| --- | --- |
| `response-1.body` | `53a47980a217f0b976e1ab8fa0b56944421f7e6311deef96a6aa591ddc693317` |
| `response-1.headers.json` | `ed53d9c111228df3b018ebfd5fc74ba07b1b478f10b97f0c14bd5a73537db8f8` |
| `live.jsonl` | `755b5c7109beb61f23e7e18592d5c769e9f131dd5a070307e145a6fa49321758` |
| `live-before-source.sha256` | `af1e5f3a54527f3502a4ca11fb4824dc5c5d925bf3c9be00d9604a5563df0205` |
| `live-before-compiled.sha256` | `af0e0b8e081be312f733c136bdafde8deaa289a02f8c02202c2b49fa0bd2a4bb` |

Writes are confined to the new lane and this report. No source/test/TASKS edits, commits, credentials, page-script execution, SafeJS, alternate browsers, TTY probes or protected-fixture modifications occurred. CSS Grid conformance, correct grid implementation, native MDN click success and broader specification research remain outstanding.
