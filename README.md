# Agent browser

An in-progress, standalone TypeScript browser for agents. The native engine is
independent of Chromium, Firefox and remote browsers. SafeJS is the only approved
page runtime.

The browser provides structured navigation, document snapshots, element references,
extraction, forms and shared sessions. Browser compatibility and scripting remain
partial. Zoom initialization currently times out; joining, audio and notetaking
are not yet working.

The extension page runtime can opt into bounded WebAssembly with
`runtimeOptions.webAssembly: "bounded-v1"`. Pages and classic Workers share
metered execution and memory limits, and enforce WASM compilation CSP separately
from string eval. This currently requires Node24 with modern JSPI explicitly
enabled; the default Node22 runtime reports unsupported. Streaming, Table/Global
wrappers and full Zoom/media compatibility remain incomplete.

## Development

```bash
npm run build
npm run typecheck
```

Use the explicit test membership in `native-tests.json` for native validation.
Live websites, SafeJS, sockets and TTY/PTY checks are separate acceptance gates.

See `CLI.md` for service usage and `TASKS.md` for current priorities. Preserve
existing source changes, keep validation artifacts temporary, and do not accumulate
run logs, research inventories or per-change documents.
