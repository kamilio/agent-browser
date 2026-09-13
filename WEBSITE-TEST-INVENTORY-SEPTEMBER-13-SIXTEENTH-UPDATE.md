# Website testing inventory: September 13, sixteenth update

This supplements the fifteenth update. Earlier receipts and failed attempts are
unchanged. New diagnostic success is not a full website-rendering pass.

## Actual TestPages stylesheet diagnosis

A new zero-HTTP native inspection runs September 13, 2026, at
10:18:02.966–10:18:03.498 UTC using audited 18,247. It consumes the same retained
158,955-byte HTML and verified 367,810-byte stylesheet, without rewriting either.
The normal native resource/SRI path installs the main sheet. One additional
import is recorded before the harness explicitly denies it:

`https://fonts.googleapis.com/css?family=Open+Sans:300,300i,400,400i,700,700i&display=swap`

Its requested native policy is `no-cors`/`include`. There is no request for that
URL, credential access, authorization prompt or Google Fonts response. This is
an intentionally uncaptured dependency, not a Cloudflare or website denial.
Only the captured main sheet is supplied: two policy calls, one offline resource
read, one stored external sheet, no stored imports, and zero new HTTP requests.

The native CSS scanner and parser inspect the original source under their normal
budgets: 5,929 rules and 9,698 declarations, below 8,192/16,384 limits. They retain
5,772 rules. Native selector validation identifies all 199 selector diagnostics:

| Unsupported selector category | Rules |
| --- | ---: |
| Pseudo-elements, including mixed selector lists | 163 |
| `:valid` | 13 |
| `:invalid` | 13 |
| `:-moz-placeholder` | 4 |
| `:-webkit-autofill` | 2 |
| `:host` | 2 |
| `:-moz-focusring` | 1 |
| `:-ms-input-placeholder` | 1 |

Mixed lists are not split or silently declared supported. Whole-sheet declaration
attribution includes unmatched and inactive rules; it is not the matched
formatting count. Examples include 85 `border-radius`, 82 `content`, 38 `opacity`
and 30 `object-fit` unsupported-property occurrences; unsupported values include
17 `vertical-align` and 15 `font-size` declarations. The scanner records twelve
`@keyframes` blocks and two `@font-face` blocks. These are actual compatibility
gaps, not exhausted parser budgets or a reason to suppress diagnostics.

Unsupported media conditions include `prefers-reduced-motion`, `hover`, and
`pointer`; the motion queries occur alone and with responsive width conditions.
The normal formatting inspection still has 36 media diagnostics. Its other
issues remain: one import-load failure, one unloaded import, fourteen at-rule
issues, 196 matched unsupported-property issues, 199 selector issues, 29 matched
invalid/unsupported-value issues, and deferred layout/overflow/alignment work.

The table geometry request still returns `unsupported`, not a rectangle. The
new inspection succeeds as a bounded diagnostic: owners close, source/compiled
pins remain stable, private directories are empty and removed, the child process
group is absent, and socket/process guards record no attempted escape.

Evidence: `node_modules/.cache/native-validation/native-testpages-css-diagnostic-september13/`.
Ledger SHA256: `68307ea4cd9fcf9171378ffc5c44f3f07ebb420537880c8f2b00af0fde65dd2c`.

## Fresh MDN article observation

One native navigation to
`https://developer.mozilla.org/en-US/docs/Web/CSS/border-style` performs exactly
two GETs: a same-origin 301 and a 200 at
`https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/border-style`.
The final response is received September 13 at 10:23:34.511 UTC: 331,666 decoded
bytes, 31,735 encoded bytes, Brotli. Body SHA256:
`ede15ee8c7a04aeb3bb130d24566b9bac3b1f9979ab6d35ba8060efb5d60f8a0`.
No retries, challenges, credentials or additional resources are used. This is
a fresh observation, not a first-ever MDN coverage claim.

Separate sealed zero-network inspection makes one full-loader load and one
semantic-reader load of those exact bytes. Full loader: 7,795 nodes, depth 19,
195,041 accounted text units, 205,672 explicit query work. Semantic reader:
7,528 nodes, depth 19, 139,984 accounted text units, 194,283 explicit query work.
Each runs three selectors and finds one `main, article`, one `h1`, and no
`input[type=search]`. Both native headings read `border-style CSS property`.

Full-loader parsing records six unexecuted scripts, 24 unsupported template
extensions, four bogus declarations and one unloaded iframe. The semantic tree
has its own native omissions and missing-doctype/quirks diagnostics; it is not
a rendering substitute. The sole geometry request targets actual full-loader
main `e1411` and returns no rectangle: eighteen unavailable stylesheet fetches,
eighteen unloaded stylesheets, and one each HTML presentation-hint, element and
SVG layout issue. The absent resources were intentionally not fetched; this
does not diagnose their contents or establish full-site rendering.

