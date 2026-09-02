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
| K01 | HTML parsing, DOM identity and mutation | Malformed markup, entities, trees, selectors and mutation fixtures; relevant web-platform tests. | Partial parser, identity, bounded queries, fragments, cloning, live tag/class/children collections, Attr/NamedNodeMap, classList mutations/iteration, baseURI and URL attribute reflection (`HTML.md`, `DOM-FRAGMENTS.md`, `LIVE-COLLECTIONS.md`, `DOM-ATTRIBUTES.md`, `CLASS-LISTS.md`, `PAGE-URLS.md`). Session-owned Location navigation, finite-JSON History state/session-wide length and bounded guest traversal are implemented (`PAGE-HISTORY.md`); bare global Location assignment and complete navigation/task semantics remain unsupported or unverified. Namespace/prototype completeness, full collection/NodeList/DOMTokenList, parser/DOM conformance and web-platform coverage remain open |
| K02 | CSS styles and layout | Cascade, inheritance, sizing, overflow and layout fixtures; compare public page structure and captures. | Partial: bounded display/visibility cascade, media viewport and live inline declarations with thirteen native-browser anchors; full CSSOM, computed styles and layout/captures pending (`CSS.md`, `INLINE-STYLES.md`) |
| K03 | Page JavaScript and modules | Inline/external/module scripts, promises, events, timers and script errors in isolated sessions. | Partial opt-in classic loading, events, parser writes, bounded identity-preserving timers, guest constructor inheritance, ordinary Object intrinsics and owned Date values/journaled clocks (`SCRIPT-LOADING.md`, `DOCUMENT-WRITE.md`, `PAGE-TIMERS.md`, `SAFEJS-FUNCTION-OBJECTS.md`, `SAFEJS-OBJECT-PROTOTYPE.md`, `SAFEJS-DATE.md`); host-task checkpoints now preserve responsiveness and native navigation after script timeout (`SAFEJS-COOPERATION.md`). Date snapshots/locale formatting, complete intrinsic graphs/coercion and property descriptors, nested inline writes, modules, full task/microtask semantics, same-document script recovery and public dynamic-site acceptance remain open; both current public navigations return readable HTML but their scripts hit the unchanged source timeout |
| K04 | Framework-driven pages | Real TodoMVC vanilla, React, Vue, Angular and Preact: add/edit/toggle/filter/delete demo todos. | Pending. A self-authored storage-backed vanilla fixture now supports actual interpreted agent add/toggle/remove and reload restoration (`PAGE-STORAGE.md`); it does not satisfy real TodoMVC/framework acceptance |
| K05 | Browser network APIs | Fetch, XHR, URL/encoding, redirects and CORS with local multi-origin security fixtures. | Partial document-owned fetch (`PAGE-FETCH.md`) plus CORS/preflights/header filtering/redirect state (`PAGE-CORS.md`), tested with real SafeJS over mock origins. XHR, binary/streaming/signals, broader conformance and real multi-origin/wire acceptance remain open |
| K06 | Cookies, storage and isolation | Per-session/per-origin jars and stores; no cross-session leakage; explicit cleanup. | Partial: native stores/jar plus owned page Storage methods and document.cookie, pre-parser access, origin/tab/session isolation, opener cloning, state imports, HttpOnly protection, quotas and revocation (`PAGE-STORAGE.md`). Bounded cross-document storage events update an interpreted second-tab UI (`STORAGE-EVENTS.md`). Named Storage properties, full scheduler/events conformance, durable/partitioned storage and broader wire/standards acceptance remain open |
| K07 | Frames and page contexts | Same/cross-origin frames, scoped globals, resource budgets and parent access restrictions. | Pending |
| K08 | Images, fonts, SVG and 2D canvas | Supported image resources, text shaping, SVG and canvas fixtures with actual exported results. | Pending |
| K09 | Interactive input and selection | Mouse/keyboard events, focus, links, forms and document selection driven through the API. | Pending |
| K10 | Screenshots | Real PNG page/element capture from our renderer with correct bounds and nonempty pixel assertions. | Pending |
| K11 | PDF | Parseable PDF export of the rendered document, with text/pages and pagination assertions. | Pending |
| K12 | HTML and structured extraction | Post-script HTML, links, selectors, semantic/accessibility output and Markdown/JSON extraction. | Partial live HTML/snapshots plus bounded Markdown and typed JSON extraction (`HTML-CONTENT.md`, `EXTRACTION.md`); actual SafeJS fixture changes pass, but public/CLI/download gates, full structure/style coverage and conformance remain open |
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
| G03 | Inspect workspace | Live page and terminal/semantic view with URL/back/forward/reload controls. | Partial keyboard terminal frontend with unit-tested shared-session actions/history (`TERMINAL.md`); real PTY/public-site gate denied and unverified, combined inspect workspace remains open |
| G04 | DOM and accessibility | Expand nodes, inspect attributes/styles, locate refs and highlight corresponding output. | Pending |
| G05 | Console | Real page logs, evaluation results and exceptions; no fabricated sample logs. | Partial page-owned logs/error codes, severity-filtered CLI and tested Console pane (`PAGE-CONSOLE.md`); full console/error/source semantics remain open |
| G06 | Network | Real request timing/status/size, failures and policy blocks with sensitive data redacted. | Partial bounded document/script/stylesheet/fetch/preflight metadata and Network pane (`NETWORK-JOURNAL.md`), with per-hop CORS results separate from HTTP completion; validated with in-memory transports, real experimental-core SafeJS and formatter tests. New visual/public-site gates, complete fetch/CORS/XHR and detailed wire timing remain open |
| G07 | Memory and execution | Actual runtime/host measurements labelled accurately, plus CPU/wall budgets and stop reasons. | Pending |
| G08 | Export actions | Working screenshot/PDF/HTML plus semantic/Markdown downloads; validate the downloaded formats. | Live HTML inspection and download request implemented; actual HTML transfer unverified because test-browser downloads are unavailable. PNG/PDF/other file gates remain open (`PAGE-CONSOLE.md`) |
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
| P08 | `resize`, `press`, `keydown`, `keyup` | Viewport and keyboard/modifier/focus semantics. | Partial: logical CSS viewport and bounded press/type/focus; physical layout and held keys pending |
| P09 | `mousemove`, `mousedown`, `mouseup`, `mousewheel` | Correct coordinate space, buttons, scrolling and cleanup. | Pending |
| P10 | `screenshot`, `pdf` | Optional element/filename/hires arguments and valid actual exports. | Pending |
| P11 | `tab-list`, `tab-new`, `tab-close`, `tab-select` | Indexed tab lifecycle, active tab, refs, storage and session isolation. | Pending |
| P12 | `state-save`, `state-load` | Explicit private-file round trips, cookies/storage fidelity and safe path handling. | Pending |
| P13 | `cookie-list/get/set/delete/clear` | Domain/path/secure/httpOnly/sameSite attributes and request/script access semantics. | Pending |
| P14 | `localstorage-*`, `sessionstorage-*` | List/get/set/delete/clear, origin scoping and lifecycle. | Pending |
| P15 | `route`, `route-list`, `unroute` | Requests actually mocked, intercepted bodies/status and retrieval showing those results. | Partial session-owned fulfillment, bounded URL globs, response bodies/status/headers, redirect responses, listing/removal and journal attribution (`ROUTING.md`). Node consults routes inside its existing redirect driver; adapters without the optional capability still fail closed on automatic navigation redirects. Mocked resolver/exchange tests cover native routing and session HTML loading; experimental SafeJS consumes fully mocked redirect chains with CORS and manual/error filtering. Header rewriting, binary/cookie rule configuration, handlers, full pattern parity and separate CLI/live acceptance remain open |
| P16 | `console`, `requests`, `request` | Real diagnostic records, levels/details and sensitive-data handling. | Partial document-scoped console (`PAGE-CONSOLE.md`) and tab/latest-network-navigation request journal (`NETWORK-JOURNAL.md`); redacted bounded metadata and detail commands tested with in-memory transports. Full traffic/header/body and console parity remain open |
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

