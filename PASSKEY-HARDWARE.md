# Real hardware passkeys: qualified next steps

September 5, 2026. Native-only documentation research identifies an eventual
external-key milestone, not an implemented hardware or platform authenticator.
The existing software authenticator remains explicitly software-backed.

## Dependency and execution boundary

**libfido2 is not an approved new runtime dependency.** No binary, library, npm
module, FFI wrapper or helper was installed, bundled or executed. Neither
`fido2-cred` nor `fido2-assert` resolved through the research agent's read-only
`command -v` check; this is a PATH observation, not a machine-wide inventory.
No device enumeration, hardware access, PIN entry, account or keyring access ran.

A host-provided CLI adapter would still depend operationally on that external
tooling. Calling it optional does not remove the dependency or authorize its use.
Any such path requires an independently provisioned compatible host and separate
execution/device authorization. Do not install tooling or substitute software
credentials to claim a real-device result.

## What the primary manuals establish

- The credential CLI documents ES256 registration using base64 client-data hash,
  RP ID and user inputs. Its output includes CBOR-encoded authenticator data,
  credential ID and attestation information. Assertion generation accepts one
  known credential ID and returns authenticator data and a signature. These are
  documented protocols, not verified behavior of an installed release.
- The assertion CLI's documented resident mode does not return the selected
  credential ID. A user handle is not that ID. This prevents a general
  discoverable-credential adapter without another qualified interface; do not
  guess IDs or invisibly enumerate device credentials to fill the gap.
- The registration CLI lacks documented exclusion-list and full display-name
  inputs. A post-result duplicate check cannot undo creation of an unwanted
  device credential. Reject unrepresentable requests before touching hardware.
- Touch, UV and host consent are distinct. Requested flags or exit code 0 do not
  prove actual presence/verification; validate returned data and obtain trusted
  human approval for the actual RP and operation. PIN behavior differs between
  commands. Piped stdio alone does not prevent a tool opening a controlling TTY.
- Library cancellation APIs do not establish a CLI cancellation guarantee or
  prove a cancelled creation had no device side effect. Require explicit device
  ownership, bounded private I/O, no blind retries and qualified cleanup behavior.
- Windows Hello needs exact unhashed client data rather than only its hash.
  The subsequent broker-context extension now supplies detached exact
  `clientDataJSON` bytes alongside the hash; see `PASSKEYS.md`. Reconstructing
  bytes from page options or treating an RP hostname as the complete origin is
  incorrect, especially for nondefault ports. This prerequisite does not
  implement a Windows Hello bridge or qualify an actual platform provider.

The earliest defensible device milestone is one genuinely hardware-backed,
non-discoverable ES256 registration and assertion with required touch, no PIN,
one explicitly approved assertion ID and independently verified signature. It
would not establish resident, platform, synchronized or live-RP acceptance.
All missing tool/version/device/noninteractive gates must be satisfied first.

## Research evidence

Nine native-reader attempts ran from **04:44:42.592 to 04:45:42 UTC** on
September 5, 2026: two sandbox network failures, two HTTP-200 HTML pages rejected
by the loader, and five successful plain-text manual extractions. No challenge
denial was bypassed. The source is mutable upstream `main`, not a pinned release.

| Source | Official URL | Receipt UTC |
| --- | --- | --- |
| Credential CLI | `https://raw.githubusercontent.com/Yubico/libfido2/main/man/fido2-cred.1` | 04:45:23.423 |
| Assertion CLI | `https://raw.githubusercontent.com/Yubico/libfido2/main/man/fido2-assert.1` | 04:45:23.508 |
| Token-management CLI | `https://raw.githubusercontent.com/Yubico/libfido2/main/man/fido2-token.1` | 04:45:42.509 |
| C assertion interface | `https://raw.githubusercontent.com/Yubico/libfido2/main/man/fido_dev_get_assert.3` | 04:45:42.578 |
| Device/capability interface | `https://raw.githubusercontent.com/Yubico/libfido2/main/man/fido_dev_open.3` | 04:45:42.647 |

Exact commands, stdin/stdout contracts, source qualifications, original JSONL,
stderr and hashes remain under
`node_modules/.cache/native-validation/browser-research/passkey-hardware-feasibility/`.
Its `REPORT.md` is the detailed design input, not a launch guide or execution
authorization. Corrected code-fence reconstruction matches all five manual body
hashes; the initial framing-check failures remain intact. The parent verified all
17 saved artifact checksums; log:
`node_modules/.cache/native-validation/passkey-hardware-parent-integrity.log`.

Actual SafeJS byte/capability acceptance, reviewed parent-domain RP/public-suffix
policy, human UI, hardware and real relying-party/account acceptance remain
separate gates. Raw CTAPHID through Node builtins is only a future research
question: these manuals do not establish its framing, descriptor, transport,
ownership, cancellation or PIN-security contract.
