# Historical section-trial receipt hashing scope

September 8, 2026. **Qualification of trial02 isolation, not a new validation run.**
The native decode/section operation used the recorded child network namespace,
but the surrounding historical supervisor also included the source receipt in
its host-side preflight and finalization checksum checks. Do not interpret the
creation-section report as proof that every receipt-byte read was namespace-only.

## Basis and distinction

Static inspection of frozen `native-section-trial-02/supervise.sh:29` and line62
finds generic `sha256sum -c SOURCE-INPUT-SHA256SUMS`. The frozen ledger has19rows;
its last row names the source10 receipt. The first checksum call is in outer
finalization; the second precedes starting the namespace child. Under that code
path, checksum verification reads the receipt outside the child namespace.

Retained `preflight.stdout` and `inputhash-check.stdout` each report that receipt
path as `OK`; the retained final input-hash status is0. This is recorded checksum
output plus source/control-flow evidence, not a syscall trace or a new reproduction.
Hashing receipt bytes is distinct from JSON decoding, capture replay or source
section extraction. No receipt/body/capture bytes were opened, statted, rehashed,
decoded or replayed for this notice; only code, ledger metadata and checksum logs
were read. The receipt itself has not been freshly revalidated here.

The separate historical verifier deliberately skips the receipt's declared row
and checks18actual inputs. That verifier behavior does not make the earlier
outer supervisor declared-only. Its recorded result is unchanged.

## Preserved evidence

Paths below are under
`node_modules/.cache/native-validation/native-section-trial-02/`:

| Metadata artifact | SHA256 |
| --- | --- |
| supervise.sh | `eaa464e06967c3743fab8937ef4e1b9acf5998e7185f0ea09f6d445b1a5ed106` |
| SOURCE-INPUT-SHA256SUMS | `ad496b4c87e73768aebd2adeeb20f7dc55bb87fb2350102fae17fc4e83184c45` |
| preflight.stdout | `31d8d990c374f0b685fb5d52bd20f203c443cfc2b40fa900cd92422fbccc2a38` |
| inputhash-check.stdout | `31d8d990c374f0b685fb5d52bd20f203c443cfc2b40fa900cd92422fbccc2a38` |
| inputhash-check.exit-code.txt | `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa` |

`SOURCE-SECTION-CREATE-TRIAL.md`, its native export, timings, namespace identifiers,
verifier result and253-file frozen inventory are not edited or relabeled. This
limitation does not reverse those recorded outcomes or demonstrate a network
request outside the namespace. Network namespaces do not by themselves prevent
filesystem reads. The narrower decode/section boundary and broader checksum
boundary must be described separately.

## Prospective work

Trial03 preparation replaces generic receipt-bearing checksum calls with exact
non-receipt checks plus a declared-only receipt comparison. That is a new proposed
behavior, not what trial02 did. Independent review also found a missing verifier
contract and malformed-ledger/NUL concerns; corrections and a separately scoped
synthetic checker gate remain unvalidated. No trial03 source action is authorized
by this notice. Do not use its future fix to rewrite historical evidence.

This qualification concerns the inspected trial02 wrapper only; it is not a
fresh audit of all earlier source trials, complete process/filesystem isolation,
or actual WebAuthn/device/credential acceptance. The ongoing browser work and
all unrelated outstanding gates remain unchanged.
