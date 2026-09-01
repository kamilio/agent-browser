# Agent browser: 72-hour implementation tasks

Started: September 1, 2026, approximately 14:58 UTC.
Work window: through September 4, 2026, approximately 14:58 UTC.
Status: active; foundation work, not a completed browser.

Scope additions confirmed by the user: cover all Kitesurf features, provide a
playground comparable to `https://kitesurf.cloudflare.app/`, and make the agent
interface a Playwright-CLI-like superset. `COMPATIBILITY.md` is the explicit
feature ledger. "Better than curl" is the first milestone, not the final gate.

## Product contract

Build our own lightweight browser in TypeScript, suitable for agents and
meaningfully more useful than curl. Agents consume semantic document state and
stable references, execute actions, and observe the results. A Browsh-inspired
terminal/web view is an observer of the same session, not the agent's primary
input format. Kitesurf is an architectural reference, not a hosted dependency.

- No Chromium, Firefox, browser extension, CDP-connected browser, or browser
  service underneath this engine. Preserve `../browser-terminal` as the existing
  heavyweight alternative; do not silently fall back to it.
- Browser implementation is TypeScript: document model, browser API bindings,
  navigation, event/default-action behavior, policy, semantic layout and clients.
- An embedded JavaScript interpreter is a building block, not a browser engine.
  It requires dependency approval. Do not execute website code with host eval,
  `new Function`, Node's `vm`, or an unrestricted host worker.
- Cloudflare compatibility is optional. A normal low-resource machine is a
  valid target. Keep platform adapters separate from the document/browser core.
- Preserve Playwright CLI command/session conventions and add agent features.
  Unsupported responses are development gaps, never evidence of a functional
  superset. Test syntax, lifecycle and behavior, not only matching command names.
  Browser-specific launch/extension flags conflict with the independent-engine
  requirement; record that compatibility decision instead of silently launching
  Chrome or pretending to implement it.
- Website content is untrusted data, never trusted agent instructions. No claim
  of undetectability, bot-challenge bypass, or a genuine Chrome fingerprint.

## Dependency decision

Approval requested, not granted or installed yet:

1. `parse5`: standards-oriented HTML parser, already present transitively in the
   repository. Adapt its parsed tree into our document model. Parsing is not a
   full browser implementation.
2. `quickjs-emscripten`: isolated JavaScript evaluation with bounded memory,
   stack and execution time. The browser APIs and document implementation remain
   our TypeScript code. Start with a minimal VM bridge and deny host access.

Do not add either dependency, vendor it, or bypass approval by resolving private
transitive paths. Dependency-free model, policy, snapshots and tests can proceed.

## Milestones

The time ranges are planning budgets, not a reason to delay working features.

### M0 — architecture and measurable acceptance (hours 0–6)

- [x] Create this task document and a separate `browser-agent` package.
- [x] Inspect current browser interfaces and existing dependencies.
- [x] Research the HTML parser and isolated JS runtime before requesting approval.
- [ ] Define serializable agent actions/results, capability reporting and errors.
- [x] Implement and test our internal document model, stable references and mutation rules.
- [x] Implement bounded semantic snapshot foundations with hidden/password handling.
- [ ] Define navigation/resource policy and explicit runtime adapter contracts.

### M1 — better than curl without JavaScript (hours 6–18)

- [x] Implement a bounded Node host transport with pinned DNS, TLS verification,
      redirects, decompression, deadlines, cancellation and local security tests.
- [x] Probe four public HTTPS sites through that transport and preserve results.
- [ ] Parse actual HTML into our document model with element identity preserved.
- [ ] Fetch with redirect/timeout/size limits, correct decoding and cancellation.
- [ ] Prevent private-network access by default, including redirects, unusual IP
      syntax and DNS rebinding; tests explicitly opt in to local fixture origins.
- [ ] Implement isolated cookie jars, origin handling and navigation history.
- [ ] Implement click/fill/type/press, links, labels and basic native form actions.
- [ ] Stable references survive non-destructive changes and reject stale pages.
- [ ] Expose useful JSON CLI/library operations and deterministic local fixtures.
- [ ] Demonstrate real-site document reading and multi-page navigation by refs.

### M2 — real page JavaScript, not host execution (hours 18–36)

