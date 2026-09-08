# Native finite scope-context source trial

On September 8, 2026, one separately authorized native GET of
`https://www.w3.org/TR/webauthn-3/` runs at 00:39:08.567–00:39:08.950 UTC.
HTTP 200 returns UTF-8 HTML with Brotli encoding: 323,705 transport-encoded and
2,739,242 decoded bytes. Actual metrics report one request, zero redirects,
zero mocks, zero active requests and closed transport. No alternative browser,
raw-source fallback, cookie, authentication, page runtime or challenge bypass
is used.

## Actual bounded diagnosis

The scan still rejects `unsupported` at `native-source-heading-discovery`:
`scope-close-structure`, last-committed source UTF-16 position 872144,
`scope-mismatch`, expected `td`, observed `table`, tracked depth 31. The new
trusted getter additionally reports the actual finite tracked scopes in
outer-to-inner order, under explicitly selected `optional-end-tags-v1`:

```text
head table thead tr th tbody tr th td td td
tr th td td td tr th td td td tr th td td td tr th td td td
```

This is an owned bounded scanner-state snapshot, not raw HTML, attributes,
DOM ancestry, an event history or inferred intervening markup. The accumulated
noncanonical table stack explains why a canonical-suffix-only planner cannot
close this state. It does not establish which earlier source transition first
created it, or prove any proposed grammar extension will recover this document.
The retained outer `head` is an independent unresolved scope, not authorization
to bundle head recovery into a table fix.

There are no source-discovery candidates, extracted text, outline or body
capture. The transport-declared body hash is
`157030c980d44a3ce4b1ec5bcfaa16790c7dfefac20709af6ed2b11c7120970b`;
its agreement with prior declarations is not independent body-byte validation.
Older receipts remain unchanged and are not retroactively enriched. No source
body or historical capture was inspected, decoded or replayed.

## Fresh checks and preserved evidence

- Five shell-only supervisor controls pass at 00:13:02.367–00:13:09.330 UTC.
  Both shell scripts receive separate syntax checks. These controls execute no
  native source operation.
- Twenty-one synthetic native integration cases pass at
  00:38:23.652–00:38:25.965 UTC, checking 1,757 inputs with no forwarding,
  actual native admission/getter/cursor cleanup and one output write per case.
  Twenty existing fixture strings remain; the added depth-128 context case
  preserves native bounds. Only two disclosed mock metric counters are masked.
- The actual verifier status helper passes 4,817 rows at
  00:14:13.685–00:14:13.718 UTC: two admitted and 4,815 rejected, without import
  output, native imports, receipt reads or requests. Independent static operation
  review finds no actionable regression. Parent reviews the integration,
  controls and verifier changes before execution.
- Source supervision runs 00:39:07.477275431–00:39:09.711589501 UTC. Native,
  timeout, pre-final and terminal statuses are one; availability is completed;
  input/engine checks are zero and stderr is empty.
- Separately authorized zero-GET verification at
  00:39:50.572–00:39:50.950 UTC passes integrity for 1,748 compiled files and
  37 RUN artifacts, with no issues. It preserves `evidence-only` /
  `native-failure`, expected exit one, 2,996 metadata bytes, no candidate/body
  identity/outline integrity/replay readiness, and empty verifier stdout/stderr.
  The complete malformed-context/schema/IO/candidate-success control matrix is
  still unrun. Status controls alone do not validate that matrix.

The initial approval reviews for supervisor controls and synthetic integration
each time out; one identical retry for each is approved. Source and verifier
operations run once under their own approvals, not as implicit continuations.

Frozen evidence: `node_modules/.cache/native-validation/native-source-heading-source-05/`.

| Artifact | SHA-256 |
| --- | --- |
| `SOURCE-INPUT-SHA256SUMS` | `5da69ab8bcc7f75ec7ee9ce47dd06a6be25e14a6e80bc3d04d876692e7741a33` |
| `RUN-SHA256SUMS` | `4d64c72f025225ace822fad534c6394fb8674b9b00d7d862fe624b5ccc38f098` |
| `exit-code.txt` | `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865` |
| `stdout.jsonl` | `64bb1fbdcacc4fb75f3da62128d9c317c4249cba6f7b346fcf2b2b2c1cecf4f2` |
| `INTEGRITY.json` | `59f93caac16aa9f6e8538b78e452de324d6ba7e08836d548382c457bb7db3506` |
| `FINAL-SHA256SUMS` (334 entries) | `0a2aa465b3aeed4ac3ec72dde7748d22092409a4d72831229cf53d66ad9fe7d8` |

Operation `a3b71e8bbd8f7cc92a069ced87d06d467a6c9287c531aef7f7440501d3bfe042`;
verifier `8c4e607233e5782cfeb945e5e2ba72890c8ab9c131083c1782d571b24a3e5577`.
Frozen engine commit label `4e440c9ed0b07901eb0810481277361ea93f33b7`, inventory
`ba268dddc0f2932196e077101000162b3f0567c200231a6410a012969fc80457`.

## Next bounded work

Investigate the smallest canonical table transition extension using local
scanner/parser code and independent synthetic fixtures. Preserve explicit policy
provenance, opaque boundaries, outer suppression, strict defaults and every
resource limit; do not pop arbitrary ancestors to repair the observed stack.
Review and test any extension separately before proposing another live operation.
Modern WebAuthn privacy research, provider/vault/device/page/consent acceptance,
blocked research and all stopped/denied gates remain unresolved. This trial is
neither browser compatibility acceptance nor a completed passkey implementation.
