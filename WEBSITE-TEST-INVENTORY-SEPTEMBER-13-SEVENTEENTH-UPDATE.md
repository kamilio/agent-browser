# Website testing inventory: September 13, seventeenth update

This supplements the sixteenth update with validity-selector implementation,
one fresh public-form navigation and exact-byte native replays. Earlier failures
and measurements remain unchanged. Read-only query success is not submission,
script, device, full-rendering or challenge-bypass acceptance.

## Native validity selectors

`:valid` and `:invalid` now use the existing native constraint validator, with
separate candidate, form-owner and fieldset-descendant rules. Empty containers
are valid; barred ordinary controls match neither. Known invalid members can
decide aggregate invalidity without fabricating successful unsupported flags.
Unsupported constraints otherwise remain explicit errors.

Operation-local state/subtree memoization and charged native control-index
preparation preserve the existing work/memo ceilings. Value-dependent cascade
tracking prevents stale styles after input or custom-error changes. No upload
bytes or raw values are retained in selector caches. See `SELECTOR-VALIDITY.md`
for the profile, source scope, remaining unsupported states and limitations.

The primary-source investigation reuses the exact 133,956-byte WHATWG document
historically retained at `/tmp/agent-browser-placeholder-spec-2026-09-03.html`.
The original retrieval metadata remains `reports/placeholder-sources-2026-09-03.json`,
September 3 at 15:25:28.664 UTC. A September 13 native inspection admits the
complete valid/invalid definitions; it makes no new HTTP or latest-source claim.
The optional read-only definition extraction fails and retains exit one.
Eligibility/custom-validity details are existing native contracts, not newly
source-proven by those admitted lists.

Source evidence: `node_modules/.cache/native-validation/native-validity-selector-source-september13/`.
Ledger SHA256: `cb98ced2531bff27a486527dab1d6751d18231725295a75bd4672bcb0d122058`.

## Isolated verification

The unchanged-runtime baseline has **227 passes and 51 failures**: every new
selector case reproduces the unsupported-selector gap, while all five existing
validation suites pass. The first fixed run has **875 passes and one failure**
in a newly written expected-map order. The existing matching API returns document
order; correcting the fixture's form/input order yields **876 passes, zero
failures and zero exclusions** across seventeen explicit suites. Production
build, strict test types and owned-source formatting pass. Both earlier runs
remain intact; no source behavior is weakened to satisfy that assertion.

The broader native gate runs September 13 at
10:50:35.609–10:54:49.860 UTC and is audited at 10:54:49.970:

- **18,655 passed, zero failed, two unchanged exclusions.**
- 366 selected suites, 365 strict roots, 737 manifest entries, 371 unrun suites.
- 58 newly written cases: 51 selector and seven control-index work cases.
- 227 existing cases newly selected: forms 12, custom validity 53, validity state
  45, calendar validity 101, and file-selection integration 16.
- Existing unsupported-selector guards now use still-unsupported `:user-valid`;
  the file-selection integration test now expects real validity matches.
- The total-host-object-pressure and unsupported-display/advisory-media exclusions
  remain unchanged. The historical `snapshot.test.ts` strict-root omission remains.
- 1,274 source files, 2,108 compiled files, 1,265 unchanged tracked inputs.
- Audit base `dce8d65ea120928d9998cb04a7fa1680c50a13a0`; eight owned source/test
  files plus the canonical manifest. Root `dist` is not rebuilt; unrelated dirty
  work is not copied into the clean canonical snapshot.

Gate: `node_modules/.cache/native-validation/native-validity-selectors-september13-round00/`.
Source-ledger SHA256: `3c314460f8909c08a37d40cb4cb54192314ca9b9b1c2e3dd8553004fa0302bbd`.
Compiled-ledger SHA256: `ed1268b46bdc17b12db84b339289328e66bbdc5ff89b416c5a27496e065f33e2`.
Native-results SHA256: `e55814bc8eb406067ab114e74d82352439326b92ba55b876b0ff6ad7472bde54`.
Summary SHA256: `f46700245aa78dc002a270bd72feb701592abcb09a5dae4a3e332e9806a02b4c`.

## Fresh public HTML form

The native full loader first reads the retained TestPages table page without
networking. One `a[href*="form"]` query finds 29 anchors using 24,068 work units.
It reads 353 bounded native text units and selects actual link `e647`, labeled
`HTML Form`, whose observed href is `/pages/forms/html-form/`. No discovered
label identifies an HTML5 validation demo; no endpoint is guessed.

