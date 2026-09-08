# Native heading-inline diagnostic trial

On September 8, 2026, one separately authorized request to the published
WebAuthn Level 3 URL reaches the same heading guard, now with trusted finite
predicate metadata. It still produces no candidates, text outline or capture.

## Actual result

The native request runs at 02:15:41.373–02:15:41.642 UTC, 269ms whole operation.
HTTP200 returns UTF-8 HTML with Brotli encoding: 323,705 encoded bytes and
2,739,242 decoded bytes. Native request time is 167.836187ms. Transport records
one request, zero redirects/mocks/active operations and closed=true.

Failure is `unsupported` at `native-source-heading-discovery`. The existing
structure record says `heading-inline-structure` at last-committed source UTF-16
coordinate250858. The actual same-engine inline getter supplies:

| Field | Value |
| --- | --- |
| kind | source-heading-inline-start |
| condition | non-inline-start |
| headingLevel | 2 |
| observedTag | other |
| inlineDepth | 1 |

The active heading is level2 with one admitted inline frame, and membership
rejection precedes reading the rejected token's self-closing predicate. `other`
means outside the fixed99-tag diagnostic vocabulary; it does not identify a tag,
attributes, custom-element status or block/phrasing semantics. No guessed tag
name is evidence. Selected head/table policies do not prove a prior transition.

No sourceDiscovery, bodyCapture, resource/scope/context diagnostic or challenge
classification accompanies the failure. Earlier receipts retain their original
schemas and measurements; this new metadata cannot retroactively enrich them.
The declared decoded-body SHA matches the earlier declaration, not independent
host byte identity. Encoded size differs from source06's323,792 bytes. Neither
source nor capture bytes were inspected, decoded or replayed on the host.

## Integration and controls

The frozen engine is copied byte-for-byte from the exact1,093-test snapshot of
commit `9195d13fa24f7f3d3ce96f1e0abd4ed8a1fb13e2`, with1,748 compiled files.
The wrapper changes only engine identity, same-module getter wiring and explicit
`trusted-heading-inline-start-v1` provenance. Table v2/head body-boundary selections,
request and scanner caps, candidate-only opaque capture, cleanup and replacement
failure accounting remain unchanged. There is no grammar expansion in this trial.

The new verifier checks five-field shape, finite vocabulary, level/depth bounds,
predicate/tag consistency and inline-record/heading-inline-reason equivalence.
It retains directional scope-to-structure implication and scope/context parity;
there is no new reverse scope requirement. Entire failure replacement drops the
inline record with all prior diagnostics. JSON shape is not native WeakMap authority.

Fresh evidence, each under separate bounded authorization:

- Independent operation/verifier and probe reviews find no actionable issues.
- Both launcher syntax checks and operation/control syntax checks pass. The first
  shell-control launch refuses the parent's incorrect environment before any
  child or control execution. That refusal is preserved; no guard is weakened.
- A freshly authorized exact-environment run passes all five shell controls at
  02:10:16.487–02:10:23.476 UTC. These do not run the native operation.
- Actual completion helper passes4,817 rows at02:12:06.274–02:12:06.306 UTC:
  2 admitted/4,815 rejected, no native imports, receipt reads or source requests.
- Actual inline helper passes3,711 rows at02:12:06.311597143–02:12:06.355848453 UTC:
  1,772 admitted/1,939 rejected. This is a preconditioned JSON-slice helper matrix,
  not full-receipt/schema/IO/candidate-success or executed byte-fallback coverage.
- Native synthetic integration passes42 cases at02:13:57.807–02:14:01.977 UTC,
  checking1,757 input hashes. All28 prior fixtures/outcomes/ceilings remain;14 new
  fixtures exercise inline metadata, unknown names, maximum depth, earlier guards
  and unchanged success. Admission/scanner/getters/capture/emitter are actual native
  code. Two explicitly disclosed mocked metrics are masked only for the wrapper;
  independent FD3 metrics, nonforwarding routes and throwing DNS/exchange guards
  remain checked. No actual old-runtime negative control runs.

## Integrity and limits

Supervisor time is02:15:40.328723987–02:15:42.409514800 UTC. Native, timeout,
pre-finalization and terminal statuses are all1 with completed availability;
input/frozen checks are0 and stderr is empty. The receipt is2,800 bytes.

The separately authorized zero-GET verifier records02:16:35.065–02:16:35.419 UTC:
integrityPassed=true, issues=[],1,748 compiled files and39 RUN artifacts checked.
Admission is evidence-only/native-failure; candidate evidence is false, body and
outline identities are null, replay readiness is false. Outer exit1 is expected
for valid failure evidence. This invocation did not collect separate verifier
stdout/stderr/status/time files; its actual INTEGRITY.json and tool exit are the
evidence. Missing artifacts are not recreated as if captured at execution time.

Frozen evidence: `node_modules/.cache/native-validation/native-source-heading-source-07/`.

| Artifact | SHA-256 |
| --- | --- |
| Engine inventory | `8bbec4807f880329385eccd8057198ce86b7ddfa5ea8fd65b2953f682bff847d` |
| operation.mjs | `f1d8827c5401b87074e80afe993925fdb27fe712ff953cb595bd77e8f2149f4a` |
| verify.mjs | `75541dea013f105196ee626211756423c8c55dc054d265de61da5be5750e2e09` |
| SOURCE-INPUT-SHA256SUMS | `2ecb40f573608429ed42f467f194dbebe48449ae2e333ebc530e571c795ef41e` |
| RUN-SHA256SUMS | `cdee44698ba76e5442c1a0ce104aacd5e15fc73cf319752da0e9b021050882a3` |
| exit-code.txt | `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865` |
| stdout.jsonl | `81abff81df063354ed395db87ec83744460b1ebb160a800b8e45c004e033554d` |
| INTEGRITY.json | `dbe9518360af67dd12eeed7adc1163ffd9d2c7283e24455a29d7bda68a811bc5` |
| FINAL-SHA256SUMS (424 artifacts) | `4b013ac8667b6b0fc25e3f1af11b5692ed9b55c039fb1f4aee24c9a32dbf698d` |

Next is a defensible bounded lexical continuation design, not repeated guessing
of unknown markup, unrestricted raw-source fallback or silent grammar relaxation.
Modern WebAuthn privacy, provider/vault/device/page/consent, blocked research and
all historical stopped/denied gates remain unresolved.
