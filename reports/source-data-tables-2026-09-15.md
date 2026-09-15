# Source-backed product data — September 15, 2026

## Outcome

The native reader now exposes bounded `sourceDataTables` metadata from a labeled
`data-json` table schema. This recovers useful product specifications already in
the HTML without page scripts, another HTTP request, or browser impersonation.
The original Markdown/JSON body is unchanged and retains priority within the
output byte budget. Metadata is explicitly partial, document-source information,
not a claim about rendered or CSS-visible content.

The motivating AMD Ryzen AI response was captured during the earlier hardware
run, not fetched again. Its five product tables contain **31 rows and 276 formatted
fields**. The new output matches an independent inventory of the entire supported
source schema: **27,409 serialized UTF-8 bytes**, including units and separate
prefix/suffix qualifiers. For example, the first product's maximum boost field
retains `5.1 GHz` and `Up to `, rather than substituting its raw numeric `5100.0`.
These are published source claims, not measured hardware performance.

## Validation

- Clean baseline: **1,647 tests in 21 explicitly selected native test files**.
- Clean candidate: **1,722 tests in 23 files**, including **75 new tests**;
  every baseline assertion retains its name, occurrence and passing status.
- Final build, narrowed types, formatter, linter and selected native suite pass.
  Initial formatting findings and three Number-constant lint findings were fixed;
  their failed records remain intact. The first candidate already passed all
  1,722 tests. No full-manifest or SafeJS acceptance pass is claimed.
- **26 saved-response/policy cases across 22 original captures** were exercised
  on both builds: **52 in-memory navigations**, zero HTTP requests. All body
  outcomes, Markdown hashes, reader diagnostics and existing source metadata
  remain unchanged. Only AMD gains the new metadata in this corpus.
- **30 successful original-receipt replays** reproduce extraction; **14 attempts
  to replay original failed receipts** remain denied. The original RFC resource
  limit is unchanged, rather than silently raised to make the corpus pass.
- The independent inventory and both replay child groups exited and were reaped;
  network-denial guards report no attempted network use. Source, compiled and
  original capture pins are checked separately from test success.
- Independent static review found no actionable production defect at the recorded
  three production hashes; this is not a live or performance acceptance claim.

## Contract and remaining work

See `SOURCE-DATA-TABLES.md` for schema, lifecycle, provenance and fixed bounds.
Both JSON and Markdown extraction envelopes can carry the metadata. Whole rows
fit into the remaining byte budget; a truncation marker or absent field is possible
when space is insufficient. Unknown bootstrap data is not dumped, raw values are
not converted, HTML-looking strings are not rendered, and attributes are not
decoded twice. Omitted subtrees follow the chosen source-visibility policy.

This targeted saved-source fix is **not another top-100 live sweep**. The original
100-site results remain in `reports/top100-websites-2026-09-15.md`, including empty
pages, barriers and failed requests. JavaScript-dependent sites, the outstanding
SafeJS contract issue, credential/passkey acceptance, interactive/service/TTY gates
and CAPTCHA handling remain open. No credentials or page runtime were accessed.

Machine-readable counts, original receipt/body hashes, production pins and
per-case comparisons are in `reports/source-data-tables-2026-09-15.json`.
Private invocation logs, independent inventory, validation failures/corrections,
review and audit records are retained under
`node_modules/.cache/native-validation/source-data-tables-september15/`.
