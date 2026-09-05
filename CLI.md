# Executable CLI and shared command service

September 4 upload integration: `UPLOAD-COMMANDS.md` connects `upload <target> <file...>`
to an existing service, capturing a stable target before private-file
reads and sending canonical bounded chunks without local paths. Native actual
CLI-to-host tests cover visible multipart submission, stale targets and uncertain
commit/cleanup outcomes. Socket/process/authentication and runtime gates remain open.

September 4 tracing integration: `TRACE-CORE.md` documents bounded per-session
semantic recording, owned JSON artifacts, private CLI export and failure recovery.
Use `tracing-start`, `tracing-status` and `tracing-stop --filename=trace.json` in
an existing session. This is not video, continuous recording or a Playwright ZIP;
local review UI and real-browser/runtime acceptance remain separate.

September 3 state persistence: `state-save [filename] [--overwrite]` and
`state-load <filename>` now connect bounded session-scoped transfers to private
local files. Normal command results contain metadata, not credentials. Native
CLI-entry round trips pass with an injected service; real socket/process/runtime
and authentication acceptance remain open. See `STATE-TRANSFER.md` for limits,
private-directory requirements, cleanup and ambiguous-commit behavior.

September 3 JPEG integration: `images` identifies PNG/JPEG resources and ignored
metadata. Baseline/progressive JPEG pixels participate in `screenshot` and `pdf`;
`capabilities.imageResources.jpeg` describes the partial codec profile. Resource
limits and unsupported metadata/color spaces are documented in `JPEG-DECODING.md`.

September 3 image resources: `images` inspects the selected document's image states,
intrinsic sizes, errors, redacted URLs and resource counters. `requests` includes
image traffic. `IMAGE-RESOURCES.md` describes real page loading/guest integration,
and budgets. `IMAGE-LAYOUT.md` connects loaded PNG normal-flow boxes to actual
`screenshot` and `pdf` pixels; `images` inspection itself is not a capture.

September 2 request diagnostics: `requests` and `request <index>` inspect bounded,
redacted metadata for the selected tab's latest network navigation attempt.
`NETWORK-JOURNAL.md` explains scope, failed-navigation ownership, retention and
the deliberately omitted bodies/headers. Reads do not send another request.
This is partial command support, not full Playwright network parity.

September 2 extraction addition: `extract [target] --format=markdown|json` reads
the retained live document with stable refs and explicit byte/node/depth limits.
`EXTRACTION.md` documents field exclusion, safe links, format coverage and tests.
Default human output is Markdown; `--json` retains the command envelope. This
does not imply separate-CLI or public-site acceptance of the new command.

September 2 terminal addition: `terminal [url]` attaches an interactive keyboard
view to the same named session. `TERMINAL.md` documents controls, raw-mode/input
cleanup, observer refreshes and limitations. Unit and API cancellation checks pass;
the real PTY/public-site probe is pending explicit permission, not accepted.
The original service and baseline command behavior below remain unchanged.

Status: September 1, 2026, playground checkpoint. Commands execute against named in-memory
sessions across separate CLI invocations. This is a tested **partial frontend**,
not the completed Playwright CLI superset: the default engine loads plain text,
JSON and partial HTML with scripts disabled (`HTML.md`). Many browser commands/
options remain explicitly unsupported.

`PROCESS-CLI.md` adds an explicit `AGENT_BROWSER_SAFEJS_ROOT` service mode with
one supervised process per named session and persistent manual `eval`. It is
tested through actual CLI invocations and the paired playground API. Automatic
website script loading remains disabled; the original mode remains the default.

`AGENT_BROWSER_PAGE_SCRIPTS=classic` additionally enables the partial automatic
loader when starting a process-backed service. `SCRIPT-LOADING.md` documents its
limits and current real-site failures. Without that variable the behavior above
is unchanged; a capability flag is not evidence that a page's scripts succeeded.

## Reader profile

The default `native` document profile is unchanged. For partial static research
pages that exceed the normal loader's supported HTML/CSS surface, start a host
with `AGENT_BROWSER_DOCUMENT_PROFILE=reader`:

```bash
AGENT_BROWSER_DOCUMENT_PROFILE=reader node dist/src/cli.js serve
```

