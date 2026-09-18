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

The captured Zoom vendor advanced beyond its former 1.6M-step parsing rejection
under this profile, then reached the SDK's separate 4096-unit regex-source cap.
It has not executed successfully. React also still exceeds the unchanged16s
deadline. Neither failure is relabeled as success by selecting this profile.