- [ ] Obtain runtime dependency approval and implement disposable per-page VMs.
- [ ] Bridge our DOM through a narrow, validated capability boundary.
- [ ] Support script loading, event listeners, DOM mutation and default actions.
- [ ] Support bounded promises/timers, fetch/XHR and document lifecycle events.
- [ ] Add module loading and document the supported browser API surface.
- [ ] Enforce same-origin/CORS, storage and cookie isolation for script access.
- [ ] Bound script CPU, memory, callbacks, requests, output and navigation loops.
- [ ] Test hostile scripts, host-access attempts, infinite loops and teardown.
- [ ] Demonstrate an actual JavaScript-dependent public page and a local dynamic
      application whose content/actions cannot be obtained by curl alone.

### M3 — agent API and human observability (hours 36–48)

- [ ] Semantic snapshots, incremental changes, action readiness and useful errors.
- [ ] Bounded session/tab lifecycle and action ordering, including cancellation.
- [ ] Playwright CLI baseline command families, named sessions and selectors.
- [ ] Preserve command/result/error and artifact semantics with fixture workflows.
- [ ] Agent extensions: JSON mode, diffs, extraction, batches and resource budgets.
- [ ] Kitesurf-compatible CDP/DevTools surface backed by our engine, not Chrome.
- [ ] Text-first terminal projection, keyboard navigation and safe control codes.
- [ ] Playground URL entry, example corpus and inspect/screenshot/PDF/HTML actions.
- [ ] Inspector with page/text view, DOM, console, network and real memory metrics.
- [ ] Authenticated loopback HTTP API and a web observer of the same session.
- [ ] Stream state/text deltas instead of shipping raster screenshots by default.
- [ ] PNG/PDF exports rendered by our implementation, not outsourced to Chromium.
- [ ] JS/CSS/SVG/canvas/iframe compatibility matrix and public TodoMVC variants.
- [ ] Dry-run transport mocks every mutation and exposes mocked changes to reads;
      no mode disclosure or accidental real network mutation from simulation.

### M4 — compatibility and resource evidence (hours 48–66)

- [ ] Check real websites across static content, navigation, forms and JavaScript.
- [ ] Record URLs, UTC times, actions, assertions, bytes, latency and failures.
- [ ] Test semantics on Node and Bun without relying on a desktop browser binary.
- [ ] Measure cold process startup, initial navigation, snapshot size and RSS.
- [ ] Compare raw fetch/curl output with our usable snapshot and action results.
- [ ] Soak repeated navigations, mutations and session closures for leaks.
- [ ] Profile expensive work; avoid screenshot/layout machinery agents do not need.

### M5 — final hardening and handoff (hours 66–72)

- [ ] Run focused and full package suites, typecheck, lint and security tests.
- [ ] Re-run real-site acceptance cases after final runtime changes.
- [ ] Inspect real CLI and streamed web output, not just generated fixtures.
- [ ] Publish reproducible commands, limitations and measured resource results.
- [ ] Audit every product requirement against code and evidence; retain failures.
- [ ] Audit every Kitesurf, playground and Playwright CLI row in `COMPATIBILITY.md`.
      Do not mark the overall goal complete while required rows remain unverified.
- [ ] Ensure no unrelated work, production service or dependency was changed.
- [ ] Only mark the goal complete when the useful browser and verification exist.

## Acceptance evidence

### Network checkpoint — September 1, 2026, 15:45 UTC

- 159 tests pass using the package's actual `test` script on Node 22.22.0.
  Build, compiled package self-imports, typecheck and Biome checks pass.
- 130 portable-core/host-guard checks pass on Bun 1.3.8. This is not a claim
  that the network backend is supported on Bun.
- Node real-site probes pass for Example Domain, Hacker News, Books to Scrape
  and the Quotes to Scrape JavaScript page's initial HTML shell. Final run:
  15:44 UTC; response latencies 50, 229, 62 and 53 ms respectively. These are
  individual observations, not general browser performance claims.
- `reports/network-sites-node-2026-09-01.json` records status, content markers,
  hashes, sizes and timing. No HTML parser, page JS, DOM action or renderer is
  involved, so browser-level real-site acceptance is still pending.
- Negative TLS tests caught a Bun incompatibility: the local server received
  a request before a custom hostname check rejected its certificate. The
  production adapter now refuses Bun; no weaker-verification fallback remains.
  `reports/bun-tls-ordering-2026-09-01.json` preserves the failing diagnostic;
  `scripts/check-bun-tls-ordering.ts` reproduces it locally.
- The Node TLS suite verifies original host/SNI, explicit fixture trust,
  default rejection of an untrusted certificate, hostname mismatch with zero
  HTTP requests received, and HTTPS downgrade denial. `NETWORK.md` records the
  host/runtime decision, current limits, references and unimplemented layers.
