# Website test inventory — September 13, twenty-second update

**Verified responsive-font fix and bounded research; broader gates remain OPEN.**
The native browser now handles font-size calculations in the real TestPages
stylesheet. This is shared text-style functionality, not rewritten website CSS.
Historical reports and failed attempts retain their original evidence.

## Implementation and native validation

The existing CSS math parser/evaluator handles calc, min, max and clamp with
parent percentages/em, root rem, inherited native ex, absolute and viewport
units. Results become computed pixels before inheritance or em box resolution.
Negative final results clamp to zero; malformed dimensions and resource limits
remain enforced. No new runtime dependency, cache or line-height-math support.
See FONT-SIZE-MATH.md for the contract.

| Gate | Actual outcome |
| --- | --- |
| New regression cases | 74 pass; unchanged baseline 54 fail / 20 passing controls |
| Corrected expanded focused run | 663 pass / 0 fail / 0 skips across 12 suites |
| Expanded selected native run | **19,343 pass / 3 unchanged failures / 2 unchanged skips** |
| Coverage | 377 selected suites / 376 strict roots / 745 manifest entries |
| Build, strict, format | Pass; source inputs stable |
| Inventories | 1285 source/config files; 2120 compiled files; 1278 unchanged tracked inputs |

Full run: 2026-09-13T13:23:24.543Z to 2026-09-13T13:27:52.766Z. The native command exits 1;
the audit verifies the exact known failures, not a green suite. The two
research-section h2::before rejection assertions and table-source non-table
attribute negative-string assertion remain failures. The two historical
focus-provisioning/media-fallback skips remain unchanged. There are 368 manifest
entries outside this selected run; explicit manifests may include planned files
absent from the committed snapshot. No acceptance is inferred for those entries.

Runtime: native-font-size-math-september13-round01/snapshot01/dist.
Base: a4aa736ffb6123cb377a3b9544ae0e7b4647fb7c.
Source inventory: 0e0eda9795d018b55b726adfda981196173659bdd51e18424b09875cec4ed8dd.
Compiled inventory: 85cb21624659b885ec7c1c5f40328159f0538b991d62710e97d185748a6d785f.
Native result: d5197604e09435f2092e2fdaffb2f6e34a170efb5ece097fb73e104b61ec5fa9.
Summary: 9b6017c12afb58f8e92ff2dd79e20ac5c6f4c61ff78d72138a330293a63a68c2.
AUDIT.json and RECEIPTS.sha256 bind the complete validation records.
All cache paths here are relative to node_modules/.cache/native-validation/.

## TestPages: exact retained HTML and stylesheet

Page: https://testpages.eviltester.com/pages/basics/html-tag-table/
HTML captured 2026-09-13T08:35:48.354Z, 158955 bytes;
SHA-256 67a13131a7e17cca96ebc7f6e80bbcd21917675d4b99768030e980e3a6c39f16.
Stylesheet captured 2026-09-13T10:03:29.553Z, 367810 bytes;
SHA-256 b6e9b375a3bd8971467d89a8ee0e92ff1f9cfaa5aa6cee2c33f25d8af82fb30d.

The corrected before/after phases each perform one native document load, one
cached stylesheet read through the native resource-policy/SRI path, three
queries and two formatting inspections. **Zero new HTTP requests**; this is a
replay of retained website sources, not a fresh live-site validation. The
uncaptured Google Fonts import stays denied. Neither source is edited.

| Measurement | Before | After |
| --- | ---: | ---: |
| Heading font size, width 800 | 16px | **34px** |
| Heading font size, width 1280 | 40px | 40px |
| Invalid font-size declarations in whole stylesheet | 15 | **0** |
| Invalid/unsupported CSS value diagnostics | 101 | **86** |
| Native DOM nodes | 3153 | 3153 |
| Intentional presentation invalidations | 2 | 2 |

The heading remains e2923, HTML Tag - Table, with text digest
a44cf2b1d061129f124ae5101f08bb8d2feb86e4f630ab19d3c2bd8af9cd7883. Native viewport changes intentionally
increment the shared revision from 3156 to 3158; styles/formatting cause no
additional mutation. Source and heading identity are unchanged, not the total
revision counter. Existing media override behavior remains at wide widths.

