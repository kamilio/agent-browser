# Python CSS blocker attribution — September 13, 2026

## Outcome

**The native diagnostic exactly attributes all nine unsupported-property and
three invalid/unsupported-value reports. No production fix or successful
Tutorial click is claimed.** This extends the earlier clearance replay with
bounded native scanner/parser, stylesheet-import, selector and computed-style
observations, not raw HTML/CSS searching or rewriting the page.

The final offline observation runs at `2026-09-13T15:36:54.130Z`–
`15:36:54.415Z` (supervisor). One native homepage navigation consumes the same
eight immutable mixed September 11/13 fixtures, totaling 72,064 decoded bytes.
One real click on discovered Tutorial `e375` still fails at width resolution.
There are zero wire requests, redirects, retries or destination requests.
All resource paths/hashes remain those documented in
`PYTHON-GENERATED-CLEAR-REPLAY-SEPTEMBER-13.md`.

## Actual property and value failures

Counts below are native rule diagnostics, **not counts of affected elements**.
Selectors, declaration components and matched references come from the native
parser and `DocumentQueries.matchingStyleSpecificities`. Media and supports
conditions use the native evaluators; the resulting totals exactly match
`styles.metrics().applicableIssues`.

| Retained stylesheet / native selector | Actual declaration or syntax | Diagnostic count |
| --- | --- | ---: |
| `basic.css`, `div.body p, div.body dd, div.body li, div.body blockquote` | `-moz-hyphens:auto`, `-ms-hyphens:auto`, `-webkit-hyphens:auto`, `hyphens:auto` | 4 unsupported properties |
| `classic.css`, `#sidebarbutton` | `cursor:pointer` | 1 unsupported property |
| `pydoctheme.css`, `div.sphinxsidebar` | `border-radius:5px` | 1 unsupported property |
| `pydoctheme.css`, search/sidebar/related input selector list | `border-radius:3px` | 1 unsupported property |
| `pydoctheme.css`, `#sidebarbutton` | `border-radius:0 5px 5px 0` | 1 unsupported property |
| `pydoctheme.css`, `div.footer a` | `text-underline-offset:auto` | 1 unsupported property |
| `classic.css`, body paragraph/list selector list | `text-align:justify` | 1 invalid/unsupported value |
| `pydoctheme.css`, `a[href]` | `text-decoration:underline 1px` | 1 invalid/unsupported value |
| `pydoctheme.css`, `div.body` | Nested `.good pre`, `.bad pre`, `.maybe pre` rules treated as one declaration | 1 invalid/unsupported value |

The hyphenation and justification selectors match 32 elements; the decoration
selector matches 96 links. The full receipt retains exact source URLs/query
strings, hashes, selector/media scopes, per-rule counts and bounded matched
references. No declaration is silently ignored to force layout acceptance.

### Nested-rule compatibility gap

The existing declaration parser reads the nested block as a property beginning
`.good pre {` followed by `border-left`, and rejects its value. The diagnostic
is attached to matching parent `div.body` (`e348`). A separate native
`parseCssRules` call on the **identical statement bytes**, without installing
anything in the page, recognizes three standalone rules with no syntax issue:

- `.good pre`: `border-left:3px solid var(--good-border)`.
- `.bad pre`: `border-left:3px solid var(--bad-border)`.
- `.maybe pre`: `border-left:3px solid var(--middle-border)`.

The native border parser retains these as width/style/color components with
pending shorthand substitution. This demonstrates the current nested-body
parsing gap; it does not implement nesting, expand parent selectors or prove
the nested rules' cascade semantics. The next implementation needs native
nesting-selector/specificity, conditional scope, source-order and resource-bound
regressions, rather than dropping the parent diagnostic. Primary-source nesting
research is tracked separately; no standard-compliance claim follows here.

### Actual vertical alignment

The two inline alignment blockers are image references `e283` and `e759`, both
computed `vertical-align:middle`, display inline, and actual replaced inline
formatting nodes 22 and 574. A third middle-aligned element, span `e732`, is
display block and is not a third inline-alignment error. This distinction uses
native formatting ownership and the correct `styles.table` accessor. The
existing sticky sidebar and overflow wrapper remain separate blockers.

## Bounds and validation

The final pass walks 853 DOM nodes, handles seven stylesheet roots (including
inline roots), one imported sheet, and 51,314 stylesheet code units. Native
scanning visits 579 rule blocks; the shared parser budget records 576 parsed
rules and 1,115 declaration parses, within 8,192/16,384 limits. There are 55
separately inspected declaration statements, 29 native selector calls and
12,455 query-work units, below the 5,000,000 aggregate query-work limit.

There are nine diagnostic records and three vertical-alignment records. Caps
also bound source depth, roots, import callbacks, matched references, property/
value/selector metadata and output. Final `attributed` and `expected` both read
9 unsupported properties and 3 invalid/unsupported values. Document revision
remains unchanged. No extra geometry or raster operation is performed.

Only `native-generated-clear-september13-round00/snapshot01/dist` is imported
under `node_modules/.cache/native-validation/`. Its inherited audit remains
19,803 passed / zero failed / two unchanged skips, 384 selected suites,
383 strict roots, 749 committed-manifest entries. **No native tests are rerun
and no production code changes occur in this diagnostic.**

- Audit base: `ea00b5b71952efeae0f7467e3c3280b9dc7471bb`.
- Complete 1,290-input source inventory: `9b0e9de877ee416b542a3169025125a3ba89bbbd4db557d1128b3844520de619`.
- Complete 2,124-file compiled inventory: `86c6dbcfc1a59d787d59432a5feb82cc51b06db4336c10c2c952e4fab7e3dde9`.

Before/after inventories, fixture hashes and execution frameworks remain
unchanged. Native session/document/image/query/cookie/transport owners close;
private HOME/TMP begin empty and are removed empty; process groups are absent.
Node 22.22.0, paired kernel/JavaScript offline guards, 30-second supervisor plus
5-second grace and 10MiB stream/file caps apply. Final execution exits zero,
without guard attempts or stderr output. This is diagnostic success only.

## Preserved attempts

Paths below are relative to `node_modules/.cache/native-validation/`.

1. `native-python-css-attribution-september13/`: exits 1 at the 128-record
   vertical cap because the harness asks `styles.text` for vertical alignment.
   That accessor returns no such property; undefined values were wrongly counted
   as nonbaseline. This is a harness failure, not a 128-element browser defect.
2. `native-python-css-attribution-september13-round01/`: uses `styles.table`,
   exits 0 and attributes all 9/3 issues. Scanner/output bounds hold, but its
   parser calls each receive a fresh budget rather than enforcing the stated
   aggregate parser quota. Do not promote this attempt to aggregate-bound proof.
3. `native-python-css-attribution-september13-round02/`: enforces the shared
   native parser budget, initializes the JS guard before the added diagnostic
   module, and records the standalone nested-rule parse. All limits and exact
   attribution checks pass. Earlier bytes are not overwritten.

All three actual click outcomes remain failed. The final lane's explicit
`DIGESTS.sha256` binds the three attempts, native runtime/audit provenance,
upstream fixture ledgers, diagnostic modules, this report and its verification.
No new HTTP, source rewrite, alternate browser, SafeJS, credentials, device,
socket/TTY probe, fingerprint spoofing or challenge solving occurs here.
