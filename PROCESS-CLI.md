# Process-backed CLI and shared playground API

September 1, 2026. The actual CLI can now route named sessions into independently
supervised processes containing the entire native browser session, DOM and
persistent SafeJS realms. This selection alone enables manual evaluation.
`SCRIPT-LOADING.md` documents the additional opt-in automatic classic-script mode.
Neither is a completed Playwright/Kitesurf superset. No dependency was added.
`PAGE-CONSOLE.md` adds page-owned console capture and the shared Console/HTML
inspector panes, including document-attributed CLI diagnostics.
`PAGE-TIMERS.md` adds bounded timeouts/intervals with cancellation and preserved
argument identity, available through the same evaluation command and shared API.

## Run

Build the browser package and the extended SafeJS public core described in
`SAFEJS-EXTENSIONS.md`. The installed global SDK is unchanged. Select the trusted
package root only when starting the package-owned foreground service:

```bash
node node_modules/typescript/bin/tsc -p packages/browser-agent/tsconfig.json --outDir packages/browser-agent/dist
AGENT_BROWSER_SAFEJS_ROOT=/tmp/agent-browser-safejs-13.0.10/packages/safe-js \
  node packages/browser-agent/dist/src/cli.js serve
```

In another terminal, ordinary commands discover the same private service file;
they do not need the SDK-selection variable:

```bash
node packages/browser-agent/dist/src/cli.js -s=research open https://example.com/
node packages/browser-agent/dist/src/cli.js -s=research eval 'let count = 1;'
node packages/browser-agent/dist/src/cli.js -s=research eval '++count'
node packages/browser-agent/dist/src/cli.js -s=research eval 'document.querySelector("h1").textContent = "Local document change"'
node packages/browser-agent/dist/src/cli.js -s=research text
node packages/browser-agent/dist/src/cli.js capabilities
node packages/browser-agent/dist/src/cli.js list
node packages/browser-agent/dist/src/cli.js close-all
node packages/browser-agent/dist/src/cli.js stop-server
```

`AGENT_BROWSER_RUNTIME_DIR` still selects an isolated private connection directory.
If used, provide it to both the service and its clients. Never select an untrusted
SDK package: it is native host code, not sandboxed page source.

Without `AGENT_BROWSER_SAFEJS_ROOT`, the original non-script service remains the
default. There is no silent upgrade, installation, remote engine, alternate
interpreter or fallback after a process failure. Capabilities and help consult the
running service when its connection file is present, so a client without the SDK
variable reports the real service mode. Without a service they report local
configuration. Metadata does not itself launch or validate the selected SDK;
the first `open` validates the declared public export during actor startup.

## Session lifecycle and API

`SessionProcessHost` is exported through `@automations/browser-agent/node-session-host`.
It implements the same `execute(argv, options)`/`close()` interface accepted by
the HTTP server. `close()` is asynchronous; service shutdown awaits both socket
closure and owned actor cleanup before completion and connection-file removal.

- The first explicit `open` reserves a named slot before asynchronous startup.
  Concurrent requests for that name share the same actor, not duplicate processes.
- The default limits are eight actors, 64 pending router requests and 10000
  counted requests. Configurable maxima are 32, 256 and 1000000 respectively.
  Each actor separately retains its existing command, interpreter and heap limits.
- `list` aggregates actual child session/tab metrics and adds each owning
  process's PID and SDK version. It does not scan the host process table.
- `close` affects one named actor. `close-all` blocks new work during its cleanup
  barrier, waits for startup/termination, then permits new explicit sessions.
  Stopping the host permanently rejects further work.
- A startup failure releases only its reservation. A failed process is removed
  after exit; subsequent actions require another explicit `open`. No command or
  network mutation is replayed. Other named actors retain their state.
- Active-request cancellation terminates that actor and all its tabs. A request
  canceled during startup waits for ownership cleanup. Pre-aborted requests never
  start a process. See `PAGE-PROCESS.md` for heartbeat and isolation boundaries.
- `--timeout` can shorten the external per-command deadline, but cannot exceed
  the configured actor ceiling (30000 ms by default). Actor startup has its own
  separate deadline. Shorter bounds apply outside the interpreter, including when
  native execution does not yield. This is not complete Playwright timeout parity.

The router accepts `process` (the `SessionProcessOptions` except the session name),
`maxSessions`, `maxPendingCommands`, `maxCommands` and an optional trusted
`createProcess` factory. The factory boundary permits deterministic lifecycle
tests; the production CLI uses `BrowserSessionProcess`, never a fixture engine.

## Evaluation and observability

The command's bounded JSON `ScriptEvaluation` envelope includes `ok`, optional
`value`/`error`, interpreter counters and `partial: true`. A single expression
returns its value. Programs retain declarations but do not implicitly return
their final expression. Function/scoped Playwright evaluation remains unsupported.
Uncaught source errors revoke the realm; a replacement document receives a fresh
one. No Node process, filesystem or ambient host globals are granted to page code.

The paired playground API reaches the same actors and realms. The existing CLI
command box can submit the supported `eval` command; resulting native snapshots
see that realm's live DOM mutations. Pairing/authentication remain unchanged, and
the UI still cannot stop the service. A Window listener and native element action
do not create a second DOM or second browser engine.

Automatic classic inline/external scripts now have a separate opt-in subset
(`SCRIPT-LOADING.md`). `PAGE-FETCH.md` adds bounded same-origin fetch to manual and
classic page realms in the new build; new process/wire-level acceptance remains
unverified. Modules, full Fetch/CORS/XHR, complete task/microtask lifecycle,
guest-driven navigation, rendering, comprehensive DOM support and dynamic-site
acceptance remain unfinished. `websiteJavaScript` stays false; `pageEvaluation`
is true in the explicitly configured process mode. The additional classic-mode
selection changes `websiteJavaScript` to true with explicit partial capabilities
and per-page success/failure counters. Node permission flags are
defense in depth, not an OS sandbox, and old-space limits are not total-RSS caps.

## Verification

- `reports/unit-node-2026-09-01-process-cli.json`: 942 passing tests in 52 files.
  New coverage includes thirteen router cases, CLI mode discovery/actor cleanup,
  asynchronous HTTP-host shutdown and two external command-timeout regressions.
- `reports/process-cli-sites-2026-09-01.json`: sixteen checks pass using fresh
  CLI processes, a temporary owned service, the actual compiled SafeJS core,
  Example Domain, Books to Scrape and the paired playground HTTP API. Persistent
  lexical state, guest/native DOM sharing, click cancellation, separate process
  identity, paired-client mutations, runaway termination and surviving-session
  continuity all execute through the real command boundary.
- `reports/cli-sites-node-2026-09-01-process-cli.json`: the existing nineteen
  default-mode public-site CLI checks also pass after this integration.
- Strict package/test compilation and the configured 124-file style check pass.
  Public requests are read-only; no form is sent. Credentials and raw page bodies
  are not retained. The new paired-API probe is not a visual UI test or a resource
  benchmark; its reported RSS is parent-only, not peak or whole-system memory.
