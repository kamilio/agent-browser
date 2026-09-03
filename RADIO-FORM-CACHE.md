# Explicit-form radio lookup cache

September 3, 2026. Native radio checkedness now caches explicit form-ID lookup
results, including missing IDs, across mutations that cannot affect those IDs.
This addresses the repeated structural lookup cost left open in `RADIO-STATE.md`.
It does not change the selection/default/dirty-state contract from that checkpoint.

## Dependency and lifetime rules

- A cache miss builds the root's first-ID table once, then retains results only
  for currently referenced explicit form names. Unrelated element IDs are not
  retained in the cache. A non-form first match still masks a later form.
- ID addition, removal, replacement, value mutation and subtree moves invalidate
  the affected ID names before regrouping. An unrelated ID does not discard a
  cached form owner. Missing-ID results are invalidated when that ID appears.
- Changing a radio's group name keeps its unchanged explicit-form dependency.
  Changing/removing the explicit form reference or leaving radio type removes
  the old dependency; its cache entry is evicted after the last reference leaves.
- The cache is per document and does not serve disconnected ancestor-form
  resolution. Tree closure releases all cached results, including negative ones.
  Failed attribute validation/allocation does not invalidate or mutate state.

Retained entries are bounded by distinct active explicit-form references, not by
the cumulative number of strings queried. The transient first-ID table remains
bounded by native document nodes and attribute text. No dependency, guest-runtime
feature or alternative browser engine is introduced.

## Measured native work

Five initial performance regressions failed before the cache. The same fixture
instruments actual native node reads, including creation and insertion, rather
than relying on wall-clock timing or a mocked resolver:

| Fixture | Before | After |
| --- | ---: | ---: |
| Construct 200 checked radios referring to one form | 24,699 | 4,202 |
| Construct 1,000 checked radios referring to one form | 523,499 | 21,002 |
| Rename one radio's group 100 times after 500 unrelated ID insertions | 51,200 | 900 |

Construction counts are identical with and without unique IDs on every radio.
After the change, constructing 100 radios takes 2,102 reads; doubling to 200 takes
4,202. Tests enforce both absolute bounds and a maximum 2.2x work increase for
that doubling. Exact after-counts were also reproduced with the compiled native
tree. These are native operation counts, not SafeJS timings or website speedups.

## Validation and remaining gates

Twenty-five new explicit native tests cover growth, positive/negative caching,
unrelated IDs, masking and duplicate IDs, reorder, all ID mutation paths, subtree
removal/reattachment, last-reference eviction, repeated reference replacement,
type transitions, detached controls, literal names, quota failure, isolation and
closure. Cache and radio-state validation passes 60 tests across two files.
Production build, strict new-test typechecking and targeted lint/formatting pass.
The full working tree passes 6,530 tests across 200 explicit native files. An
isolated HEAD snapshot with only this owner/test/allowlist patch typechecks and
passes 3,770 tests across 139 available allowlisted files, independently of the
unrelated unfinished browser changes.

Cold lookup and relevant ID changes still scan the root. This is not a claim of
constant-time structural mutations or linear total cost for workloads that keep
introducing distinct form references or repeatedly invalidate their owners.
Parser-specific form associations, broader structural scaling, actual SafeJS,
framework/site, socket, real TTY/PTY and UI acceptance remain open. No unapproved
acceptance probe ran. Historical paths and measurements are unchanged.
