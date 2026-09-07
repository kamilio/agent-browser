# Native table-close diagnostic observation

On September 7, 2026, a fresh authorized native-browser request narrows the
WebAuthn source-discovery failure to **scope mismatch: expected `td`, observed
`table`, tracked depth 27**. This identifies the failed predicate, not complete
source markup or a proven optional-end-tag pattern. The earlier observations in
`SOURCE-SCOPE-FAILURE.md` remain unchanged.

## Actual result

The single GET of `https://www.w3.org/TR/webauthn-3/` runs at
23:06:44.933–23:06:45.340 UTC. Native transport returns HTTP 200, UTF-8 HTML,
Brotli, 323,705 encoded and 2,739,242 decoded bytes. It closes with one request,
zero redirects, mocks and active requests. Discovery fails `unsupported` at
`native-source-heading-discovery`, retaining these actual trusted diagnostics:

```json
{
  "sourceHeadingStructure": {
    "kind": "source-heading-structure",
    "reason": "scope-close-structure",
    "position": 834905,
    "positionSemantics": "last-committed-source-utf16"
  },
  "sourceHeadingScope": {
    "kind": "source-heading-scope-close",
    "condition": "scope-mismatch",
    "expectedScope": "td",
    "observedScope": "table",
    "depth": 27
  }
}
```

Position is the last committed decoded-source UTF-16 coordinate, not an identified
bad-token start or byte offset. Depth describes the tracked stack, not DOM depth.
No candidate, outline, extraction or capture survives. No raw source or old
capture is inspected, decoded or replayed; matching declared body hashes do not
establish independently validated body identity. Modern privacy wording is unread.

## Validation and evidence

- Five fresh shell supervisor controls pass, finishing 23:00:12.586 UTC.
- Fourteen synthetic native-operation cases pass at 22:58:18.031–22:58:19.500 UTC,
  checking 1,757 inputs. Actual native admission/scanner/getter paths execute with
  non-forwarding fixture routes; two mock metric counters are explicitly masked.
  Four new cases cover scope mismatch, nonplain close and mismatch precedence.
- The actual verifier status helper passes 4,817 finite rows at
  23:05:54.708–23:05:54.744 UTC: two admitted, 4,815 rejected, no import output,
  native imports, receipt reads or requests. Independent static review finds no
  actionable operation regression. These are not full verifier-schema/IO tests.
- Actual supervision runs 23:06:43.931492896–23:06:46.076585690 UTC. Native,
  timeout, pre-final and terminal statuses are one; availability completed;
  input/engine checks zero; stderr empty.
- Separately authorized zero-GET verification runs
  23:07:25.069–23:07:25.418 UTC, checks 1,748 compiled files and 37 RUN artifacts,
  and passes integrity without issues. Admission remains `evidence-only` /
  `native-failure`, expected exit one, no candidate/body identity/replay readiness.
  Receipt and admitted metadata are 2,598 bytes; verifier stdout/stderr are empty.

Frozen evidence: `node_modules/.cache/native-validation/native-source-heading-source-03/`.

| Artifact | SHA-256 |
| --- | --- |
| `SOURCE-INPUT-SHA256SUMS` | `c5902c4867aaeb5e9a97b96708dc1fa47bb31e2365c128b771cf753d1e9506fc` |
| `RUN-SHA256SUMS` | `b27f5cca12b41a3529b37e86d5d57f942ebe8210a8155b97edc5e3fd3327039c` |
| `exit-code.txt` | `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865` |
| `stdout.jsonl` | `e8574f04ec1926f18e1c76c6310af2ff53fc923f6a906acf5f30898e99a5e9a3` |
| `INTEGRITY.json` | `717b5c0a28b20cb6a8e0eb1fe667c92e77837777a87f5c1b4379a444b4fc18d5` |
| `FINAL-SHA256SUMS` (304 entries) | `efb99dde974c348c97dcc9c5f11c9a4ccb59bcd146333d93e95ff48d8e90013a` |

Operation hash `461bb93e66de16e194986ebd4e851cc28c192af946d242f53a527682e33247e3`;
verifier hash `27665ba101b14565afa74e5c89a18eaa26930c7ab7f66a98db2bd0d076b9cf05`.
Frozen engine commit label `f1cdf57168a549f34154af3391d2ce0b96f1688d`, inventory
`1efa93f3ff924e012a07ca1e034a869e79cfaf7539666e024845afa4b6abf901`.

## Next work and limits

Investigate a conservative lexical suppressed-table model using local native
code and synthetic cases. Do not blindly pop to a table, infer complete source
markup, claim DOM/HTML-standard compatibility, raise budgets or replay captures.
Any grammar change, tests and later source activation need separate review and
authorization. Current strict grammar and all bounds are unchanged by this run.

Actual provider/vault, passkey privacy/device/page/consent and full-browser gates
remain open. The stopped Reddit/Astra/X and denied RP/SafeJS/socket/TTY gates remain
unchanged. Header/first-label classification is limited, not challenge bypass.
The original browser improvement goal remains active.
