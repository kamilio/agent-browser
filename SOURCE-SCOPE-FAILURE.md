# Native source scope-close failure

Observed September 7, 2026. A fresh authorized request reaches the W3C WebAuthn
Level 3 document, but native heading discovery still fails. The new trusted
diagnostic narrows the failure to the scope-close guard; it does not establish
the offending tag or make the source readable. Earlier reports and measurements
in `RESEARCH-SOURCE-HEADING-FAILURE.md` remain unchanged.

## Actual observation

The one-request attempt to `https://www.w3.org/TR/webauthn-3/` runs at
**22:21:47.578–22:21:47.948 UTC**, measured 371 ms. The native transport reports
HTTP 200, UTF-8 HTML with Brotli, 323,705 encoded and 2,739,242 decoded bytes.
It closes with one request, zero redirects/mocks/active requests.

The exact native failure is:

```json
{
  "category": "unsupported",
  "stage": "native-source-heading-discovery",
  "sourceHeadingStructure": {
    "kind": "source-heading-structure",
    "reason": "scope-close-structure",
    "position": 834905,
    "positionSemantics": "last-committed-source-utf16"
  }
}
```

The position is the last committed native cursor coordinate in decoded source
UTF-16, not an identified offending-token start or a body-byte offset. The guard
combines a tracked-scope top mismatch with a non-plain closing token. This record
does not distinguish those predicates or name either scope. A presumed table
optional-end-tag issue would be speculation, not an observed diagnosis.

No `sourceDiscovery`, candidate outline, extraction or `bodyCapture` is retained.
Outcome remains `failure`, `partial: true`, `contentSuccess: false`. No raw source
or historical capture is inspected. The primary body hash matches an earlier
declaration, but that is not independently revalidated body identity or a new
read of privacy wording.

## Controls and limits

The operation explicitly uses the already tested native diagnostic getter and
full-original-header admission before the primary summary/classifier. It does
not change scanner grammar, budgets, yields, deadlines or output bounds.
Network/source remains one exact GET, no cookies/auth/redirects, 4,000,000-byte
response/session caps, 15-second request and 120-second whole-operation budget;
external supervision is 125 seconds plus five-second kill grace. No page scripts,
SafeJS, another browser, external HTTP client or host source-parsing fallback.

Fresh separately authorized prerequisites:

- Five shell-only supervisor controls pass at 22:18:12.578–22:18:19.727 UTC:
  success, nonzero failure, timeout, pre-existing collision and finalizer collision.
- Ten actual native operation fixtures pass at 22:19:26.748–22:19:27.844 UTC,
  checking 1,757 inputs. Actual native request admission and scanner/getter/capture/
  emitter run under synthetic routes with disabled DNS/HTTP fallback. Separate
  observers retain actual metrics; only two mock counters are masked. All cases
  have zero forwarding and one output write. Ordinary candidate, three structural
  reasons, challenge/header boundaries, private network error and empty-source
  cases pass. These are synthetic results, not a successful W3C source read.
- The new actual verifier helper passes 4,817 finite status rows at
  22:20:24.800–22:20:24.836 UTC: two admitted, 4,815 rejected, no import output or
  direct lane artifact mutation. Admission deliberately requires matching all-zero
  or all-one completed statuses and zero input/engine checks.
- Independent static review finds no actionable regression in the intended
  operation changes. It does not infer the actual source markup.

Complete header admission prevents oversized/ambiguous headers from being
silently omitted for classification. Headers-plus-first-candidate-label detection
remains limited; this is not comprehensive barrier detection or challenge bypass.

## Failure integrity

The supervisor runs at 22:21:46.514992917–22:21:48.692023862 UTC. Native,
timeout, pre-final and terminal statuses are all one, availability is completed,
input/engine checks are zero and stderr is empty. Separately authorized zero-GET
verification at **22:23:34.343–22:23:34.718 UTC** checks 1,748 compiled files and
36 RUN artifacts. Integrity passes without issues while preserving
`evidence-only` / `native-failure`, no candidate evidence and verifier exit one.
The exact 2,415-byte metadata retains the native diagnostic; no body decoding,
outline export, native imports, retry or additional request occurs.

Evidence directory:
`node_modules/.cache/native-validation/native-source-heading-source-02/`.

| Artifact | SHA-256 |
| --- | --- |
| `SOURCE-INPUT-SHA256SUMS` | `13882616ca7dbeb5d15938ec90c7d15ce0f97411d23aacb5da2d76cbd3e57e1a` |
| `RUN-SHA256SUMS` | `4304db6e3b9a4f5b6348cc8fe381f57dd2e150da214ad53172e1082df7b2af2b` |
| `exit-code.txt` | `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865` |
| `stdout.jsonl` | `1f73739a80e3833e3fbf1417cc72b2a59084bf47b0c006ddb23f11445d79a0e2` |
| `INTEGRITY.json` | `2178a3b42a4d897fdc0d1441633ecf32387001d066dbf2b4057132941a7da446` |
| `FINAL-SHA256SUMS` (292 entries) | `4209056c5d3bd497a5a3d0c53cf3948f764bd2005febaa2b38e7992d3e7619e3` |

The frozen diagnostics engine has commit label
`6ab350fc56a8119735e752de8a9b6881ae51d2d1`, inventory SHA-256
`308894082e05c94afac808b485d0ffcd0ead1f6508d2cb97b0773001f11c6059`.
Operation SHA-256:
`6f82b79bac842763b67260513b71471f23b89b93d27eff126c61706dcc6fb13b`;
verifier SHA-256:
`6ab01506e3709a4f1d581fc1db9078157592f2de22c0c7b0d0b81b6df80e0d64`.
The verifier's new narrow status rule does not model every legitimate interrupted
state; full malformed/IO/collision/candidate-success matrices remain unrun.

## Next bounded work

Distinguish the existing scope-close predicates using only trusted fixed metadata
and finite scope-name constants, without changing parsing behavior or exposing
source/attribute values. Such code, tests and later source activation remain
separate gates; the actual offending construct is not yet established. Do not
relax grammar, raise limits or replay old captures on the strength of this result.

Published passkey privacy wording, providers, physical devices, page/consent
integration and full browser acceptance remain open. Stopped Reddit/Astra/X and
previously denied RP, SafeJS, socket and TTY gates are unchanged. The overall
browser goal remains active.
