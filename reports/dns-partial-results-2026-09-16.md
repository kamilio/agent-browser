# Default DNS partial-success handling — September 16, 2026

## Defect and fix

The default resolver in `src/node-transport.ts` already starts A and AAAA lookups
concurrently and waits for both. Its old result loop throws immediately on any
non-absence query failure, even if the other family supplied addresses. This can
reject an otherwise usable native request before its ordinary address-policy
check or HTTP boundary.

The fix collects all fulfilled addresses and records whether a non-absence
failure occurred. It decides DNS failure only when the final address list is
empty. No dependencies, extra DNS queries, retries, race, fallback transport,
identity changes or relaxed network policy are added.

Every returned address remains subject to the unchanged policy before exchange.
Mixed public/private or invalid results still stop before HTTP. In a partial
failure containing invalid/private returned addresses, the error now correctly
comes from address policy rather than the unrelated failed family lookup.

If no address exists, the original distinction remains: absence/empty results
produce `DNS returned no addresses`; other failures produce
`DNS resolution failed`. Both errors remain `network-error`. Cancellation and
request deadlines retain their original errors and cleanup paths. A-before-AAAA
ordering, first-address use, custom resolvers, DNS timeout2000ms/tries2, request
budgets, TLS checks and resolver listener cleanup are unchanged.

The complete wait for both query results remains. **No DNS speedup, successful
real HTTP exchange, website recovery or arXiv timeout diagnosis is established.**
The earlier arXiv attempt reached an observed HTTP request start; that evidence
does not identify this DNS failure as its cause. Its original timeout remains open.

## Validation

Parent: `8a18c1d6459109219780f08817f3836c2308ea66`. Build a clean archive and overlay
only the resolver production change and its new test file; do not test dirty root
runtime as if it were the committed candidate.

| Gate | Result |
| --- | --- |
| Clean parent selection |346 passed/0 failed,7 explicit native-manifest files |
| Final candidate |371 passed/0 failed,8 files,25 new cases |
| Final tests on unchanged production |17 passed/8 expected failures,1 file |
| Final production build / selected types / focused format / lint |All pass |

The eight negative-control failures comprise six partial-success admission cases
and two partial-failure address-policy precedence cases. They are not25 missing
features or25 real DNS failures. Normal absence, cancellation, empty/error,
ordering and cleanup cases continue to pass on the old production control.

The new tests mock `node:dns/promises.Resolver` and all HTTP/HTTPS request/get/
server entrypoints. The intended request boundary records its arguments and
throws a synthetic coded refusal. Reaching it proves that DNS answers passed
through address-policy admission; **it does not mean an HTTP request succeeded
or was transmitted**. Tests verify which first address would be used, no extra
request attempts, cancellation, zero active transport work/timers and removal
of the owned DNS/request abort listeners. Real I/O remains forbidden by the
native guard. No real socket/TTY/SafeJS, page script, credential or website probe
is included in this validation scope.

Initial controls are retained: the first candidate failed all25 new cases in
teardown because its global AbortSignal spy also counted Vitest's listeners.
That was a test-harness error, not25 production regressions. The corrected tests
track only listeners added during their own `transport.request` call and inspect
actual listener retention. The constructible fake resolver and formatting were
also corrected. Final red/final comparisons use identical corrected tests.

The existing seven-file selection also covers network policy, request signals,
response budgets/byte diagnostics and request pacing. This is not a full native
manifest, actual SDK or live transport acceptance run. No unrelated pre-existing
work or historical measurements are rewritten.

## Evidence and limits

Local lane: `node_modules/.cache/native-validation/dns-partial-results-september16`.
The accompanying JSON pins clean source/compiled manifests, exact production/test
hashes, baseline/final/red results and the independent static review. The preserved
first failing controls remain separate from the corrected evidence.

Contract: `DNS-PARTIAL-RESULTS.md`. This small production fix removes avoidable
resolution rejection; connection fallback, live failure attribution, dynamic
search, challenge handoff, SafeJS and credential/passkey gates remain open.
The broader browser goal stays active. Pre-existing work is preserved; no push.