The automatic-classic checkpoint adds real parser pauses and loader/lifecycle
integration, not a post-parse manual-script simulation. Eleven actual HTTP-fixture
assertions pass. Two public sites report script failures and remain failed
compatibility cases. `SCRIPT-LOADING.md` records the evidence and missing gates;
this does not complete K03 or any full-browser compatibility claim.

The process-CLI checkpoint has 942 passing browser tests, sixteen actual-SDK
CLI/paired-API real-site checks and nineteen passing default-mode CLI checks
(`PROCESS-CLI.md`). Named sessions now own supervised native browser/DOM/realm
processes; manual evaluation shares state across clients. This remains partial:
automatic website scripts, full lifecycle/scheduling and dynamic-site acceptance
are still missing. No full compatibility row is completed by this checkpoint.

The native-action checkpoint has 908 passing browser tests, seventeen actual
compiled-core fixture/real-site action checks and nineteen passing CLI checks
(`NATIVE-SCRIPT-ACTIONS.md`). Native defaults now respect interpreted listener
phases, and stopped pages can retain history for clean navigation/reload. This
does not complete a compatibility row. The process-owned realm gate is addressed
in the later checkpoint; automatic scripts, full event-loop behavior and
dynamic-site acceptance remain unfinished.

The latest guest-event checkpoint has 885 passing browser tests and forty
compiled-core fixture/real-site checks (`SCRIPT-EVENTS.md`). Guest function
listeners now bind to live nodes and events, but native action migration, automatic
website script loading and full callback checkpoint semantics remain incomplete.
No Kitesurf or Playwright row is marked complete on the strength of these partial
checks. Synthetic callback-cost measurements are evidence of remaining performance
work, not a fast-browser claim. Older checkpoint evidence follows.

