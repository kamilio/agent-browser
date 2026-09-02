# Retained-graph accounting performance blocker

September 2, 2026. This is local evidence from the isolated v13.0.10-based SafeJS
candidate, not a claim about a released SDK or current upstream main. Posting the
detailed findings to a new public Poe Code issue was denied by approval review;
no performance issue was created. Publication requires explicit user approval.
The separately approved named-capability issue is #546; Date remains #543.

Follow-up, September 2: `SAFEJS-COOPERATION.md` adds host-task checkpoints without
removing accounting or increasing deadlines. Both tested public navigations now
return readable HTML while their expensive scripts hit the existing source
timeout. The heartbeat failures below are historical evidence. CPU throughput,
parser/native-operation latency and full script compatibility remain unresolved;
this scheduling fix is not a faster retained-graph algorithm.

## Reproduced behavior

The browser's production actor retains its two-second heartbeat deadline.
Books navigation repeatedly fails that deadline; the measured final attempt took
2009 ms. This is neither the ten-second command deadline nor a successful page
load. The public script was not rewritten and the watchdog was not relaxed.

A separate diagnostic process with an external 60-second timeout and 192 MiB heap
ceiling reaches the next script error, `+new Date`, after approximately 8926 ms
inside jQuery evaluation. Quotes reaches Date.now in 97 ms in that same run.
This diagnostic process is not the permission-restricted production actor.

The CPU profile's dominant call chain is:

`evaluateNode → reconcileDataBudget → reconcileCompiledValues → measureSandboxData → visit`

The retained-data visitor accounts for 6181 of 9165 self-samples, approximately
67%. The interpreter performs retained-root reconciliation after each AST node.
This is evidence of an expensive accounting path, not permission to remove
memory checks, ignore host objects or change the safety deadlines.

## Bounded reproduction

`scripts/check-safejs-retention-cost.ts` loads only the compiled public core. It
binds unused live objects with ten numeric getters each, then evaluates identical
80-iteration arithmetic. It reads the answer in a separate evaluation and closes
each realm. Run it under an external process timeout because host timers do not
progress during the measured evaluation:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/tmp/agent-browser-safejs-13.0.10/packages/safe-js \
  timeout 30s node --max-old-space-size=128 \
  packages/browser-agent/dist/scripts/check-safejs-retention-cost.js
