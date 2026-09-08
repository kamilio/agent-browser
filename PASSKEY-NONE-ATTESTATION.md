# Provisional none-attestation projection

September 8, 2026. `src/passkey-none-attestation.ts` adds the private module export
`projectNoneAttestationObject(input: Uint8Array): Uint8Array`. It is not exported
from the package barrel or integrated into the broker, page runtime or provider.
This is a strict structural primitive, not complete WebAuthn support, signature
verification, authenticator trust, user consent or a privacy/anonymity guarantee.

## Supported profile

The helper snapshots a genuine, nonshared, nondetached native Uint8Array and
uses the existing canonical CTAP CBOR decoder/encoder and registration-data
parser. The inherited 7609-byte limit and depth-four containers apply separately
to the outer CBOR object and embedded registration structures. These restrictions
are an explicit local support profile, not general WebAuthn CBOR acceptance.

The outer map must have exactly the text keys `fmt`, `attStmt`, and `authData`.
Format is nonempty and at most64 UTF-16 code units, statement is a map, and
authenticator data is bytes. Complete supported registration structure is parsed
before choosing a branch; malformed data is not accepted merely because its
statement would later be discarded. No RP, requested-algorithm, consent or
client-data policy is introduced by this standalone helper.

Only exact format `packed`, an all-zero16-byte AAGUID and absence of the exact
text `attStmt.x5c` key enter the retention branch. That branch supports exactly
integer `alg` matching the parsed credential key and nonempty byte-string `sig`.
Unknown/nontext fields reject as unsupported before missing-field validation.
An integer-valued CBOR float is not an integer field. There is no per-algorithm
signature-format or cryptographic verification in this shape check.

Any present exact text `x5c` key, including undefined/null/empty/wrong-kind values,
selects reconstruction before self-statement field validation. Nonzero AAGUID,
other format and already-`none` objects also reconstruct. Reconstruction emits
`fmt: "none"`, an empty `attStmt`, and the original complete `authData` bytes.
It does not zero or rewrite AAGUID, flags, counter, credential ID, COSE encoding
or extensions. Retention returns an owned byte-for-byte copy of the input.
Output has its own byte admission, including expansion from a short input format.

## Ownership and failures

Successful outputs do not alias caller storage, including offset views. Reachable
owned input, decoded byte/float nodes, parsed registration fields and failed
output are wiped with a captured fill intrinsic; caller bytes and successful
output remain intact. Decoder-internal partial allocations and JavaScript/VM
copies are not all reachable, so this is not complete memory erasure or a host
sandbox. No secret provider, credential store or actual key is accessed.

Failures become fresh AgentBrowserError instances with fixed code/message:

- `invalid-input`: `Invalid none attestation object`.
- `unsupported`: `Unsupported none attestation object`.
- `resource-limit`: `None attestation object exceeds limits`.

Errors do not preserve source errors, causes, statement text or caller data.
This does not establish complete process-level confidentiality/noninterference.

## Source qualification and integration gates

SOURCE-SECTION-CREATE-TRIAL.md records the conditional none-conveyance branch;
SOURCE-SECTION-PACKED-TRIAL.md now resolves nested packed statement field placement
and its self/certificate alternatives. The packed verification algorithm also
requires actual signature verification over authenticatorData and clientDataHash;
this helper deliberately does not claim to perform that verification. The
admitted create passage does not establish universal AAGUID zeroing.

Generating-attestation and none-format sections remain unread/unadmitted. The
primitive therefore remains provisional, with no claim of full privacy-algorithm
conformance. Broker integration separately needs an explicit compatibility
decision: current opaque response acceptance is broader than this strict profile.
No pending/denied RP widening, provider-context or hash change is included.
Actual device, vault, guest-runtime and live-site gates remain separate and open.

## Focused validation