Before formatting: 800px: 742 boxes / 190363 work units; 1280px: 1051 boxes / 194614 work units.
After formatting: 800px: 742 boxes / 190363 work units; 1280px: 1051 boxes / 194614 work units.
These are native work counters, not timing claims or a speed benchmark. Each
inspection stays below its two-million-work ceiling. Formatting remains partial:
positioning, overflow, unsupported properties/selectors and denied font import
are not fixed by responsive font computation. No geometry, raster, scripts,
actions, SafeJS, credentials, real terminal or device access ran.

Corrected phase times: before 2026-09-13T13:23:09.526Z to 2026-09-13T13:23:10.085Z;
after 2026-09-13T13:27:57.641Z to 2026-09-13T13:27:58.210Z.
Both exit zero; source/build inventories match before/after, private directories
are empty and removed, child process groups absent, document/query owners
closed, and paired guards record no prohibited attempt. Every phase uses a
30-second limit plus five-second grace and a 10 MiB output ceiling.
Evidence: native-testpages-font-size-math-september13-round02/RESULT.json and
EVIDENCE.sha256. Before uses the prior ARIA build; after uses the new audited
font-size build. Neither is presented as the other build's evidence.

## Preserved failures

- baseline00 never starts build/tests: an extra proposed font-relative-box test
  exists only as unrelated untracked work, absent from the canonical snapshot.
  Corrected baseline01 omits that proposed addition; prior coverage is unchanged.
- fixed00 has 583 passes and one real whitespace/case normalization failure.
  Trimming only the math dispatch check fixes it while preserving the original
  untrimmed input's source-size budget. fixed01 has all 584 passing cases.
- The first broad run, native-font-size-math-september13-round00, has 19,340
  passes, SIX failures and two skips. Its audit correctly rejects the extra
  three failures: ex-text, font-size-keywords and font-size-layout still assert
  font-size math is unsupported. Related expectations now test supported ex
  math and preserve malformed-math and unsupported-line-height guards; no test
  is removed or skipped. Expanded fixed02 passes 663 cases across 12 suites.
  Separate release round01 retains the original three baseline failures only.
- Original TestPages before-phase exits 1 because the wrapper incorrectly
  expects an unchanged total revision despite two deliberate viewport changes.
  Its original records stay failed in native-testpages-font-size-math-september13/.
  A separate round01 before phase passes with exact presentation-invalidation
  accounting. Its proposed after build is rejected by the first broad audit;
  that successful before-only record is preserved. A separate round02 runs
  before/after against the revised audited build without raising budgets or
  changing retained sources. All three website lanes have digest ledgers.

## LiveBench: native-only research and website limitation

Two actual GETs succeed: livebench.ai at 13:05:37.272 UTC and the authorized
raw GitHub README at 13:05:37.742 UTC, September 13, 2026. There are no redirects,
retries or subresources: 17,391 decoded bytes total. The website's native reader
admits only its title, not a dynamic leaderboard. The README's native text
loader yields 13 complete admitted heading-delimited blocks / 15,956 units.

BENCHMARK-LIVEBENCH-RESEARCH-SEPTEMBER-13.md separates source claims about
freshness, ground-truth scoring, task coverage and release matching from analysis
of their strengths and limitations. The captured README's April 25, 2025 and
November 25, 2024 release statements do not verify the actual latest September
2026 state. No model is evaluated or ranked. The website's script-dependent
leaderboard and scorer/dataset/contamination validation remain OPEN.

This research uses only the prior native-aria-table-september13-round00 runtime:
19,269 pass / 3 unchanged failures / 2 skips. It is not a new-font-size-build
website validation. Four research phases exit zero; the parent rechecks all
97 digest entries and read-only seal. Evidence: native-livebench-research-september13/.

## Remaining gates

The browser goal and original four research topics remain OPEN. This iteration
does not complete local-LLM hardware research, Astra/X chatter, Reddit/Poe
opinions, dynamic leaderboard behavior, full rendering, live socket/TTY/SafeJS
acceptance, credential providers or passkeys. No CAPTCHA solving or fingerprint
spoofing is attempted; challenge/login/rate-limit signals retain stop/handoff
behavior. Prior uncommitted work is preserved. No push.
