# Cached Selenium text-transform CSS check — September 12, 2026

## Result and scope

**PASS for the fixed cached CSS hypothesis only.** The single authorized native
HTML parse retained all six original statements. The three previously
unsupported `text-transform` declarations became accepted; raw and applicable
unsupported-property counts both changed **3 to 0**. No CSS was stripped or
rewritten, and the hypothesis was not adjusted after execution.

This was an offline observation of the existing captured public Selenium
fixture, not live navigation, a browser replay, geometry/painting validation,
or full-page acceptance. No additional hosts were attempted. The separate live
worker's authorization was not used. Main's geometry review and native release
gate remain separate evidence, not results of this cached check.

## Authorization and release

- Main's explicit execution message and
  `node_modules/.cache/native-validation/text-transform-work-september12/RELEASE.md`.
- Final gate: `native-text-transform-september12-round01`.
- Actual commit: `ae098bf77c19d626a8f54561da8bc3b496cbc308`.
- Verified existing gate: **14922 passed, 0 failed, 2 unchanged exclusions**;
  290 selected suites, 289 strict roots, 668 manifest entries. This gate was
  verified from its receipts, not rerun by the cached worker.
- 21 committed snapshot inputs: 20 scoped inputs plus `native-tests.json`.
- Complete inventories: **1176 source / 1992 compiled files**, unchanged before
  and after the cached parse. All 20 current gate receipt entries were checked.
- Actual Git capture outside kernel isolation: **24 objects** comprising the
  commit, root/src trees, and 21 blobs. Inside isolation, Git object IDs and
  commit/tree/blob linkage were checked without invoking Git.

Final commit-proof SHA256:
`3bc0b086c102f061d7debeb0a08e7bf97b4fc65933b81f9f47adb94c91f3d120`.
Audit SHA256:
`8495dae2a0ea8395d812d9f476ee5beedd37219e3016f432b14b3c13aa961614`.
Source inventory SHA256:
`aa918afbcb610944045f6ffbcb7247c7f56e5250cc37d9927aeac35659ac4d08`.
Compiled inventory SHA256:
`2f3a25e8ca090e4c83a1232cf60726a5779bbff760d1856a8649913c0da04895`.

## Unchanged capture and statements

Source: `node_modules/.cache/native-validation/native-selenium-simple-flow-september12/response-1.body`.
Size: **3123 bytes**. SHA256:
`97179c187a27e230036f15ee8615213366ebd1ec8cc93ac70ef8afb8737331f3`.
The source was hash-checked before and after the parse, without modifying or
rerunning the historical flow.

Comparison: `node_modules/.cache/native-validation/native-selenium-indent-css-diagnostic-september12/results/stdout.json`,
SHA256 `4007994851f8d49efede37eb5499e1c354343c9e1c62fd6407787fbe00f77eba`.
That historical observation used release
`0adb8759343ef83a2cca755903d13f33ee51447b` and reported three remaining issues.

| Reference | Original statement, unchanged | Current observation |
| --- | --- | --- |
| e17 | `visibility: hidden` | Accepted, no issues; unchanged |
| e136 | `text-indent:80%` | Accepted, no issues; unchanged |
| e156 | `width: 10px` | Accepted, no issues; unchanged |
| e186 | `text-transform: capitalize` | Accepted, no issues |
| e190 | `text-transform: lowercase` | Accepted, no issues |
| e194 | `text-transform: uppercase` | Accepted, no issues |

All six declarations had `important: false`. References, tags, owner kinds,
and statement strings matched the comparison observation exactly. There were
7 style owners, 121 CSS code units, and no scanner issues. Both issue maps were
empty objects, not suppressed diagnostics.

## Execution and verification

All times below are September 12, 2026 UTC.

- Release preparation: 17:29:10.044–17:29:10.200, exit 0.
- Isolated probe process: 17:29:16.771–17:29:16.992, exit 0, no signal/error.
- Native observation: 17:29:16.916–17:29:16.981; **one HTML parse**, zero new
  HTTP requests, zero layout attempts, and no image hydration.
- Independent read-only result verification under the isolation wrapper:
  17:29:24.240–17:29:24.332, exit 0, **zero additional page parses**.
- DOM: 197 nodes and revision 198, both stable. Selector cleanup reported
  closed, zero cached selectors and zero indexed nodes; last query work 817.
- Kernel receipts: Seccomp 2, NoNewPrivs 1, zero socket self-probes. The original
  wrapper denied socket/socketpair and related networking syscalls.
- Sanitized environments; private empty HOME/TMPDIR; stdin DEVNULL; 30-second
  process limits and 256 KiB output caps. Source/DOM/CSS/query/JSON bounds in
  `CONTRACT.md` were retained. No cap was raised.
- Captured observation: **1997 bytes**, stderr **0 bytes**. Script/wrapper
  hashes and private directory contents were unchanged across execution.
- One preparation attempt, one probe attempt, one result-verification attempt;
  all passed. No execution or preparation failure required a retry. All
  attempt logs and syntax-check logs remain in the lane.

Times are trace receipts only, not a performance claim. No SafeJS, providers,
credentials, devices, real TTY/PTY, alternate browser, or live network check was
used. Protected payloads were not accessed.

## Evidence and seal

Lane: `node_modules/.cache/native-validation/native-selenium-transform-css-diagnostic-september12/`.

- `RELEASE.json`, `PIN.json`, `actual-git/`: authorization and actual objects.
- `preparation/`, `dispatch-prepare/`: preserved release preparation receipts.
- `results/stdout.json`, `results/stderr.txt`, `results/PROCESS.json`,
  `results/SUMMARY.json`, `dispatch-run/`: single-probe observations and status.
- `verification/`: isolated read-only verification output and wrapper receipts.
- `FINAL-RECEIPTS.sha256`, `SEAL.json`: final lane/report seal. The sealing step
  includes every existing lane file and this report; only the ledger and seal
  themselves are excluded. The final seal audit is read-only, with no additional
  native parse and no post-seal artifact writes.

Observation SHA256:
`d3a55e3fc53596818fcef57af4c50f55753a3069327b0ac15df0aff01cfb89fd`.
Pin SHA256:
`89f83b5d343f939d60e4e1383fedea7b828fe30e4451043a681ddb25a1ded498`.
Read-only verification output SHA256:
`43f1afa114fc6c6c064527f4aa273e4f68c9d30eff8822451c38c4b755729c2f`.

## Changed paths and remaining limits

Only this new root report and the private lane changed. Since READY, the lane
adds `RELEASE.json`, `EXECUTION.md`, `dispatch.mjs`, `seal.mjs`, the pin, object
archive, release syntax logs, preparation/execution/verification receipts and
seal products; `common.mjs`, `prepare.mjs`, and `verify.mjs` were finalized
before execution. `CONTRACT.md`, `READY.md`, and the original syntax logs remain
unchanged preparation evidence. No source, tests, manifest, TASKS, Git metadata,
historical reports, or historical lanes were edited. No commit or push was made;
Main owns any eventual report commit.

CSS declaration acceptance does not establish correct transformed geometry,
painting, interaction, navigation, full-page rendering, or broader website
support. Those acceptance gates remain outside this check.
