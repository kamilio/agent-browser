# Website testing inventory: September 13, fifteenth update

This supplements the fourteenth update with completed source extraction, one
local capture-setup failure, one real stylesheet GET and a resource-backed native
replay. Earlier evidence is unchanged. Source reading, network/SRI acceptance and
complete website rendering remain separate claims.

## Missing inline-joining source pair recovered

A new zero-network extraction uses the exact retained 171,462-byte CSS
Fragmentation response. It runs at 09:58:16.353–09:58:16.566 UTC on historical
audited 18,149, not the new 18,247 renderer. One native load retains 5,721 nodes;
one query for the previously observed `joining-boxes` ID uses 27,216 work units.
Traversal uses 8,162; eleven exact blocks retain 2,242 text code units.

Native `dt`/`dd` siblings `e2909`/`e2911` in `dl` `e2907` supply the missing
inline pair. The rule orders same-line fragments visually, later-line fragments
according to the element's inline base direction, and aligns dominant baselines.
Its governing paragraph expressly scopes composite assembly to backgrounds and
border images. Mapping ordinary dashed-border phase onto the unbroken/sliced
model remains an implementation inference for the declared simple-LTR profile,
not a universal numeric rule or RTL/bidi/vertical conformance proof.

This specific source-coverage gap is closed. Both previous failed extraction
attempts retain their original exit-one receipts; neither is relabeled a pass.
Evidence: `native-border-slice-joining-september13/`; ledger SHA256
`1f42ff4bdc8e37dcbc319056210f9b2ad15f220de4e9d3b3db96aefed54fb917`.

## Capture setup failure: no network request

The first stylesheet capture starts at 09:59:29.915 UTC and fails locally before
DNS, sockets or HTTP. The harness supplies an explicit credential-omit cookie
context without the CookieJar required by the native transport API. It reports
`invalid-input`, not a website denial, CAPTCHA, permission request or SRI failure.
No stylesheet body exists and no integrity helper runs in that attempt.

Evidence: `native-testpages-stylesheet-capture-september13/`; ledger SHA256
`4c1d301bf0616cf5b632ceaf69795e822372122e34cd2b3d50ae0cec5715f1ce`.
This zero-GET failure stays sealed and is not rerun.

## Corrected native capture and SRI success

A separate lane initializes a fresh empty in-memory jar, without importing any
user state. Transport credentials remain `omit`; wire headers contain no Cookie
or Authorization, no cookie-storage callback is installed, and jar metrics show
zero cookies/accepted entries before, after and at closure. No real browser
profile, password provider, environment secret or user credential is accessed.

Exactly one native GET, zero redirects, runs 10:03:29.426–10:03:29.589 UTC.
Headers arrive 10:03:29.536 and the full decoded receipt at 10:03:29.553. The
observed link e72's exact URL is:
`https://testpages.eviltester.com/scss/main.min.b6e9b375a3bd8971467d89a8ee0e92ff1f9cfaa5aa6cee2c33f25d8af82fb30d.css`.

Response: HTTP 200, `text/css`, 62,160 encoded bytes, 367,810 decoded bytes.
Native `fetchStylesheetResource` returns type `basic` for this same-origin
response. Its requested policy is CORS/same-origin, narrowed to omit at the
public-resource transport adapter. This is not cross-origin CORS validation.

Native `parseIntegrityMetadata` and `verifyIntegrityMetadata` accept the exact
decoded bytes against the link's observed SHA256 metadata. Captured digest:
`b6e9b375a3bd8971467d89a8ee0e92ff1f9cfaa5aa6cee2c33f25d8af82fb30d`.
The captured digest—not merely the hash-looking asset filename—matches SRI.
Capture runtime remains audited 18,149. Network acceptance alone does not prove
the current renderer or loader consumes the resource correctly.

Evidence: `native-testpages-stylesheet-capture-september13-round01/`; ledger
SHA256 `03df0b6f115bc583164bf03820fd27e09455c662a5460ce3a39118ca61425068`.

## Current native loader installs the real stylesheet

One new sealed replay on audited 18,247 runs
10:05:45.971–10:05:46.385 UTC. It uses the unchanged original 158,955-byte HTML
and newly captured 367,810-byte CSS, with zero new HTTP requests. No CSS is
rewritten, removed or replaced with fixture styles.

The native resource policy helper and loader's integrity path run normally.
An observer forwards `setExternalSheet` arguments unchanged and records successful
storage for native link 72, with the exact captured CSS hash. The loader returns
3,153 nodes, revision 3,156; subsequent read-only inspection leaves that revision
unchanged. The main stylesheet is installed, and the previous policy-callback,
missing-stylesheet and integrity-mismatch diagnostics are absent.

The CSS also requests an import. A second policy callback is denied by the
explicit one-captured-resource scope before any second resource read or HTTP.
Only one resource response is supplied. The old exact-one-callback end assertion
then fails (`2 !== 1`), so the process honestly retains exit one and
`inspectionPassed: false`. This is not reported as a wholly passing inspection.
The denied import URL is not retained by this attempt's pre-assert observer;
discovering it is a next bounded native diagnostic, not a guessed URL.

Despite that harness assertion, the native loader/formatting/geometry outcomes
were observed before it. One table query uses 17,442 work units. The actual styled
page produces 956 visited formatting nodes, 963 boxes, 3,734 text code units,
192,948 work units and nine deferred subtrees. These differ from the resource-free
page because real CSS changes visibility and layout; they are not a speedup claim.

Observed formatting diagnostics include:

| Diagnostic | Count |
| --- | ---: |
| Import load failed / import not loaded | 1 each |
| Unsupported CSS properties | 196 |
| Unsupported/invalid CSS selectors | 199 |
| Unsupported CSS at-rules | 14 |
| Unsupported/invalid media queries | 36 |
| Unsupported/invalid CSS values | 29 |
| Deferred display subtrees | 9 |
| Overflow layout unsupported | 4 |
| Inline vertical alignment unsupported | 1 |

These are observed formatting diagnostics, not a claim that every listed warning
independently blocks geometry. The geometry request separately returns
`unsupported` and no rectangle. Broad native test success does not cover these
live-derived stylesheet compatibility requirements.

Default style limits remain unchanged: 524,288 code units, 8,192 rules, 16,384
declarations, 5,000,000 work units and 32 sheets. This attempt does not fail from
those limits. No raster, pointer action, scripts, images or imported resources
are executed to fabricate a complete page result.

Evidence: `native-testpages-resource-replay-september13/`; ledger SHA256
`8a61ec90d8e94ff9c4af8fbbcc630074d32ed58dc025096912f7b7c3c2b54e9f`.

## Integrity and next work

All evidence lanes are under `node_modules/.cache/native-validation/`. Runtime
pins verify before/after, native owners close, process groups are absent, private
HOME/TMP directories are removed empty and guard attempts stay zero. Initial
capture failure, corrected capture and failed replay remain separate artifacts.

No new production code follows the dashed-border commit in this update. Its
18,247-test audit, two unchanged exclusions and 377 unrun suites remain exactly
as recorded previously; there is no pretend second test run or root-dist rebuild.

Next: identify the denied import and the precise unsupported selectors,
declarations and active rules using bounded native CSS/DOM diagnostics. Prioritize
real compatibility fixes rather than dropping rules or suppressing diagnostics.
Continue additional websites and the original research topics. Full rendering,
password/passkey devices, SafeJS, real TTY and human challenge handoff remain open;
the overall browser goal stays active.
