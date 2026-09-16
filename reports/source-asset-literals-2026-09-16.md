# Native pinned script-asset literal recovery

## Delivered

The browser now has a maintained, dependency-free data-literal parser and a native
asset CLI. A caller supplies an audited public HTTPS script URL, decoded-body hash
and explicit byte ranges. The command fetches once, verifies the entire body,
parses only the selected literal syntax and returns bounded source-backed values.
No compiler, SafeJS or page JavaScript execution is needed for this workflow.

`SOURCE-ASSET-LITERALS.md` documents usage, grammar, identity, limits and explicit
limitations. Normal reader extraction and existing page-runtime behavior do not
change. This is not automatic chart discovery, module/export resolution, rendering
or access-control bypass. The caller still establishes the surrounding context.

## Actual CLI validation

At **12:30:20 UTC on September16,2026**, the actual compiled command retrieves the
previously advertised Bankrate `24y2ic8xw9h1l.js` asset in one native GET200.
The66520-byte decoded body matches its independently captured SHA-256 exactly.
The command emits **10829 JSONL bytes**, containing four literal selections:

| Literal | Start byte | End byte, exclusive | Rows |
| --- | ---: | ---: | ---: |
| stateData | 30323 | 34822 | 51 |
| HMDA state literal before its PR filter | 47034 | 50757 | 52 |
| incomeGroups | 51337 | 51645 | 5 |
| loanTypes | 51660 | 51830 | 3 |

All111 raw literal rows exactly equal the earlier independently AST-recovered
values. They include duplicate state representations and the explicitly
unfiltered PR record; **do not describe them as111 independent measurements**.
There are eight risk-chart records and51 shared state/DC records. The CLI does not
apply surrounding filters, derive units or merge the differently scaled annual
fields. String FIPS identifiers and source numeric values are preserved.

Before live access, the same actual CLI entry point runs against a native routed
response under kernel-denied network: one mocked GET, no live requests, the same
four values and10829 output bytes. A separate offline API replay also matches all
four literals, using the earlier core build. These are distinct checks, not new
successful homepage validations. The original article remains2447 Markdown bytes.
The offline CLI's empty HOME/TMP use workspace mode775, not the intended private
mode700; no private-file/credential gate is claimed for it. Live directories are700
and native-unit temporary directories have protected ancestors.

Live observation confirms exactly one credential-free GET, authorized TLS,
request/socket closure and normal process exit. Native metrics show one request,
zero redirects,21786 encoded bytes,66520 decoded bytes, zero active operations
and a closed transport. No retry, page script, SDK, form, ZIP lookup, extra asset,
challenge solver, identity change or alternate browser/client is used. Source
values remain partial, unrendered and `extracted-unverified`, not factual advice.

## Tests and quality

The final clean, fixture-complete candidate passes **809 tests in nine explicit
native-manifest files**:228 new parser cases,150 new API/CLI cases and431 existing
dependency/reader regression cases. Build, strict selected-test types, scoped
formatting and lint all pass. All supervised child/process groups close with no
timeout or signal and empty HOME/TMP. Unit tests use the JavaScript network guard;
the separate offline CLI/API checks use kernel denial.

Coverage includes inert syntax, raw/escaped strings, immutable containers,
prototype/duplicate-key rejection, each resource boundary, byte-view ownership,
strict source identity and UTF-8 ranges, MIME ambiguity, argument errors, one-GET
policy, sanitised failures, backpressure, cancellation, deadlines and late write
errors. A cancelled pending write retains an error guard until acknowledgement or
close, without ending caller-owned streams; completed writes release the guard.

The initial native preflight rejects an inadmissible test-file choice before
running any test. Its approved replacement is `node-route-transport.test.ts`.
A local helper-label check also stops before execution; subsequent core checks
pass659 tests, with three test-only lint findings corrected for the final release.
All those records remain separate. No failed website attempt is hidden as a retry.

The final build has2300 artifacts. All2292 pre-existing compiled artifact hashes
remain unchanged; only the new parser and CLI's eight artifacts are added. The
committed manifest grows from941 to943 entries; the working manifest's three
pre-existing additions remain separate. No dependencies or existing production
modules are changed. Existing user changes are not bundled into the commit.

## Gates still open

This selected gate is **not a full943-file native pass**. The previous broad run's
62 unresolved assertions and22 manifest entries backed only by uncommitted files
are not repaired or revalidated here. Their evidence remains in
`reports/bankrate-chart-assets-2026-09-16.md`. Original hundred-page outcomes remain
unchanged. Automatic discovery/context attribution, map consumers, geometry, ZIP
data, actual SDK, scripted-site rendering and credential/device/access-handoff
gates stay open. Hash/range pins must fail on source changes rather than weaken.

The adjacent JSON records source/runtime/evidence hashes. Complete local receipts
and test records are under
`node_modules/.cache/native-validation/asset-literals-september16/`.