From another terminal, normal `open`, `extract`, `snapshot`, `find` and `text`
commands use that host's reader. Setting the variable only on a client does not
reconfigure a running service. JSON extraction/snapshot/search results carry
reader provenance, and plaintext output displays a partial-reader notice.
Scripts, styles, SVG/MathML and selected subtrees are omitted, forms are inert,
and hidden-content semantics are ignored; this is not normal rendering or a
login workflow. See `NATIVE-RESEARCH.md` for exact limits and omissions.

Only unset, `native` or `reader` are accepted. Reader configuration rejects any
explicit `AGENT_BROWSER_SAFEJS_ROOT`, `AGENT_BROWSER_PAGE_RUNTIME`,
`AGENT_BROWSER_PAGE_SCRIPTS` or `AGENT_BROWSER_SECRET_CONFIG`, including empty
values, before resources or credential configuration load. Mode and configuration
filenames are captured before asynchronous connection lookup rather than reread
afterward. Language preferences remain supported. No alternative engine is used.

September 5, 2026: a separately authorized real loopback CLI service successfully
opened Example Domain and completed eight CLI commands, with reader notices and
JSON provenance preserved even from native-profile clients. Its private runtime
directory was removed and the owned service exited cleanly. This narrow
service/HTTP check is separate from synthetic tests, actual SafeJS, real vaults,
platform authenticators and broader website compatibility.

## Run it now

Set `AGENT_BROWSER_LANGUAGES='["pl-PL","en-US"]'` when starting a host to
configure its ordered language preferences. Unset means the explicit `en-US`
default, not the machine locale. The value is a bounded strict JSON array;
invalid/duplicate tags reject. Native and process-backed sessions receive the
same canonical options. Client invocations do not reconfigure an already-running
service. This configures truthful native identity, not another browser's brand;
actual guest-runtime behavior remains a separate gate. See `BROWSER-IDENTITY.md`.

From the repository root, build and start the package-owned foreground service:

```bash
bun run build
node dist/src/cli.js serve
```

In another terminal:

```bash
node dist/src/cli.js -s=research open https://httpbingo.org/json
node dist/src/cli.js -s=research snapshot
node dist/src/cli.js -s=research localstorage-set example synthetic-value
node dist/src/cli.js -s=research localstorage-get example --json
node dist/src/cli.js list
node dist/src/cli.js close-all
node dist/src/cli.js stop-server
```

The manifest declares the eventual `agent-browser` executable; no install/link or
dependency operation has been performed. `bun run cli`
also runs the built frontend. `--help`, command help, `--version` and `capabilities`
work without a running service. The service does **not** automatically start on
`open` yet. Keep its foreground terminal open, or use your own explicit supervisor.
This service neither uses tmux nor controls the repository's automations stack.

`serve` prints its loopback address and connection-file path, never its auth token.
It binds an ephemeral port on `127.0.0.1`. `Ctrl-C`, `SIGTERM` or `stop-server`
close only this service and its owned sessions. `close` closes one named session;
`close-all` closes sessions while leaving the service running. There is no process
scanning, arbitrary PID killing or dependency on an external browser engine.

When a service connection exists, help and capabilities query that service rather
than assuming the client's environment matches it. Process mode requires an
explicit trusted, compiled extended-SafeJS package root at service startup;
`PROCESS-CLI.md` documents configuration, shutdown and timeout semantics.

## Named sessions and implemented command paths

Session selection uses `-s=name`, then `AGENT_BROWSER_SESSION`, then
`PLAYWRIGHT_CLI_SESSION`, then `default`. Session names are bounded and validated.
An explicit flag wins over the environment. Each session owns isolated cookies,
storage, tabs and document state. Data is in memory for the service lifetime,
not a saved browser profile on disk.

- `open [url]`, `goto url`, `reload`, `close`, `list`, `close-all`.
  Opening without a URL creates an empty tab, not a fully implemented about:blank
  browsing context. Unsupported formats/parser features fail without replacing the
  committed page. Supported HTML produces real element refs, not fabricated controls.
- `go-back`, `go-forward` traverse actual combined same-/cross-document history.
  State/keys survive restoration; POST replay and origin-changing history redirects
  fail explicitly. See `NAVIGATION-HISTORY.md` for bounds and missing lifecycle semantics.
- `tab-list`, `tab-new [url]`, `tab-select index`, `tab-close [index]`.
  Tab indices are zero-based; omitted close index means the selected tab.
