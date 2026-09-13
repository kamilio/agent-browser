# Native box-sizing compatibility aliases

The explicit legacy names `-moz-box-sizing` and `-webkit-box-sizing` map to the
existing native `box-sizing` property. This is actual parser/cascade/CSSOM and
layout behavior, not filtering unsupported-property diagnostics.

## Motivation and scope

The retained Internet checkbox page has three applicable declarations using
these names: Mozilla content-box on `hr`, and Mozilla/WebKit border-box on a
universal element/pseudo rule. The prior native attribution records them among
11 applicable property guards. See `INTERNET-CHECKBOX-REPLAY-SEPTEMBER-13.md`.
Those guards are distinct from the page's font, keyframe, selector and other
property limitations; supporting aliases does not make the pointer flow usable.

Only these two names and the previously supported `word-wrap` alias are registered.
There is no wildcard vendor-prefix stripping or automatic support for similarly
named properties. Native content-box/border-box values and existing CSS-wide,
variable, priority, source-order, sizing and error behavior remain authoritative.
Unsupported box-sizing values are not made valid by adding a prefix.

## Shared state and accessors

Parser and CSSOM method normalization resolve both vendor names to canonical
`box-sizing`. They share declaration state, priority, removal and serialization;
there is no extra indexed longhand. The canonical alias helper itself remains
case-exact; its callers retain their existing CSS case-normalization rules.
Prototype-like names are not aliases because registry lookup checks own keys.

Inline and computed style host objects use one shared accessor-name helper:

| CSS name | Additional host accessor spellings |
| --- | --- |
| `box-sizing` | `boxSizing` |
| `-moz-box-sizing` | `MozBoxSizing` |
| `-webkit-box-sizing` | `WebkitBoxSizing`, `webkitBoxSizing` |

Hyphenated accessors remain available too. All spellings resolve the same canonical
value. Computed accessors stay read-only. Standard property indexing, host-object
identity and close/revocation rules are unchanged. CSS method names and JavaScript
accessor spellings remain separate interfaces; a camelCase host name is not a new
CSS declaration name.

The original stylesheet is not edited to admit these aliases. Canonical CSSOM
serialization reflects the parsed declaration state when requested or mutated,
just as for the existing word-wrap alias. Real geometry and pixels must agree with
equivalent canonical declarations; no synthetic rectangles or new layout path.

No new engine, runtime dependency, network behavior, credential/provider access,
device capability or SafeJS execution is introduced. Full-asset website actions,
broader compatibility and repeatable performance remain separate acceptance gates.

## Focused validation

Two new suites contain **134 cases**: 74 parser/style/geometry/raster and 60
CSSOM/host-accessor/lifecycle cases. They exercise independent canonical fixtures,
numeric box dimensions, pixel equality, generated boxes, source order, importance,
inheritance/defaults, variables, mutation, serialization, indexing, unsupported
values/prefixes, prototype names, bounds and revoked capabilities.

The identical-test final baseline records **526 passed / 126 failed / zero
skipped** on old production. The candidate records **652 passed / zero failed /
zero skipped** across 16 files. All 134 new cases pass; 126 fail on old production
and eight retain existing negative/invariant behavior. Build, strict compilation,
scoped formatting and immutable-source checks pass for the focused pair. Candidate
run: September 13, 2026, 18:27:52.587–18:28:17.355 UTC.

The initial pair is preserved: baseline 524/128, candidate 650/2. Its only candidate
failures are two newly selected word-wrap tests with a stale hard-coded computed
property count of 73; the existing canonical list already contains 114 entries on
both runtimes. The corrected tests use that canonical list's length while keeping
exact index/name equality and alias exclusion checks. No production or resource
limit change is made to accommodate them.

Four previously unselected existing suites join this validation: word-wrap (23
cases), word-wrap CSSOM (34), CSS box (32) and page CSS (51), totaling 140 cases.
These are existing tests newly exercised, not 140 newly authored feature tests.
The selected native release gate and real checkbox action are separate checks.

## Selected native gate and website replay

The fresh release snapshot records **20,672 passed / zero failed / two unchanged
skips**, with 402 selected files, 401 strict roots and 760 manifest entries. Build,
strict compilation, scoped formatting and source/compiled integrity checks pass.
There are still 358 unselected manifest entries; this is not a whole-manifest pass.
The two exclusions remain the total host-object ceiling and unsupported-display
media-fallback cases. The increase from 20,398 is 134 newly authored cases plus
140 existing cases newly selected, not 274 new feature cases.

Run: September 13, 2026, 18:28:39.480–18:33:30.400 UTC. Audited snapshot:
`node_modules/.cache/native-validation/native-box-sizing-alias-september13-round00/`.
It contains 1,301 source files, 2,124 compiled files and 1,294 unchanged tracked
inputs. Pre-existing computed-style reorder and other working-tree edits remain
outside the feature snapshot and commit.

An unchanged-harness, complete-asset Internet checkbox replay then records
applicable property guards **11→8** and raw property diagnostics **374→359**.
The actual pointer click still fails before dispatch. Semantic toggle/restore,
formatting observations and retained assets remain unchanged. This is zero-HTTP
offline replay, not a new live-page acceptance or performance improvement.
Details: `INTERNET-CHECKBOX-BOX-SIZING-SEPTEMBER-13.md`.

Focused evidence: `node_modules/.cache/native-validation/box-sizing-alias-work-september13/`.
All initial attempts remain beside final `baseline01` / `fixed01`. The audit
confirms identical pairwise test sources, only the three intended production
differences, 126 fail-to-pass transitions and no pass-to-fail regression.
