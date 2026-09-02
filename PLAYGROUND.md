# Shared-session playground

September 2 Network addition: the Network pane reads the selected tab's latest
network-navigation journal, including failed attempts that leave an old document
displayed. It shows bounded redacted request metadata; `request <index>` in the
command field reads details. `NETWORK-JOURNAL.md` defines scope and limitations.
Formatter/asset and mock-host checks pass; no new visual UI run is claimed.

Status: September 1, 2026. This is a working observer/controller for the current
partial-HTML/text/JSON engine, **not full Kitesurf playground parity**. It does not use the
repository's Chromium browser as an engine. The existing watchable browser is
used only as an end-to-end UI test tool.

`PROCESS-CLI.md` adds opt-in process-backed sessions. Its sixteen actual CLI/API
checks include paired-client `eval` changing the same live document read by a
separate CLI process. The existing command box uses that API; this new probe does
not claim a new visual UI run. Automatic website scripts remain disabled.

The later `SCRIPT-LOADING.md` opt-in classic mode also applies to the shared
playground session. The capability view and navigation results disclose enabled
mode and script failures; the header now says scripts are opt-in rather than
claiming they are always disabled. No new visual UI run is claimed here.

## Start and connect

From the repository root:

```bash
bun run --cwd packages/browser-agent build
node packages/browser-agent/dist/src/cli.js serve
```

Keep that foreground process running. In another terminal:

```bash
node packages/browser-agent/dist/src/cli.js playground
```

Open the printed loopback URL in your browser. Select **Request connection**, then
run the displayed `playground --pair CODE` command in the same environment as the
service. If you set `AGENT_BROWSER_RUNTIME_DIR`, the approval command needs that
same variable. Only approve a code displayed in your own intended window.

No bearer credential is printed or put in a URL, DOM markup, clipboard, cookie,
local storage or session storage. A short-lived window token stays in JavaScript
memory. Reloading requires another approval; disconnect revokes the token and
clears the inspected page/command output. CLI sessions remain running. Stop the
service explicitly with `stop-server`; the UI cannot stop the service.

## Working features

- Choose the same named sessions used by `-s=name`; navigate, reload, create/select/
  close tabs, and inspect documents opened by a separate CLI process.
- Back/Forward traverse the engine's session history, not the observer browser's
  URL history. They share the CLI's POST-replay protections and explicit limitations.
- Text view and structured semantic snapshots expose the engine's actual refs.
  Snapshot reads use `--observe`, which does not consume CLI diff baselines.
- Metrics show actual session/resource counters. Activity shows the last 32 UI
  command names, success/error and durations, not website console output.
- Run the supported CLI subset, with bounded single/double quoting and escapes;
  no shell execution or variable expansion. Ref/CSS click/fill use the same host.
- Follow external session changes every three seconds while visible, or refresh
  manually. Observer requests are invalidated on UI actions/session changes so
  stale reads cannot overwrite a newly selected session.
- Public JSON and RFC plain-text examples work. Example Domain deliberately
  opens parsed HTML with visible partial-parser and configured-script disclosures.
- HTML and Console panes inspect the shared live document. Console severity
  filtering reads actual bounded page diagnostics, distinct from UI Activity.
  See `PAGE-CONSOLE.md` for the September 2 visual probe and capture limitations.
- Responsive layout, keyboard focus indicators, semantic labels, explicit busy/
  disconnected/error states, and reduced-motion support.

This is a semantic text view, not pixel layout. Complete HTML semantics, site
JavaScript, image/CSS rendering, PNG/PDF exports, full console semantics, memory
graphs, streaming updates and full browser interaction remain missing. HTML
download requests are implemented, but actual file transfer remains unverified
because the observer test service prohibits downloads. PNG/PDF buttons remain
disabled and capability limitations are visible. Command errors can occur after partial
side effects: there is no automatic retry of commands.

## Security and bounds

The service serves only three fixed, credential-free assets: `/`, `/playground.js`
and `/playground.css`. There is no filesystem/static-directory browsing. Assets
are no-store/nosniff, use a restrictive same-origin CSP and cannot be framed.
Remote website content is inserted with text nodes, never executed as UI markup.
Do not expose this loopback service through a public proxy.

Pair requests expire after 90 seconds. At most eight pending requests and eight
connected window tokens are retained. An approved handle yields a random token
once; only its hash is retained after delivery. Tokens expire 30 minutes after
approval without sliding renewal. Expired undelivered approvals are removed.
Disconnect revokes immediately; closing/reloading a window discards its local
token, but the service entry can remain until expiry. Restart clears all tokens.

Public `POST /api/pair/start` and `/api/pair/poll` require the exact service Origin.
Approval requires the private CLI credential. UI tokens can operate all named
sessions through `/api/command`, so approving a window grants trusted local
operator access, not read-only or per-session access. UI tokens cannot approve
another window or call `/api/shutdown`. All existing API body, connection, time,
Host and cross-origin restrictions still apply (`CLI.md`).

## Verification

The Node suite includes real HTTP pairing/revocation tests, scope restrictions,
token expiry/quotas, fixed assets/CSP, pure frontend parsing/URL handling,
observer diff isolation and actual subprocess approval. No external dependencies
were added. The dedicated UI probe uses an already paired, task-owned watchable
session and an isolated foreground service:

```bash
AGENT_BROWSER_RUNTIME_DIR=/tmp/your-isolated-runtime \
PLAYGROUND_TEST_BROWSER_SESSION=your-task-owned-session-id \
node packages/browser-agent/dist/scripts/check-playground-ui.js
```

Run from the repository root. The probe uses the existing `bun run browser` tool;
it is a development check, not a production dependency. It mutates only its
`playground-probe` profile, requests public demo documents, and prints assertion
metadata rather than page bodies or credentials. Begin with that profile absent.
It does not own lifecycle: after verification, close only your watchable session,
verify it disappears, and stop only your isolated service. If the user takes
control, stop input and do not close their session until they release it.

See `reports/README.md` for dated results and the retained initial assertion
failure. None of these checks establish general HTML/JavaScript compatibility.

The later HTML checkpoint has 17 passing assertions on desktop and at 390×844,
including actual Example Domain parsing and XML rejection preserving that HTML
document. The updated card and semantic text explicitly disclose the partial parser
and disabled scripts. `HTML.md` and `reports/README.md` contain dated evidence.
