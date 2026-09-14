# Native background-navigation cancellation regressions

The September 14 captured MDN run reaches an uncaptured background request, then
fails its immediate logical-cleanup snapshot. These **separate synthetic native
tests** investigate cancellation without rerunning that consumed observation.
They preserve the existing asynchronous shutdown contract rather than changing
production code or pretending unfinished work has disappeared.

`src/background-navigation-abort.test.ts` adds five cases:

- Cancellation from inside an image request through the caller signal, `stop`,
  `closeTab` and `close`, using the real native document loader and a transport
  advertising capacity one. Each verifies eventual zero document nodes, closed
  image ownership, zero pending loads/queue leases, one close notification and
  exactly the two synthetic page/image attempts—no retries or stale commit.
- An uncooperative image transport remains counted as active after the document,
  image owner and navigation have settled. Only explicit completion of that fake
  transport releases its queue slot. Closing does not falsify capacity metrics.

Waits inspect actual owner metrics with a 1,000ms deadline. They do not require
immediate cleanup to remain incomplete: implementations that settle earlier still
pass. Teardown releases the held fake transport and checks that work is drained.
All response data is in memory; no website, socket, script, SafeJS, credential or
device probe occurs.

## Validation

- Focused build/types/format/native checks pass **308/0** across six explicit
  files at **11:55:43.998 UTC, September 14, 2026**.
- Full isolated gate runs **11:55:58.231–12:01:35.145 UTC** and passes
  **23,340 / 0 failures / 2 unchanged exclusions**, across 466 selected files
  and 465 strict roots. The manifest contains 818 entries; 352 remain unselected.
- Independent audit preserves all **23,337 prior case occurrences**, including
  both exclusions, and verifies five new passing cases, 2,901 source inputs and
  2,192 compiled files. Production source and every compiled file remain byte-
  identical to the background-image runtime's validated gate.
- The initial strict check catches a circular inferred fixture type before tests
  execute. An explicit fixture interface fixes it; that failed stage is retained.

Original lane: `/dev/shm/agent-browser-background-abort-september14/`; final gate:
`release00/`. Durable retention:
`node_modules/.cache/native-validation/background-abort-september14/`, containing
the compressed lane and an identical uncompressed final gate. Hash inventories,
selection, complete test results and `AUDIT.json` remain with the original paths.

These passing tests **do not turn the captured MDN check into a pass** and do not
establish its unobserved later cleanup. That failure is recorded independently in
`MDN-BACKGROUND-IMAGE-ABORT-SEPTEMBER-14.md`. Future capture supervision should
report bounded asynchronous settlement rather than silently resetting counters
or sampling only the first synchronous close state.
