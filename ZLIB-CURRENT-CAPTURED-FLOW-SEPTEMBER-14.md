# Current native zlib captured flow — September 14, 2026

## Outcome and scope

**One bounded offline check completed and its evidence verification passed. The
documentation-link flow did not reach acceptance: the intentionally incomplete
historical corpus lacks `https://www.zlib.net/madler-email.png`. This is a
capture/resource-allowance limitation, not evidence of a browser compatibility
regression.** No live fallback, synthetic image, enlarged corpus, retry or direct
destination-navigation substitute was used.

The current native browser consumed the eight original captured responses once
each, then the ninth adapter entry was denied before transport. Initial loading
aborted before any document commit, anchor discovery or click. HTTP 200 and
successful offline response delivery do not establish working-site acceptance.

- Child UTC: `2026-09-14T14:09:12.503Z`–`2026-09-14T14:09:12.593Z`.
- Supervisor UTC: `2026-09-14T14:09:12.352Z`–`2026-09-14T14:09:12.608Z`
  (256 ms); child/supervisor flow exit 1; no signal, spawn error, timeout,
  output-cap breach or integrity/cleanup error.
- Independent verification: exit 0 at `2026-09-14T14:09:23.120Z`;
  `observationComplete: true`, `siteAccepted: false`.
- Initial navigation calls: 1; native commits: 0; inspected anchors: 0;
  explicit selector queries: 0; genuine clicks: 0.
- Adapter attempts: 9; native transport requests: 8, all captured route
  fulfillments (`mockedRequests: 8`); replay decoded bytes: 72,703;
  replay encoded bytes: 0; redirects: 0; wire requests: 0.
- First blocker: `AssertionError`, `ERR_ASSERTION`, stage
  `initial-navigation`, message `Uncaptured request denied before transport`.
  The later outer `AgentBrowserError` (`aborted`, `Navigation aborted`) is
  separately retained and does not replace that first blocker.

## Authority and immutable runtime

Authority and assigned scope were read before preparation from
`/dev/shm/agent-browser-multisite-september14/AUTHORITY.md` and adjacent
`ZLIB-TASK.md`. The parent subsequently confirmed the eight-response corpus is
intentionally incomplete and must not be presented as a browser regression.

- Runtime commit: `39b55d996feb7af5320e3a1d575821743477b475`.
- Runtime: `/dev/shm/agent-browser-opacity-september14/release01/snapshot/dist/`.
- Current HEAD: `cc2466ce6ce6fa4707c0cede7adef65cab4f09bf`; its differences
  from the runtime commit are only three Markdown documents.
- Gate audit SHA-256:
  `735a820574fdffa0af4d0ecf8ded759f2a4c955aa37fe2550e518f441e766de5`.
- Full source and compiled inventories were rehashed at preparation, before and
  after the one execution, and independent verification: 2,925 source files and
  2,200 compiled files, exact membership and hashes unchanged.
- Source ledger SHA-256:
  `d83227bad54ecaa20c738be4a899a1ca63f19049b6f3cb991ec5b283d6ef23cf`.
- Compiled ledger SHA-256:
  `7bdeceba8cde54c2387f38c2527e3f3548019c1e13aab4c5c2aeba707bcf5bd9`.
- Completed gate receipts and post-commit adoption were verified, not rerun:
  23,757 passed, zero failed, two unchanged exclusions, 477 selected files and
  476 strict roots. These are the earlier gate's measurements, not a new gate
  execution or live-site acceptance.

No old runtime or dirty root source was imported. Node v22.22.0 executable
SHA-256 is `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
Security executables and the reference harness were pinned and rechecked.

## Original captured evidence

Historical report `ZLIB-NATIVE-FLOW.md` and original receipts were read before
interpreting captured content. The original lane remains unchanged at
`/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-zlib-flow-september12/`.
Its first live attempt on September 12 stopped at the eight-GET allowance;
that historical result and its paths/measurements have not been rewritten.

Both original receipt ledgers were verified in full (150 and 152 entries).
Original response metadata, raw ordered header pairs, encoded payloads and
decoded bodies were cross-checked for exact lengths and SHA-256; decoding was
independently reconstructed without parsing page content outside the native
browser. All eight recorded statuses are 200. Replay preserved status,
ordered header entries and exact decoded bytes. Original compressed-content
headers were not rewritten; transport accounting correctly records already
decoded captured route bodies as zero newly encoded bytes.

| Original ID | Captured URL path on `https://www.zlib.net` | Encoded / decoded bytes |
| --- | --- | --- |
| 1 | `/` | 9,230 / 32,006 |
| 2 | `/images/zlib3d-b1.png` | 21,373 / 21,350 |
| 3 | `/images/zlib_ddj.png` | 17,250 / 17,227 |
| 4 | `/zlib-email.png` | 942 / 919 |
| 5 | `/images/li_blue.png` | 322 / 302 |
| 6 | `/images/li_green.png` | 325 / 302 |
| 7 | `/images/li_red.png` | 322 / 302 |
| 8 | `/images/li_yellow.png` | 318 / 295 |

