# zlib CSS recovery: one isolated captured-response native replay

## Result and boundary

The single authorized replay completed on September 12, 2026. **The CSS recovery
hypothesis is confirmed, but the FAQ flow still fails.** The malformed trailing
CSS now produces one advisory `discarded-incomplete-css-rule`, replacing one
non-advisory `unimplemented-or-invalid-css-rule`. Independent center, table and
HTML presentation guards remain. This is not a working FAQ flow, live revisit,
new attempted host, production change, or authorization for another replay.

Only this report and the private lane
`node_modules/.cache/native-validation/native-zlib-css-replay-september12` are new.
No previous zlib evidence, sealed Lua evidence, production source, shared docs,
inventory, manifests or Git history were edited. No commit or push was made.
The historical eight-GET failure, later nine-GET capture, failed preparations and
their existing seals remain preserved. No other unfinished agent lane was read.

## Pinned runtime and evidence

- New release: `61ca9861fbecfcaaccba0730962799e4c16ef053`, **11952 passed, 0 failed,
  2 excluded**, 219 selected suites / 218 strict roots / 613 manifest entries.
  Runtime is exclusively `native-css-rule-recovery-september12-round01/snapshot01/dist`;
  Node is `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node` (22.22.0).
- All 20 release receipts, 1109 source and 1944 compiled entries, and seven
  commit-owned inputs were verified before replay and rechecked afterward.
  Source ledger SHA256: `b233012cf69936b17532e2e1eb05c67d68040a7e19140bcd0980fa471fc5fb5d`.
  Compiled ledger SHA256: `3ad037b3f204ad8c8fc4e30781dc5e4dfa8ad5348f89de1dae812c4610c6abee`.
- The completed original `native-zlib-budget-flow-september12` report and full
  first/final ledgers were verified, including exact membership, 156 original
  archived byte copies, predecessor ledgers, raw headers and nine gzip bodies.
  The original final ledger remains
  `6a421ec5068c3ad0e6e34449ea655943bdf0a4ac318c032530878062862facc2`.
  Its report remains
  `765a5ed61cf5eac2cbea2d9ab440e9c5677e56b6ea49adceb11dbb66842e8f4f`.
- This lane archives 86 exact byte copies of task/release/helper/original/release
  evidence. Original report JSON claims were independently reconstructed from
  saved results and cross-checked against original observations. The old probe
  and its subprocess-spawning verifier were **not** executed again.

## Separate original and replay measurements

| Measurement | Recorded live capture, 11784 / `ffc7b2e` | Isolated replay, 11952 / `61ca986` |
| --- | --- | --- |
| Child UTC, September 12, 2026 | 04:40:34.392–04:40:36.650 | 05:29:46.665–05:29:48.729 |
| Supervisor UTC | 04:40:34.277–04:40:36.662 | 05:29:46.552–05:29:48.748 |
| Wire GETs / mocks | 9 / 0 | 0 / 9 |
| Actual wire encoded bytes | 51535 | 0 |
| Decoded response bytes | 74133 | 74133 |
| Initial navigations / clicks / commits | 1 / 1 / 1 | 1 / 1 / 1 |
| Native FAQ outcome | unsupported formatting profile | same unsupported formatting profile |

All nine exact archived decoded response buffers were returned with their
original normalized headers. Each decoded body was checked against decompression
of its archived gzip wire body; hashes, lengths, raw header arrays and original
metadata agree. The root body is 32006 decoded bytes, SHA256
`a2654af9cc15e4943a11c8aa27ce378f7293230d2953f18609fca7485b9423a5`.
The eight PNG resources account for the remaining 42127 decoded bytes. Original
gzip accounting is not presented as new network traffic. Raw HTTP header
observations are not packet captures. Exact per-response sizes, hashes and
source paths are retained in `PREFLIGHT.json` and `archive/response-*` / `wire-*`.

Nine bodyless native GET attempts were fulfilled locally. There were no replay
misses, destination requests, local image rejections or underlying wire calls.
All eight successive mock intervals exceeded 250ms; the minimum was
250.827588ms. The adapter rechecked monotonic deadlines after every sleep.

## Native discovery, census and source attribution

The current native DOM contains 109 anchors. The first 96 were inspected for
current computed visibility, native actionability, ARIA and ancestor availability
**before** URL deduplication: 9 eligible occurrences, 5 destinations. The available
FAQ was discovered at index 17, current reference `e228`, href `zlib_faq.html`,
with three eligible occurrences. Those are observations, not hardcoded replay
selectors. The only genuine native click failed with:

