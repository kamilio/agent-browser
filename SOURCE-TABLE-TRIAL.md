# Native opt-in table-policy trial

On September 7, 2026, a separately authorized native-browser request with the
tested explicit table policy reaches a later source coordinate, but **still
fails without candidates, source text or capture**. The earlier measurements in
`SOURCE-SCOPE-DETAIL.md` and feature validation in `SOURCE-TABLE-SCOPES.md` remain
unchanged. This is a preserved failure, not successful WebAuthn research.

## Actual observation

One GET of `https://www.w3.org/TR/webauthn-3/` runs at
23:43:11.205–23:43:11.591 UTC. Native transport returns HTTP 200, UTF-8 HTML with
Brotli, 323,705 encoded and 2,739,242 decoded bytes. It closes with one request,
zero redirects, mocks or active requests. The native failure is:

- Category/stage: `unsupported` / `native-source-heading-discovery`.
- Structure: `scope-close-structure`, position **872144**, semantics
  `last-committed-source-utf16`.
- Scope: `scope-mismatch`, expected **`td`**, observed **`table`**, depth **31**.

The coordinate is later than the previous trial's 834905, but is neither an
identified bad-token start nor a body-byte offset. The records do not reveal the
complete tracked stack or prove a particular omitted-tag pattern. The matching
declared body hash is not independent byte revalidation. No raw source or old
capture is inspected, decoded or replayed; modern privacy wording remains unread.

## Integration and integrity

This operation explicitly selects `tableScopePolicy: "optional-end-tags-v1"` in
the actual native scanner call and sourceMode provenance. A successful native
report would also have to declare that policy; no success is inferred here.
The existing trusted diagnostics, full-header admission, exact source authority,
resource caps, candidate-only capture, final metrics and failure replacement stay
unchanged. Default strict scanner behavior remains unchanged elsewhere.

- Five fresh shell supervisor controls pass at 23:39:13.593–23:39:20.460 UTC.
- Twenty native synthetic integration cases pass at
  23:42:19.235–23:42:21.255 UTC, checking 1,757 inputs with zero forwarding,
  actual native cursor cleanup and one output write per case. They use fixture
  routes and explicitly mask only two mock metric counters. The changed opaque
  template fixture and six new table cases are documented, not reused evidence.
- The actual verifier status helper passes 4,817 rows at
  23:40:15.211–23:40:15.243 UTC: two admitted, 4,815 rejected; no import output,
  native imports, receipt reads or requests. Independent static operation review
  finds no actionable regression.
- Actual supervision runs 23:43:10.141811630–23:43:12.355504426 UTC. Native,
  timeout, pre-final and terminal statuses are one; availability completed;
  input/engine checks zero; stderr empty.
- Separately authorized zero-GET verification at
  23:44:04.549–23:44:04.913 UTC checks 1,748 compiled files and 37 RUN artifacts.
  Integrity passes without issues, retaining `evidence-only` / `native-failure`,
  expected exit one, 2,635 metadata bytes and no candidate/body identity/outline/
  replay readiness. Verifier stdout/stderr are empty. Full policy/schema/IO and
  candidate-success verifier controls remain unrun.

Frozen evidence: `node_modules/.cache/native-validation/native-source-heading-source-04/`.

| Artifact | SHA-256 |
| --- | --- |
| `SOURCE-INPUT-SHA256SUMS` | `f40463fd2e876d1a6b2f730be4baad89c15756759acf219f9e95c0e6f58e4651` |
| `RUN-SHA256SUMS` | `265274958d926576d052179290a4b98912891374672e59743b90d10316de3b9a` |
| `exit-code.txt` | `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865` |
| `stdout.jsonl` | `5e77f8bb9c3488580f65ab872cc436029d88b21499572a120df4f018e5be0a0a` |
| `INTEGRITY.json` | `b4205f9317bd0d4bb0a79d7ab2f50cfdad5db1a2d9273c982190558b32889487` |
| `FINAL-SHA256SUMS` (328 entries) | `56810ffc9cf255955f7332850c99487d20aedac4270b6250ce521812688cf63c` |

Operation `311503345ef065e803239b36c5132eceee85e672fedcea83fa06e4f403375f5b`;
verifier `8841a80bcb50da49c0f9c66837309651c0f3007a991106627a0daf7bed44336e`.
Frozen engine commit label `76c5591522f962ac6b008157bd9f4ef0802d5754`, inventory
`7ef39de1a4784e97595fad5dd0bef4abe4a6c4de6fe5909228008db80060ecf7`.

## Next bounded work

Add trusted bounded tracked-scope context using finite native tag constants,
without changing grammar or exposing source/attribute values. Test and review
that diagnostic before any separately authorized source use. Do not assume
implicit thead/tfoot handling, search for arbitrary ancestors, raise limits or
replay captures merely to force this source through.

Provider/vault, modern passkey privacy, physical-device, page/consent and full
browser gates remain open. All stopped/denied research, RP, SafeJS, socket and TTY
gates remain unchanged; this trial is not challenge bypass. The original browser
improvement goal remains active.
