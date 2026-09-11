# Leading stylesheet trivia and Python.org recovery

Status: captured Python.org homepage loading and a separate fresh structural
search flow pass. The earlier literal-query text check remains failed, and search
relevance, complete rendering, scripts and challenge effectiveness are unverified.

## Parser boundary

`parseCssRules` now starts a qualified rule's selector at the first non-trivia
token already found by its CSS scanner. Leading whitespace/comments are stylesheet
trivia, not selector text. Interior comments, quoted strings, escapes, nested lists
and combinators remain byte-for-byte unchanged. Raw selector text is not split or
normalized through a replacement parser.

The full stylesheet, including discarded leading comments, still counts against
the existing 524288-code-unit CSS source limit. The query text limit remains 8192;
ordinary DOM queries, genuinely oversized selectors and oversized interior-comment
selectors still reject. No numeric limit, runtime dependency or script policy changes.

## Isolated validation

`node_modules/.cache/native-validation/native-css-leading-trivia-september11-round01/`
records September 11, 2026, 09:07:55.118–09:09:33.424 UTC:

- 6415 passing tests, zero failures and the one previously reproduced baseline
  assertion exclusion, across 109 explicitly selected native files.
- All 50 styles tests pass, including nine new parser/accounting cases. Production
  build, 108-root strict checking and two-file formatting pass; the unchanged
  snapshot.test.ts strict typing exception remains documented.
- The clean HEAD fe0e399 snapshot includes only the leading-trivia source hunk and
  new styles tests. Pre-existing css-parser.ts import/order changes are excluded.
- 1006 source/fixture files remain stable. The 1788 compiled files are pinned in
  `native-css-leading-trivia-compiled-september11`, ledger SHA-256
  `4e5212182eb803d2c08c83f00822598324737012d7ba4648f4b01a8a9037fba5`.

`native-css-leading-trivia-baseline-september11/` retains unchanged HEAD fe0e399
production source with these new tests: 44 pass and six fail, including the real
comment-heavy stylesheet load pattern. Its source pins remain unchanged.

## Captured homepage replay

`node_modules/.cache/native-validation/native-python-leading-trivia-replay-september11/`
records 09:09:48.918–09:09:49.187 UTC. One native navigation serves the four exact
previously captured homepage/stylesheet URLs through fixture routes. The homepage
loads with 1016 selector calls and 441906 cascade work units, under the unchanged
5000000-unit allowance. It admits 1955 rules and 3713 declarations.

Partial support remains explicit: 1285 property issues, 323 value issues, 87
selector issues, 13 at-rule issues, one denied stylesheet and one unloaded external
stylesheet. There is no network traffic: four mocked responses total 529326 decoded
bytes and zero encoded bytes. Guards have no attempts, all native objects close,
and source/build/capture pins remain stable. Receipt SHA-256:
`526116a224976db4d9a43b9410e4403ff5acc2b4b40ce305e2eb7fe63a3917dd`.

## Retained failed live check

`node_modules/.cache/native-validation/native-python-leading-trivia-live-september11/`
records 09:09:56.917–09:09:58.830 UTC, exit 1. The real homepage loads, one enabled
`q` search field is discovered, constant `asyncio` is filled, and its observed GET
form is submitted through native requestSubmit. The destination and three stylesheets
load; the old document closes. The query-in-text assertion fails. This run is not
rewritten as a pass. Receipt SHA-256:
`5b0a8594bc1ea24be194bd218f54204a7aec06261fbb81687e141fb0b2c86892`.

The separate native-parser-only diagnostics
`native-python-search-result-diagnostic-september11/` and
`native-python-search-state-diagnostic-september11/` inspect only that captured
search response, with network/process guards and verified source/build/capture
pins. The full 17399-character native text lacks the literal query, not just the
first 12000 characters checked earlier. Both query input values retain `asyncio`;
the main content has a Results heading and populated result titles. No scripts
are executed. These observations distinguish structural search completion from
literal snippet matching without proving relevance or relabeling the old run.

## Separate structural search flow

`node_modules/.cache/native-validation/native-python-structured-search-live-september11/`
records a new live run at 09:13:53.242–09:13:55.196 UTC, exit 0. It repeats native
homepage discovery, fill and observed GET submission, then verifies:

- Destination URL and both returned `q` fields preserve the submitted query.
- The native result document has the observed Results heading and 20 populated,
  nonempty result-title links, rather than merely an HTTP200 response.
- The old document closes; final cleanup closes both documents and the transport.

The destination has 1432 nodes. Homepage/result cascade work is 441906/368917.
Eight real requests return HTTP200 with zero redirects/mocks, transferring 361809
encoded / 1050838 decoded bytes. No challenge is classified. Pins stay stable and
private directories remain empty. The record explicitly retains
`searchTermObserved: false` and `queryRelevanceVerified: false`. Receipt SHA-256:
`bbbeee190ab364a11cc91aa77aacceba48c7812cb03220eb0e5cef2d6a608dba`.

Both live runs use only the pinned native engine, omitted credentials, one allowed
origin, two navigation and 12 request ceilings, 250-ms request spacing, 30-second
child deadlines and 6-MiB output/file caps. No alternate browser, scripts, account
actions, TTY/PTY, SafeJS or CAPTCHA solving is used. These are separate functional
checks, not full rendering, research completion or challenge-evasion acceptance.