- HTML parser and isolated-JavaScript dependency approval remains outstanding.
  Cookies, actual navigation/history/actions, JS, layout and playground are
  still required. No Kitesurf/Playwright parity row is declared complete.

### Foundation checkpoint — September 1, 2026, 15:19 UTC

- 49 package unit tests pass across CLI parsing, internal document mutation and
  semantic snapshots. TypeScript checking and Biome checking pass.
- Own document tree has bounded nodes/text/depth/change history, immutable read
  views, connected-node references and runtime mutation validation.
- Snapshot JSON has a measured UTF-8 byte ceiling, semantic depth/entry/string
  limits and truncation metadata. Text output strips terminal control codes.
- Password values, file-input paths and URL credentials are omitted. Snapshot
  diffs reset across documents/scopes and incomplete views rather than inventing
  deletions. These are targeted redactions, not general secret detection.
- Evidence: `src/cli-parser.test.ts`, `src/document.test.ts`,
  `src/snapshot.test.ts`. Command:
  `bun --bun node_modules/vitest/vitest.mjs run packages/browser-agent/src --maxWorkers=1`
  from the repository root. Vitest requires execution outside this environment's
  sandbox to start its worker; this is not a test skip.
- This checkpoint uses constructed document fixtures, not parsed real websites.
  HTML parsing, network navigation, isolated JavaScript, rendering, browser
  actions and the playground remain unimplemented. None of their parity rows
  are marked complete by these unit tests.
- Snapshot semantics currently cover a documented subset of native/ARIA roles,
  labels, control state and explicit hidden attributes, not the full accessible
  name algorithm or computed CSS visibility. Layout boxes are not fabricated.
- The temporary reference-inspection browser session was closed and its absence
  from the service session list verified. It was never our engine.

### What must make this better than curl

1. Read an actual page as compact text plus named, typed actionable elements.
2. Follow an element reference, keep session state, go back and continue browsing.
3. Fill and submit a designated test form with correct native control semantics.
4. Execute page JavaScript that changes the document and handles a click, then
   expose that changed document to the agent without a separate browser engine.
5. Observe the same session in a terminal/web text view.
6. Contain malicious or runaway website code and network requests.

### Real websites

Candidate corpus (availability and exact assertions must be checked at run time):

| Category | Candidate | Action policy |
| --- | --- | --- |
| Small static page | `https://example.com/` | Read and inspect a link. |
| Dense link listing | `https://news.ycombinator.com/` | Read; follow a public pagination link. |
| Catalog/navigation | `https://books.toscrape.com/` | Read; follow category/product/pagination refs. |
| Documentation | Public TypeScript or MDN documentation | Read headings, links, code and content. |
| JavaScript content | `https://quotes.toscrape.com/js/` | Read JS-generated content and public pagination. |
| JavaScript application | A public TodoMVC demonstration | Disposable demo-only interactions; no account. |
| Forms | A designated HTTP echo/test service | Only synthetic non-sensitive values. |

No purchases, messages, account changes, or writes to real user data. Public-site
network tests are opt-in and rate-limited; no automatic retries of mutations.
Do not include passwords, auth cookies, API keys or private responses in reports.
Record blocks/timeouts as results rather than changing the sample to hide them.

### Performance targets

Provisional goals to measure, not current claims: a small single-page session
under 100 MiB RSS, sub-second cold startup on this machine, and default semantic
output capped at 16 KiB. Report host/runtime/version, document complexity and
network latency separately. Larger JS applications may exceed the initial target;
publish those measurements and set explicit resource limits instead of pretending
all sites fit. A terminal display alone is not evidence of a lightweight engine.

## Research references

- Browsh design: https://www.brow.sh/docs/introduction/
  Its Firefox dependency is specifically not our implementation architecture.
- Kitesurf design: https://blog.cloudflare.com/kitesurf/
  Worker-native components and scoped capabilities are reference ideas only.
- Kitesurf functionality: https://developers.cloudflare.com/browser-run/kitesurf/
- Kitesurf playground: https://kitesurf.cloudflare.app/
- Playwright CLI: https://github.com/microsoft/playwright-cli
- HTML parsing: https://parse5.js.org/
- Runtime binding: https://github.com/justjake/quickjs-emscripten
- Host VM warning: https://nodejs.org/api/vm.html

Research checked September 1, 2026. No downloaded source has been copied into
this package, and no new dependency has been installed at this checkpoint.
