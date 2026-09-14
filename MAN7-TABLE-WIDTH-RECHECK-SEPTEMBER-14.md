# Man7 percentage-table-width recheck — September 14, 2026

## Outcome

**The captured ls(1) page loads and the native date(1) click advances past the
previous percentage-table-width guard, but the flow still fails.** The next
native layout blocker is `unsupported: Percentage cell descendant heights
require table reflow`. No destination request, destination commit or successful
mouse activation occurs. This is neither live website acceptance nor a missing
destination-fixture result: the independent absent date(1) capture is not reached.

One browser observation ran at **14:58:56.168–14:58:57.018 UTC**, using runtime
`bdb923d11ba2f1ea9182263714acb6c2be217c91`. The prepared workload, four responses
and seven other workload/framework files are byte-identical to the corrected
owner retest recorded in `MAN7-OWNER-RETEST-SEPTEMBER-14.md`. That earlier run
failed with `Percentage table role sizing requires cycle resolution`. The changed
failure is evidence that this exact captured input passes the previous guard;
it is not proof that all table layout, the click, or the website works.

The child and supervisor both exit **1**, preserving the failed flow. The separate
unchanged evidence verifier exits **0**, with **18 checks passed / zero failed**.
These checks verify the bounded observation, source/fixture integrity and cleanup,
not site acceptance. No additional replay followed the native failure.

## Observed native behavior

| Observation | Recorded result |
| --- | --- |
| Initial document | `ls(1) - Linux manual page`, 722 nodes, revision 727; one commit |
| Discovery | 64 of 64 anchors inspected, two explicit selector queries |
| Selected link | Native reference `e472`, text `date(1)`, relative href `../man1/date.1.html`, target `_self` |
| Action | One ordinary BrowserSession click attempt; layout fails before activation/navigation |
| After failure | Initial URL, document identity, revision and history unchanged |
| Formatting diagnostic | One inspection: 719 boxes, 707 visited DOM nodes, 10,626 text code units, 18,869 work units |
| Deferred layout | Three table coordination shells: `e27`, `e61`, `e649` |
| Cached diagnostics | Applicable CSS issues empty; inspection does not change the cache |
| Replay | Four accepted mocked responses, 39,562 decoded bytes; no replay misses |
| Adapter attempts | Five: four accepted responses plus the unchanged local optional tracker denial |
| Wire / scripts | Zero / zero |

The four immutable original captures contain the HTML (17,305 decoded bytes),
root stylesheet (4,297), book-cover PNG (15,833) and manual-page stylesheet
(2,127), captured September 12. Original encoded bytes, decoded bytes, headers,
timestamps and historical evidence remain unchanged. The optional tracker is
denied before transport under the original policy. It is not a newly tested host,
server-side restriction, Cloudflare challenge or CAPTCHA.

## Runtime and execution scope

The adopted runtime's final native release has **23,822 passing tests, zero
failures and two unchanged exclusions**, with build, strict roots and formatting
checks passing. Its 65 new tests and two explicit existing-case migrations are
documented in `TABLE-CONTAINER-PERCENTAGE-WIDTHS.md`. No production source or
test code changes occur in this captured recheck.

Runtime directory:
`/dev/shm/agent-browser-table-container-percentage-september14/release01/snapshot/dist`.
The parent independently checked the binding, adopted runtime and unchanged
eight workload/framework files before releasing the prepared one-shot check.
Preflight passes at 14:55:36.758 UTC; the supervisor starts at 14:58:56.028 UTC
and finishes at 14:58:57.058 UTC. Its output is 61,252 bytes, below the 6 MiB cap.

A parent command initially omitted the mandatory `before` argument. It exited at
the argument assertion before creating the run-once lock or spawning a browser.
That prelaunch command error is retained in `PARENT-OBSERVATION.md`. Supplying
the required argument then launched the sole native observation. This is not a
second browser attempt, a changed workload, or a retry of the failed site flow.

Execution retains kernel/network/process guards, private empty HOME/TMP,
pipe-only I/O, a 30-second timeout with five-second grace, original response and
action caps, and no forced click or direct destination fallback. No live request,
credential/provider/passkey/device access, SafeJS, extra asset, socket probe or
real TTY/PTY is included. This run does not authorize or claim those gates.

## Cleanup and preservation

The session, transport, documents, image/query/interaction owners close with no
cleanup errors. Pending work settles in one bounded sample with unchanged
counters. Both private directories are empty and removed; the child process
group is absent. No timeout, truncated output, stream failure or spawn failure
occurs. Source/compiled inventories, prepared framework inputs, original
captures and 1,481 protected worktree files pass the unchanged verifier.

The previous failed first instrumentation check and corrected owner retest stay
at their original paths with their original failures and measurements. Existing
dirty source work and the 927-line TASKS residual are preserved. This increment
does not push changes.

## Evidence and next action

New private lane:
`/dev/shm/agent-browser-man7-table-width-september14/`.
Durable copy:
`node_modules/.cache/native-validation/man7-table-width-september14/`.
`SEAL.json` and `EVIDENCE.sha256` enumerate closed artifacts and this report;
`PERSISTENCE.json` records byte-for-byte verification of the durable copy.

| Artifact | SHA-256 |
| --- | --- |
| `before-RESULT.json` | `aa3a252a0e62b09d5ae9e2285bc752c849476b4e6c5b27e8ec20b4062fbbbef4` |
| `before.jsonl` | `805c992d8abe8a96cc52692297e464d7c66fbd585debeec0076e162826ed611f` |
| `before-EXECUTION.json` | `830c53a08d8b898dc874a9264d36c21a8fe120ba209d4abc63c36cae1590ac2a` |
| Runtime release audit | `4d4435d5e0dcfa97c92e5d84dac970a0dd48c6bfa19ab72e12b4cbc930e93dac` |
| Runtime post-commit audit | `5cc05dc509cb4d82a6826ecf4c57dae27bcfffaa7996b33fb937cd21ad312a41` |

Next, identify which actual cell descendant requests percentage height and
whether its containing height is definite. Add native red/green geometry,
rendering and interaction coverage before changing the reflow guard. Do not
silence it, fabricate geometry or repeat the same captured input without a
relevant validated change. A complete destination corpus remains necessary
independently. These timings and work counters are observations, not a speed or
memory benchmark. Broader complete-corpus/live coverage and the overall browser
goal remain open.
