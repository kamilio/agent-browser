# Branch-local stylesheet matching and ancestor bounds

Status: the captured Wikipedia article and a fresh native Wikipedia search flow
load within the unchanged 5000000-unit CSS/query budget. Python.org progresses
past its old work failure but exposes a separate selector-component limit. This
does not establish complete CSS, rendering, script, research or challenge support.

## Matching changes

Stylesheet selector-list branches enumerate their own conservative candidates
instead of cross-matching every branch against the union of all candidates.
Matching results retain document order, unique-node limits and the maximum
specificity of the branches that actually match each node.

Direct positive ancestor id/class/type keys can additionally constrain candidates
to merged descendant ranges in the existing preorder index. A key supplies a
range only when its next relation is descendant or child. Subsequent sibling
relations stay inside that ancestor; sibling-only seeds do not constrain ranges.
Logical operands are not mined for required keys. Full matching remains decisive.

Complete bounded indexes, foreign tag-case handling, structural invalidation and
capped-index fallback remain unchanged. Candidate filtering, range construction,
key checks and result sorting consume the existing work allowance. No dependency,
resource limit or public query API changes.

Review found a regression before acceptance: repeating the same ancestor key 200
times rescanned a 30000-entry bucket and exhausted the default work limit, despite
a single rightmost ID candidate. The two isolated fixtures in
`node_modules/.cache/native-validation/native-selector-repeated-ancestor-regression-september11/`
both reproduce that failure with the uncorrected implementation. Per-branch
kind/value deduplication now reuses the constraint without changing specificity.
Both cold and warm checks retain specificity `[1, 200, 0]` below 1000000 work units.

## Isolated validation

`node_modules/.cache/native-validation/native-selector-ancestor-ranges-september11-round02/`
records September 11, 2026, 08:50:48.117–08:52:24.007 UTC:

- 6377 tests pass, zero fail and one previously reproduced baseline assertion is
  excluded across 109 explicitly selected native files.
- All 54 selector-candidate tests pass, including 14 new branch/range cases.
- Production compilation, strict checking of 108 test roots and formatting of
  the two changed TypeScript files pass. The existing snapshot.test.ts typing
  exception remains excluded from strict roots, not native runtime tests.
- 1006 source/fixture files remain unchanged. The 1788 compiled files are pinned
  in `native-selector-ancestor-ranges-compiled-september11` with ledger SHA-256
  `663dc68f46efa05bb5a6f85f5ba4e962ef2af1b04e89ac8ba527fda043e615f3`.

The earlier round01 passed the then-existing 52 candidate tests, but did not cover
the subsequently discovered repeated-key regression. Its evidence remains intact;
it is not acceptance evidence for that fix.

Final round03, at 08:54:33.584–08:56:09.555 UTC, repeats the same 6377 passing
tests, one baseline exclusion, build, strict and formatting checks after an unused
test-parameter naming cleanup. Its BUILD-EQUIVALENCE.json verifies all 1788
production output files are byte-identical to round02, the build used in the
following replays and live flow. Both changed source files match this final
validated snapshot. Follow-up static review reports no actionable deduplication
findings; the test results are independently checked, not inferred from review.

## Captured Wikipedia article

`node_modules/.cache/native-validation/native-wikipedia-ancestor-ranges-replay-september11/`
records one zero-network native replay at 08:52:42.406–08:52:43.221 UTC.
The article and two captured stylesheets load, with 755 selector calls and total
cascade work 4246822. The prior required-key replay failed at call 180 on broad
edit-section matching; its failed result remains unchanged.

The current cascade still reports partial support: 700 unsupported properties,
165 unsupported/invalid values, 73 selector issues, 52 media-query issues, three
at-rule issues and one rule issue. Layout and painting are not validated here.
Stylesheet queries were redacted in the original capture; offline binding uses
native DOM link order plus retained origin/path, not original wire-query proof.
All captured inputs, source and compiled pins remain unchanged; documents,
queries and transport close, with zero network-guard attempts. Receipt SHA-256:
`623c1920d0a6e7dce38acb55f3f0545a8dd113ed8cb53f79bdaa9cac68777fd5`.

## Fresh Wikipedia flow

`node_modules/.cache/native-validation/native-wikipedia-ancestor-ranges-live-september11/`
records a separate live native-browser flow at 08:53:36.069–08:53:37.472 UTC:

1. Load the public Wikipedia portal and discover its enabled search field/form.
2. Fill the constant `large language model` and invoke native GET requestSubmit.
3. Follow two redirects and load the article plus both external stylesheets.
4. Verify destination text contains the query and the old document closes.

The flow passes, not merely its HTTP requests: the destination title is
`Large language model - Wikipedia`, with 17768 native nodes. Portal cascade work
is 255105; article work is 4246822. Six real requests, including redirects, transfer
238174 encoded / 1409219 decoded bytes; there are no mocked requests. All four
recorded final responses are HTTP200 and no challenge is classified. This is not
evidence of defeating a challenge. No supplied credentials or scripts are used.
Documents and transport close, active requests reach zero, private directories
remain empty and source/build/tool pins remain stable. Receipt SHA-256:
`b1abd243716cb9e8faa115c9751d1f45f2197e72df75e00328426580c5c22556`.

## Python.org remains incomplete

`node_modules/.cache/native-validation/native-python-ancestor-ranges-replay-september11/`
records a separate zero-network replay at 08:52:51.615–08:52:51.840 UTC. All four
exact recorded URLs/bodies are served through native fixture routes. The old
query-work failure at call 266 is gone, but call 523 fails while parsing a
4207-character, 120-branch icon selector list: `Selector component limit exceeded`.
The 256-component limit is unchanged. Before that call, 4828015 cascade work units
remain and successful selector calls consume 155933 units. The throwing parser
does not update lastWork: its reported 24 is the previous call, not this failure's
cost. Do not interpret the diagnostic's derived fatal-work accounting otherwise.

This replay exits zero because the bounded diagnosis and cleanup complete, not
because the homepage loads. No search field is filled or submitted. Source/build/
capture pins remain stable; all observed documents, queries and native transport
close, with zero actual encoded network bytes and no guard attempts. Receipt:
`6ecac2b4d1324017800ada5ee9a2ccbe38d91de320732b8967c3f9185af972a4`.

Next investigate bounded CSS selector-list handling without silently raising
query limits, then replay Python.org and run its separate fresh search flow.
Varied-site coverage, full rendering, the four research topics, fingerprinting/
challenge effectiveness and real credential/passkey acceptance remain open.
