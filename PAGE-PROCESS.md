# Owned page realms and session processes

September 1, 2026. Experimental SDK API, now optionally routed by the actual CLI
and playground API (`PROCESS-CLI.md`). Automatic website scripts default to off;
`SCRIPT-LOADING.md` adds an explicit partial classic mode. No dependency was added
or installed.

## Ownership

`PageScripts` owns one persistent extended-SafeJS realm for one live document.
It grants only the browser's opaque document/Window capabilities, tracks pending
callbacks, applies cumulative interpreter budgets, and revokes callbacks when the
document closes. `window`, `self`, `top` and `parent` currently alias the same
single Window capability; frames are not implemented. Window listeners use the
same native event dispatcher as element listeners. `PAGE-CONSOLE.md` describes
bounded document-owned console capture. `PAGE-TIMERS.md` adds timers sharing the
realm budget and callback lifecycle, including argument identity and cleanup.

`BrowserSessionProcess` puts the entire command host, session, document trees,
native actions and page realms in one owned child. The parent transfers bounded
command/result frames, not copied DOMs. One actor owns exactly one named session;
multiple tabs remain possible within it. A new document gets a new realm, while
fragment navigation retains the document and lexical state. Realm creation is
lazy, on the first explicit `eval` command.

The child uses an empty environment, fixed Node executable/entrypoint, permission
flags restricting filesystem access and denying subprocesses/workers/addons/WASI,
disabled native string code generation, and a bounded V8 old-space heap. These
Node restrictions are defense in depth, not an OS sandbox or a total-RSS limit.
The selected SDK is trusted native code. Node 22 permission flags do not restrict
its network syscalls; browser requests use the existing guarded transport. Guest
code receives no ambient Node, filesystem or network capability.

The parent independently enforces startup and command deadlines. A sequenced
heartbeat also detects an idle child whose event loop is starved by callbacks
after a command returns. Timeout, active-command cancellation or invalid protocol
output kills only the owned child; promises settle after confirmed child exit.
Pre-aborted requests leave the actor alive. There is no automatic replay, restart
or fallback to an in-process evaluator. An actor failure loses all its tabs.

## Explicit API

Build this package and the locally extended SafeJS public core first. Select the
package root explicitly; the existing installed SDK is never silently replaced.

```typescript
import { BrowserSessionProcess } from "@automations/browser-agent/node-session-process";

const browser = await BrowserSessionProcess.create({
  packageRoot: "/tmp/agent-browser-safejs-13.0.10/packages/safe-js",
  session: "research",
});
try {
  await browser.execute(["open", "https://example.com/"]);
  await browser.execute(["eval", "let visits = 1;"]);
  const result = await browser.execute(["eval", "++visits"]);
  console.log(result.data);
} finally {
  await browser.close();
}
```

`execute(argv, { signal?, session? })` uses the existing command parser and host.
Explicitly selecting another session is rejected before dispatch. Its `eval`
result is the bounded JSON `ScriptEvaluation` envelope, not a remote object handle.
A single expression returns its value; a multi-statement program does not
implicitly return its final expression. Function-invocation and element-scoped
Playwright eval semantics are not implemented. Uncaught source errors currently
revoke the realm; reloading creates a fresh document rather than reviving it.

Options: `packageRoot` required; `session` defaults to `default`;
`commandTimeoutMs` defaults to 30000 (20–300000), `startupTimeoutMs` to 5000
(20–60000), `heartbeatTimeoutMs` to 2000 (100–10000), `maxOldSpaceMiB` to 128
(32–256), `maxPendingCommands` to 8 (1–8). `scripts.limits` takes existing
`ScriptLimits`; `scripts.maxPendingCallbacks` defaults to 128 (1–1024). Heartbeats
are emitted every quarter-deadline, clamped to 25–250 ms. Interpreter timeouts
are cooperative; only the external process deadline is a hard watchdog.

The public loader accepts only a declared `@poe-code/safe-js/core` or
`poe-code/safe-js` export providing all required extensions. The lightweight core
now also exports the existing safe result copier and typed `SandboxError`.
The upstream repository tag is v13.0.10; its SafeJS package version is 0.0.1.
Those are different version identifiers, not an installed dependency upgrade.

## Evidence

- Browser regression suite: 925 tests across 51 files pass, including eight page
  owner tests, eight new process tests and nine existing script-process tests.
- Focused source suite: 58 real interpreter tests pass. The two added cases
  exercise detached structured-result copying and rejection of live grants without
  invoking their getters. The full upstream suite is not a green release gate;
  see `SAFEJS-EXTENSIONS.md` for its missing dependencies/type-fixture failures.
- `reports/session-process-sites-2026-09-01.json`: 18 checks pass against the
  actual compiled SDK in real child processes. Example Domain and Books to Scrape
  verify persistent lexical state, Window identity, live DOM changes visible in
  native snapshots, native click cancellation, fragment retention, fresh realms
  after reload, and confirmed process termination. A deliberate guest infinite
  loop hits the external deadline while a separate actor remains responsive.
- `reports/session-process-sites-initial-2026-09-01.json` preserves the first
  failing probe: it incorrectly expected multi-statement source completion to
  return the final expression. The corrected probe separates setup and queries;
  it does not change the interpreter's source-return semantics.
- Real-site requests are read-only GETs; link cancellation/fragments make no
  remote mutations. Probe scripts are authored explicitly, not downloaded site
  JavaScript. The report's RSS is parent-only and not a peak measurement.
- Strict package/test compilation and the 121-file configured style check pass.

## Remaining gates

The opt-in CLI/server router is implemented in `PROCESS-CLI.md`; basic automatic
classic loading is in `SCRIPT-LOADING.md`. Dynamic script discovery, modules,
complete page lifecycle, browser timers/fetch,
microtask checkpoints, navigation from guest code, broader DOM coverage and real
dynamic-site acceptance remain open. It is not full browser or Kitesurf parity,
an anti-bot bypass, or a measured fast-browser claim. The Node child-process host
does not run directly in Cloudflare Workers; portable core work remains separate.
