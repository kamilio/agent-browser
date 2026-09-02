# Page-owned timers

September 2, 2026. Explicit SafeJS page sessions now support `setTimeout`,
`setInterval`, `clearTimeout` and `clearInterval`, both as globals and Window
methods. Automatic classic scripts can use the same implementation. There is no
browser-engine dependency, new installation or silent change to script defaults.

## Agent usage

Start the explicit process-backed service as documented in `PROCESS-CLI.md`, with
the rebuilt extended public core. Then use the normal CLI/API evaluation surface:

```bash
node packages/browser-agent/dist/src/cli.js -s=research open https://example.com/
node packages/browser-agent/dist/src/cli.js -s=research eval 'await new Promise(resolve => { setTimeout(function() { document.querySelector("h1").textContent = "Changed by a timer"; resolve(); }, 10); });'
node packages/browser-agent/dist/src/cli.js -s=research text
node packages/browser-agent/dist/src/cli.js -s=research console
```

An ordinary evaluation that schedules a timer returns without waiting for future
timers. Await a page promise when completion is needed; snapshots and later CLI
commands otherwise observe the document at the time they run. This does not add a
general browser-idle or locator-wait command. Timers continue between commands.

## Semantics and ownership

- IDs are positive, document-local and never reused during one realm's lifetime.
  Both cancellation functions address the same ID map. Unknown IDs are no-ops.
- Callbacks receive the page Window as `this`, and their extra arguments preserve
  guest identity and mutations after scheduling. Cycles, closures and DOM grants
  are not replaced with detached copies. See `SAFEJS-GUEST-REFERENCES.md`.
- Timers run asynchronously. Due timer callbacks enter the existing SafeJS job
  queue; timer prefixes are serialized. Intervals re-arm after the synchronous
  prefix, not after an async callback's eventual result. Pending async results
  still count against the page-wide callback bound.
- Later source evaluations wait for active callback prefixes rather than hitting
  the interpreter's reentry guard. The evaluation deadline includes this wait.
  An awaited promise can itself be resolved by a timer in the same realm.
- Primitive delays/IDs use signed 32-bit conversion. Negative/non-finite delays
  become zero. Deeply nested timers have a four-millisecond floor. These are
  minimum scheduling requests, not exact execution-time guarantees.
- Clearing an active timer prevents later invocations, not an already-started
  callback. Argument handles remain budgeted until pending invocations settle.
  Navigation/realm closure cancels native handles and revokes guest access.
- Ordinary callback failures are retained as sanitized console error codes.
  Callback-count exhaustion closes the realm and records `resource-limit`; it
  does not silently stop scheduling while pretending the page is healthy.

## Bounds and measurements

`PageScriptOptions.timerLimits` configures trusted host limits:

| Limit | Default | Maximum override |
| --- | ---: | ---: |
| Active timer registrations | 128 | 2,048 |
| Lifetime registrations, including canceled timers | 4,096 | 65,536 |
| Lifetime callback starts | 1,024 | 16,384 |
| Extra arguments per timer | 32 | 512 |

The independent page-wide pending-callback bound defaults to 128. All timer
callbacks reuse the document's existing cumulative interpreter budget; scheduling
does not reset it or open another realm. Retained guest arguments participate in
SafeJS collection/data accounting. Native handles, object overhead and total RSS
are not equivalent to those accounting units. Keep the owned-process supervisor,
heartbeat and command deadline boundary; cooperative JavaScript checks alone are
not a hard resource sandbox.

Evaluation metrics expose timer counts: active registrations, queued tasks,
pending callbacks, total scheduled/fired, running/closed and configured limits.
They are not CPU, heap or browser-performance measurements. Probe parent RSS is
the parent process's sample, not an actor peak or full workload memory ceiling.

## Verified evidence

- `reports/unit-node-2026-09-02-timers.json`: 1,075 browser tests across 61 files
  pass. Strict package/changed-test compilation and the 143-file Biome check pass.
- `scripts/check-page-timers.ts` runs actual owned-process automatic fixtures and
  controlled evaluation on Example Domain and Books to Scrape. It checks Window
  callbacks, identity, cancellation, async intervals, retained logs and limits.
  `reports/timers-process-sites-2026-09-02.json` records 17 passes: 15 fixture and
  two controlled public-document checks, with owned-process cleanup complete.
- `scripts/check-process-cli.ts` adds timer evaluation and DOM inspection through
  separate executable CLI invocations on both public documents.
  `reports/timers-cli-sites-2026-09-02.json` records 22 passing CLI/paired-API checks.
- `reports/timers-website-regression-2026-09-02.json` records 25 fixture plus two
  public reporting checks. Both public automatic-script sites still fail.
- `reports/safejs-guest-references-native-config-2026-09-02.json`: 7,957 SDK tests
  pass; 30 known fixture/type tests fail, six skip and 54 files fail overall.
  Comparison with the prior checkpoint proves identical failed assertions/files,
  with 11 additional passing reference tests. This is not a green upstream gate.

The timer probe retains failed initial runs. One used an unsupported DOM helper
and timed out; another expected a marker beyond Books' default text-output limit;
a subsequent attempt incorrectly passed a target to `text`. The final probe uses
the supported scoped `snapshot --observe` command and separately records full
text truncation. It does not weaken the identity or mutation assertions.

## Remaining gaps

String/TrustedScript timer handlers and object coercion are explicitly unsupported.
Full task/microtask-source conformance, background throttling, suspended document
lifetimes, global/Window function-object identity, workers, animation/idle callbacks
and `queueMicrotask` remain open. The core still needs function-object/prototype
semantics for real jQuery. Neither Books nor Quotes passes automatic dynamic-site
compatibility; controlled public-document timer checks are not that acceptance.
No new visual playground run is claimed for this non-visual implementation.

The scheduling target is the WHATWG timer initialization algorithm, not a claim
of complete conformance: https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html
