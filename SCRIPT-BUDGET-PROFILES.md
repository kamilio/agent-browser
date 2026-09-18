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

An owned process can receive the same option under `scripts`. Invalid profile names and
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
application execution is a separate acceptance gate. ASSETS26 now initializes
the unchanged captured Zoom React/ReactDOM bundle in 118937ms with this explicit
profile, using 413674 steps and 573049 peak logical data units. The public exports
are verified; this is not combined application startup or meeting admission.
The ordinary 16s performance gate remains failed. Owned processes still
have independent command/startup/heartbeat/heap limits: selecting this profile
does not silently increase them. A command that needs longer than the default
30000ms must also explicitly select an appropriate finite `commandTimeoutMs`.

## CLI selection

`AGENT_BROWSER_SCRIPT_BUDGET_PROFILE` accepts `bounded-v1`, `large-source-v1`
or `application-v1`. It requires an explicit `AGENT_BROWSER_SAFEJS_ROOT` and
`AGENT_BROWSER_PAGE_RUNTIME=extension`; it does not enable website scripting.
Reader mode conflicts with explicit script profile or command-timeout selection.

`AGENT_BROWSER_COMMAND_TIMEOUT_MS` independently selects a canonical decimal
integer from20 through300000 for the owned-process command deadline. It requires
an explicit SDK root, but does not select a script profile or runtime adapter.
Neither variable silently changes heap, startup or heartbeat limits. With both
absent, existing behavior is unchanged.

Configuration rejects inherited, accessor-backed and non-string entries before
credential configuration or SDK imports. Selected values are copied into an
immutable native configuration and forwarded through the existing process options.
Source and compiled mocked checks each pass310 tests across7 selected files.
Actual CLI process startup with these variables remains a separate acceptance
gate; this is not a successful Zoom navigation.

## Busy initialization and heartbeat policy

The actual owned-process Zoom prerequisite exposed a separate watchdog problem:
seventeen public commands, including bounded assembly of the unchanged captured
React source, succeeded; its one indirect guest eval was terminated by the2s
heartbeat deadline after1851.7ms. It did not reach React initialization or the
explicit120s script/180s command deadlines. This was not external-script loading.

`SessionProcessOptions.heartbeatPolicy` now accepts `always` (the unchanged
default) or explicit `idle-only`. The latter suspends only the heartbeat-absence
timer while a command is pending. Every command retains its independent finite
parent hard deadline; heartbeats cannot extend it. After the final pending
command returns or fails, the ordinary idle heartbeat timer restarts. Sequence
validation, cancellation, startup deadline, process failures and hard termination
remain active. Background work without a pending command remains subject to the
idle watchdog; this is not an unlimited busy mode.

`AGENT_BROWSER_HEARTBEAT_POLICY` exposes the same explicit selection through the
existing primitive CLI configuration. It requires an owned SDK root, rejects
reader mode and does not enable scripts or change heap/timeout limits. Malformed,
inherited and accessor selections reject before SDK-root reading/process launch.
The child cannot select this parent-owned policy through a protocol message.

Parent native/mock checks pass2344 tests in51 files, with build/types/format/lint
passing. Tests retain the default busy-heartbeat rejection and prove idle restart,
multiple pending commands, unextendable hard deadline, invalid sequence and abort
cleanup. The unchanged-production red gate retains22 failures. A separate actual
owned Zoom replay is required to establish behavior with this new selection.
