# Passkey assertion flag/layout checks

The broker rejects authentication assertions with the attested-credential-data
flag (AT, bit 6). It also requires the extension-data flag (ED, bit 7) to agree
with the presence of bytes after the fixed 37-byte authenticator-data prefix.
Consequently, an assertion without extensions must contain exactly 37 bytes;
an assertion advertising extensions must contain a nonempty tail.

These checks apply to the broker-owned byte copy alongside existing RP hash,
user-presence, reported user-verification and response-size checks. A rejected
provider result does not prevent a subsequent independent request. No RP scope,
provider activation, permission or credential namespace changes are introduced.

## Source evidence

The repository's native browser originally retrieved the March 4, 2019 WebAuthn
Level 1 Recommendation on September 5, 2026 at 05:44:55.797 UTC. On September 6,
an offline replay through the frozen native loader and section extractor selected
section 6.1, Authenticator Data, from the saved response. This is not a new live
retrieval or evidence that the historical Recommendation is the latest standard.

- Original receipt: `node_modules/.cache/native-validation/browser-research/passkey-rp-boundary-definition/01-webauthn.jsonl`.
- Native section: `node_modules/.cache/native-validation/webauthn-assertion-offline-02/authenticator-data.md`.
- Original body SHA-256: `0173a74367a88ac40cc2564abe4b4d5af000a3d81e3eec50bcb14fb16106062e`.
- Selected section SHA-256: `7838f79948f2512ae2bb8d4fc57a190d78c015f1216362a0227a7e522f7cf8f1`.

An earlier offline attempt used an invalid heading-discovery option. Its failure
is retained separately in `webauthn-assertion-offline`; the corrected replay uses
the existing limit and does not raise browser resource budgets or access a site.

For compatibility evidence, the native browser also captured W3C's mutable
WebAuthn development source on September 6, 2026 at 07:47:24.929 UTC. A separate
offline native line discovery/extraction at 08:03:14.161 UTC selected lines
4679–4778. That window identifies BE at bit 3 and BS at bit 4; the earlier native
selection identifies valid BE/BS states 0/0, 1/0 and 1/1, with 0/1 forbidden.
Thus masks 0, 8 and 24 in the compatibility cases correspond to those valid
states. This mutable development source is not a pinned or released standard.

- Flag table: `node_modules/.cache/native-validation/webauthn-modern-layout-offline/extraction.md`.
- Flag table SHA-256: `d5bfebe696b0a40d29c85d162b70a1af154e9a0623a79751e1f29579f96bc234`.
- State table: `node_modules/.cache/native-validation/webauthn-modern-flags-source/02-selection/extraction.md`.
- Modern captured body SHA-256: `49cbba99908101524908b615b92cb0ace674455f31945f5a72cfef91f175dade`.

## Validation

On September 6, 2026, the exact two-file native matrix passed 104 synthetic
cases: 27 new assertion-layout cases and 77 existing broker cases. Against
unchanged committed `f5b99ca` broker code, the same new test file passed 20 cases
and failed precisely the seven malformed-layout rejection cases. Those failures
were unexpected resolved assertions, not setup failures or timeouts.

The isolated candidate's TypeScript build, strict test types and Biome check pass.
Initial formatting and a later check-runner path typo are retained as failures,
not rewritten as successful runs. Native evidence and exact input ledgers are in
`node_modules/.cache/native-validation/passkey-assertion-layout/evidence/`.
Neither pending parent-RP changes nor their tests were included.

## Boundaries

This is a structural consistency check, not a complete authenticator-data parser.
A nonempty extension tail is not proof of a well-formed CBOR map, supported
extension, verified signature or genuine consent. The broker continues to rely
on its explicitly supplied trusted provider; it does not verify signatures or
track signature-counter history. CTAP's canonical decoder is not silently imposed
on generic WebAuthn extension data.

The historical reserved-bit allocation is not used as a rejection mask: modern
passkeys use backup flags in that space. This change neither interprets those
flags as trust evidence nor implements their state-consistency policy. Tests
preserve valid backup combinations and leave reserved bits uninterpreted.

Actual authenticator I/O, PIN/UV workflows, passkey creation/registration,
attestation parsing and end-to-end account authentication remain separate gates.
Synthetic assertions in the tests do not establish any of those capabilities.
