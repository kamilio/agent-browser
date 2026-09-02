# Automatic classic-script loading

September 2 fetch addition: `PAGE-FETCH.md` connects the page realm to its
document-owned network port. Real interpreted Promise/JSON callbacks update our
DOM in a mock-transport fixture. The later `PAGE-CORS.md` adds checked cross-origin
fetch and preflights. XHR, full conformance and real-site fetch acceptance remain open.

September 1, 2026. Experimental automatic page-script execution is now available
inside the owned-process engine. This is a tested classic-script subset, not full
ECMAScript, browser lifecycle, dynamic-site or Kitesurf compatibility. No additional
dependency was installed, and the installed global SafeJS package is unchanged.

## Enable explicitly

Build this package and the extended public SafeJS core as described in
`SAFEJS-EXTENSIONS.md`. Then start a dedicated foreground service:

```bash
AGENT_BROWSER_SAFEJS_ROOT=/tmp/agent-browser-safejs-13.0.10/packages/safe-js \
AGENT_BROWSER_PAGE_SCRIPTS=classic \
node packages/browser-agent/dist/src/cli.js serve
```

Ordinary CLI and paired playground clients use that service's mode. Without the
second variable, automatic scripts remain disabled and the existing manual
`eval` mode is unchanged. Invalid mode values and enabling page scripts without
an explicit process runtime are rejected. There is no automatic interpreter
installation, remote browser, fallback or mutation replay.

The programmatic equivalent is
`BrowserSessionProcess.create({ packageRoot, websiteScripts: "classic" })`.
Trusted hosts may supply its `network` option using the existing
`NetworkPolicyOptions`. Private-network access is denied by default; the automated
fixture explicitly allows only its own temporary loopback origin. Website scripts
cannot change this policy or inherit the parent environment.

## Parser and runtime integration

- The existing TypeScript parser now has a shared generator-driven core. Its
  asynchronous driver pauses at parser-inserted scripts. Blocking scripts run
  before later markup is constructed, including before the body exists for a
  script in the head. It does not parse a second DOM for script execution.
- Parser advancement and interpreted execution share a serialized queue. This
  prevents the interpreter's asynchronous implementation from accidentally
  allowing concurrent parser mutations during a synchronous script body.
- External classic scripts without `async`/`defer` block parsing. Deferred
  scripts fetch ahead and execute in source order after parsing and stylesheet
  loading. Async scripts queue as their resources become ready; their network
  requests do not themselves block parser advancement. Inline `defer`/`async`
  attributes do not defer inline classic code.
- A prepared script retains its original URL even while waiting for a fetch slot;
  later base-element changes do not retarget it. Removing a prepared deferred
  element does not silently cancel its execution. Parser-stream writes are covered
  in `DOCUMENT-WRITE.md`; general DOM insertion/re-execution is not implemented.
- Native interactions and history are created early and reused by the committed
  session. Script-installed listeners therefore handle later CLI actions on the
  same authoritative tree. Ignored script completion values are not projected
  into JSON or mistaken for evaluation failures.
- Parsing completion transitions `document.readyState` to `interactive` and
  dispatches `readystatechange`. Deferred execution precedes `DOMContentLoaded`;
  async work finishes before `complete`, another `readystatechange`, and Window
  `load`. Lifecycle callbacks use the existing controlled native-event dispatcher.
- `document.currentScript` exposes the script capability during evaluation and
  resets afterward. Synchronous identity and load-handler reset are tested;
  microtask-sensitive currentScript semantics are not yet fully conforming.
- Script-like markup inside `noscript` is inert when scripting is enabled.
  Data blocks remain inert. Module/import-map/speculation-rule scripts are
  reported as unsupported rather than executed as classic code.

The response is still buffered before parsing; this is incremental tree
construction, not streaming HTTP parsing. Stylesheet blocking for earlier inline
scripts, complete document.write semantics, script-task/microtask checkpoints, Window load
event legacy-target semantics and full lifecycle behavior remain incomplete.

## Limits, policy and failure

The loader defaults to 64 encountered scripts, 16 external resources and 1048576
submitted UTF-8 source bytes. `ScriptLoaderOptions` can set `maxScripts` (up to
256), `maxExternal` (up to 64), and `maxSourceBytes` (up to 8388608). Session
navigation independently caps script requests at 16, so increasing the loader
limit does not bypass that ceiling. Four loader fetch slots share the guarded
session transport. Fetched source holders are released after completion.

Script GETs use the document's cookie context and existing DNS, address, redirect,
TLS, timeout and byte policies. Mixed-content/non-network URLs are refused before
retrieval. External responses require one explicit JavaScript MIME type and a
successful HTTP status; permissive browser MIME sniffing is not implemented.

Response or encountered meta CSP blocks execution conservatively: CSP parsing,
nonces/hashes and full dynamic-policy behavior are not implemented. Meta policy
remains recorded even if its element is later removed. External scripts declaring
integrity or crossorigin are skipped rather than bypassing unimplemented SRI/CORS.
These restrictions are explicit compatibility gaps, not a claim of full web
security-policy conformance.

Interpreter budgets, cooperative source timeouts and the independent parent
process watchdog still apply. A source error halts its realm and removes its guest
event listeners, not the native document dispatcher. HTML can still commit and be
read with an explicit failure report; native links can navigate to a replacement
document with a fresh realm. Pending guest-controlled actions are interrupted;
further guest execution on the stopped document remains unavailable. Errors are not disguised
as success, and previous scripts are not replayed to reconstruct state.

