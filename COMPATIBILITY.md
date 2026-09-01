# Compatibility and playground acceptance ledger

Baseline researched September 1, 2026. All rows start as **pending** unless
there is a linked implementation and passing behavioral test. A CLI parser that
recognizes a command is not a browser implementation. An `unsupported` error
must remain visible as a gap; it cannot be counted as a parity pass.

This ledger expands the goal: a useful text browser is an intermediate result,
not fulfillment of the requested Kitesurf coverage and Playwright CLI superset.
The 72-hour window is a work budget, not evidence that every feature is complete.

## Sources and direct inspection

- https://developers.cloudflare.com/browser-run/kitesurf/
- https://blog.cloudflare.com/kitesurf/
- https://kitesurf.cloudflare.app/
- https://github.com/microsoft/playwright-cli/blob/main/README.md
- https://github.com/microsoft/playwright-cli/blob/main/skills/playwright-cli/SKILL.md

The playground was opened in an isolated inspection session on September 1,
2026. Its Example Domain card opens an embedded DevTools frontend with a live
page viewport, navigation bar, DOM tree, styles/computed/layout panels, console
and additional panels. The reference landing page has URL entry; Inspect,
Screenshot, PDF and HTML actions; grouped site cards; and agent connection
instructions. Private screenshots were inspected at:

- `/tmp/kitesurf-reference-20260901.png`
- `/tmp/kitesurf-inspector-reference-20260901.png`

The existing Chromium browser is an inspection/test tool only. It must not be
imported into or silently used as the new browser engine. Our own names, visuals
and implementation will be used; do not copy Cloudflare's logo or claim affiliation.

## Kitesurf engine coverage

| ID | Required capability | Acceptance evidence | Status |
| --- | --- | --- | --- |
| K01 | HTML parsing, DOM identity and mutation | Malformed markup, entities, trees, selectors and mutation fixtures; relevant web-platform tests. | Pending |
| K02 | CSS styles and layout | Cascade, inheritance, sizing, overflow and layout fixtures; compare public page structure and captures. | Pending |
| K03 | Page JavaScript and modules | Inline/external/module scripts, promises, events, timers and script errors in isolated sessions. | Pending |
| K04 | Framework-driven pages | Real TodoMVC vanilla, React, Vue, Angular and Preact: add/edit/toggle/filter/delete demo todos. | Pending |
| K05 | Browser network APIs | Fetch, XHR, URL/encoding, redirects and CORS with local multi-origin security fixtures. | Pending |
| K06 | Cookies, storage and isolation | Per-session/per-origin jars and stores; no cross-session leakage; explicit cleanup. | Pending |
| K07 | Frames and page contexts | Same/cross-origin frames, scoped globals, resource budgets and parent access restrictions. | Pending |
| K08 | Images, fonts, SVG and 2D canvas | Supported image resources, text shaping, SVG and canvas fixtures with actual exported results. | Pending |
| K09 | Interactive input and selection | Mouse/keyboard events, focus, links, forms and document selection driven through the API. | Pending |
| K10 | Screenshots | Real PNG page/element capture from our renderer with correct bounds and nonempty pixel assertions. | Pending |
| K11 | PDF | Parseable PDF export of the rendered document, with text/pages and pagination assertions. | Pending |
| K12 | HTML and structured extraction | Post-script HTML, links, selectors, semantic/accessibility output and Markdown/JSON extraction. | Pending |
| K13 | CDP interoperability | Required target/page/runtime/DOM/input/network/CSS/accessibility operations exercised by real clients. | Pending |
| K14 | DevTools integration | DOM inspection, evaluation, console/network events and captures connected to our engine. | Pending |
| K15 | Budgets and failure recovery | CPU/wall/memory limits, navigation stop reasons, runaway scripts and clean relaunch. | Pending |
| K16 | Ephemeral scaling and resource use | Concurrent disposable sessions, repeated teardown, measured CPU/RSS/startup and bounded output. | Pending |
| K17 | WebAssembly page code | Page-owned Wasm execution constrained by the same resource and host-access rules. | Pending |
| K18 | Published browser API surface | Inventory additional APIs observed in the reference and add conformance cases rather than guessing support. | Pending |

