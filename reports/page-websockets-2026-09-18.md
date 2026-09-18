# Native page WebSocket bridge — September 18, 2026

## Outcome

Implemented the opt-in guest WebSocket bridge on the document-owned native
transport. Final selected native **1,510 passed, zero failed, 23 files**; candidate
build, types, format and lint all pass. The second authorized isolated public
SafeJS **0.1.640** run passes **all 15 finite in-memory bridge checks**.

That SDK result belongs to core03. Final core04 includes two subsequent
native-tested accounting fixes; no third actual-SDK run was authorized or made.

This completes one prerequisite, not the Zoom notetaker. No meeting was joined,
website loaded, real socket opened, credential accessed or audio captured.

## Changes

Document binding now precedes parser/script initialization, preserving response
CSP and document lifetime. The extension runtime evaluates one static guest
bootstrap; a one-shot private port publishes the original constructor to Window.
The controller validates synchronously, copies binary data, bounds events/writes,
orders listeners and cancels connections/tasks/references on shutdown. The old
release gate remains unchanged; the new isolated runner fixes its stage sequence
to guard then the finite WebSocket fixture, not arbitrary scripts.

## Preserve the unsuccessful attempts

- Native core01: **1,503 pass / 1 fail**. A host-connection test supplied the wrong
  mock URL; build/type issues and lint findings were corrected before requalification.
- Native core02: **1,504 pass / 0 fail**; build/types/format/lint pass.
- SDK attempt 1 at **02:49 UTC**: guard pass, bridge **9 pass / 1 fail**, five not
  reached. `close-open` failed with `Guest assertion failed`: native close completion
  changed state before the interpreter evaluated the caller's next statement.
- The browser fix introduces cancellable network tasks and adds four native
  regressions for state visibility, message scheduling and task cleanup. The
  immediate-CLOSING assertion, in-memory adapter and SDK are unchanged.
- Native core03: **1,508 pass / 0 fail**, 23 files in **8.737 seconds**;
  build/types/format/lint pass. Native HOME/TMP stayed empty. Quality commands
  created only the reported `.cache` and `node-compile-cache` entries; do not
  describe that separate quality environment as empty.
- SDK attempt 2 at **03:00 UTC**: guard pass, bridge **15 pass / 0 fail**, none
  skipped/not reached. The 15 checks cover constructor/Window identity, admission,
  connecting/open, text and binary send/receive, listeners, close/cancel,
  bootstrap authority and document/realm/final cleanup.
- Review then identified retained writes between native closure and its terminal
  task, and a leaked event reservation when a queued open is suppressed. Final
  core04 fixes both and adds two focused native regressions: **1,510 pass / 0 fail**.
  It passes build/types/format/lint. Actual SDK coverage remains core03-only;
  these follow-ups were not used to justify any third run.

## Evidence and scope

The approved scope permits at most two finite runs; both are consumed. Each uses
the fixed guard then WebSocket stage, 45-second/384-MiB child bounds and an external
parent supervisor. Scope SHA-256:
`c5fd60daddefdc51f1bed2efda76d3066972ac459e0a114221c6ef27e4832006`.

Final canonical candidate: **1,683 source pins / 2,504 compiled pins**.
Each run verifies **6,913 input file pins and 19 contained links** after execution.
Both parent and child processes/groups are absent; SDK host/stage HOME/TMP are
empty; cleanup/evidence failure lists are empty; terminal and persisted reports
agree. Each SDK phase archives 23 original output files and seals 36 evidence
files. Failed evidence is retained rather than overwritten.

- Native phase: `node_modules/.cache/native-validation/page-websocket-september18`.
- First SDK phase: `node_modules/.cache/native-validation/page-websocket-sdk01-september18`.
- Final SDK phase: `node_modules/.cache/native-validation/page-websocket-sdk02-september18`.
- First execution root: `/tmp/agent-browser-page-websocket-sdk01-25HUSR/outputs/websocket-bridge-VmstAy`.
- Original final execution root and per-file hashes are recorded in the JSON report.
- SDK-tested runtime: `/tmp/agent-browser-page-websocket-n4dyOM/candidate`.
- Final native-qualified runtime: `/tmp/agent-browser-page-websocket-xCBchf/candidate`.

The guard/receipts and child-written reports are trusted cooperative evidence,
not a hostile-code security boundary. System libraries are not content-pinned;
the historical guard does not filter every exec/clone/ioctl operation. No claim
of package publication provenance or latest-version selection is made.

## Outstanding gates

The earlier core callback/source async-tail concurrency failure remains open:
**11 pass, ordinal 12 fail**, with later core/page/module checks not reached.
This distinct WebSocket profile does not retry or supersede that failure.

Actual sockets, authenticated signaling, Blob/full event conformance, long-running
retention, Zoom/WebRTC/codecs/audio, capture, speaker tracking, transcription,
summary and delivery remain unverified or unimplemented. Real credential, passkey
and device gates remain separate. No fallback browser, CAPTCHA solver, default SDK
switch or push. Overall browser/notetaker goal remains active.
