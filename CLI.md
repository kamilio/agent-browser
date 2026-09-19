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

## Runtime configuration

Set configuration on the service, not only on a client:

- `AGENT_BROWSER_SAFEJS_ROOT`: a trusted compiled extended-SafeJS package root
  for supervised, process-backed sessions.
- `AGENT_BROWSER_PAGE_SCRIPTS=classic`: opt into the partial classic-page loader
  with process-backed SafeJS. Script support is incomplete; this does not make
  Zoom work automatically.
- `AGENT_BROWSER_DOCUMENT_PROFILE=reader`: partial static extraction instead of
  normal rendering. Scripts and styles are omitted and forms are inert. This
  mode cannot be combined with explicit SafeJS/page-runtime/secret configuration.
- `AGENT_BROWSER_LANGUAGES`: a JSON array such as `["pl-PL","en-US"]`; the
  default is `en-US`.

The native engine remains independent of external browsers. Unit tests do not
establish live-site, credential, media or real-terminal compatibility.
