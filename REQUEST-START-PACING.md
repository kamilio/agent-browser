# Native request-start pacing

## Outcome

The opt-in native transport now invokes synchronous request startup inside its
per-origin pacing grant. The following cooldown starts after that invocation
returns, rather than before promise continuation, cookie preparation and request
construction. Response promises are not awaited by the scheduler, so spaced
requests may overlap while receiving responses. Default unpaced behavior stays.

This strengthens the earlier grant-only contract documented in REQUEST-PACING.md;
it does not recast the original September 11 validation as proof of exchange or
wire spacing. No dependencies, retries, identity changes or bypass mechanisms.

## Implementation

- OriginRequestPacer.dispatch runs synchronous startup while the origin is
  actively owned, then sets the monotonic deadline in a finally block. Legacy
  wait uses the same coordinator with a no-op callback.
- Active origins cannot be reclaimed or granted again through reentrant calls.
  FIFO, independent origins, 256-origin/128-pending limits and early-timer
  rechecks remain. Startup errors, abort and reentrant close preserve cleanup.
- NodeNetworkTransport supplies a non-async callback around activity checks,
  cookie refresh and its existing exchange constructor. DNS/address admission
  still comes first; routed responses bypass pacing. Whole-request deadlines,
  redirects, cookie policy and active/request/byte bounds remain unchanged.
- Native exchange synchronously constructs the platform request and calls end
  before returning its response promise; the pacing slot does not own that
  response's lifetime. In-flight cancellation stays with the transport.

## Validation

All execution below uses copied native source with kernel socket/socketpair
denial, private HOME/TMPDIR, explicit native-tests.json selections and existing
compiler, formatter and test runner. No live websites or real credentials.

| Lane | September 12, 2026 UTC | Result |
| --- | --- | --- |
| Original-source baseline | 14:11:51.624–14:11:52.072 | 35 passed, five new regressions failed |
| Constructor baseline01 | 14:18:23.771–14:18:24.234 | Five selected regressions failed; 40 other cases explicitly filtered |
| Fixed focused four-suite gate | 14:20:19.735–14:20:21.865 | 215 passed, zero failed |
| Broader native gate round00 | 2026-09-12T14:20:48.559Z–2026-09-12T14:23:43.100Z | 13588 passed, zero failed, two unchanged exclusions |

The ten new transport regressions use synchronous setup delays of 1, 10, 99,
100 and 250 ms. Original source produces start gaps of 99/90/1/0/0 ms for a
100 ms target. Five use a mocked exchange; five restore the production exchange
and substitute only an in-memory HTTPS request/response constructor. The latter
five retain exact baseline01 test-file bytes in the passing gate. They are not
real ClientRequest, socket, packet or website measurements.

Eighteen new pacer cases cover immediate/queued startup, exact intervals, FIFO
shared with wait, unsettled responses, independent origins, synchronous and
asynchronous failures, reentrancy, cancellation, close and early timers.
Build, strict checks over 260 roots and formatting of all four owned files pass.
The gate selects 261 suites from the unchanged 653-entry native manifest.

The total increases from 13501 by **28 new cases plus 59 pre-existing cases newly
included in this gate** (24 pacer and 35 transport). The two existing pacing
suites were absent from the prior 259-suite selection. Historical measurements
and the two unrelated exclusions remain unchanged; no claim covers every
manifest entry or separate live/provider/device/TTY/SafeJS gates.

The source audit binds 1155 source files, 1968 compiled files and 1150 unchanged
tracked inputs. Four owned source/test paths are origin-request-pacer.ts,
node-transport.ts and their two pacing test suites. The unchanged clean manifest
is a fifth input for subsequent committed-snapshot verification. No rich-button
test/manifest work or unrelated dirty files are included.

Static integration review found no additional concrete issue. Its author also
implemented the pacer: this is not an independent implementation audit. Compiler
and executed tests, rather than that review, establish the results above.

## Evidence

Private work: node_modules/.cache/native-validation/request-start-pacing-work-september12.
Gate: node_modules/.cache/native-validation/native-request-start-pacing-september12-round00.
Original baselines, fixed00, original source, contracts, validation notes and
review remain at their original paths. Gate input inventories match before and
after execution. Gate receipts:

- results/source-before.sha256: 1887feeb9be9acb9563312b955659e798d089147aeaf2332f03f09322d06399c
- compiled.sha256: de27e109c06fd2e008d89b955985db40abd31266f7bae217062b9419e6d33336
- results/native.stdout: 94eb83585b8fdf898d4ccbdc296109bf090c9405d40484cc9782b9276a068a50
- results/SUMMARY.json: 80fac59653d226fd01e3894181acae693f13c8131c065f7e1b03abbd1f101529
- AUDIT.json: ddf475e547bba740eb3843ee91bdd98f816818166c3590e73f58a6dd3ef8cf57
- RECEIPTS.sha256: e29aecdeecb4ab689d4ad1bd90edd1239323cce05b1488019c75fbec30fb62dd

## Remaining limits

This separates synchronous native startup invocations, not exact packet sends
or arrival times observed by a server. Slow startup adds latency. There is no
throughput, speedup, lower blocking rate or real-site pacing claim here.

NASA's earlier one-response flow failed with a wrapped assertion before a second
recorded wire event. Its missing inner assertion is still missing; these tests
do not identify that historical cause and NASA was not retried. The original
failure and parent-verified report remain in NASA-ABOUT-FLOW.md.

Rich HTML button descendants remain unsupported: their separate two-case
baseline still fails and is not included in this release. Existing Go CSS/CSP,
Libjpeg width/layout and broader research, password-provider, passkey/device,
real-SafeJS, TTY and challenge acceptance gaps remain explicit in TASKS.md.