The separately authorized round02 native action passes363 cases across exactly
three manifest-listed files:114 new primitive cases,52 unchanged registration
parser cases and197 unchanged encoder cases. Zero failed, pending or todo cases;
all three files pass. Native command:2026-09-08T12:40:37.965Z through12:40:38.775Z,
exit0, no signal or incomplete-output flag. Helper37.105Z through39.586Z also
returns0, with all bootstrap/precheck/action/supervisor/publication statuses0.
Its exact approval succeeds first attempt; no test retry occurs.

Original format runs12:12:20.377Z–12:12:21.953Z; checks run12:20:11.918Z–12:20:19.982Z.
Build, strict typing of the three selected test roots and two-file lint pass.
Each of these two separate approvals has one timeout then one identical approved
retry. Before formatting, static review corrects only the65-unit format fixture
to expect resource-limit;114 instances and runtime/assertions otherwise remain.
Original draft and narrow correction review are retained, not an executed failure.

Original native01 at12:22:21.700Z–12:22:22.115Z fails preflight before any subprocess
or test because parent omits two required support-file authority pins. Its first
approval and actual failure remain preserved. Fresh native-only round02 copies
all2731 already-built snapshot files and three overlays byte-for-byte, repairs
only authority preparation, and neither rebuilds nor reformats. Independent
review verifies all13 bootstrap/1685 authority/4413 expected hashes, exact required
membership and exactly two support/snapshot overlaps before fresh approval.

Expected, before and after input ledgers are identical:4413 unique entries,
914336 bytes, SHA256
`4a286b3176fd4390f7d4ce437db75882b49dd42485459bd925d0a99b2525fa3a`.
Raw native JSON output is94035 bytes,
`4c699a55f82aa7b3d0aec23092f2c3d93112a76a17d38dac52ea1e394cbe184e`;
pretty report135755 bytes,
`e7fa8356b58e18624a5dd98972a782f646f2a4583ceb418df930efa89859160c`.

New cases cover exact retention/reconstruction, x5c presence before self-schema,
supported COSE shapes, malformed outer/registration structures, unknown fields,
input/output/depth limits, offset views, aliasing, shared/detached storage,
hostile proxies and fixed fresh failures. All keys/signatures/certificates are
owned synthetic bytes, not generated real keys or verified signatures.

The snapshot uses committed baseline29698a9529b73850d8e1705e4dbbe14172056b07,
committed package metadata and only the two new files plus a manifest insertion.
The523-entry candidate manifest retains all522 committed entries; the two older
working-tree additions remain excluded from this tested/staged candidate.
No mixed working-tree or full-suite pass is claimed. Evidence stays in
`node_modules/.cache/native-validation/native-passkey-none-attestation/` and
`node_modules/.cache/native-validation/native-passkey-none-attestation-round02/`.

Native180+5s, inner210+5s, outer225+5s and6MiB per-file limits remain; outer startup,
redirection and final status are outside the timeout. The test process uses a
native mjs config, one worker and owned caches with env-file/server features off.
No browser, source receipt, network/socket, guest, vault, hardware or live-site
acceptance follows from this focused synthetic run.

Independent integration review finds no actionable defect, checks selected input
hashes and preserves all old pending work. Its SHA256 is
`8b63d4a5873d32d6b9f8b9f8fb25f61b76260e0f1ff4cccc579fe28ef8777fcd`.
Both evidence lanes are sealed read-only after complete final-inventory audits:

- Original:2900 hashes over2901 regular files excluding the ledger itself,
  `ad4c80b1fe91203a45f6ab943bfbabf8c6775bdf46640c6b9a170d1f762ccdd3`.
- Round02:2792 hashes over2793 regular files with the same self exclusion,
  `d95cfc93d5b2da2c1c77703a4e4d6663fab8867eb1ad51346c0714c241c93466`.

No symlinks are admitted to either inventory. All5692 listed hashes check; no
test, build, source or verifier is rerun for sealing. Read-only retention is
operational, not OS immutability, atomic durability or hostile-loader isolation.