> Document width resolution requires an issue-free supported formatting profile

The discovered FAQ destination is absent from the capture. The guard stopped
before its request; there was no forced navigation or fabricated destination.
An uncaptured request would stop as `replay-miss`, not count as success.

One bounded explicit post-failure formatting census retained authoritative
`styles.metrics().issues` and `styles.metrics().applicableIssues`, actual deferred
records and their computed styles. Read-only geometry also remained unsupported.

| Diagnostic | Original raw / applicable / formatting | New raw / applicable / formatting | New advisory status |
| --- | --- | --- | --- |
| `unimplemented-or-invalid-css-rule` | 1 / 1 / 1 | 0 / 0 / 0 | non-advisory code, absent |
| `discarded-incomplete-css-rule` | 0 / 0 / 0 | 1 / 1 / 1 | advisory |

The single actual native style element (`e11`) has **76 code units / 76 UTF-8
bytes**, SHA256
`e8ac137f7bb4a21a549ea940b9b42531b85d4e2d8f466d8e6045118b2bda6ea8`.
Its complete text is retained in `new11952/inline-style-0.css`. This is whole
native style-element source attribution, **not** a guessed per-rule substring
or an invented diagnostic span. It preserves the corrected-attribution standard
without changing any sealed Lua record. Native CSS metrics still report one
rule, one declaration and 76 code units. The changed diagnostic was measured
in this run, not assumed from the source-only hypothesis.

Non-CSS issues remain exactly: 9 `html-presentation-hint-not-supported`,
1 `element-layout-not-supported`, 1 `html-table-presentation-hint-not-supported`,
1 `display-layout-not-supported`. All remain non-advisory. Two actual deferred
subtrees remain: center `e68` (element-layout) and table `e1135` (display-layout).
The table retains its `width="100%"` attribute, computed width `auto`, separate
border collapse and `2px 2px` spacing. This report makes no sole-cause claim.

Native census metrics match the original: 1149 visited DOM nodes, 1283 boxes,
30 outside markers, 13076 text code units, 23635 work, 2 deferred subtrees;
1253 formatting nodes. The advisory change is a narrow CSS diagnostic improvement,
not evidence that the remaining layout or presentation guards work.

## Preservation, limits and cleanup

- Viewport 1280×720; scripting disabled; original HTML/CSS/image bytes and native
  loader resource policy unchanged. All 73 image states are complete and equal
  to the original, backed by eight resource requests; no external CSS requests.
- Original network bounds: 15s timeout, 2MiB/response, 1 request-body byte,
  16KiB headers, 5 redirects, concurrency 1, 32 requests, 8MiB total decoded
  budget. Session: 1 tab, 2 navigation capacity, 1 pending navigation, 20s timeout.
  Actual scope is narrower: one initial navigation and at most one click.
- Document limits: 50000 nodes, depth 256, 2000000 text code units, 1024 changes.
  CSS: 524288 code units, 8192 rules, 16384 declarations, 5000000 work, 32 sheets.
  Formatting: 50000 owned nodes, 50000 boxes, depth 256, 1000000 text code units,
  2000000 work. No capacity was raised and no source was stripped.
- Text observation cap remains 12000 code units. The native document-root
  observation exactly equals the original. No structured extraction was invoked
  in either flow. The original has no saved full native serialization or matching
  body-text observation, so equality for those historical outputs is not claimed.
- Current native serialization is unchanged before/after the click: 32273 bytes,
  SHA256 `37e0a47fb0ed2d6bf7ebc0d04f2fa8469e8f7e78e100a792bcfb5c3b0f527162`.
  It is stored as `new11952/native-dom.html`. Title remains `zlib Home Site`, root
  `e1`, 1170 nodes, revision 1179. History remains index 0 / length 1, key `h1-1`,
  29 retained bytes, no evictions, same document throughout.
- Actual document/image/event/control owners were observed immediately and finally
  after close: retained nodes/resources/listeners/files/pending work zero; owners
  closed. Session and transport closed and idle; no cleanup errors. No cookie was
  accepted. Uninstrumented ownership is not claimed proved.
- Strict kernel socket **and socketpair** denial plus JS network/process/runtime
  guards remained active. No HTTP, alternate browser, real SafeJS, credentials,
  device, TTY/PTY, challenge bypass or protected source-heading payload access.
  No active socket self-probe was used. Private 0700 HOME/TMP stayed empty;
  explicit environment, DEVNULL stdin, no TTY; 45s wall + 5s termination grace,
  6MiB/file and combined output, 16MiB lane, minimum 64MiB free were enforced.