Cloudflare documents video playback, WebGL, real-browser TLS bot-challenge
handshakes and long-running persistent authenticated sessions as Kitesurf
limitations. Do not relabel those as Kitesurf-supported features. Our separate
Playwright CLI requirements may still require persistent profiles and capture
recording; keep those requirements even where they exceed Kitesurf. Browser Run
platform features are not automatically Kitesurf engine features: verify before
claiming either parity or an exclusion.

Kitesurf's published web-platform-test coverage is far beyond a smoke test.
Track our own selected suites and failures; do not borrow its percentages or
claim equivalent browser conformance from matching five example sites.

## Playground coverage

| ID | Feature | Acceptance evidence | Status |
| --- | --- | --- | --- |
| G01 | URL entry and navigation | Hosts/URLs normalized; invalid schemes rejected; loading/error/stop states visible. | Pending |
| G02 | Curated example cards | General/docs/news and all five TodoMVC variants; every card uses our backend. | Pending |
| G03 | Inspect workspace | Live page and terminal/semantic view with URL/back/forward/reload controls. | Pending |
| G04 | DOM and accessibility | Expand nodes, inspect attributes/styles, locate refs and highlight corresponding output. | Pending |
| G05 | Console | Real page logs, evaluation results and exceptions; no fabricated sample logs. | Pending |
| G06 | Network | Real request timing/status/size, failures and policy blocks with sensitive data redacted. | Pending |
| G07 | Memory and execution | Actual runtime/host measurements labelled accurately, plus CPU/wall budgets and stop reasons. | Pending |
| G08 | Export actions | Working screenshot/PDF/HTML plus semantic/Markdown downloads; validate the downloaded formats. | Pending |
| G09 | Agent connection | Copyable CLI/API/CDP instructions that work against the displayed session. | Pending |
| G10 | Responsive and accessible controls | Keyboard operation, focus, narrow viewport, readable text and sensible loading feedback. | Pending |
| G11 | Session lifecycle | Reconnect/close/cleanup, isolation and human/agent input arbitration on one session. | Pending |
| G12 | Safe hosting | Loopback/auth defaults, origin/host checks, no arbitrary file access or private-network proxy. | Pending |

## Playwright CLI baseline

**Superset is a behavioral contract, not just familiar command spelling.**
Existing baseline workflows must retain argument ordering, session behavior,
action effects, failure semantics and usable artifacts without requiring an
agent to rewrite them. Added JSON/diff/batch/budget features must be optional.
Ignored options, stub responses and recognized-but-unimplemented commands do
not satisfy compatibility. Pin the upstream revision before the parity suite
is declared complete, and test every row through the actual CLI, not only its
parser. Browser-engine-specific options remain an explicit unresolved row.

The desired executable is `agent-browser`, with Playwright CLI conventions:
`agent-browser -s=name open URL`, `snapshot`, `click e15`, `fill e3 value`.
Preserve positional argument ordering, named sessions, useful per-action output,
reference/selector/locator targeting and explicit artifact filenames. JSON/diff
extensions must be additive, not require rewriting existing command workflows.