```

One Node 22.22.0 run:

| Unused live objects | Elapsed ms | Guest steps | Getter calls |
| --- | ---: | ---: | ---: |
| 0 | 14 | 652 | 0 |
| 10 | 58 | 652 | 0 |
| 30 | 113 | 652 | 0 |

Every answer was 3160. No DOM, network, guest getter execution or altered
accounting was involved. These are measured observations, not brittle unit-test
time thresholds or a general throughput claim.

Evidence files:

- `reports/attributes-process-sites-2026-09-02.json`: exact watchdog source and
  per-site navigation durations under unchanged production bounds.
- `reports/site-script-errors-attributes-2026-09-02.json`: source hashes, bounded
  failure context and per-source diagnostic durations.
- `reports/site-script-errors-attributes-profile-2026-09-02.json`: profiled
  diagnostic run. The full CPU profile stays at the local temporary path
  `/tmp/agent-browser-attributes.cpuprofile`, not in a public issue.
- `reports/safejs-retention-profile-summary-2026-09-02.json`: self-sample counts
  and the hot call chain, without a full profile export.
- `reports/safejs-retention-cost-2026-09-02.json`: validated minimal reproduction.
  The retained initial report used the wrong harness assumption that a
  multi-statement program returns its final expression; the corrected probe reads
  the total in a second evaluation. No interpreter behavior was changed to pass it.

## Local partial mitigation — September 2, 03:12 UTC

The isolated candidate now reuses shallow frozen-object shapes and immutable
property descriptors. It still enumerates mutable objects, visits mutable child
values, checks guest prototypes, reads guest function properties and collects
regex compilation ownership on every measurement. Frozen Map/Set wrappers do
not make their contents immutable. Caches use weak object keys, not retained
whole-graph totals or a cross-evaluation memory estimate.

Interpreter-created closures identify their captured Scope. Within one graph
measurement, closures sharing that exact scope enumerate its roots once, while
preserving the previous repeated charge for primitive strings. The scope is read
again in the next measurement. Only the internal same-scope, side-effect-free
provider contract enables this optimization; arbitrary unlabelled retained-root
callbacks remain independent. Recursive captures and later roots are covered.

The secondary escaping-value scan is skipped only when the primary full scan
finds no included compile ticket with a positive charge. Such tickets cannot
change a transfer charge. Positive-charge tickets still trigger the full escape
scan and normal forwarding; primary retained-data measurement is never skipped.

Seventeen shape/capture tests and two new compile-handoff regressions were added
test-first. The focused run passes all 25 tests, including six pre-existing
compile-accounting cases. Tests check reflection counts rather than machine-time
thresholds, live mutation, aliases, cycles, accessors, prototype changes, fatal
memory limits and active-versus-transferred compile charges. Targeted strict core
and test compilation passes. This is not a fully metered or incremental collector.
The final native-config SDK run has 8067 passes, 30 failed assertions, six skips
and 54 failed files. Failure identities exactly match the preceding 8048-pass
checkpoint; the comparison is recorded in
`reports/safejs-retention-baseline-comparison-2026-09-02.json`. This is not a green
upstream SDK suite. The browser retains 1126 passes across 65 files; its strict
package build and configured 152-file Biome check pass.

Measured diagnostic progression for the identical Books jQuery source:

| Candidate | Books evaluation ms | Quotes evaluation ms |
| --- | ---: | ---: |
| Before optimization | 8926 | 97 |
| Frozen shapes and immutable descriptors | 5936 | 94 |
| Also shared capture sources | 3424 | 65 |
| Final candidate, including escape-scan guard | 4048 | 88 |

These individual runs vary with load and do not establish that the final guard
improves wall-clock throughput. It does remove the deterministic redundant scan.
Both public scripts still stop at missing Date. In the final owned-process probe,
Books again fails the unchanged heartbeat at 2009 ms; Quotes navigation succeeds
but its script fails. There are 38 passing local checks plus one public reporting
check, not successful automatic-site acceptance or forty passing checks.

The final no-DOM benchmark takes 15/30/63 ms for 0/10/30 unused host objects,
compared with 14/58/113 ms before optimization. Every result is correct, guest
steps remain 652 and getters are never invoked. Host timers still do not progress
during these evaluations. Scheduling and remaining accounting cost stay open.

Final evidence: `safejs-retention-focused-2026-09-02.json`,
`safejs-retention-escape-cost-2026-09-02.json`,
`site-script-errors-retention-escape-2026-09-02.json` and
`retention-escape-process-sites-2026-09-02.json` in `reports/`. Intermediate reports
are retained separately; none is published upstream. The combined contribution
patch includes the optimization and passes applicability checking against the
same exact base. Its current hash is recorded in `SAFEJS-EXTENSIONS.md`.

## Remaining work

Bound and reduce repeated graph/compile-ticket scans while preserving exact
retention and fatal-budget behavior. Incremental or versioned accounting must
invalidate correctly for nested mutation, aliases, prototypes, callback retention,
cycles, exceptions and close. Work spent scanning retained state must not hide
behind unchanged guest step counts. Cooperative host-task yielding may also be
needed but is not a replacement for reducing the cost or external supervision.

Any fix needs deterministic work/scaling regressions, the existing native-config
SDK suite, and the actual owned browser actor. Do not call this resolved by merely
increasing the heartbeat, skipping memory/compile-ticket checks, using a native
evaluator or implementing Date. The full browser goal remains active.