The uncaptured ninth entry `/madler-email.png` had zero route calls, no
transport entry and no fabricated response. Original `RECEIPTS.sha256` digest:
`42e9652852f8b5d46354df2b1515b9985607589287e6f208b6de14d1b57dc6e8`;
original `FINAL-RECEIPTS.sha256` digest:
`9b9ab4289d958542aab47e528cb0539992280cd1844ea0309241d1b226c602f0`.

## Containment and cleanup

The completed CERN header-retest supervisor/native harness was adapted into the
new private RAM lane. Its network guard and kernel wrapper were copied exactly;
the corrected ordered-header comparison and bounded owner cleanup were retained.
One-use supervisor and workload locks record the sole execution. Self-preflight
checked nine JavaScript modules and Python wrapper syntax without browser loading.

Kernel seccomp mode 2 and `NoNewPrivs: 1`, JS network guards and child-process/
worker/addon guards were active. Network guard attempts: 0; child process guard
attempts: 0; script attempts: 0. No SafeJS, other browser/parser, credentials,
providers, passkeys, devices, socket probe, real TTY/PTY or new assets were used.
The child received a sanitized environment, empty private HOME/TMP and pipe-only
stdio. Limits remained 30 seconds plus five seconds supervisor grace, 6 MiB
combined output, one second native-owner settlement, eight accepted responses,
one terminal denial, one initial navigation and at most one genuine native click
if reached. Discovery caps were 96 inspected anchors and three explicit queries.

Captured stdout was 16,891 bytes; stderr empty. GNU time recorded 0.25 seconds
elapsed and maximum RSS 116,564 KiB for the wrapped child, not a site benchmark.
Native cleanup settled in two samples / 1.244123 ms, with counters unchanged
during settlement. The session, transport, queue and cookie owner closed; tabs,
pending loads, active requests and cookies were zero. One actual document owner
and one configured image owner were sampled: document nodes, image resources,
active/queued work, waiters and retained decoded bytes were zero. The image owner
counted eight image attempts, including the missing image; this is not eight
successful image responses. Query owners were not reached, so their empty sample
does not prove query/event/control-owner coverage.

Private HOME/TMP remained empty and were removed. Process group `1663559` was
absent at supervisor close and independent verification; no matching workload
process remained. Flow failure and successful evidence/cleanup verification are
deliberately separate outcomes.

## Preservation, limitations and handoff

The only repository addition is this report. Verification preserved all 735
pre-existing modified/untracked files in its inventory and the Git index;
five untracked `cache/` paths were explicitly excluded from that dirty-work
inventory. Original capture receipts and immutable runtime were independently
checked in full. No source/shared-document edits, commits or pushes were made.

The first preparation heredoc could not allocate its disk-backed temporary file;
it created no harness files and launched no browser. Subsequent preparation
temporary files were confined to the new RAM lane. This preparation issue was
not a browser failure or an extra check.

No committed page title/body/history, anchor actionability, destination content,
formatting inspection, cached style diagnostic or raster was observed. Those
gates remain unproved, not passed or zero-defect. No CSS or other compatibility
cause is inferred from this missing-fixture stop. There was no live validation.

RAM evidence: `/dev/shm/agent-browser-zlib-current-september14/`.
Key files: `PROCEDURE.md`, `PREFLIGHT.json`, `PINS.json`, `CORPUS.json`,
`before-RESULT.json`, `FIRST-BLOCKER.json`, `before-EXECUTION.json`,
`before-CLEANUP.json`, `before-INTEGRITY.json`, `VERIFICATION.json`,
`WORKTREE-BEFORE.json`, preparation/execution/verification streams, native
harness and guards. Outputs close before final `SEAL.json` and
`EVIDENCE.sha256` creation; the lane is retained in RAM for parent persistence,
without archives. The final seal includes this report and exact lane membership.

- `before-RESULT.json` SHA-256:
  `4f1d8186a2a9cef030affb5101bf57fbf4f6cdcece25199d4e6697edfed002ed`.
- `FIRST-BLOCKER.json` SHA-256:
  `b9e8602b740bd306360fee7a0b2c3278589b8b256d9eef1a3e9de702dcc0bd8a`.
- `before.jsonl` SHA-256:
  `7fa1c964c1b6ac5d775897aae9676cbaebeb2b8a951e3f35e1ade62526e416b6`.

Read-only seal verification (no browser execution):

```sh
sha256sum -c /dev/shm/agent-browser-zlib-current-september14/EVIDENCE.sha256
```

### Final handoff addendum

The first seal precheck stopped before creating a seal because the parent-owned
`HN-CURRENT-CAPTURED-DIAGNOSTICS-SEPTEMBER-14.md` changed after the successful
14:09:23 UTC verification (5,613 to 6,154 bytes). The parent subsequently
confirmed completion of its HN observation and persistence. This worker neither
edited nor reverted that report. The first seal script and failure receipt remain
in the RAM lane; final sealing explicitly records this concurrent parent-document
change while requiring all other inventoried files and the index to remain
unchanged. The earlier verification's preservation measurement remains accurate
for its recorded time. No browser check was rerun, and the fixture-limit outcome
is unchanged.
