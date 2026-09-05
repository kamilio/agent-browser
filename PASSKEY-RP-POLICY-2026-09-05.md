# RP-ID research: source-access limits and an integration hazard

This native-browser-only round on September 5, 2026 did **not** obtain readable
WebAuthn normative evidence. It makes no RP-policy permission change. The complete
offline PSL fixture in `PUBLIC-SUFFIX.md` does not supply the missing WebAuthn
authorization rules by itself.

## Attempts

Four runs covered three distinct official candidate URLs. Times are UTC.

| Source | Time | Observed result |
| --- | --- | --- |
| `https://www.w3.org/TR/webauthn-3/` | 05:12:11.049 | Sandbox network failure; zero body bytes |
| Same URL, separately authorized retry | 05:12:19.137–05:12:19.265 | Decoded response exceeded the two-million-byte transport ceiling; no accepted response/hash/content |
| `https://developers.yubico.com/WebAuthn/WebAuthn_Developer_Guide/Scopes_Credentials.html` | 05:12:40.163 | HTTP 404, 9,726 decoded bytes, then loader unsupported |
| `https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialCreationOptions` | 05:13:02.357 | HTTP 200, 169,283 decoded bytes, then loader unsupported |

All runs exited 1 and reported content failure. The Yubico and MDN candidates
were recorded known URLs, not links falsely attributed to unread pages. Neither
loader result identifies its offending HTML construct; original bodies were not
exported by that runner. A null challenge classification on failed loading does
not prove that an unseen body is readable or barrier-free. No limit was relaxed,
alternate browser used or security denial bypassed. Subsequent diagnostics must
retain their own evidence rather than rewriting these failures.

## Local-code hazard, not a discovered policy bypass

The current broker intentionally accepts only exact-host RP IDs. Its provider
context and assertion RP-hash validation consequently use that origin hostname.
Simply relaxing the admission comparison for parent RPs would leave those other
operations bound to the wrong RP. A future implementation must consistently use
the approved selected RP for provider options, credential namespace and RP hash,
while exact client-data origin retains the document origin including its port.
This is a prospective integration requirement, not a bug in the unchanged
exact-host policy or evidence that parent-RP authentication works.

Before widening policy, establish source-backed WebAuthn rules for same-host and
parent-domain admission, intermediate parents, public and PRIVATE boundaries,
IDNA/root dots/IPs and secure origins. Test registration, assertion, cancellation,
allow/exclude lists and exact credential namespaces together. Do not assume an
RP must equal the registrable domain, or that any string suffix is an eligible
parent. Keep actual guest-runtime, hardware and live-RP acceptance separate.

## Evidence

Original reports, commands, body hashes where available, timestamps, source
qualifications and the proposed test checklist remain in
`node_modules/.cache/native-validation/browser-research/passkey-rp-policy/`.
All 20 saved artifact checksums passed parent verification from the manifest's
required directory; the earlier wrong-directory audit failure remains intact.
The successful log is
`node_modules/.cache/native-validation/passkey-rp-policy-parent-integrity-corrected-cwd.log`.
There was no source change, test execution or authentication acceptance in this
research round. Existing exact-host RP restrictions remain in force.
