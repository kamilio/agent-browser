# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. This is
  exploratory work, not a migration; keep Automations unchanged and operational.
- Keep the native engine independent of Chromium, Firefox and remote browsers.
  SafeJS is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. The approved diagnostic route
  is https://app.zoom.us/wc/7982110526/join. No meeting has been joined.
- Acceptance requires initialized interactive controls, admission and verified
  presence, roster/chat, audio capture/transcription, playback, live microphone
  and avatar support, then leaving and verified cleanup.
- Continue legitimate challenge handoffs, top100 compatibility, secret
  placeholders with extensible .env/pass providers and passkeys, browser-only
  research, playground/terminal and command coverage.

## Current verified state

- Maintained SafeJS source/build: /home/kjopek/project/poe-code/packages/safe-js.
  Reuse this browser's working dist; preserve unrelated dirty sources in both
  repositories. The full native suite and full SafeJS suite have no completed
  pass established for the current trees.
- Retained SafeJS improvements include private retained-data snapshots and
  descriptor access, bounded capture pooling, direct SDK-owned getter dispatch,
  fixed-key source records, discarded module-snapshot elision and static module
  export/import indexes. Indexes preserve live bindings and cycle/ambiguity
  handling; a 600-export fixture uses 3604 rather than 183304 steps.
- Latest accepted live profile before the current candidate: HTTP 200, all 13
  classics pass, seven ES modules prepare, main import hits its 120 s deadline.
  Last sampled 8997712 steps / 6906886 units. Sockets zero; cleanup data zero.
  The final 90 s window attributes 60.6 s inclusive CPU to reconciliation,
  33.3 s visitor self CPU and 18.9 s GC. No readiness or joining verified.
- Maintained primitive-literal fix (a2a31bb07, local only) avoids an empty child
  CompileScope and context
  copy while preserving await and full retained-data reconciliation. Before-fix
  tests create one empty scope for each of five primitive kinds; candidate
  creates zero. The 43 selected checks cover string limits/error locations,
  regex accounting, job scheduling and fresh ordinary/held retained-data quotas.
  A final strengthened nine-case rerun proves retained-quota errors occur at
  the literal, including during callback holds. Strict typing, scoped lint,
  selected SDK build and eight built imports pass.
  Reversed serial comparisons preserve results, steps and units; literal-heavy
  expressions use about 13–15% less CPU. Table/function setup has no consistent
  gain. The final candidate live diagnostic returns HTTP 200, passes nine
  classics, then hits execution-timeout in externals before ES imports.
  Externals takes 117.1 s elapsed / 43.7 s CPU; shared contention prevents
  startup attribution. No readiness/join; sockets zero and cleanup data zero.
- A zero-window candidate diagnostic passes nine classics but fetches no client
  and reports an unhandled callback rejection; cleanup verifies data/sockets zero.
  Normal 10 s delayed-script windows are required to observe timer-loaded client
  scripts. Source fetch/compilation and green classic checks prove no readiness.
- Empty optional closure-metadata filtering and function-prototype/accessor
  tracking trials are discarded for lack of consistent gain. Full primary
  reconciliation must remain active during suspended callback holds. Preserve
  fresh property/provider reads, memory/depth limits, cancellation, callback
  ownership and credential isolation. Do not revive graph-accounting shortcuts
  based only on tracked ownership. Capture pools stay capped at 64 physical slots.
- Native bounded canvas 2D, worker/Wasm and socket support have separate focused
  probes; their availability does not establish full Zoom media compatibility.
  Actual meeting audio transport/source remains unimplemented. Native PCM chunk
  handling is not a Zoom audio source.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances. Seven
  modules clear offline compile/link but live evaluation remains too costly.
  Explicit 120 s / 256 MiB diagnostics clear no default-resource acceptance gate;
  earlier larger/longer runs also established no interactive readiness.
- Verify actual joining/admission and presence in the test meeting, then every
  notetaker capability above. The default identity's server-rendered Join button
  requires installed JS handlers (type=button, javascript: form action).
  Desktop HTML has no server-rendered Join controls. Invitation landing can
  report unsupported OS. Optional file-paa.zoom.us/cdn.cookielaw.org blocking
  remains diagnostic configuration; production behavior is unverified.
- Implement and verify native RTC/audio/media transport and capture APIs. The
  working notetaker uses getDisplayMedia plus an AudioWorklet at 16000 Hz with
  one browser audio track and disabled audio processing. No native equivalent
  audio source or end-to-end transcription/playback/microphone/avatar is proven.
- Iframe navigation/srcdoc/policy contexts and child script realms remain open;
  broader DOM branding/prototype tables, namespaced names, library compatibility
  and full canvas rendering need validation. Unknown React stream helper variants
  and interactive behavior remain unverified despite opt-in extraction support.
- Revalidate earlier unresolved parser nesting/depth, deep host ingress/result
  export/prototype/capture copying, joined-callback rejections, timer/onload
  failures, idle timing reliability and fake-SDK contract expectations before
  fixing them. Focused measurement depth passes do not clear other graph paths.
- Background imports retain per-import deadlines and TLA expiry revokes the
  realm. Shared step/data limits and cancellation remain active. Cooperative
  scheduling does not bound synchronous blocking host calls or parsing.
- Keep native, SafeJS, live-network, socket and real TTY/PTY acceptance separate.
  Native tests must come from native-tests.json. SafeJS, live Zoom and necessary
  sockets are authorized; native passes prove none of those other gates.

## Development inputs

- Reusable accepted isolated SDK:
  /home/kjopek/project/poe-code/out/agent-browser-zoom-desktop-ihql25/candidate.
  Older scratch SDK: /tmp/agent-browser-zoom-sdk/packages/safe-js; its dependency
  typing issues do not establish failures of the maintained build.
- Focused SDK contributions are in contributions/; some recovered patches still
  need reconciliation. Do not apply them blindly to the maintained runtime.
- Keep artifacts ephemeral; remove owned logs, reports and redundant builds after
  all owned processes terminate. No run diaries or findings inventories. Commit
  completed focused changes atomically with explicit paths. Do not push.
