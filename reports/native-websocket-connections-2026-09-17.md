# Native WebSocket connections: Zoom prerequisite

Phase opened September 17, 2026; final candidate audited at
2026-09-18T00:02:12.137Z. The report path retains the phase's original date.

**Status: host transport implemented; native Zoom notetaking still unavailable.**
No meeting was joined, audio received, recording started, transcript produced,
or summary delivered. This work does not substitute the Chromium/CDP notetaker
from `~/automations` for the standalone browser.

## Implemented

- Incremental, bounded server-frame and fragmented-message reception, strict
  UTF-8/control/close validation, and owned text/binary payloads. Fragmented
  assembly uses one geometrically grown buffer rather than one object per
  tiny fragment.
- Strict opening handshake and a Node host connection/transport API, exported
  through `agent-browser/node-websocket`. Existing network policy checks DNS
  results before a pinned-address connection; TLS retains original-hostname
  identity checks. No runtime dependency was added.
- Fresh client masking, fragmentation, bounded inbound and outbound queues,
  ping/pong, serialized writes, close/abort settlement and deadlines. Oversized
  text is rejected before an unnecessary UTF-8 length scan.
- Review fixes: a separate pending-write task cap prevents tiny-pong metadata
  growth behind a stalled write; control admission failure aborts immediately.
  HTTP header-count extraction is disabled while the finite byte cap remains,
  so late extension/protocol/duplicate-accept fields reach validation.

See `NATIVE-WEBSOCKET.md` for the API, defaults and limitations. This is a host
API, not yet a page `WebSocket` implementation or a media transport.

## Final isolated qualification

Candidate: `/tmp/agent-browser-native-websocket-NudlFW/candidate`.
Canonical baseline: `b0212a4ae8e47f4673d38272768141675269407a` plus the explicitly
owned WebSocket sources/tests and package/native-manifest additions.

| Test file | Passed | Failed |
| --- | ---: | ---: |
| `websocket-frames.test.ts` | 153 | 0 |
| `websocket-receiver.test.ts` | 122 | 0 |
| `node-websocket-handshake.test.ts` | 52 | 0 |
| `node-websocket-connection.test.ts` | 59 | 0 |
| `node-websocket-transport.test.ts` | 152 | 0 |
| `network.test.ts` | 80 | 0 |
| `network-policy-diagnostic.test.ts` | 62 | 0 |
| **Selected total** | **680** | **0** |

Build, test types, formatting and lint all exit zero. The selected test process
finishes in 3.978 seconds; this is test-run duration, not browser performance.
Process/group closure passes, with empty private native HOME/TMP directories.
The source audit verifies 1,649 source and 2,440 compiled hashes, including
1,637 unchanged canonical inputs. The 1,033-entry native manifest still has
22 absent committed paths; this run is not a complete-manifest pass.

The harness uses in-memory streams, mocked HTTP(S), injected DNS and fake
timers, with the native guard and explicitly selected manifest entries.
Actual TCP/TLS, Node HTTP parser behavior and public-server interoperability
are **not** qualified by these results. Installed Node 22.22.0 bundled source
was inspected to confirm the header-count extraction path, not executed as a
parser probe.

## Negative evidence and preservation

- The seven new P1/P2 regression cases all fail against frozen pre-fix core02
  production with the final tests; all seven pass in core04. The modeled
  header-count tests are not actual parser-boundary acceptance.
- The earlier oversized-string negative control preserves 55 passing and
  2 expected failing tests. Core03 preserves its 679/1 result: an exact metrics
  expectation omitted the newly added `pendingWrites` field. Core04 corrects
  that expectation without another production change.
- Original review findings, raw executions and failures remain under
  `node_modules/.cache/native-validation/websocket-connections-september17`.
  The static followup finds both issues addressed and verifies identical
  production bytes in the final candidate; it is not live acceptance.
  Machine-readable details are in the companion JSON report.
- The audit preserves 42 pre-existing dirty tracked files and 700 individual
  untracked files, the previous Zoom runtime and 1,642 prior selector source
  pins. No unrelated CSS-selector changes are included in this feature.
- Low disk space is mitigated only by sharing byte-identical immutable inputs
  and freshly compiled outputs with prior copies. Historical evidence paths
  and bytes remain intact; recording still needs adequate storage.

## Remaining end-to-end work

1. Integrate page events and binary ownership/retention with document-owned
   origin/CSP, then qualify actual SafeJS and real socket/parser boundaries.
2. Complete HTML module execution and determine/implement native incoming
   media transport, decode and PCM capture rather than assuming WebSocket
   support alone implements Zoom audio.
3. Verify meeting admission, permitted sustained audio, pause/final flush,
   durable recording, transcription, summary and requested delivery/readback.

The single previous native Zoom entry GET remains HTTP 200 with 11,539 decoded
bytes and **zero extracted Markdown bytes**; this phase does not repeat it or
change that failed content/workflow result. It does not establish the meeting
state or the site's exact media protocol. Authentication, credentials/passkeys,
research completion and broader website coverage remain separate open work.
