# CLI

Build and start the foreground service from the repository root:

```bash
npm run build
node dist/src/cli.js serve
```

Use another terminal for commands against a named session:

```bash
node dist/src/cli.js -s=research open https://example.com
node dist/src/cli.js -s=research snapshot
node dist/src/cli.js -s=research extract --format=markdown
node dist/src/cli.js list
node dist/src/cli.js close-all
node dist/src/cli.js stop-server
```

Use `node dist/src/cli.js --help` for command details. Opening a page does not
start the service automatically. The service binds an ephemeral loopback port;
its authentication token is not printed. `close-all` closes sessions, while
`stop-server` shuts down the owned service.

When unsupported CSS prevents pointer clicks, explicit keyboard activation can
still navigate a focusable link: `press Enter --target=e123` using its snapshot
reference. This respects focus restrictions; it does not validate pointer geometry.

## Streamed content extraction

For large React-streamed HTML, use an explicit inert extraction strategy:

```bash
node dist/scripts/research-browser.js --document-strategy native-streamed-content-v1 --content-focus main-content-v3 --output-limit-policy text-prefix-v1 https://arena.ai/leaderboard
```

This admits up to 16 MB per response and projects recognized React completion
calls into their placeholders without executing scripts or loading stylesheets.
It accepts one Markdown URL, without body capture, reader mode or DOM selection.
Unknown helper versions and unresolved hidden chunks remain untouched. Output is
source-derived, not verified rendering, hydration or proof of interactive support.

## Runtime configuration

Set configuration on the service, not only on a client:

- `AGENT_BROWSER_BLOCKED_ORIGINS`: a JSON array of up to 128 HTTP(S) origins
  to deny, for example `'["https://tracker.example"]'`. Applies to native, reader
  and process-backed sessions, including redirects and subresource requests.
  Paths, query strings and credentials are rejected. Nothing is blocked by default;
  this does not relax network safety rules or solve access challenges. Restart the
  service to change its policy; setting it on a client does not change a running service.
- `AGENT_BROWSER_SAFEJS_ROOT`: a trusted compiled extended-SafeJS package root
  for supervised, process-backed sessions.
- `AGENT_BROWSER_PAGE_RUNTIME=extension`: select the public SafeJS extension API.
- `AGENT_BROWSER_CLASSIC_SCRIPT_ERRORS=report`: with
  `AGENT_BROWSER_PAGE_GLOBALS=classic` and a supporting SafeJS runtime, report
  uncaught classic-script exceptions and continue later scripts. The default is
  fatal; syntax, module, callback, budget and timeout failures still stop execution.
- `AGENT_BROWSER_PAGE_SCRIPTS=module`: load classic and module scripts, including
  dynamically inserted modules, with the extension runtime. CSP, CORS, integrity
  and resource limits remain enforced. Use `classic` to omit module execution.
  Script support is incomplete; this does not make Zoom work automatically.
- `AGENT_BROWSER_SCRIPT_BUDGET_PROFILE=large-source-v1` (or an application
  profile): allow larger module graphs within the selected page source/data
  budgets. Hard ceilings remain 4,194,304 code units per module, 16,777,216 total
  code units, and 16,777,216 response bytes; default limits are unchanged.
  `application-v1` allows 120 seconds per evaluation; `application-unicode-v1`
  also raises the per-pattern regex-compilation allowance from 32,768 to 65,536
  units without increasing the page heap or time limits. `application-media-v1`
  adds explicit ceilings of 33,554,432 array elements and 33,554,432 retained-data
  units for media heaps, keeping the Unicode and time allowances. Profiles do
  not grant WASM, Worker, or network capabilities or guarantee application startup.
- `AGENT_BROWSER_DOCUMENT_PROFILE=reader`: partial static extraction instead of
  normal rendering. Scripts and styles are omitted and forms are inert. This
  mode disables subresource requests and WebSockets while retaining document CSP
  and base-URL restrictions. Unsupported execution policies do not prevent static
  extraction. It cannot be combined with explicit SafeJS/page-runtime/secret
  configuration.
- `AGENT_BROWSER_LANGUAGES`: a JSON array such as `["pl-PL","en-US"]`; the
  default is `en-US`.

The native engine remains independent of external browsers. Unit tests do not
establish live-site, credential, media or real-terminal compatibility.