| ID | Command family / behavior | Acceptance evidence | Status |
| --- | --- | --- | --- |
| P01 | `open`, `goto`, `close`, `go-back`, `go-forward`, `reload` | URL/history/error/session behavior through separate CLI invocations. | Pending |
| P02 | `click`, `dblclick`, `hover`, `drag`, `drop` | Event ordering, mouse buttons, drag data and files. | Pending |
| P03 | `type`, `fill --submit`, `select`, `upload`, `check`, `uncheck` | Real document/control state and native default actions, including disabled controls. | Pending |
| P04 | `snapshot`, `find` | Whole/scoped/depth/boxes snapshots, files, refs, literal/regex searches. | Pending |
| P05 | CSS and Playwright locator targets | Role/name/test-id/selector targeting, ambiguity/actionability and stale-reference errors. | Pending |
| P06 | `eval`, `run-code` | Page/element expressions and supported Playwright-style page operations; never evaluate site code on host. | Pending |
| P07 | `dialog-accept`, `dialog-dismiss` | Alert/confirm/prompt lifecycle and response semantics. | Pending |
| P08 | `resize`, `press`, `keydown`, `keyup` | Viewport and keyboard/modifier/focus semantics. | Pending |
| P09 | `mousemove`, `mousedown`, `mouseup`, `mousewheel` | Correct coordinate space, buttons, scrolling and cleanup. | Pending |
| P10 | `screenshot`, `pdf` | Optional element/filename/hires arguments and valid actual exports. | Pending |
| P11 | `tab-list`, `tab-new`, `tab-close`, `tab-select` | Indexed tab lifecycle, active tab, refs, storage and session isolation. | Pending |
| P12 | `state-save`, `state-load` | Explicit private-file round trips, cookies/storage fidelity and safe path handling. | Pending |
| P13 | `cookie-list/get/set/delete/clear` | Domain/path/secure/httpOnly/sameSite attributes and request/script access semantics. | Pending |
| P14 | `localstorage-*`, `sessionstorage-*` | List/get/set/delete/clear, origin scoping and lifecycle. | Pending |
| P15 | `route`, `route-list`, `unroute` | Requests actually mocked, intercepted bodies/status and retrieval showing those results. | Pending |
| P16 | `console`, `requests`, `request` | Real diagnostic records, levels/details and sensitive-data handling. | Pending |
| P17 | `tracing-start`, `tracing-stop` | Replayable action/network/document evidence and exported artifacts. | Pending |
| P18 | `video-start/chapter/show-actions/hide-actions/stop` | Valid recording of our rendered output, lifecycle and visible annotations. | Pending |
| P19 | `show`, `show --annotate`, `highlight`, `generate-locator` | Observable sessions, overlays, review feedback and valid locator generation. | Pending |
| P20 | `-s=name`, session env, `list`, `close-all`, `kill-all`, `delete-data` | Cross-invocation sessions, explicit persistence and cleanup restricted to our sessions. | Pending |
| P21 | Configuration, output paths, mobile/device/profile options | Validated options and corresponding behavior rather than ignored flags. | Pending |
| P22 | Browser-specific `--browser`, extension/CDP attach/detach | Compatibility decision required; never silently substitute or launch Chrome as our engine. | Decision pending |
| P23 | `--help`, install/skill workflow and code generation | Discoverable documented commands and generated TypeScript/skills that actually work. | Pending |

Do not claim a literal full superset while P22 remains unresolved or other rows
are only parsed. The independent engine and compatibility frontend are separate
concerns. Exposing our own CDP server is allowed; calling another browser to do
the work is not an engine implementation.

## Agent additions beyond the baseline

| ID | Addition | Acceptance evidence | Status |
| --- | --- | --- | --- |
| A01 | Structured JSON output | Stable versioned actions/results/errors with no ANSI noise. | Pending |
| A02 | Bounded snapshots and semantic diffs | Budget/truncation metadata and only changed refs/state when requested. | Pending |
| A03 | Extract/query/table/link helpers | Useful structured values with provenance and source refs. | Pending |
| A04 | Ordered action batches | Stop-on-error, no implicit mutation retries, per-step results and cancellation. | Pending |
| A05 | Explicit capability and budget reporting | Real supported features, limits, resource measurements and reasons for denial. | Pending |
| A06 | Live semantic/terminal subscription | Shared session updates, backpressure, disconnect cleanup and safe text. | Pending |
| A07 | Reproducible real-site suite | Dated assertions, successes/failures, artifacts and performance measurements. | Pending |

## Completion rule

Evidence as of September 1, 2026, 15:45 UTC: 159 tests pass on Node, covering
command parsing, our internal document tree, snapshots and guarded networking.
The portable core/host guard has 130 passing Bun checks; Bun networking is
explicitly unsupported after a failing negative TLS diagnostic. `NETWORK.md`
and `reports/README.md` preserve both successful and failed evidence.

Four Node HTTPS probes demonstrate downloading and content-marker checks only.
They do not complete A07 or K05: there is no page Fetch/XHR/CORS implementation
or functioning browser integration yet. `src/snapshot.test.ts` is partial
evidence for A02, not completion of A02 or P04. Actual navigation, page scripts,
CSS layout, browser-level real-site acceptance and playground remain pending.

Link every completed row to code and executable tests. Preserve failed tests and
known gaps. A landing-page mockup, parser-only CLI, screenshots from another
engine, or hand-authored fake document state cannot satisfy this ledger. If a
feature needs an extra dependency, ask before adding it. If all rows cannot be
completed within the work window, report the actual state; do not mark an
incomplete goal achieved merely because the time is exhausted.