- `viewport` reads the selected tab's actual logical dimensions, document reference,
  scale 1 and opaque target key without forcing layout or mutating the document.
- `resize width height` changes a per-tab logical CSS viewport, not a physical
  window or emulated device. Optional `--expected-viewport=KEY` rejects changed
  tabs, sessions and recreated-session identities before mutation. The narrower
  `--expected-tab=ID` checks only the tab ID in the addressed session. Both guards
  are additive; unguarded baseline syntax still works. See `VIEWPORT-CONTROLS.md`.
- `styles [ref-or-selector]` returns bounded CSS diagnostics or a target's current
  visibility, box, typography and paint values. Native normal-flow layout exists;
  general CSS remains partial. See `CSS.md` for supported rules and limits.
- `snapshot [target]`, `--depth`, `--max-bytes`, `--diff`, and `text`.
- `html [target] --max-code-units=N` returns current serialized HTML as JSON,
  including post-script mutations; it is not a source cache or sanitized UI.
  See `HTML-CONTENT.md` for bounds and incomplete serialization semantics.
- In explicit SafeJS services, `console [min-level]` reads bounded page messages
  and sanitized error codes; the default minimum is info. See `PAGE-CONSOLE.md`.
  Snapshots are semantic and bounded. Diff caches are byte-bounded, detached from
  returned objects and cleared on session/tab closure. Full snapshots reset diffs
  across replaced documents or incomplete views; layout boxes are not fabricated.
  `snapshot --observe` returns a non-caching snapshot for observer clients and
  cannot be combined with `--diff`.
- `fill target value`, `check target`, `uncheck target`, `select target value`,
  and left-button `click target`. Targets are stable `eN` refs or unique supported
  CSS selectors. Missing/ambiguous matches fail. Playwright role/name/test-id
  locator syntax, auto-wait and full pointer/keyboard semantics are missing.
- `type text`, `press key`, `fill target value --submit`: focus/caret-aware editing
  and supported Enter form/link defaults. See `KEYBOARD.md` for keys, cancellation,
  limits, result shapes and deliberately incomplete native event timing.
- `localstorage-*` and `sessionstorage-*`: list/get/set/delete/clear at the selected
  document's origin. Cookie list/get/set/delete/clear use the existing session jar;
  list/get/delete also work after the last tab closes. Set needs an active HTTP(S)
  page and supports path, Unix-second expiry, secure/httpOnly and sameSite flags.
  Domain cookies remain unsupported. See `COOKIE-COMMANDS.md` for exact scope,
  sensitive read output, result shapes and native-only validation boundaries.
- `metrics`, `capabilities`, help and version. Capability output distinguishes
  partial command implementations, unsupported commands and frontend-only service
  commands. It explicitly reports no page JavaScript or full CLI-superset claim.

`playground` prints the UI URL; `playground --pair CODE` approves its pending
connection through the private CLI credential. See `PLAYGROUND.md`.

Manual `eval` is available only in the opt-in process mode (`PROCESS-CLI.md`).
Native `screenshot` and `pdf` exports now support safe local `--filename` writes;
see `CAPTURE-EXPORT.md` and `PDF.md` for their supported layouts and limits. PDF
uses the whole current document and viewport-sized screen-layout pagination.
`run-code`, upload, dialogs and tracing/video remain unimplemented. Other APIs
have documented partial profiles, not full browser parity. Recognizing syntax
does not make a missing operation functional. Unsupported options (including
`--browser`, `--persistent`, `--config` and snapshot filenames/boxes)
fail before state-changing command execution, rather than being silently ignored.

A native submit click now executes the documented form-navigation subset, including
validation/cancellation outcomes (`FORM-NAVIGATION.md`). Unsupported constraints or
targets still fail explicitly. Reload refuses automatic replay of committed POST
results. `fill --submit` executes the supported Enter behavior described in `KEYBOARD.md`.

A native click can dispatch events before discovering an unimplemented default
action, such as opening another target. That command returns an
explicit unsupported error; listener mutations are not rolled back. Do not retry
potentially mutating actions automatically after errors or connection loss.

## Ordering, cancellation and results

`BrowserCommandHost.execute(argv, { session?, signal? })` is the portable shared
dispatcher used by both the CLI and the playground. Normal commands
are FIFO within a session; different sessions can proceed independently. Closing
one/all sessions is out of band so an active navigation can be stopped promptly.
Queued commands recheck cancellation before execution. Defaults are 8 sessions,
64 pending commands, 10,000 normal command attempts, 30-second deadlines and a
1 MiB shared snapshot cache. Cleanup/metadata commands remain usable at limits.

