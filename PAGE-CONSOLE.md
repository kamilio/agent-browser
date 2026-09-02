# Page console and shared inspectors

September 2, 2026. Page-owned diagnostics now reach agents and the playground
instead of being discarded. This uses the existing public SafeJS host-object
and binding APIs; it does not modify the interpreter or install dependencies.

## Agent API

In an existing explicit SafeJS session (`PROCESS-CLI.md`):

```bash
node packages/browser-agent/dist/src/cli.js -s=research eval 'console.info("diagnostic"); console.warn("warning")'
node packages/browser-agent/dist/src/cli.js -s=research console
node packages/browser-agent/dist/src/cli.js -s=research console warning
node packages/browser-agent/dist/src/cli.js -s=research console debug
```

The baseline `console [min-level]` command defaults to info. Debug includes all
levels; info includes log/info/warning/error. Unknown levels fail explicitly.
The non-script service reports the command as unsupported rather than inventing
messages. A configured evaluator with no page console yet returns `started: false`.
Custom evaluation hosts must use the page-console adapter to capture messages.

Results identify the current document reference and URL, sequence, retained
messages, eviction/clear counters and limits. Each entry includes timestamp,
level, source (`console`, `evaluation` or `callback`), text and truncation flag.
The timestamp is a wall-clock sample, not a CPU/execution measurement. Document
identity distinguishes navigation from a cleared buffer; IDs never repeat within
one buffer. Retrieval does not execute guest code or consume console history.

## Page capability

`console` and `window.console` share an opaque capability implementing log, info,
debug, warn, error, dir, assert and clear. It explicitly shadows the generic
interpreter console through trusted bindings. The intrinsic implementation and
installed SDK remain unchanged. Missing browser-console methods are not stubbed.

Supported values get bounded previews, not retained live object handles. Copied
plain-object properties use own data descriptors; getters and toJSON methods
are not invoked by the preview formatter. Functions, unsupported objects and
cycles have placeholders. Owned DOM capabilities get node labels without
exposing host properties. This is not a sandbox for arbitrary native proxies;
native extensions remain trusted, and SafeJS owns guest-to-host conversion.

Default limits per document:

| Limit | Default |
| --- | ---: |
| Retained messages | 256 |
| Retained text, UTF-16 code units | 65,536 |
| Text per entry | 4,096 |
| Preview nodes | 256 |
| Preview depth | 4 |
| Arguments previewed | 32 |

Oldest entries are evicted when retention limits are reached. Preview limits
truncate with an explicit flag, not an interpreter-budget reset. Metadata/object
overhead, conversion work and total RSS are not measured by these text limits.
The owned-process supervisor and existing interpreter budgets remain required.

Ordinary evaluation/callback failures record only a stable sanitized error code,
not native messages or host paths. Logs survive a halted/closed realm while its
document remains readable. Closing the document releases the buffer and revokes
its console methods. Records never cross document, tab or session ownership.
Explicit reads may contain application data; do not publish console exports as
if they were automatically redacted. The console does not erase caller copies.

## Playground

The shared inspector now has HTML and Console panes. HTML is live serialization
rendered with textContent, not executed markup. Console messages are distinct
from this window's Activity list and can be filtered by severity. Document or
session changes clear stale inspector content. Script-mode disclosure reflects
the connected service and the snapshot's automatic-scripting flag.

The HTML export button requests bounded live markup and constructs a text/html
download; its content is **not sanitized**. The actual file-transfer gate remains
unverified here: the watchable test service returned `Downloads are not available
in this browser session`. No service configuration or access policy was changed
to bypass that operator restriction. PNG/PDF exports remain unavailable.

## Evidence and remaining work

- `reports/unit-node-2026-09-02-console.json`: console limits, hostile getters,
  cycles, immutable reads, lifecycle, callback failures, command filtering and
  UI text helpers, alongside the complete browser regression suite: 1059 tests
  across 60 files pass. Strict package/test compilation and the configured
  140-file Biome check also pass.
- `reports/console-cli-sites-2026-09-02.json`: 20 actual executable CLI/paired-API
  checks pass, including filtered diagnostics after controlled page evaluation.
- `reports/console-process-sites-2026-09-02.json`: actual SafeJS website scripts
  exercise all captured levels, Window identity, DOM/value previews, clear and
  retained failure diagnostics. All 25 fixture checks plus two public reporting
  checks pass. Public dynamic-site compatibility remains incomplete.
- `reports/console-playground-ui-2026-09-02.json`: 21 actual watchable UI checks
  pass on public JSON, RFC text and Example Domain, including shared-page console
  messages, severity selection, inert markup and disconnect behavior.
- `reports/console-playground-ui-initial-2026-09-02.json` preserves the initial
  failed assertion: it incorrectly required a literal `<html>` without attributes.
  Inspection showed correct `<html lang="en">` output. The corrected assertion
  still requires the HTML inspector, a real root tag, closing tag and page text.
- `/tmp/agent-browser-console-playground-20260902.png` was visually inspected.
  It shows literal hostile-markup test text in the Console pane. The visible XML
  error banner is from the intentional unsupported-format preservation check.
  The watchable session and isolated foreground service were closed afterward.

The watchable browser is an observer/test tool, never the new browser's engine.
Both public automatic-JavaScript sites still fail compatibility. Complete printf
formatting, CSS directives, groups/counters/timers, trace/source locations, live
object inspection and full error-event behavior remain open. The standard is a
target, not a claim of complete console conformance:
https://console.spec.whatwg.org/
