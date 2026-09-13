# WHATWG table-heavy document check — September 13, 2026

**Verified native document reading, not full-page rendering.** This is a fresh
public website capture after the column-group reader fix, separate from the
retained W3C Selectors before/after reproduction.

## Source and runtime

- URL: `https://html.spec.whatwg.org/multipage/tables.html`.
- Captured September 13, 2026, **12:16:17.507 UTC**: one actual GET, HTTP 200,
  no redirects, retries, subresource requests or challenge diagnostic.
- Body: 254,858 decoded / 32,212 encoded bytes; SHA-256
  `fb26736819aaa873821f4e0322a0e3c96b884737541f1956eea1739be058d0c4`.
- Audited runtime: `native-reader-colgroup-september13-round00/snapshot01/dist`,
  18,931 passing native cases, zero failures, two unchanged exclusions.
  Snapshot base is `ee8237a8f3383c360a9e7db03e69d71ec43467a9`; committed source
  `9aa37b861011dc4cafa849b6b9338f85ea07459f` matches its two owned-file hashes.

## Reader result

One sealed, zero-network `long-v1` reader load used the exact captured bytes and
default raw policy, without increasing limits or rewriting the source. Extraction
ran **12:16:22.195–12:16:22.405 UTC**; this interval is one instrumented run,
not a repeatable performance comparison or page-rendering measurement.

- 10,816 native nodes; maximum depth 17 within the unchanged depth-128 limit.
- Three queries return **19 headings, nine tables and zero column groups**.
  This page therefore adds table-heavy coverage, not another positive omitted
  column-group reproduction; the retained Selectors document provides that proof.
- Six complete headings / 143 text units retained, including “Tabular data” at
  `e163` and the table/caption sections. No raw-HTML search or text reconstruction.
- Query work: 341,956; walk work: 10,994. Document revision remains unchanged.
- Reader reports zero tokenizer issues; 13 omitted script/meta/link subtrees,
  3,053 ignored attributes and 2,029 unwrapped elements remain explicit.

All document/query/network owners close; process groups are absent; private
HOME/TMP directories are empty and removed. Credential jars start empty,
credentials are omitted, and no cookies are accepted. Source/compiled inventories
match before and after both phases. No script runtime, SafeJS, real TTY, credential
provider, passkey device, site action, geometry or raster acceptance is established.

## Evidence

Paths are relative to `node_modules/.cache/native-validation/`:
`native-whatwg-tables-september13/RESULT.json` and its 50-entry `EVIDENCE.sha256`.
Ledger SHA-256: `6a849a998a44fcbe0fa5f18ca2d43c0fea31aa1da17f9262b725d6041356e744`.
The overall browser goal and original four research topics remain open.