`--timeout` accepts 1–300,000 milliseconds and includes queue time. The CLI gives
the local API a small additional response grace period. Underlying session/network
budgets can still expire earlier; this is not unlimited execution permission.

Successful JSON results contain `schemaVersion`, `command`, `session` and `data`.
Human-mode snapshots/text use terminal-safe semantic rendering; other results use
JSON. Errors use stable codes and exit status 1, with terminal controls escaped.
These output envelopes are not a claim of byte-for-byte upstream CLI output parity.
Explicit storage retrieval may expose user-stored values to the authorized caller;
metrics and verification reports do not dump them automatically.

## Loopback API and private discovery

`POST /api/command` accepts JSON containing `argv` strings and an optional default
session name. `POST /api/shutdown` accepts an empty JSON object. Every request
requires a bearer token from the private connection file or an approved UI window;
shutdown accepts only the private CLI credential. This is an internal
authenticated API, not the page Fetch API or a public network proxy.

- Bind only loopback; require the exact Host authority. If Origin is present, it
  must equal the service origin. Cross-site fetch metadata and duplicate sensitive
  headers are rejected. No CORS permission is emitted.
- Require JSON POST bodies; cap request headers at 8 KiB/32 headers, connections
  at 32, request bodies at 64 KiB and response bodies at 2 MiB. Body reads have a
  separate 10-second deadline. JSON responses are no-store/nosniff with restrictive
  CSP and no-referrer policy. Three fixed public playground assets and bounded
  same-origin pairing routes are documented in `PLAYGROUND.md`.
- Disconnecting a client cancels its command. Shutdown closes sockets and owned
  sessions. Normal Node network policy still blocks private-site navigation; an
  authenticated local API is not permission to bypass that policy.
- Store the random token in `connection.json` under a private per-user runtime
  directory, normally the OS temp directory's `agent-browser-<uid>` folder.
  `AGENT_BROWSER_RUNTIME_DIR` selects an explicit private directory for isolated
  runs/tests. No database or browser-history persistence is introduced.
- Require current-user ownership, private permissions, regular files and no final
  symlinks; create metadata exclusively with mode 0600 and never overwrite another
  instance's file. Removal checks the owned inode. Reads are bounded to 4 KiB.
  The CLI currently requires Unix ownership checks; core portability is separate.

The same OS user can read its own private token; this does not defend against a
compromised host account. Automatic background launch, stale-file crash recovery,
endpoint rotation/reconnection and durable named profiles remain unimplemented.
A stale metadata file is refused rather than used to kill or overwrite an
unverified process. Do not claim full baseline session lifecycle parity yet.

## Evidence

- `src/command-host.test.ts`: 18 ordering, state, targeting, rejection and cache tests.
- `src/node-command-server.test.ts`: 15 authenticated API, origin/Host, body/response
  limits, slow/chunked input, disconnect and shutdown tests.
- `src/node-runtime.test.ts`: 9 private discovery-file and endpoint-validation cases.
- `src/cli.test.ts`: three actual subprocess workflows, compiling the CLI first,
  including separate invocations, a real local HTTP document and service cleanup.
- `reports/unit-node-2026-09-01-cli.json`: all 564 Node checks in 27 files pass.
- `reports/command-core-bun-2026-09-01.json`: 46 portable dispatcher/parser checks pass.
- `reports/cli-sites-node-2026-09-01.json`: all 11 public CLI assertions pass, including
  JSON/RFC text loading, cross-invocation storage, session isolation, expected HTML
  rejection, reload/ref replacement and service/private-file cleanup. The service
  is ephemeral; no token, response body or raw process output is retained.

Run the opt-in public check after building with
`bun run check:cli-sites`.
The later `reports/html-cli-sites-2026-09-01.json` run has 17 passing assertions,
including actual Example Domain/Hacker News parsing, Books to Scrape ref-driven
navigation/back and XML failure preservation. `HTML.md` records scope and limitations.
The existing Bun networking and pre-existing TLS test-source typing limitations
remain documented. No dependency was added, no production service was restarted,
and no Kitesurf/Playwright compatibility row is declared complete by this checkpoint.
