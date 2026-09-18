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
30000ms must also explicitly select an appropriate finite `commandTimeoutMs`
and request a sufficient public command `--timeout`. The parent ceiling does
not replace the child CommandHost's independent default30000ms timeout.

## CLI selection

`AGENT_BROWSER_SCRIPT_BUDGET_PROFILE` accepts `bounded-v1`, `large-source-v1`,
`application-v1`, or `application-unicode-v1`. It requires an explicit `AGENT_BROWSER_SAFEJS_ROOT` and
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
owned Zoom replay now passes21 public commands, including one80713.828ms indirect
guest eval of the unchanged337218-byte captured React/ReactDOM bundle. React,
ReactDOM.createRoot and native URL globals are verified in that owned process.
The replay explicitly selects `application-v1`, `idle-only`, a180000ms parent
ceiling, `--timeout=180000` for that long command, and a256MiB child heap; default
limits remain unchanged. Its supervisor exits0 in83.426s, and the owned child
is absent after production `close()` sends SIGKILL; this is not graceful disposal.

Evidence: `/tmp/agent-browser-owned-react-deadline-september18-0ZTS0l/RESULT.md`.
Source arrived through eleven bounded public eval appends on a synthetic page,
then one ordinary guest indirect eval, with no publisher-source modification.
This proves that narrow owned-runtime capability, not external-script loading,
policy-preserving live navigation, meeting admission or audio. The previous
oversized-route, heartbeat and separate child-timeout failures remain preserved.
Ordinary16s performance remains unpassed.

## Explicit document loading limits

Runtime budgets do not control how many external scripts a document may fetch.
`SessionProcessOptions.scriptLoading` now independently accepts finite
`maxScripts` (1–256), `maxExternal` (1–64), `maxSourceBytes` (1–8388608), and
`navigationTimeoutMs` (1–300000). Values are snapshotted before SDK-root reading
and validated again in the child. Omitted fields retain existing defaults.
The external limit is applied to both ScriptLoader and the session's shared
script-request counter, not just one layer. The session also exposes
`limits.maxScriptRequests` (default16, maximum128) for direct native embedders.

`AGENT_BROWSER_SCRIPT_LOADING_PROFILE` provides two explicit CLI selections:

| Profile | Script elements | External requests | Source bytes | Navigation ms |
| --- | ---: | ---: | ---: | ---: |
| `bounded-v1` | 64 | 16 | 1048576 | 30000 |
| `large-source-v1` | 256 | 64 | 8388608 | 300000 |

This variable requires an explicit SDK root and conflicts with reader mode.
It does not enable scripting, select an interpreter budget or change command,
heartbeat, heap, network-response or output limits. A longer navigation remains
subject to the independently selected parent and public-command deadlines.
CSP/CORS, redirects, cancellation and shared request counting remain enforced.

The observed Zoom join page exceeds the old16-external-script session ceiling.
The configurable path passes2523 selected native tests in54 files with build,
types, format and lint checks. This is not a live Zoom loader acceptance gate.

## Explicit Unicode application compilation

`application-unicode-v1` is a new opt-in profile for large Unicode character
patterns. It preserves every `application-v1` default, override and ceiling,
except that it requests65,536 per-pattern regex compilation allocation units.
The regex-source allowance remains8,192. Existing `bounded-v1`, `large-source-v1`
and `application-v1` behavior is unchanged; in particular the latter two still
request32,768 compilation units. No default is silently raised.

```ts
const scripts = new PageScripts(page, runtime, {
  budgetProfile: "application-unicode-v1",
});
```

The environment selector also accepts
`AGENT_BROWSER_SCRIPT_BUDGET_PROFILE=application-unicode-v1`, retaining the
explicit SDK-root and extension-runtime requirements. It neither enables
scripting nor changes command, heartbeat, heap, network, loader or output limits.
Source/owner-data/steps/depth/deadline and regex matching guards remain active.
A supporting public SDK is required; the validated package remains experimental.

Motivation: Zoom's captured script17 reaches a7,978-byte Unicode regexp literal
and fails the separate compilation quota at34,722>32,768. The SDK labels this
failure `dataSize`; it is not exhaustion of the16MiB whole-application allowance.
A private exact-fragment diagnostic reproduces the failure at32,768 and compiles
and runs11 fixed matching checks at65,536. The latter is the smallest tested
sufficient quota, not an exact minimum. Lower source, owner-data and step caps,
matcher repeat and regex nesting controls still reject, and all seven realms
close with no retained data. No SDK source or matcher is changed.

Evidence: `/tmp/agent-browser-zoom-regex-quota-gIuH0u/HANDOFF.md`.
The fragment diagnostic does not run the remaining publisher bundle or website.
Core50 passes5,096 native tests across122 explicit files in51.925 seconds;
build/types/format pass, with only the pre-existing ScriptDom.ranges lint finding.
The failure-first native profile selection retains44 pass/4 fail. Source/build:
`/tmp/agent-browser-event-union13-duJvuD/candidate`.
All nine actual native/runtime cases pass in12.636 seconds: the original eight
Event scenarios plus the exact Unicode literal and11 matching checks, with full
observed closure. The selected profile is explicit, and the synthetic harness
retains its existing smaller execution bounds. Parent verifies7,095 inputs and
25 execution artifacts; the final55-file seal is retained at
`/tmp/agent-browser-unicode-profile-actual-september18-FnUo0Z/HANDOFF.md`.
A fresh live load with the new profile is released. No usable Zoom UI, admission,
audio or notetaking is claimed by these synthetic results.

The first live core50 load no longer produces the immediate32k compilation
failure but still stops at script17's120-second evaluation deadline. This does
not establish complete bundle execution or a specific performance cause; see
`reports/zoom-unicode-initialization-timeout-2026-09-18.md`. The deadline is not
raised. Exact-asset offline CPU/progress diagnosis is separate from live success.