`websiteJavaScript: true` means this partial mode is enabled, not that every script
on the page succeeded. Navigation results include `scripts` counters for discovered,
executed, skipped, failed and external scripts, submitted bytes, halt/completion
state and bounded issue categories. Semantic snapshots disclose partial classic
scripting instead of printing `JS off`. No raw source or error stack is retained
in these reports. `complete` means the loading attempt finished, not site acceptance.

## Verified evidence

- `reports/unit-node-2026-09-01-website-scripts.json` records 962 passing tests in
  54 files, including parser checkpoints, post-parse failure cleanup,
  detached prepared scripts, fetch-slot URL capture, and both CLI mode settings.
- `reports/website-scripts-sites-2026-09-01.json` contains eleven passing actual
  compiled-SDK HTTP-fixture assertions plus two passing public-site reporting
  assertions. Fixture scripts arrive in HTML/JS HTTP responses and run automatically;
  subsequent manual evaluations only inspect the resulting state. Deferred/async
  ordering, parser boundaries, native action callbacks, reload, CSP refusal, halted
  source recovery and currentScript's tested subset are exercised in owned processes.
- Both public sites remain **failed script-compatibility cases**, despite readable
  navigation. Books to Scrape reports seven scripts, zero successful executions,
  two failures and five skips (policy denial followed by an execution error).
  Quotes to Scrape's JS page reports two scripts, zero successful executions, one
  execution error and one skip. The next section records the diagnosed causes;
  these are not passing dynamic-site acceptance results.
- `reports/process-cli-sites-2026-09-01-script-loading-regression.json` retains
  sixteen passing actual CLI/paired-API checks with automatic scripts disabled,
  verifying the earlier manual mode remains functional.
- Strict compilation and the existing style checker are used. Probe RSS remains
  parent-only, not peak or total browser memory. No visual UI rerun or fast-browser
  benchmark is claimed for this checkpoint.

## Real-site diagnosis and parser fixes

The disposable `scripts/diagnose-site-scripts.ts` probe wraps the actual extended
public realm API without changing sources or guest behavior. It records source
hashes, bounded own-data errors and at most 140 public source characters around
each failure. It does not retain full page bodies, credentials or native stacks.
This diagnostic process is not the permission-restricted production actor;
always use an external deadline and the heap ceiling:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/tmp/agent-browser-safejs-13.0.10/packages/safe-js \
  timeout 45s node --max-old-space-size=192 \
  packages/browser-agent/dist/scripts/diagnose-site-scripts.js
```

September 1's initial diagnostic identifies Books to Scrape's missing
`document.write`, after a correctly refused external request. Quotes to Scrape's
unmodified jQuery first hits an omitted constructor argument list (`new Date`),
then an unbraced do/while statement terminator. Both are now fixed in the isolated
SafeJS candidate, with 37 new TDD cases and 589 passing parser tests. The same
84,345-character jQuery source advances to unsupported numeric regex
backreferences. These remain failed dynamic-site acceptance cases; no source
rewriting, native RegExp fallback or policy bypass is used.

The sequence is preserved in `reports/site-script-errors-context-2026-09-01.json`,
`reports/site-script-errors-new-expression-2026-09-01.json` and
`reports/site-script-errors-statement-terminators-2026-09-01.json`.
`reports/website-scripts-sites-2026-09-01-parser-regression.json` separately reruns
the actual owned-process loader: eleven HTTP-fixture assertions and two public
reporting assertions pass, while both sites remain failed compatibility cases.
The SafeJS broad suite adds 37 passes without changing its known failed file set;
see `SAFEJS-EXTENSIONS.md` for the non-green upstream release gate.

All 962 browser tests pass in
`reports/unit-node-2026-09-01-site-parser-regression.json`. Strict package and
new SDK-test compilation pass, as does the existing 131-file style check.

## Next acceptance gates

The following checkpoint implements numeric backreferences and positive/negative
lookahead in the existing metered SafeJS matcher. The same real jQuery now parses
and stops at guest function-property/prototype assignment. The latest diagnostic
is `reports/site-script-errors-lookahead-2026-09-01.json`; the actual owned-process
regression retains eleven fixture and two public reporting passes in
`reports/website-scripts-sites-2026-09-01-regex-regression.json`. Neither site
passes dynamic compatibility. `SAFEJS-EXTENSIBILITY.md` records the user-authorized
upstream handoff for extension lifecycle and guest function semantics (#540/#541).

`DOCUMENT-WRITE.md` records the subsequent tested parser-stream subset: ordinary
synchronous insertion and written external scripts now work, with explicit refusal
of nested inline and post-parse writes. Books to Scrape executes its fallback and
reaches the same function-object blocker as Quotes. Neither is a passing dynamic
site. `PAGE-TIMERS.md` subsequently adds bounded timeouts/intervals with preserved
guest argument identity. Integrate and verify upstream core improvements and add
nonfatal source-error recovery without replay; precise task/microtask phases;
location/navigation, fetch and remaining
browser globals; dynamic scripts; modules/import maps; complete CSP/CORS/SRI;
stylesheet/script dependencies; and resource/latency measurements on real dynamic
sites. Full rendering and Playwright/Kitesurf coverage remain separate open goals.

## Reference rules reviewed

The design was checked against the WHATWG script processing, parser completion
and JavaScript MIME rules, while retaining the explicit gaps above:

- `https://html.spec.whatwg.org/multipage/scripting.html#the-script-element`
- `https://html.spec.whatwg.org/multipage/scripting.html#execute-the-script-element`
- `https://html.spec.whatwg.org/multipage/parsing.html#the-end`
- `https://mimesniff.spec.whatwg.org/#javascript-mime-type`
