# Explicit script budget profiles

`PageScriptOptions.budgetProfile` selects a bounded native page budget.
Omitting it or choosing `bounded-v1` retains all existing defaults and ceilings.
The single-evaluation runtime also retains its existing default behavior.

`large-source-v1` is an explicit programmatic option for publisher bundles that
exceed the ordinary step allowance merely while parsing. It sets these defaults:

| Limit | Large-source default |
| --- | ---: |
| Source/string code units | 4,194,304 |
| Cumulative interpreter steps | 16,000,000 |
| Logical retained data units | 16,777,216 |
| Evaluation timeout | 16,000 ms |
| Call depth | 512 |
| Array length | 262,144 |

The profile also explicitly requests an 8192-unit regex-source allowance and
32768 regex compilation allocations from the SDK. The ordinary profile omits
both options, preserving SDK defaults. These are independent finite compilation
budgets, not host-regex execution or changes to regex matching limits. The SDK
must support these options; adapter forwarding alone does not establish that.

Run count and result-output defaults are unchanged. Explicit `limits` still
override profile defaults within finite ceilings. Only the maximum step allowance
increases beyond the old ceilings; time, logical data, source/string, array,
depth, run and output ceilings are not removed or increased. This is input/work
admission, not a performance optimization or a claim of physical memory usage.

```ts
const scripts = new PageScripts(page, runtime, {
  budgetProfile: "large-source-v1",
});
```

An owned process can receive the same option under `scripts`. There is no new
CLI budget environment option in this change. Invalid profile names and
nonpositive/noninteger/excessive limits reject before page runtime allocation.
The SDK, process heap/watchdog, network and loader retain their separate limits.

The captured Zoom vendor now registers through the actual SDK with both regex
options: ASSETS25 passes, using 3,094,986 steps and 3,498,483 peak logical data
units. This is offline chunk registration, not module execution, full navigation,
or meeting readiness. Earlier parsing and regex failures remain historical
evidence. React still exceeds the ordinary 16s deadline.

## Slow application initialization

`application-v1` is a separate explicit programmatic option. It uses the same
defaults and ceilings as `large-source-v1`, except its evaluation timeout defaults
to, and cannot exceed, 120000ms. Smaller overrides remain supported. Both existing
profiles retain their prior timeout ceilings; omitting the profile changes nothing.
Cancellation, cumulative work/data limits, regex matching limits and output caps
remain active. Native integration passes 434 tests in 14 files with build, types,
formatting and lint checks passing.

This option distinguishes slow initialization capability from performance. It is
not a speed improvement or a retroactive pass of earlier timeout failures. Actual
application execution remains a separate acceptance gate. Owned processes still
have independent command/startup/heartbeat/heap limits: selecting this profile
does not silently increase them. A command that needs longer than the default
30000ms must also explicitly select an appropriate finite `commandTimeoutMs`.
