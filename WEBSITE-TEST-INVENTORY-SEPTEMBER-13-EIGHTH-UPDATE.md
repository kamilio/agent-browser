# Website evidence — September 13, 2026, eighth update

This supplements the seventh update. Earlier captures, paths, measurements and
failures are unchanged. Native test results and website acceptance are separate.

## Fresh Selenium public form

One native GET of `https://www.selenium.dev/selenium/web/web-form.html` at
07:35:19 UTC returns HTTP 200 with zero redirects: 4,988 decoded / 1,233 encoded
bytes, SHA256 `fbf64bd0731a21f7e77abfde1b3bfc01377215783952facaccc8ed5eb105c6c3`.
Credentials are omitted; no resource/script request, alternate URL or retry.

One separate sealed offline load at 07:36:09 UTC finds 179 DOM nodes, one form,
17 controls and 15 labels. Three queries consume 4,729 work units. The actual
form has GET action `submitted-form.html`; it is observed but never submitted.
Control types include text, password, file, checkbox, radio, color, range and
hidden inputs, plus textarea/select/button. No values or credentials are used.
Label observations use native label association and bounded DOM text, not a
claim of computed accessible-name or date-picker widget support.

The native formatting tree contains 166 boxes and two deferred inputs: color
and range. Two stylesheets are intentionally unfetched and four scripts are not
executed. The sole form geometry request throws `unsupported` for these CSS and
control limitations; offline exit 1 is retained and no rectangle is fabricated.
This adds live capture and real-form inspection coverage, not rendering success.

This visit uses the earlier audited 17,863-case/base8eb runtime, independently of
the fieldset candidate. Its source/compiled pins remain unchanged; both process
groups terminate, private directories are removed empty and guard attempts are
zero. All 57 evidence files verify against the retained manifest.

Evidence: `node_modules/.cache/native-validation/native-selenium-form-september13/RESULT.md`,
`RESULT.json`, `OFFLINE-AUDIT.json` and `EVIDENCE.sha256` in the same directory.

## Wikipedia: failed captured-page replay

No new Wikipedia HTTP request. Both phases load the exact 119,573-byte portal
body from `native-wikipedia-form-flow-september13/response-1.body`, SHA256
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.

| Runtime | UTC execution | Actual outcome |
| --- | --- | --- |
| Audited 17,863-case snapshot | 07:29:48.469–07:29:48.779 | Formatting tree returned; fieldset deferred, search input absent; geometry unsupported |
| Audited 17,945-case snapshot | 07:33:26.804–07:33:27.067 | Rich button throws unsupported during formatting; process exits 1 before geometry |

Each phase performs one native load, two queries and one attempted formatting
inspection. DOM nodes remain 2,708 and revision 2,712. The after phase does not
produce a completed formatting tree, so there is no valid after-box count or
confirmed whole-page search-input formatting/geometry result to report.

This is a discovered next blocker, not a successful portal render. The previous
fieldset deferral prevented traversal into the rich button. Unit fixtures prove
the new fieldset behavior but do not substitute for real-page acceptance.
There are no actions, raster, scripts/resources, credentials or source rewrites.

Evidence integrity passes independently: both trees close, process groups are
absent, no unexpected network/process guard calls occur, private HOME/TMP is
removed empty and runtime ledgers match the respective audits. The original
portal and closed-dialog replay manifests still verify.

Evidence: `node_modules/.cache/native-validation/native-wikipedia-fieldset-content-september13/`.
`RESULT.json` explicitly records `passed:false`, `outcome:blocked-rich-button`;
`EVIDENCE.sha256` is
`0d7406b60537781ee9179d17fbfb2178af224820b6fd18890f5743e1d717ad74`.

## Native implementation and regression scope

The new fieldset implementation creates a single DOM-owned outer box and a
reference-less flow-root content box. Padding transfer, original percentage
bases, intrinsic minimums, UA/author cascade and independent flow are tested.
See `FIELDSET-CONTENT.md` for admission limits and remaining legend/default-border
work. Unsupported behavior is not converted into guessed geometry.

The 82 new cases first produce 31 pass / 51 fail on unchanged source. Focused
validation then passes 712 with one explicit legacy intrinsic-grid exclusion,
reproduced separately on unchanged production (96 pass / one fail).

Clean broad validation passes 17,945 with zero failures and two unchanged
exclusions, across 347 selected suites and 346 strict roots. There are 725
manifest entries, leaving 378 unrun. Source/build/strict/format checks pass;
1,247 unchanged tracked inputs, 1,257 source files and 2,088 compiled files are
audited. No root dist rebuild or unrelated dirty-work inclusion occurs.

Audit: `node_modules/.cache/native-validation/native-fieldset-content-september13-round00/AUDIT.json`.
Source inventory SHA256:
`3bf501faf7f98812bfe1fa69ca70e5d776c0049a53d5d2f8037a9eb8fd3a0e89`.
Compiled inventory SHA256:
`355ce2b27bcc6ff1e1428d3bb52e09112f118a0d794ae9a9b93cb5e4e321474b`.

These counts and single-run timings are not browser speed benchmarks. All four
original research topics remain incomplete. Real credential/provider flows,
passkey devices, SafeJS, real TTY and human challenge handoff remain separate
acceptance gates. No other browser or automatic challenge bypass is used.
