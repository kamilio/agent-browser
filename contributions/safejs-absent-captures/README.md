# SafeJS absent closure captures

Avoid calling the retained-data visitor for `undefined` capture values. The
existing visitor returns immediately for that value, before charging, depth,
identity or retained-provider work. The capture provider and its iterator still
run completely, in the same order; no other value or accounting check is skipped.

The patch applies to the exact combined private SDK candidate
`/tmp/agent-browser-sdk-literal-snapshot-kR8kMd/candidate`. Only
`interp/values.ts` and the new `interp/absent-capture-accounting.test.ts` differ
in `/tmp/agent-browser-sdk-absent-captures-P8S12x/candidate`.

## Evidence

- Deterministic performance RED: a closure yielding 1,000 undefined values and
  one owned record causes 1,003 visitor calls, versus three for the reference.
  GREEN: both cause three calls. Both versions charge exactly 11 units, invoke
  the provider once, consume all 1,001 yields and finish the iterator.
  Evidence: `/tmp/agent-browser-absent-capture-red-PBsMdN` and
  `/tmp/agent-browser-absent-capture-green-of5qstwt`.
- Seven correctness tests pass before and after the change. Related regression
  passes 125 tests across 14 files; strict types and fresh core/node build pass.
  Parent re-verifies 4,590 input hashes per lane. Test HOME/TMP remain empty;
  compiler TMP contains its isolated `node-compile-cache`.
- Tests preserve provider order/errors, mutable descendants, transient growth
  rejection, depth failures, cycles/aliases and ignored-capture behavior.
- The new package passes all nine unchanged native Event/legacy/Unicode checks
  in 11.986 seconds. Parent verifies 7,084 input hashes and 42 artifacts in
  `/tmp/agent-browser-absent-actual-psfthshw`; observed resources close completely.

The counter overlay is diagnostic only and is not included in the qualified
package `/tmp/agent-browser-absent-capture-sdk-2x8YPp/package`.

## Zoom limitation

The unchanged exact-vendor replay still times out: 120.278 seconds, 825,291 SDK
steps and 800,003 peak data units. Evidence:
`/tmp/agent-browser-absent-vendor-4mbworbo`. Parent verifies 7,084 input hashes and
19 artifacts; all observed resources close, with zero retained data afterward.
No deadline or other budget is raised. No end-to-end speedup is established.

This is a local contribution, not default-runtime activation or a live Zoom run.
Meeting UI, legitimate admission, incoming audio and notetaking remain open.
