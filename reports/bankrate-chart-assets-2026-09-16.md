# Bankrate: recovering chart records from public script assets

## Outcome

The prior article workflow returned research prose but no complete chart values.
Five separately scoped native asset GETs now locate the missing data in public
JavaScript bundles. Offline AST-only recovery confirms **eight risk-chart rows**
and **51 distinct state/DC records**. No page JavaScript is executed.

This is successful source-data recovery, **not yet a maintained browser extraction
feature or a rendered chart**. It does not retroactively change the earlier article
output, original 100-page verdicts, or claims about agent-traffic rankings.

## Native retrieval

On September 16, 2026, from 11:48:39.010 to 11:48:47.602 UTC, the pinned optimized
browser's `NodeNetworkTransport` retrieves exactly the five script URLs advertised
by the saved Bankrate article and its chart module references. All return HTTP200
and JavaScript MIME. Captures total **535410 decoded bytes**. Individual bodies
are15588,54643,28317,370342 and66520 bytes. No redirects or network retries occur.

Each isolated child admits one GET to the exact public HTTPS origin, a2MB decoded
body,16KB headers and15-second network timeout, with a25-second outer deadline.
Children run sequentially with at least two seconds between requests. Native
public-address checks and ordinary TLS verification remain enabled. The observer
confirms all five request/socket closures, authorized TLS, no credential headers,
normal process exit, and no forbidden alternative-client calls. HOME/TMP stay empty.

Only approved response headers are retained. No page scripts, SDK, account access,
ZIP lookup, report form, identity change, challenge solving or other browser/client
is used. This is native **transport-level asset retrieval**, not five navigations
or five new successful websites. Full bodies remain local diagnostic artifacts.

Two initial wrapper invocations fail local cookie-context validation before any
request; both zero-request records remain. A kernel-denied native routed-response
proof then verifies the corrected empty-jar/credentials-omit configuration. Its
first fixture and guard-output configuration errors are also preserved separately.
No server failure is hidden as a retry.

## Recovered records and attribution

- `RiskChart` is module20474 in the fourth chunk. It imports module13774 in the
  fifth chunk, whose literal `incomeGroups` has five rows and `loanTypes` has three.
  Both have `overpaymentRate`; the other fields are respectively `lostWealthPct`
  and `lifetimeTax`. The component maps both to a common display key, but labels
  them differently. Preserve the original decimals and measures; rounded tooltip
  values are not the stored records. No extra fetch is required for these eight.
- Module44431's `stateData` has51 records with string FIPS identifiers, names,
  abbreviations, `overpaymentRate`, `lifetimeTax` and `annualCost`. Leading zeroes
  remain intact. Its companion representation in module13774 has52 literal rows,
  including PR, followed by an explicit PR filter. The exported subset is51 rows.
- Main-agent AST recovery independently verifies all51 shared state rows: rates
  and lifetime fields match; annual fields differ by a factor of1000 (comparison
  tolerance below0.000001). Stored values are **not converted** or merged. The
  absent map consumers leave their final unit labels and table choice unresolved.
- `OverpaymentMap` is module20580 in the fourth chunk. It loads map components
  lazily. Those components and geometry are not present among these five captures.
  Bundled state statistics are not proof of a functioning geographic map.

The independent text audit is followed by a separate existing-development-compiler
AST pass under kernel-denied network. It parses only data literals, verifies exact
source byte ranges/hashes and12 dataflow snippets, and rejects nine fixtures with
calls, getters, spreads, references, computed or duplicate/prototype-sensitive keys,
undefined and functions. Complete recovered tables are retained locally, with the
untransformed52-row alternative explicitly distinguished from its51-row export.
An initial compiler-path error is preserved; the corrected recovery passes.

The compiler is a diagnostic development tool, not a new page-runtime dependency.
No production source, dependency, default, extraction policy or limit changes.
Figures are publisher-provided source data, not independently verified statistics
or financial advice. The original article output remains2447 Markdown bytes.

## Remaining content work

The inspected ZIP component names `/data/zip-overpayment-data.json` and performs a
local ZIP-string lookup after loading that public-path object. Its contents and
accessibility are **not tested** here. The UI's21340 label is not an observed record
count. `/data/us-states-10m.json` is geometry, not overpayment statistics. Neither
asset is fetched; unrelated email/analytics POST paths are not invoked.

Next, turn validated literal records into an explicit bounded, provenance-bearing
source-data workflow rather than silently evaluating arbitrary scripts. If map or
ZIP behavior is needed, separately scope the actual advertised additional assets,
verify their consumers, units and missing-data behavior, and keep form/access
boundaries intact. Automatic chart extraction, rendering, actual SDK and credential
or device acceptance remain open. The broader browser goal is active; no push.

## Validation artifacts

The unchanged optimized runtime is also subjected to the **entire941-entry
committed native manifest**, not just the earlier25-file selected gate. This is
an attempted broad gate, **not a pass**:

- The first supervised run finishes in584.52 seconds:43802 passed,154 failed;
  Vitest reports919 file results, including four collection failures. The22
  missing entries exist only as pre-existing untracked working files, not in the
  committed source snapshot. They are not silently imported, dropped or committed.
- The original source-only snapshot omits non-runtime fixtures, and its temporary
  paths have group-writable ancestors. Native private-file protections correctly
  reject those paths. A separate protected `/tmp` checkout contains all committed
  files, with the same1520 pinned inputs (1519 source/config plus the manifest).
  No production source or safety check changes.
- Rerunning all41 failed files there finishes in29.62 seconds:1455 passed,62
  failed across41 files. Exactly92 previously failing assertions now pass. The
  four collection failures load successfully and add235 passing cases. No
  formerly passing matched assertion fails in this follow-up. These are separate
  runs, not a combined claim of a clean full suite.
- **62 failures in26 files remain**, including reader attribute expectations,
  capability/property inventories, unsupported-layout expectations and two
  challenge-classification assertions. These are observed categories, not a
  completed root-cause audit or permission to weaken assertions. No causal claim
  about the preceding parser optimization is established by this broad run.
- Both supervisors reap their child/process groups normally; no deadlines,
  termination signals or leftover HOME/TMP files are recorded. The unit-network
  guard is JavaScript-level, distinct from the kernel-denied recovery/proof. No
  actual SDK, live scripted-site, credential or device gate is claimed.

Next validation work must reconcile the22 manifest/source omissions without
bundling unrelated user edits, use a fixture-complete protected environment, and
triage the remaining62 assertions against actual contracts. Do not report the
browser as fully tested or green on the basis of the earlier narrow suite.

The adjacent JSON records both native runs, all missing/failed files and exact hashes.
Local captures, independent reviews, recovered tables, corrections and supervised
execution records are in
`node_modules/.cache/native-validation/bankrate-chart-assets-september16/`.
Historical measurements remain at their original paths.
