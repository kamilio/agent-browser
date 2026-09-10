# Attestation source qualification — September 10, 2026

## Outcome

The two outstanding cached WebAuthn sections now have separate successful native
extractions and independent verifier admissions. This resolves their unread-source
status, not the overall browser goal or passkey acceptance gates. No runtime code
changes, new website requests, credential access or real-device operations occurred.

The admitted generating-attestation template permits a format-specific statement
to be a map **or an array**. Our private `projectNoneAttestationObject` currently
requires a map before selecting a branch. That is a concrete compatibility
restriction, not a general WebAuthn requirement. Broker integration remains pending.

## Source findings

- **Generating an Attestation Object, section112:** the algorithm uses the selected
  format's signing procedure, authenticator-data bytes and client-data hash, then
  returns a CBOR object containing authData, fmt and format-specific attStmt.
  The general template permits map or array statements; individual formats still
  determine their valid shape. No claim about actual device support follows.
- **None Attestation Statement Format, section128:** the none format can replace
  unwanted attestation and can also be produced directly by an authenticator.
  Its statement is an empty map; its verification procedure yields a None-type
  result and empty trust path. This supports the helper's none/empty reconstruction,
  not signature verification or a trust guarantee.
- Neither selected passage establishes universal AAGUID zeroing. This is not proof
  that no other provision applies. The earlier conditional create/packed findings
  and strict local profile remain relevant; preserving authData is not anonymization.

The interpretation uses only the newly admitted native exports and the current
helper source. Earlier context remains in `SOURCE-SECTION-CREATE-TRIAL.md`,
`SOURCE-SECTION-PACKED-TRIAL.md` and `PASSKEY-NONE-ATTESTATION.md`; their original
dates, measurements and then-outstanding qualifications are not rewritten.

## Actual executions

All times below are UTC on September 10, 2026, not approval-decision timestamps.

| Gate | Native extraction | Independent verification | Export |
| --- | --- | --- | --- |
| Generating, trial04 | 16:30:53.639–16:30:54.089; 449.526724ms | 16:39:22.031–16:39:22.267 | 4819 bytes; 12 blocks; 832 UTF16 units |
| None, trial05 | 16:24:59.627–16:25:00.113; 485.55042000000003ms | 16:33:41.884–16:33:42.120 | 4877 bytes; 13 blocks; 841 UTF16 units |

All four actual actions return0. Each verifier reports both integrityPassed and
sectionEvidenceAvailable true. Both check18 ordinary SOURCE inputs, skip one
literal receipt declaration, and check1748 engine files; RUN counts are57/59
for trial04/trial05. Verifier oldReceiptBytesRead is0. Native source namespaces
are distinct from the parent; parent tools never open the historical receipt.

Trial05's source approval times out once, then its one identical retry succeeds.
Trial04 source approval and both verifier approvals succeed on their first
requests. No execution is retried. Earlier10syntax/94checker/23native results
remain September8 prerequisites, not new test runs.

Trial04's first source review discloses initial login-setting and Python-method
deviations. That report remains intact. A new login:false/Node-builtins-only full
identity recheck passes before source approval; it does not erase the earlier
procedure. A data-only preparation quote-parser failure also remains documented;
it occurred before patch emission, not during a source or native test run.

## Evidence identities

Evidence roots are `node_modules/.cache/native-validation/native-section-trial-04/`
and `node_modules/.cache/native-validation/native-section-trial-05/`. Each retains
source and verification child proposals, reviews, actual statuses and inventories.
Only after successful independent admission did the parent read each new export.

| Artifact | Trial04 SHA256 | Trial05 SHA256 |
| --- | --- | --- |
| section.jsonl | `9ce149c5b0ee28d1d45f06062139fca421b3bff8cec41f499055eb4a5252983c` | `712ec401d3d504f11a138217ac751ec5c6092d014d8f49186c56d4af0f5ff6f1` |
| INTEGRITY.json | `dbc3c4f402af883cc3919ef1c35fa0ca8454d5608f781289cdb5d337b433b53d` | `ebe41f084ce9513b1e0e0766e791b8f5a09ca2979b9025037e21f666b2f2dfbb` |
| SOURCE ledger | `7e289c8d7dd72488bde7e4d0868519b4201685d0a4eccb4e8819ffa075cc1de0` | `2126d83131b480b7f2854854c9b968b29b50a3da43c47bb2f850b4ea0b50baae` |
| RUN ledger | `8b5134a7b1672f928357d8d66cd3fa08a6a2d3e71dbbfed1e04163ad3f11eec1` | `b5afcf5bbfc4888d7129490b4ab9ad9ca1958dd741240014602090e3be1a1ce5` |

`SOURCE-RAW-DISCARD-TRIAL.md` records the original W3C fetch on September8 at
05:25:47.920–05:25:48.742Z. That earlier fetch record, not these exports' processing
timestamps, supplies the acquisition date. These cached reads do not establish
September10 freshness or independent source authenticity. Both exports
remain partial:true/contentSuccess:null, normalized lexical prose rather than DOM
or visibility evidence, without reported text truncation. Only the selected bodies
and stopping-heading metadata are admitted; linked and following bodies are not.

## Implementation still pending

Before integration, decide how the helper handles general array statements versus
its supported concrete formats, and make that choice explicit in focused tests.
Do not simply accept arrays for packed or none, whose concrete schemas differ.
The existing7609-byte canonical CTAP limit and strict registration/key/depth profile
also differ from the committed broker's broader opaque acceptance. Specifically,
`src/passkeys.ts` at commit `51afaf5fd811b64feff019b37cf5d68022ee79aa` defines
responseBytes as64*1024 and applies it when copying registration.attestationObject.
That implementation, not the source-export cap, establishes the65536-byte ceiling.
This comparison excludes pending working-tree RP changes. Source admission does
not resolve those compatibility decisions or authorize denied RP/hash changes.

The helper is still private and unintegrated. No real signature/certificate trust,
human consent, device/vault, guest-runtime, live website or fingerprinting/challenge
acceptance gate closes. The evidence is retained, but no final read-only archive
seal is claimed by this update. No new push is included.
