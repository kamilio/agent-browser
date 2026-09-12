# Fresh native Python documentation initial load — September 12, 2026

## Result: stopped before document commit

At **2026-09-12T19:19:31.654Z**, the original native image owner exposed three broken image references (`e103`, `e283`, `e759`) for `https://docs.python.org/3/_static/py.svg`, each with **`error: unsupported`**. The single fresh load stopped at `original-loader-return-before-commit`; no document committed, and no title/body/committed identity, formatting inspection, or used-layout attempt was reached. Exactly **1 navigation, 0 commits, 0 clicks, 0 formatting calls, 0 used-layout calls**.

The archived failure wrapper is `AgentBrowserError`, code `resource-limit`, stage `initial-navigation:resource-error`. That generic code was emitted by the harness stop adapter for an exposed image error; it is **not a native capacity-exhaustion finding**. The concrete native observation is `unsupported`. Global image failure was null and the sampled stylesheet-resource-error filter was empty. Full CSS issue counts and geometry are unobserved, not zero. No post-failure page analysis, modification, substitute resource, availability override, retry, or second navigation occurred.

Observation boundary: the first error snapshot was taken when the original loader returned. This is not instrumentation of the exact instant each image became unsupported. Subsequent native CSS fetches before that snapshot are retained, not hidden. No request or analysis stage followed the observed stop; only bounded owner cleanup and offline evidence verification followed.

## Fresh captures and request accounting

**8 native adapter admissions / 8 native transport requests / 8 wire requests / 8 HTTP 200 responses**, zero redirects, mocks, or rejected adapter calls. Encoded payload total **16924 bytes**; decoded payload total **72064 bytes**. Wire measurements are original native HTTP instrumentation, not TCP/TLS packet capture.

| Request | Original-loader URL | Role | HTTP | Encoded bytes | Decoded bytes |
| --- | --- | --- | --- | --- | --- |
| 1 | `https://docs.python.org/3/` | document | 200 | 4012 | 19434 |
| 2 | `https://docs.python.org/3/_static/pygments.css?v=b86133f3` | stylesheet | 200 | 1021 | 4848 |
| 3 | `https://docs.python.org/3/_static/py.svg` | image | 200 | 936 | 2041 |
| 4 | `https://docs.python.org/3/_static/classic.css?v=234b1a7c` | stylesheet | 200 | 1339 | 5290 |
| 5 | `https://docs.python.org/3/_static/basic.css` | stylesheet | 200 | 3390 | 14685 |
| 6 | `https://docs.python.org/3/_static/pydoctheme.css?v=4365c8fe` | stylesheet | 200 | 4021 | 17045 |
| 7 | `https://docs.python.org/3/_static/pygments_dark.css?v=0fc419ee` | stylesheet | 200 | 1029 | 5055 |
| 8 | `https://docs.python.org/3/_static/pydoctheme_dark.css` | stylesheet | 200 | 1176 | 3666 |

`basic.css` was actually requested and captured as request **5**, HTTP 200, **3390 encoded / 14685 decoded bytes**. Its decoded body is `response-5.body` with SHA-256 `656ff1bacd6f260fc7d71b97f9c2f1fcbf692dc84bf469cd952034efcb9eefed`. Original native stylesheet/import provenance and policy receipts are retained. This is a new current-response corpus; nothing was mixed into the historical seven-response capture or its incomplete replay.

## Runtime, limits, and isolation

- Pinned committed runtime **`5164b28a6480c2748a18534ac7799ad0e215bfd1`**, in-place `native-empty-image-september12-round02/snapshot01/dist`; Node **22.22.0**. No rebuild, current working-tree imports, or uncommitted spacing code.
- Before/after verification: **13 committed inputs / 16 actual Git objects**, **1181 source / 1992 compiled files**, **20 gate receipts**. Existing native gate **15421 passed / 0 failed / 2 exclusions** was verified, not rerun. Git used only local readonly object retrieval outside the kernel seal.
- Retained caps: **32 bodyless HTTPS GETs, 1 concurrent, 250ms minimum spacing, 2MiB/response, 8MiB encoded and decoded totals, 45s + 5s grace, 6MiB artifact/output, 16MiB lane, 64MiB free**. All eight observed wire starts satisfy the spacing and concurrency guards. Original bounded native queue has maximum pending **128**.
- Only `docs.python.org` was contacted. Original native DNS/public-address policy and TLS checks remain in place; eight authorized TLS connections were observed. `AgentBrowser/0.1`, fresh empty cookie jar, omitted credentials, no credential headers, no script/SafeJS execution or alternate client.
- Original native loader, stylesheet/import owner, image owner, transport, and request queue were retained. Private sanitized HOME/TMPDIR are under this owned `/home` lane; non-TTY input/output. Live seccomp prevents listening and tracing, **not outbound sockets**; outbound scope is enforced by the original native policy and exact-origin guard. Offline syntax/preflight/verification run with kernel socket/socketpair denial. No socket self-probe.

## Lifecycle and evidence

Supervisor UTC: **2026-09-12T19:19:29.476Z–2026-09-12T19:19:31.928Z**, elapsed **2.451032s**, child exit **1** from the preserved stop. No timeout, termination signal, output truncation, or stderr; child stdout **72069 bytes**.

Immediate cleanup retained one pending load. The single existing 50ms settlement sample took **50.601120ms**. Final nodes, tabs, pending loads, active transport, active/pending queue, cookies, storage entries, pending storage events, and cleanup errors are zero. One instrumented document, image owner, event owner, and control owner are closed with cleared resources. Process group **44441** is absent; private HOME/TMPDIR are empty.

Evidence lane: `node_modules/.cache/native-validation/native-python-fresh-initial-september12`. Key receipts: `RELEASE-MESSAGE.md`, `ADAPTATION.json`, `PREFLIGHT.json`, `GIT-COMMANDS.json`, `GIT-AFTER-COMMANDS.json`, `live/INVOCATION.json`, `live/EXECUTION.json`, `live/stdout.json`, `progress.jsonl`, all `wire-*` and `response-*` captures, `VERIFICATION.json`, `RESULT.json`, `SEAL.json`, and `FINAL-RECEIPTS.sha256`.

Readonly verifier: `node_modules/.cache/native-validation/native-python-fresh-initial-september12/verify.mjs`, invoked through that lane's `offline.py verify` supervisor with sanitized private HOME/TMPDIR, pinned Node, and socket-denying `sealed-exec.py`. It checks the actual stop rather than a success-only Selenium flow; final receipts include this report and all other lane files except the ledger itself. Verification success means evidence integrity, **not website, formatting, geometry, or interaction acceptance**.

Historical Selenium sealed lanes/reports and the modern Python replay/report remain byte-identical against their pinned receipts. Old evidence, source, tests, manifest, TASKS, Git state, and others' lanes were not edited. Main independently verifies and handles any documentation commit. Any further live run or focused resource/layout investigation requires separate authorization.
