# Captured Wikipedia compound-availability comparison

Status: **the bounded offline regression comparison passes**. Both immutable
builds load the captured Large language model article and both stylesheets.
All 755 corresponding selector calls have identical original selectors, ordered
matched node IDs, specificity tuples and errors. Candidate cascade work decreases
by only 2167 units (0.0583%); 55 completed calls become more expensive. This is
not a wall-clock speedup, live-site, click, scripting or rendering acceptance.

## Scope and validation gate

All new execution evidence is in
`node_modules/.cache/native-validation/native-wikipedia-compound-availability-pair-september11/`.
Only that lane and this report are written. No source, test, manifest, TASKS,
dependency, credential, historical receipt or other agent's active comparison
lane is changed. No commit or push is made.

The candidate completion notice was independently checked against actual
SUMMARY/native-result files, assertion counts, manifest selection, strict roots,
source ledgers and compiled inventories before the child ran:

| Build | Immutable snapshot under `node_modules/.cache/native-validation/` | Native passes |
| --- | --- | ---: |
| Baseline | `native-selector-test-order-september11-round01/snapshot01` | 6765 |
| Candidate | `native-compound-availability-september11-round01/snapshot01` | 6786 |

Both have zero failed assertions, 112 distinct manifest-selected test files,
111 distinct strict roots, 1006 source/fixture files and 1788 compiled files.
Production build, strict checking, formatting and the complete selected native
run all exit zero. The one excluded native assertion is
`exposes the separate total host-object ceiling without claiming full-pool runtime capacity`.
`src/snapshot.test.ts` remains excluded only from strict roots, not native runtime
selection. Candidate validation finishes September 11, 2026, 11:24:55.352 UTC;
the paired child starts at 11:29:46.254 UTC, after rechecking stable inputs.
Only `src/selectors.ts` and `src/selector-candidates.test.ts` differ between the
two source inventories.

Baseline compiled-ledger SHA-256:
`4f3635ffa96f8cc26ed908917885e39a7d1609fee689359b06de2dee851afebe`.
Candidate compiled-ledger SHA-256:
`af0e0b8e081be312f733c136bdafde8deaa289a02f8c02202c2b49fa0bd2a4bb`.
The baseline also matches its previously retained compiled pin. Full source,
summary, native-result and tool hashes are in `PINS.json` and `PREFLIGHT.json`.

## Capture identity and unchanged limits

The replay uses `response-2.body`, `response-3.body` and `response-4.body` from
`node_modules/.cache/native-validation/native-wikipedia-ancestor-ranges-live-september11/`.
Their hashes also match the older captured bodies and the native link-discovery
receipts referenced by
`node_modules/.cache/native-validation/native-wikipedia-ancestor-ranges-replay-september11/`.
The original validated source/build inventories and the replay's recorded input
pins are verified; all three historical capture directories are inventoried
before and after. Original paths, times and measurements remain untouched.

The exact final article URL is retained. Both original stylesheet response URLs
end in `?redacted`; exact original wire query strings are **not retained**.
The pair therefore explicitly preserves the existing native DOM-link order plus
retained response order/origin/path binding, rather than inventing wire queries.
Both loaded native documents reproduce the retained link attributes and URLs.
The article, two HTTP200 stylesheet bodies and response headers are unchanged.
Each build serves three fixture responses totaling 1289646 decoded bytes.
The historical portal, form submission and redirects are not replayed.

- One initial navigation per build, one tab, one pending navigation and the
  original 20000 ms navigation deadline; no retries or clicks.
- Original DOM caps: 50000 nodes, depth 256, 2000000 text code units and 1024 changes.
- Original CSS/query work ceiling: 5000000 units each. Selector syntax retains
  8192 code units, 256 components and nesting depth 16. Cascade matching permits
  50000 results; public queries retain 10000 results. No work cap is raised.
- Styles retain 524288 code units, 4096 rules, 16384 declarations and 32 sheets;
  viewport remains 1280 × 720. Both current builds additionally expose the same
  existing session default of eight stylesheet requests, absent from the older
  receipt's session-limit schema; this comparison does not change that default.
- Original research transport limits remain unchanged, including 12 requests,
  2000000 bytes per response and 8000000 total bytes. Only captured routes serve
  responses; the 22 historically uncaptured image-resource requests are denied.

Stylesheet completeness requires both external sheets, 1396 rules, 3589
declarations, 237237 code units and no stylesheet-resource-limit issue. Both
builds meet these criteria; no CSS is removed to make the result pass.

## Actual outcomes and exact-result comparison

Both navigations return a document titled `Large language model - Wikipedia`,
with 17768 native nodes, one `main`, and the `Large language model` main heading.
The bounded content evidence is identical: the first 20 heading records and
12000 code units of native main text, including the search phrase.

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| All `matchingSpecificities` calls | 755 | 755 |
| Completed calls | 682 | 682 |
| Recoverable unsupported-selector errors | 73 | 73 |
| Completed selector work | 3209628 | 3207461 |
| Completed single-build cascade work | 3717097 | 3714930 |
| External stylesheets | 2 | 2 |
| Wire bytes | 0 | 0 |

