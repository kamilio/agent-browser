# GnuPG clear-applicability follow-up — September 12, 2026

The new **captured-only flow still fails**, but its first failure is now the
document-width supported-formatting-profile guard rather than the prior
supported-block-owner guard. This is useful diagnostic progress, not a working
GnuPG website or successful FAQ navigation claim.

## Controlled replay

Committed native12254 (`722c101fe567d59dabb4ab1db11e22a2f18c0892`) runs one
session using all six original captured responses, including all four images.
There is one initial navigation, one genuine discovered FAQ click, one document
commit, six exact mocks, zero HTTP/wire calls and zero replay misses. The same
58-anchor discovery selects FAQ reference `e282`; no destination is observed.

Native UTC: 2026-09-12T07:40:55.872Z–2026-09-12T07:40:57.169Z.
The same source, viewport, capacities, identity and request policy are preserved.
Decoded response bytes total34,877. DOM/title/history remain unchanged after
the failed click; the DOM retains428 nodes/revision434. Sampled document, image,
event, control, session and transport ownership closes under the recorded checks.
There is no retry, source stripping, forced navigation or restriction bypass.

## What changed and what did not

The clear-applicability fix preserves computed CSS while excluding inline,
boxless, out-of-flow and flex/grid-item boxes from false clearance ownership.
The full-image census now records **two clear requests instead of eight**,
consistent with the two genuine block owners and six ignored inline anchors.
Nine float diagnostics remain. No deferred element appears in this census.

Independent CSS counts are unchanged from the preceding12187 replay:

| Diagnostic | Raw | Applicable |
| --- | ---: | ---: |
| Invalid or unimplemented value | 7 | 2 |
| Unimplemented property | 43 | 14 |
| Invalid or unimplemented selector | 2 | 2 |

These unresolved profiles still prevent width/layout acceptance. No sole cause
is assigned to any declaration. Source-only unloaded-image probes are not used
as full-image comparators; neither historical live nor captured runs are rerun.

## Parent verification and next work

Sealed report: `GNUPG-CLEAR-APPLICABILITY-REPLAY.md`, SHA256
`4eea923725d8a6330cecb74f1552f633358e55d37c5162f40504de7f2d1b7bb5`.
Parent verification on September12,2026 at07:42:51.478UTC reproduces22 checks,
282/284-entry ledgers and eight actual Git outputs: the release tree plus seven
owned snapshot inputs. The read-only verifier denies sockets/socketpair,
reports zero guard attempts and executes no browser page. Its evidence is in
`node_modules/.cache/native-validation/inline-clearance-work-september12/parent-gnupg-applicability-verification`.

The source release independently passes12,254 selected native cases, zero
failures and two unchanged exclusions; see `CLEAR-APPLICABILITY.md`. This replay
does not turn those isolated results into live acceptance. Next work remains
Netlib center layout and scoped regression-backed CSS/HTML compatibility,
including BusyBox font-family/presentation/table limitations. The inventory
remains75 attempted hosts, not75 working sites. Research completeness and
provider/credential/passkey-device/TTY/realSafeJS/challenge gates remain open.