Both phases use historical audited 18,247, close their owners, preserve build
pins and remove empty private directories with absent process groups. No
actions, scripts, resource loading, raster, SafeJS, devices or real TTY are run.
Evidence: `node_modules/.cache/native-validation/native-mdn-border-style-september13/`.
Ledger SHA256: `a7fb02157266104e823a8ecd5610ac4cd7cf46e07b73417bf63fcc7768935e5c`.

## Retained reduced-motion source

A separate zero-HTTP native semantic load inspects the exact 709,021-byte Media
Queries response captured September 5, not a newly downloaded/latest source.
Seven admitted scopes contain 1,449 text units. They establish the discrete
`reduce`/`no-preference` values, preference intent, and the Boolean-false meaning
of `no-preference`. The source report separates those definitions from the
browser's fixed-UA policy and from actual operating-system preference detection.
See `REDUCED-MOTION-MEDIA.md` for implementation scope and provenance.

Evidence: `node_modules/.cache/native-validation/native-motion-source-september13/`.
Ledger SHA256: `b6188a903a42258154ac556a5400a25b1ea19832a1327f038b057679c4d50db4`.

## Implemented motion-query support and native verification

The native evaluator now supports the fixed `no-preference` UA profile described
in `REDUCED-MOTION-MEDIA.md`. This does not detect an OS preference, implement
animations, or recognize unrelated pointer/hover features.

The first 30-case baseline reports thirteen passes and seventeen failures; one
assertion also incorrectly expects a color string from the native RGBA API.
That baseline is preserved. A separate corrected baseline again reports
thirteen passes/seventeen failures. The fixed run has 504 passes, zero failures
and zero exclusions across nine explicit suites. It includes 31 new feature
cases, five new page-binding cases and the existing 87-case `css-media` suite.
An initial focused preparation rejects its proposed strict-root list before
creating a lane; correcting the declared list is not a rerun of a consumed test.

The broader canonical native gate runs September 13 at
10:27:28.978–10:31:40.799 UTC and is audited at 10:31:40.905:

- **18,370 passed, zero failed, two unchanged exclusions.**
- 359 selected suites; 358 strict roots; 735 manifest entries; 376 unrun suites.
- The 87 existing media cases are newly selected, not newly written tests.
- Exclusions remain total host-object pressure and the existing unsupported
  display/advisory-media interaction. No new exclusion or weakened assertion.
- The historical `snapshot.test.ts` strict-root omission remains; its behavior
  still runs. Native success is not SafeJS, real TTY, live website or device proof.
- 1,271 source files, 2,104 compiled files, 1,266 unchanged tracked inputs.
- Audit base `4b83abbcd372ca7c3e98c1ddf700a4aec7254806`; only four owned source/test
  files and the canonical manifest change. Existing root working-tree edits are
  not copied into the clean snapshot, and root `dist` is not rebuilt.

Gate: `node_modules/.cache/native-validation/native-reduced-motion-september13-round00/`.
Source-ledger SHA256: `89b4358577e2c1deb387f01ad39940540061f00d8214c4189e8bc98839894bba`.
Compiled-ledger SHA256: `6f82039ef7fc89f33502f8670438bd58ac603051ebdb959ad868ae62b2c6271d`.
Native-results SHA256: `f16f55c72830a65342892f59103a32d065374087e096c8f788e8b113bf54d03a`.
Summary SHA256: `96a723a901ffb73ed9aaf140552c859d8fa05d553af214fae701685eba74ef1c`.

## Actual stylesheet replay after the fix

A new audited-18,370 replay runs 10:32:08.145–10:32:08.678 UTC. It uses the exact
same HTML, CSS, native SRI path and denied-import scope: one load, one captured
resource read, two recorded policy callbacks, no new HTTP, scripts or raster.

Actual formatting media diagnostics decrease **36 → 3**. The remaining two
distinct unsupported conditions concern `hover` and `pointer`; no retained
unsupported media condition contains `prefers-reduced-motion`. Whole-sheet
parser budgets and raw selector classifications are unchanged.

Formatting selector diagnostics decrease 199 → 195 and unsupported-property
diagnostics 196 → 188 because now-known inactive motion branches are no longer
treated conservatively as possibly relevant. This does **not** implement those
selectors or properties. Other source and compatibility issues remain visible.

Formatting measurements are unchanged: 956 visited DOM nodes, 963 boxes, 3,734
text units, 192,948 work units and nine deferred subtrees. There is no measured
layout speedup claim. Table geometry still fails on the remaining font import,
at-rules, selectors, values and layout limitations; no rectangle is fabricated.
Owners close, source/compiled pins match, private directories are removed and
the process group is absent, with no guard attempts.

Evidence: `node_modules/.cache/native-validation/native-testpages-motion-replay-september13/`.
Ledger SHA256: `d308c9258cff3d001788c8ee77416f8c4db846553dc058b99e524c90b5dea4ab`.

## Open gates

Full TestPages rendering, the uncaptured import and fonts, pseudo-elements,
constraint-validation selectors, animation/radius/opacity/object-fit support,
original research tasks, real password/passkey devices, SafeJS, real TTY and
human challenge handoff remain open. Subsequent tests must retain their own
runtime/date/scope rather than treating this inspection as those acceptances.
