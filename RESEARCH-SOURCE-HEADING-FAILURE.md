# Native source-heading request: preserved unsupported failure

September 7, 2026. One separately authorized fresh repository-native request to
`https://www.w3.org/TR/webauthn-3/` returns HTTP 200, but native source-heading
discovery rejects with `unsupported`. **No candidate or body capture is retained.**
No privacy wording or source content is exposed to the agent by this result.
This is a failure checkpoint, not browser or WebAuthn acceptance.

## Actual operation

The frozen engine at `65e727e5927bfd896db0e7acce0637160e1cf286` supplies the actual
`NodeNetworkTransport`, HTML byte admission/decoder and native source-heading
scanner. The explicitly source-only wrapper does not build a DOM or use another
browser/client. It allows one GET, zero redirects, a 4,000,000-byte response/total
budget, 15-second request limit and supervised 125-second operation deadline
with five-second kill grace. No scripts, cookies, credentials, routes or alternate
endpoints are used. Existing document ceilings are not raised.

| Observation | Recorded value |
| --- | --- |
| Native interval | 21:07:15.867–21:07:16.250 UTC |
| Native elapsed | 383 ms |
| Response | HTTP 200, Brotli, `text/html; charset=utf-8` |
| Encoded / decoded bytes | 323,705 / 2,739,242 |
| Failure | `unsupported`, `native-source-heading-discovery` |
| Requests / redirects / mocks | 1 / 0 / 0 |
| Final transport | Closed, zero active requests |
| Receipt | 1,971 bytes; no capture or candidate payload |
| Final / pre-final / native / timeout statuses | 1 / 1 / 1 / 1 |
| Native completion availability | `completed` |
| Input / frozen checks | 0 / 0 |
| Stderr | Empty |

The generic failure category does not identify the rejected construct. No old
capture is decoded, no raw-HTML inspection substitutes for native extraction,
and no further request follows this failure. Historical September 6 default and
long-profile failures keep their original paths and measurements.

## Separate checks

Five finite synthetic supervisor controls pass at
21:04:34.699–21:04:41.798 UTC: success, failure, timeout, preflight collision and
final-ledger collision. These use shell sentinels, not source requests.

The actual wrapper's error projection initially omitted `network-error`. The
corrected and retained earlier operations were separately exercised with native
request methods intercepted before invocation. At 21:05:29.870–21:05:30.080 UTC,
both return 1 with one bounded failure receipt and no private error message;
the current operation preserves `network-error`, while the actual earlier one
reports `internal-error`. Two intercepted calls, zero network requests, and all
1,755 pinned inputs rechecked. This is a synthetic error-path control only.

A separately authorized zero-GET verifier runs at
21:16:58.950–21:16:59.342 UTC. It checks all 1,748 compiled files and 38 RUN
artifacts against independently supplied source/RUN/terminal-status hashes.
`integrityPassed: true` correctly retains `evidence-only` / `native-failure`
and process exit 1. Candidate availability and replay readiness remain false;
body and outline identities remain null. No base64 decode, native import or
source retry occurs. Candidate-success and malformed-input control branches
remain unexecuted; this one failure verification does not validate them.

Syntax authorization and the first verifier authorization each initially timed
out in permission review; one identical retry was used for each. The first
verifier launch then refused a stale code pin before syntax/runtime execution
or marker creation. A new authorization used the completed, re-inspected worker
version. The refusal and final result remain separate evidence.

## Evidence and limits

Frozen lane:
`node_modules/.cache/native-validation/native-source-heading-source/`.

- `FINAL-SHA256SUMS`: 258 files, SHA256
  `f5f07e80ca06d204be67e4f5a49638fbb0779158f4257e3a1b76f492cd8c25d3`.
- `stdout.jsonl`: SHA256
  `ac203e08413a95471140a545fcceb83ea177eb674fde531d517194289415e8fa`.
- `INTEGRITY.json`: SHA256
  `c3c440b7f2b574d759038650e98621a6006428869076116cd0f384fb507579bb`.
- Source-input ledger SHA256
  `9fe8b53279cf6c883e019c534e10f4da431ac53fbfa84e2730646070ea66bb5a`.
- RUN ledger SHA256
  `141f30c5633224507ca6d47d705f6d435e7e76677546e058977cf443a010acab`.

Challenge coverage is limited to native header classification and a conservative
first-candidate label guard, which this failed scan never reaches. Separate
hardware-wrapper review identified that the frozen classifier returns null for
headers outside its narrower admission bounds, not only for absence of a
challenge. The complete original header set is not retained here, so this
receipt cannot establish classifier admission. Future wrappers must fail closed
on that ambiguity; this historical failure is not rewritten as successful
challenge handling.

`SOURCE-HEADING-DIAGNOSTICS.md` adds tested, fixed enum/numeric observability
without changing the rejected source or parser policy. Hardware multi-GPU source
preparation remains unexecuted pending the header-admission correction and its
separate checks. Published privacy wording, provider/device/page/consent,
blocked Reddit/X/Astra research and all stopped/denied gates remain open.
The overall browser goal is not narrowed to this checkpoint.