- Seven strict preflight checks passed. The one native child exited 1 for the
  recorded flow failure, with 124288 stdout bytes, zero stderr, no timeout,
  truncation, signals or remaining process group. This was not rerun.

## Read-only verification and exact Git format

From the repository root, the complete read-only entrypoint is:

```sh
env -i PATH=/usr/bin:/bin LANG=C LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B \
  node_modules/.cache/native-validation/native-zlib-css-replay-september12/verify.py
```

It first checks **eight actual local Git stdout outputs** outside the
socket-denied Node child, then executes `offline.py verify` under the unchanged
strict kernel/JS policy. The child performs 17 read-only assertion groups,
including full ledger membership, before/after runtime hashes, archived evidence,
counts and actual records, original/new report claims, and no artifact mutation.
It cannot import the page/session/transport/loader runtime or spawn Git. No page
session, native replay, network operation, rebuild or suite rerun occurs.

Exact Git commands use executable `/usr/bin/git`, repository-root cwd, ignored
stdin, and the following argv (each stdout is compared as raw bytes):

```text
ls-tree -r -z 61ca9861fbecfcaaccba0730962799e4c16ef053
show 61ca9861fbecfcaaccba0730962799e4c16ef053:native-tests.json
show 61ca9861fbecfcaaccba0730962799e4c16ef053:src/css-imports.ts
show 61ca9861fbecfcaaccba0730962799e4c16ef053:src/css-parser.ts
show 61ca9861fbecfcaaccba0730962799e4c16ef053:src/css-recovery-layout.test.ts
show 61ca9861fbecfcaaccba0730962799e4c16ef053:src/css-rule-recovery-fallback.test.ts
show 61ca9861fbecfcaaccba0730962799e4c16ef053:src/css-stylesheet-recovery.test.ts
show 61ca9861fbecfcaaccba0730962799e4c16ef053:src/formatting-tree.ts
```

The tree output is NUL-delimited, unmodified Git `ls-tree` output in
`archive/git-tree.stdout`; seven raw blobs are `archive/git-input-0.blob` through
`archive/git-input-6.blob` in the order above. `GIT-COMMANDS.json` records each
`executable`, `args`, `cwd`, explicit `environment`, `stdin`, `exitCode`, `target`,
`bytes`, and SHA256, plus seven `inputProof` records. Every source file's Git blob
SHA1 is also checked against the saved tree; seven blobs are byte-equal to the
released snapshot. There is no lossy line-based or digest-only replacement for
the actual Git stdout, no dependence on current HEAD, and no nested Node IPC.

Git's exact environment is PATH `/usr/bin:/bin`, LANG/LC_ALL `C`, TZ `UTC`, HOME
and TMPDIR set to this lane's private `home` and `tmp`, `GIT_CONFIG_NOSYSTEM=1`,
`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_OPTIONAL_LOCKS=0`, with no other inherited
variables. The read-only parent emits a JSON `gitPreverification` object containing
`passed`, `readOnly`, `actualOutputs`, `elapsedSeconds`, and eight `outputs` records
(`command`, `archive`, `bytes`, `sha256`, `equal`), followed by the strict child
verification and supervisor JSON. Fresh Git checking does not start another page.

`COMPARISON.json` retains original/new measurements and actual bounded deferred
records. `ARTIFACTS.json`, `RECEIPTS.sha256`, `SEAL.json`, and
`FINAL-RECEIPTS.sha256` bind the full report and lane, including executed helper
pins, invocation/exit/progress records, original copies and report claims. The
first ledger excludes itself, seal and final ledger; the final excludes only
itself. The verifier checks exact roster membership rather than hashes alone.

## Machine-checked report claims

```json
{
  "runtime": 11952,
  "commit": "61ca9861fbecfcaaccba0730962799e4c16ef053",
  "originalRuntime": 11784,
  "replayStartedAt": "2026-09-12T05:29:46.665Z",
  "replayFinishedAt": "2026-09-12T05:29:48.729Z",
  "navigationCalls": 1,
  "clickCalls": 1,
  "commits": 1,
  "mockResponses": 9,
  "newWireRequests": 0,
  "originalEncodedBytes": 51535,
  "replayEncodedBytes": 0,
  "decodedBytes": 74133,
  "discardedRaw": 1,
  "discardedApplicable": 1,
  "discardedAdvisory": true,
  "invalidRaw": 0,
  "deferredSubtrees": 2,
  "flowPassed": false,
  "classification": "native-click-guard",
  "actualGitOutputs": 8,
  "commitOwnedInputs": 7
}
```
