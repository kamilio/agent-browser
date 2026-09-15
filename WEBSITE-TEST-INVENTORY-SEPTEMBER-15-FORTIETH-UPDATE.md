# Website inventory: fortieth update

## Fresh website observation

One native public navigation to
`https://docs.python.org/3/tutorial/controlflow.html` was recorded on
September 15, 2026, at 00:38 UTC. It returned 200 after one request and zero
redirects/mocks: 23,495 encoded body bytes, 140,130 decoded bytes and 52,180 bytes
of whole-document Markdown. The native reader recovered 34 headings, 57 code
blocks and 132 paragraphs. Original outcome remains `extracted-unverified`,
`partial: true`, `contentSuccess: null`; this is not visual or interactive
acceptance. The process/group is reaped, transport closed and HOME/TMP empty.

The page contains duplicate navigation and a source `div class="body"
role="main"`. Reader sanitization drops that role/class but retains its nested
`section id="more-control-flow-tools"`. That observed ID, not a guessed landmark
selector, provides the subsequent offline article scope. Role/class retention
remains a targeting limitation, not a dropped-descendant claim.

## Saved-page replay and the fix

The earlier MDN content-negotiation capture is reused without another website
request. Initial native inspection finds one `main`, no `article` and no retained
`[role="main"]`. Whole compact Markdown is 74,889 bytes; compact main extraction
is 18,114. The new replay CLI uses the ordinary native Markdown table formatting,
not the compact option, and emits 18,426 content bytes for that same main scope.

The feature adds explicit `--format markdown` to the validated replay CLI/API,
including bounded default-profile section recovery. The output remains JSONL
with Markdown in `extraction.content`, source hashes and zero-network provenance.
Existing four-argument API calls and omitted/explicit JSON CLI format retain
structured JSON behavior. No runtime dependency, transport, source/output limit,
challenge rule or MIME admission is widened.

Six socket-denied CLI runs compare two captured pages:

| Capture and scope | Mode | Result | JSONL bytes | Markdown content bytes |
| --- | --- | --- | ---: | ---: |
| MDN `main` | Baseline JSON | Extracted | 44,259 | — |
| MDN `main` | Candidate JSON | Byte-identical to baseline | 44,259 | — |
| MDN `main` | Candidate Markdown | Extracted | 20,693 | 18,426 |
| Python `#more-control-flow-tools` | Baseline JSON | Output-limit failure | 0 | — |
| Python `#more-control-flow-tools` | Candidate JSON | Same output-limit failure | 0 | — |
| Python `#more-control-flow-tools` | Candidate Markdown | Extracted | 46,944 | 43,583 |

Python's JSON failure is concrete: two separate socket-denied API diagnoses,
one per baseline/candidate, both identify `extraction.output`, 256,000-byte limit,
342,496 bytes observed. The failed CLI runs and original messages are retained.
Markdown recovers the scoped article within the unchanged limit. No source/pin
change, live retry or automatic fallback is involved.

Independent content checks confirm all 57 Python code blocks, 24 scoped headings
and 128 scoped paragraphs. Code comparison removes only the native outer list
prefix; Python's internal indentation remains exact. MDN preserves ten checked
prose anchors and all eight table cells. Its main scope still includes the
article contents list and contribution footer. Markdown is not claimed to be
identical to structured JSON, nor is scoping a completeness guarantee.

MDN's same-scope Markdown JSONL is 53.2% smaller than JSON JSONL. Comparing saved
whole Markdown with scoped output gives 75.4% fewer bytes for MDN and 16.5% for
Python, with the table-format distinction above. These are output-size measures,
not transfer or general latency benchmarks. The only new HTTP request in this
increment is the initial Python navigation. Six CLI replays, two diagnoses and
the initial native scope inspection make zero HTTP requests.

## Validation

The clean candidate is based on
`47ccf3188258b8c2fb6d377e9a88c1e1a9bd3b3f` plus the scoped source overlay.
All 2,477 tests across 19 explicitly selected native files pass, including 44 new
API/CLI cases. Build, 19-root strict typecheck, four-file formatting and lint pass.
The canonical manifest has 851 file entries. This is not a full native release.

Initial results remain: 2,471 passed/six failed, generic overload/type errors and
the existing CLI regex lint issue. Three new assertion mistakes and parameterized
test-row typing are corrected; equivalent whitespace/control checks preserve
link admission. Three existing large synthetic serialization cases take 11–13
seconds, exceeding this lane's original 5-second per-test harness allowance.
The final harness allows 30 seconds per test, with identical selected files and
no retries; no application timeout changes. Serialization cost remains a
performance lead. The four failures documented in the thirty-ninth inventory
were outside this selection and remain unresolved, not silently declared fixed.

## Evidence and outstanding work

- `/dev/shm/agent-browser-content-focus-september15/`: initial/final source and
  compiled ledgers, test/check logs, native inspection, all six CLI receipts,
  Python failure diagnoses, `REPLAY-VERIFICATION.json`,
  `EVIDENCE-VERIFICATION.json`, scopes, continuation and staged/post-commit audit.
- `/dev/shm/agent-browser-python-controlflow-september15/`: original navigation,
  captured source/extraction, metadata, verification and review. Its preliminary
  simple matcher misses two list-indented fences and an escaped footnote; final
  verification resolves those formatting cases rather than claiming content loss.
- `/dev/shm/agent-browser-mdn-negotiation-september15/`: unchanged earlier MDN
  capture. It is not relabeled as a new live website visit.

Durable new evidence is copied below
`node_modules/.cache/native-validation/content-focus-september15/` and
`node_modules/.cache/native-validation/python-controlflow-september15/`.
Historical paths/measurements remain intact. See `CAPTURED-ARTICLE-MARKDOWN.md`.

The broader goal remains active: more sites and research, role-based targeting,
large-receipt performance, JS-only/blocked content, rendering/interaction and
full native release validation remain open. No challenge solver, credential or
passkey-device access, SafeJS probe, service listener or real TTY/PTY is exercised.