Evidence as of September 1, 2026, HTML checkpoint: 772 tests pass on Node, covering
command parsing, our internal document tree, snapshots, guarded networking,
isolated storage, control helpers, form serialization/HTTP roundtrips and
event-driven control interactions, bounded DOM querying and same-document
history, label activation, form reset, redirect-aware host-only cookie jars and
owned tab/document navigation and a real partial CLI/shared command API.
`CLI.md` records named in-memory sessions across separate invocations, command
ordering, strict unsupported-option failures, bounded authenticated loopback access
and private discovery files. Eleven public CLI checks pass for text/JSON only;
automatic launch, crash recovery, many baseline commands and full playground parity remain
missing. The 46 dispatcher/parser checks also pass on Bun. No full row is completed.
`SESSION.md` records the explicit loader boundary:
real text/JSON loading and reload work; general HTML conformance, page JS and native
history lifecycle remain missing. All 59 focused session/history/text-loader checks
also pass on Bun. Public text/JSON documents and expected HTML rejection have
dated evidence, not general browser/CLI compatibility acceptance.
Four public cookie-session assertions pass using six requests; Domain/Partitioned
cookies, registrable-domain same-site logic and browser/profile bindings remain
missing (`COOKIES.md`). The 55 portable cookie cases also pass on Bun.
The 172 history/URL/event/query tests
and a later 73-test focused form-action/core run also pass separately on Bun.
`FORM-ACTIONS.md` records supported reset/label behavior and missing native semantics.
`HISTORY.md` distinguishes stored target state, URL rewrites and fragment
traversal from loading. The later `NAVIGATION-HISTORY.md` checkpoint adds actual
combined traversal through the session/CLI/playground, JSON-state restoration,
branching, reload preservation, bounded archives and POST replay refusal. Public
JSON/RFC movement passes; full native bindings/lifecycle and redirect restoration
remain incomplete. `SELECTORS.md` documents scope, missing
selector features and constructed-fixture resource measurements; none establish
browser-level query or extraction parity. `EVENTS.md` details the event and action
boundary. The later `FORM-NAVIGATION.md` checkpoint executes native submit defaults
through supported validation, submit events and owned GET/POST navigation. Real
HTTP redirects/cookies and two public echo submissions pass with constructed
controls. Complete HTML parsing, website JS, full constraint/FormData/keyboard behavior and
non-self navigation targets remain missing; this does not complete P02/P03.
The later `KEYBOARD.md` checkpoint adds focused type/press/fill --submit, native
control caret editing, tab traversal and implicit Enter defaults. Separate-process
CLI tests and two public keyboard-driven echo POSTs pass; 65 focused cases pass on
Bun without network support. IME, contenteditable, held keys, full event timing and
other keyboard/control behavior remain missing, so K09/P03/P08 stay incomplete.
The earlier portable-core Bun diagnostic has 161 passing checks and one failing native
multipart-reader check. Bun networking remains explicitly unsupported after
a failing negative TLS diagnostic. `NETWORK.md`, `STATE-FORMS.md` and
`reports/README.md` preserve both successful and failed evidence.

Four Node HTTPS probes demonstrate downloading and content-marker checks only.
They do not complete A07 or K05: the later `PAGE-FETCH.md` supplies partial
fetch and the later `PAGE-CORS.md` adds policy checks with in-memory interpreter
evidence, not full XHR/Fetch conformance or real-site
acceptance. `src/snapshot.test.ts` is partial
evidence for A02, not completion of A02 or P04. Actual navigation, page scripts,
CSS layout and general browser-level real-site acceptance remain pending.
`PLAYGROUND.md` records the working shared-session UI: local CLI pairing, text/
snapshot views, navigation/tabs, command input, actual counters and command activity.
The UI is tested using an existing watchable browser as a test tool only; website
Complete HTML/JS, visual rendering and exports are not implemented by our engine. No full
playground compatibility row is completed by this subset.

The later `HTML.md` checkpoint uses original dependency-free TypeScript to load a
bounded HTML subset. Actual Example Domain/Hacker News content, Books to Scrape
ref navigation/back, and a parsed public form POST pass. The form needs no inserted
controls, attribute changes or validation bypass. There are 17 passing public CLI
assertions, 17 desktop/mobile UI assertions and 76 focused Bun parser/decoder/form
tests. Snapshots/navigation disclose partial parsing and disabled JavaScript. Foreign
content/templates, complete recovery/entities/modes, scripts and CSS rendering remain
missing. This improves K01/K09/K12/P01/P03 but completes none of those full rows.
Two public demo POST echoes validate serialized fixture values and file content;
two more verify event-driven control values and a host-listener mutation; two
further echoes exercise label forwarding, reset defaults and refilled values. None
prove parsing, website script execution or browser submission. Storage/control
and event/query/history helpers alone do not complete browser-level state/actions
rows. Same-document traversal is not proof of full P03 back/forward behavior.

Link every completed row to code and executable tests. Preserve failed tests and
known gaps. A landing-page mockup, parser-only CLI, screenshots from another
engine, or hand-authored fake document state cannot satisfy this ledger. If a
feature needs an extra dependency, ask before adding it. If all rows cannot be
completed within the work window, report the actual state; do not mark an
incomplete goal achieved merely because the time is exhausted.