One fresh native GET retrieves
`https://testpages.eviltester.com/pages/forms/html-form/` with no redirects,
retries or extra resources. Receipt: **September 13, 10:50:38.186 UTC, HTTP 200**,
160,810 decoded bytes and 19,262 encoded bytes. Body SHA256:
`fbd02213ef6613bf0e8618a5ff441579be007453b821fca0117f8a88f03bef13`.
The native challenge diagnostic is null. The jar is private and empty; transport
credentials are omitted, with no Cookie or Authorization headers or stored state.

A sealed native read of those exact bytes finds 3,233 nodes, 138,032 text units,
depth 24, two forms, 240 input/select/textarea/button/fieldset controls and one
heading. Three queries use 111,627 work units. Counts cover the entire page,
including navigation controls: 225 checkboxes, three radios, two text inputs,
one each password/file/hidden/image/reset/submit input, two selects, one textarea
and one button of type button. No fieldsets or required/disabled attributes are
observed. Attribute presence is not itself effective state or validity.

Discovery, capture and initial reading use historical audited 18,370, not the
new selector implementation. Five scripts are not executed. There is no resource
loading, action, fill, submission, value/password output, geometry or raster.
All owners close, pins match, private directories are removed and process groups
are absent. Evidence: `node_modules/.cache/native-validation/native-testpages-validity-form-september13/`.
Ledger SHA256: `b1fb1cb6c0d18fcaec2211ff15f02abfa6c5dc65fbbee688e47d9a2ceabf9e1f`.

## Same form before and after

Two new zero-HTTP native phases inspect the unchanged captured form:

| Phase | Runtime | UTC execution | Validity queries |
| --- | --- | --- | --- |
| Before | Audited 18,370 | 10:54:59.744–10:54:59.935 | Both unsupported at parsing |
| After | Audited 18,655 | 10:56:41.751–10:56:41.952 | `:valid` 239; `:invalid` zero |

Each phase loads once and makes four queries. Structural results remain 240
controls and two forms. After-query work is 82,289 for controls, 16,262 for forms,
154,585 for valid and 19,620 for invalid, totaling 272,756. Failed before-phase
selector parsing records work as null, not the preceding query's stale counter.

Direct native validation cross-checks 237 candidates, three excluded controls
and two forms. The resulting sets exactly match the new selector interface.
This verifies integration with the existing validator, not independent complete
constraint conformance. The page has no required attributes and produces no
invalid matches; it does not establish live required-invalid feedback.

Both phases leave revision unchanged, emit no control values, perform no actions
or submissions, close owners and retain stable source/compiled pins. The shared
wrapper's inherited generic scope text mentions stylesheet inspection; the actual
child harness, authorization and counters establish HTML-only validity reading.
That stale label is retained, not used as evidence of resource/SRI/geometry work.

Evidence: `node_modules/.cache/native-validation/native-testpages-validity-form-replay-september13/`.
Ledger SHA256: `ced36c22ca4c30ef33537672d8fcd748ec269b027e64c4ee26916361c56f652d`.

## Real stylesheet after the fix

A separate audited-18,655 zero-HTTP replay runs at
10:56:41.075–10:56:41.607 UTC on the unchanged TestPages table HTML and verified
stylesheet. The native policy/SRI path installs the same captured sheet and
records the same uncaptured Google Fonts import before denying it. One load,
one offline resource read, two policy callbacks, one formatting inspection and
one geometry request; no additional resource request or diagnostic suppression.

All 26 actual `:valid`/`:invalid` rule failures disappear. Whole-sheet unsupported
selectors decrease 199 → 173; formatting selector diagnostics decrease
**195 → 169**. Six property and fourteen value issues also stop being treated as
relevant because the now-recognized rules do not match this document. Those
properties/values are not newly implemented: their raw source diagnostics remain.

Formatting measurements remain 956 visited nodes, 963 boxes, 3,734 text units,
192,948 work units and nine deferred subtrees. No speedup claim follows from
unchanged measurements. Full geometry still returns unsupported, without a
rectangle: the font import, pseudo-elements, other CSS features and layout gates
remain. Pseudo-elements still account for 163 whole-sheet selector failures.

Evidence: `node_modules/.cache/native-validation/native-testpages-validity-stylesheet-september13/`.
Ledger SHA256: `3adabfe3bd4e5981a77b5ca1a4454c913192731c8335bbc6dfaee874b2bc2933`.

## Still open

Pseudo-element generation/mixed-list compatibility, full website styling and
rendering, further form interactions and invalid-feedback examples, actual
font/resource handling, broader website coverage and the original research
remain open. Real password/passkey devices, SafeJS, real TTY and human challenge
handoff are not validated by this work. No challenge bypass is claimed.