The independent file-only verifier compares the complete per-call JSONL records,
not the child's comparison booleans. It checks ordering, unique matched elements,
three-component nonnegative specificity tuples and exact error objects.
Node correspondence is bound to equal full native document graphs, not assumed
from numbering: each retained graph has 17768 nodes and SHA-256
`0a371107e8596fbb08d0727585feab48c700252851ff19964170ed08ba5bcc02`.

Of 682 completed calls, four save work, 55 add work and 623 are unchanged.
Gross savings of 22981 units are offset by 20814 additional units, leaving
2167 units saved: 0.0675% of selector work and 0.0583% of cascade work.
Call 752, the six-branch navbox/hlist selector, decreases from 34955 to 18341
units with the same 80 matches. Call 312, the selected-link selector, decreases
from 6404 to 134 with no matches. Conversely, calls 514–516 each add 1373 units
on `.cdx-button` selector branches, with unchanged results.

The largest remaining call is `.mw-parser-output a`: 590846 units and 2231
matches in both builds. `.vector-pinnable-element .mw-list-item a,.vector-dropdown-content .mw-list-item a`
remains at 262977 units. This workload does not demonstrate a broad improvement.
`WORK-ANALYSIS.json` retains costs for every completed call. Unsupported parser
errors have null charged work; stale `lastWork` values are not counted. Cascade
work is counted once per completed document, not summed across loader/navigation
snapshots. Instrumented execution timestamps are not a speed benchmark.

## Support limitations

Both builds report exactly the same partial CSS issues:

| Issue | Count |
| --- | ---: |
| Unimplemented CSS property | 700 |
| Unimplemented or invalid CSS value | 165 |
| Unimplemented or invalid CSS rule | 1 |
| Unimplemented CSS at-rule | 3 |
| Unimplemented or invalid CSS selector | 73 |
| Unimplemented or invalid media query | 52 |

The 73 matching errors are 51 pseudo-element errors, two `:dir()` errors,
one `:after`, nine `:before`, five `:lang()` and five `:read-only` errors.
Each retains `AgentBrowserError`, code `unsupported`, and the exact message.
There is no unexpected query/CSS budget failure.

The native HTML parser remains partial, with five `script-not-executed` issues
per build. SafeJS is not run. Image evidence is also identical and incomplete:
49 elements, 22 resource requests, zero received image bytes, 33 element-level
`policy-denied` errors and 16 `unsupported` errors. Expected fixture-policy
denials are recorded separately from network guard attempts. Layout, painting,
full CSS, scripts, live interaction, research flows, challenges and fingerprinting
are not validated by this offline result.

## Containment, cleanup and receipt verification

Exactly one bounded paired child runs from 11:29:46.254 to 11:29:47.585 UTC on
September 11, 2026, exiting zero. Baseline session, document, queries and transport
are closed and pending loads settle at 11:29:46.943; candidate begins at
11:29:46.944. Candidate cleanup settles at 11:29:47.556. Both sessions have zero
pending loads, zero active transport requests, restored instrumentation and no
cleanup errors. The supervisor confirms the final process group is absent.

The inherited seccomp network/io_uring denial and JS network, native-addon,
subprocess and worker denials are retained. No live network, socket self-probe,
SafeJS, real TTY/PTY, alternate browser, credentials or inherited user environment
is used. Recorded network/addon/process/worker guard attempts are zero. The child
has a clean private HOME/TMPDIR, no core dumps, a 30-second deadline plus five-second
termination grace, a 6 MiB per-file limit and a 6 MiB combined output limit.
Output is 12258 bytes with empty stderr; the largest artifact is 3094173 bytes.
Private directories remain empty and are removed. Both source/compiled
inventories, captured inputs, original pins and launch tools remain unchanged.

The initial file-only verifier rejected the additional existing
`maxStylesheetRequests: 8` field when comparing against the historical schema.
`VERIFIER-CORRECTION.md` records this verifier-only defect. The original
preflight-pinned `verify.mjs` is preserved unchanged; `verify-final.mjs` adds an
explicit check for that default and its pinned source declaration. It then passes
all evidence checks. No probe, result, acceptance cap or native child is retried
or modified. `VERIFICATION.json` records both `evidenceVerified: true` and
`regressionPassed: true`.

The lane's `RECEIPTS.sha256` ledger, covering the original execution and corrected
verification evidence, has SHA-256
`08983d1c044322f26dbc78cb4ff097f8f256639524c79debc4e67367c4263949`.
`FINAL-RECEIPTS.sha256` additionally binds this report and the subsequent file-only
work analysis without rewriting the original ledger.
