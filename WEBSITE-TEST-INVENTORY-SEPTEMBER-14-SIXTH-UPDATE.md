# Website test inventory — September 14, sixth update

**Adds one failed captured MDN action check and one native-only CPU profile.**
No fresh HTTP request or new website capture occurs. Historical measurements and
inventories remain unchanged; the overall browser goal remains **ACTIVE**.

## Website Observation

The native browser loads the original captured MDN `Document.querySelector` page,
discovers 49 main links and two exact `querySelectorAll` matches, then attempts
one real click. Formatting-profile width resolution rejects unsupported features
before any destination request. This is a native capability failure, not a site
block, authorization failure, fixture denial or successful navigation.

All 19 responses / 270,288 decoded bytes are accepted; wire requests and denials
are zero. The 05:17:20 UTC observation lasts 0.415 seconds. Exit1, the original
exception and clean owner/process teardown are preserved. The destination is
still absent from the corpus, but that boundary is not reached in this run.
See `MDN-OWNERSHIP-REPLAY.md` for exact runtime, limits and evidence.

## Native Profile, Not Website Coverage

One separate selected run passes 36 explicit native cases: 9 nested-actionability
and 27 positioning-performance tests. CPU profiles contain actual implementation
samples in the two fixture workers; the runner-only profile is not browser
evidence. `layoutTextContexts` is a follow-up candidate, with deliberate baseline
paths and negative sampling deltas explicitly separated from performance claims.
See `NATIVE-ACTION-PROFILE.md`. No optimization or full native-gate rerun occurs.

## Next Checks

- Isolate MDN's generated-content and vertical-alignment conditions without
  deleting capability guards or expanding the completed experiment.
- Measure the text-transform presence scan on a production-only native path
  before adding a cache or claiming a speedup.
- Broaden to separately scoped public form flows and fresh live checks. The
  captured Python two-page pass remains a bounded offline result, not whole-site
  acceptance or evidence for these independent gates.

Research, credential/device, SafeJS, socket, real TTY and challenge-handling
gates remain open. Pre-existing work stays separate. No push.
