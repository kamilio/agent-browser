# Browser priorities

- Develop the standalone native browser + SafeJS toward a possible future
  replacement for the working Automations Zoom notetaker. Keep Automations
  unchanged and the native engine independent of Chromium, Firefox and remote
  browsers. SafeJS is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. The approved diagnostic route
  https://app.zoom.us/wc/7982110526/join returns HTTP 200 with server-rendered
  name and Join controls, but interactive initialization still fails. No meeting
  has been joined. Acceptance requires joining/admission and presence, roster/chat,
  audio capture/transcription, playback/live microphone/avatar, leaving and cleanup.
- Reduce retained-graph accounting cost while preserving memory/depth limits,
  cancellation, callback ownership and credential isolation. Full primary graph
  reconciliation must remain active during suspended callback holds.
- Continue compatibility work, legitimate challenge handoffs, top100 checks,
  browser-only research, playground/terminal and command coverage. Opt-in 16 MB
  extraction recognizes React stream completions; unknown helper variants and
  interactive behavior remain unverified. Validate secret placeholders with
  extensible .env/pass providers and passkeys.

## Current verified state

- Retained SDK contributions include classic globals, callback scheduling, strict
  idle dictionary conversion, timed checkpoints, held-data enforcement, tracked
  own-field/private-name projections, frozen closure symbol snapshots, managed
  proxy descriptor capture and record/array DFS continuations. Record/array chains
  reach depth 1024 and reject 1025 with dataDepth; broader depth coverage remains open.
- Compiled-ticket ownership now scans escaping roots only when reconciliation is
  unheld and an included ticket has a positive staged charge. Primary graph
  measurement, held limit enforcement and ticket forwarding remain intact.
  Metadata providers must not rely on an optional ownership scan for side effects;
  release of a hold during the primary capture is covered. This change deliberately
  reduces capture invocations when the ownership result would be unused.
- Latest validation: 143 focused SDK checks across 18 files, scoped core compilation,
  new-test formatting, exact contribution patch forward/reverse application and all
  nine actual native SafeJS idle adapter checks pass. Four new checks fail on the
  saved baseline's redundant capture calls; primary-capture hold release passes on
  both versions. The actual native extension adapter rejects suspended 60000 units
  plus a later 60000-unit value at data limit 100000 and releases data on close.
- Last 120 s, 192 MB live diagnostic: initial 107111-character script completes in
  14.6 s; Vue still times out at 120315 ms, peak data 912839 units, 16 scripts
  executed. Cleanup completes. Loader completion and existing controls do not prove
  application readiness or joining. No reliable initialization speedup is claimed.
- Rejected scope-root grouping/reuse and weak-map visitation experiments were
  reverted after mixed benchmarks and no initialization gain. Extending snapshots
  to native private-name maps also failed to establish a useful live improvement:
  30 s Vue diagnostics reached 957965 baseline versus 958575 candidate steps, both
  timed out. Synthetic warmed measurements fell from 0.45 to 0.36 ms, but the
  experiment is reverted. Its 113 focused SDK checks, native suspended private-field
  data limit and removed-value GC probes passed. No experimental caches remain.
- Current 49 s CPU profile: graph visitor 25.4 s, private/symbol traversal 5.7 s,
  scope-root collection 4.2 s and GC 1.9 s of self samples. Investigate visitor
  traversal/capture continuations next; repeated scope snapshot experiments have
  not resolved live initialization. The diagnostic profile and harness are removed.

## Outstanding gates

- Interactive Zoom initialization/join and every notetaker capability listed above.
  Diagnostics block optional file-paa.zoom.us and cdn.cookielaw.org origins;
  production actor/default 128 MB heap, meeting sockets, media and transcription
  acceptance remain unverified. Invitation landing reports unsupported OS; an
  alternate duplicate script path exhausted the 192 MB heap.
- Default-stack dataDepth for direct symbol descendants and closure captures;
  older scope-root shape expectations and a baseline Promise snapshot timeout.
- Three baseline joined-callback rejection failures, earlier shared-budget realm
  reentry failure, a PageScripts timer probe's generic callback script-error and
  an onload non-callable-handler failure. Prior intermittent default 1 s idle
  initialization failures keep timing reliability open despite recent nine-case passes.
- Full SDK package build: unresolved tiny-mcp-client dependency types through the
  shared local dependency tree. Scoped core compilation is not a full-package pass.
- Older native capability metadata and classic-loader limit expectations; no full
  native-suite pass is claimed. DOM branding lacks full prototype method tables;
  namespaced creation currently supports only unprefixed HTML, SVG and MathML names.
- Keep native, SafeJS, live-network, socket and TTY/PTY gates separate. Use only
  manifest-listed native tests from native-tests.json. The user approved SafeJS,
  live Zoom and necessary sockets; native passes prove none of the other gates.

## Retained development inputs

- Native source/build: this repository. Preserve unrelated uncommitted work.
- Working SDK source/build: /tmp/agent-browser-zoom-sdk/packages/safe-js.
- Local SDK baseline: /home/kjopek/project/poe-code/packages/safe-js.
- Focused SDK contribution patches: contributions/. Some recovered accounting
  patches still need reconciliation; a temporary metadata patch header was normalized
  only in the retained scratch SDK.
- Keep validation artifacts ephemeral. No run diaries, inventories, page dumps or
  archives. Commit completed focused changes atomically; do not push unless asked.
