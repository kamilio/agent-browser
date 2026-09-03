# Agent browser

Standalone repository: `~/project/agent-browser`. `MIGRATION.md` records preserved
history and setup; new completed changes receive atomic commits without pushes.

An in-progress lightweight, agent-first browser implemented in TypeScript.
This is a new engine, not the Chromium-backed `browser-terminal` alternative.
It must become meaningfully better than curl: semantic document snapshots,
stable element references, stateful navigation, forms and isolated page scripts.

Agents use a structured API. A Browsh-inspired terminal/web view will make the
same session observable to humans. Kitesurf is an architectural reference, not
a service dependency. Cloudflare deployment is optional, not a requirement.

The requested final scope includes Kitesurf feature coverage, a comparable
playground and a Playwright-CLI-like superset. `COMPATIBILITY.md` tracks these
individually. A basic text fetcher or a parser that accepts familiar command
names is not completion of that scope.

## Current status

`NODE-RELATIONS.md` adds live containment, document ordering, identity and structural
equality to node/attribute capabilities, with bounded iterative comparisons and
actual experimental-SafeJS reconciliation reflected in agent snapshots. This is
not a complete Node prototype graph, namespace model or framework acceptance.

`JPEG-PERFORMANCE.md` brings the tested one-megapixel JPEG under the unchanged page
work guard: fast inverse transforms and cached chroma rows retain identical pixels,
with about a 2× local timing improvement. Actual experimental-SafeJS page loading,
PNG and PDF export pass; this is not universal large-image or Worker acceptance.

`JPEG-DECODING.md` adds native 8-bit Huffman baseline/progressive JPEG resources,
verified against 252 independent fixtures and actual experimental-SafeJS agent
PNG/PDF captures. Existing page resource budgets remain enforced; large photos,
CMYK, orientation and color management still have explicit gaps.

`IMAGE-LAYOUT.md` connects loaded PNGs to normal-flow inline/block sizing, live
geometry and the shared PNG/PDF renderer. Actual experimental-SafeJS agent captures
contain the resource pixels and update after source changes. The profile uses
nearest-neighbor sampling; broken-image fallback and general image/CSS/site parity
remain open.

`IMAGE-RESOURCES.md` connects PNG resources to page-owned loading, shared requests,
source changes, live image properties/decode/events and agent `images` inspection.
Actual experimental-SafeJS loader checks pass; `IMAGE-LAYOUT.md` adds bounded
normal-flow layout/compositing without changing the resource lifecycle limits.

`PNG-DECODING.md` adds an independent PNG/zlib decoder with all static color/depth
combinations, filters and Adam7 interlacing. Native and independent Pillow pixel
checks pass. Color management, animation and general replaced-element coverage
remain open. No dependency is added.

`PDF.md` connects native paginated PDF export to the `pdf` command, private local
CLI files and the playground PDF download. One layout feeds native page pixels
and compact searchable text. Independent Ghostscript parsing, text extraction
and exact pixel checks pass. This is screen-layout pagination, not print CSS,
full fonts, tagged PDF or live-site/frontend acceptance.

`CHARACTER-DATA.md` adds live text/comment data editing, `splitText`, `wholeText`
and subtree normalization. Actual SafeJS edits change agent snapshots and native
captures; splitting and merging preserve pixels and retained node identities.
Text/node quota failures are preflighted. Mutation observers, ranges and broader
framework/site acceptance remain open.

`ANIMATION-FRAMES.md` adds bounded `requestAnimationFrame`/`cancelAnimationFrame`
and a shared monotonic `performance` clock. Actual experimental-SafeJS callbacks
update measured layout and explicit capture pixels; batching, cancellation,
rejection isolation and cleanup are verified. This is software scheduling, not
automatic painting or released-SDK event-loop acceptance.

`ELEMENT-SIZES.md` adds live readonly client/offset size properties and a `sizes`
field in agent geometry inspection. It distinguishes padding boxes, inline/degenerate
fragments and root viewport sizes, with integer rounding and revision-cached reads.
Actual experimental-SafeJS checks pass; quirks mode, borders, scrollbars and general
layout remain open. Upstream #550 is closed, but local released-SDK acceptance is
still pending and the runtime has not been switched.

`INLINE-BOXES.md` adds actual horizontal inline margin/padding layout, including
signed margins, percentages, empty padded elements and first/last wrapped edges.
Client rectangles, computed styles and native PNG backgrounds now share those
fragments. Actual experimental-SafeJS and pixel checks pass; general CSS and
public-site/released-SDK acceptance remain open.

`MEDIA-RANGES.md` adds bounded compiled responsive conditions, including chained
width/height comparisons, nested Boolean groups, ratios and native resolution.
Actual interpreted command/capture checks pass; general media conformance remains open.

`VIEWPORT-CONTROLS.md` adds confirmed playground viewport inspection, presets and
explicit size editing. Opaque per-session/tab guards prevent stale UI requests
from resizing a different target. These are logical CSS sizes, not device emulation.

`MEDIA-QUERIES.md` adds live media lists, resize/change callbacks and Window
viewport dimensions using the shared CSS/event engines. Actual interpreted
responsive DOM and PNG changes work; one global/Window function-identity assertion
still fails with the selected experimental runtime, so its full probe stays red.

`BACKGROUNDS.md` adds solid-color/none `background` shorthand with eight-component
resets, live inline/computed CSSOM, and actual SafeJS-driven PNG/PDF checks.
Images, layers and non-default background component values remain unsupported.

`COMPUTED-STYLES.md` adds live, readonly `getComputedStyle` on the global and
window objects. Thirty-one longhands use the existing cascade and actual
normal-flow used sizes, sharing the client-geometry cache. Production page
bindings have actual experimental-SafeJS evidence; pseudo-elements, custom
properties, general CSS and released-SDK/public-site acceptance remain open.

`LAYOUT-MEMORY.md` removes eager duplicate glyph records from painting and client
geometry without removing inspection data. Complete frozen absolute vectors are
materialized only when read. The large fixture drops from 199.4 to 175.4 MiB peak
RSS in local samples, with identical output; smaller samples vary and full browser
or low-memory Worker acceptance is not implied.

`INLINE-CAPTURES.md` connects wrapped-inline bounds to actual PNG captures and an
optional playground capture target. Agent inspection, guest geometry and capture
share one extractor; element capture does not perform a second layout pass.
Actual-core, pixel, file and mocked-UI checks pass. Large documents still retain
substantial layout memory; full browser compatibility remains open.

`CLIENT-GEOMETRY.md` exposes native block/wrapped-inline rectangles to page
JavaScript and `geometry <target>`. Snapshot lists, writable returned rectangles,
empty inline/BR geometry, and revision-cached unions have actual SafeJS evidence.
This remains a restricted profile, not scrolling, hit testing or full DOMRect/CSS.

`PNG-COMPRESSION.md` adds bounded, dependency-free fixed-Huffman/LZ77 compression
with a stored-block fallback. The actual 1,024 × 768 exported fixture shrinks from
3,146,804 to 52,889 bytes with independently verified identical decoded pixels.
Measured capture-transfer costs also fall; full browser compatibility is unchanged.

`CAPTURE-EXPORT.md` connects the native renderer to `screenshot`, safe local CLI
PNG files, bounded session-owned artifact reads, and a playground Render/PNG action.
Viewport and single-block targets work in the supported profile. CLI entry, UI
handlers and byte transfers are tested with in-memory/mocked boundaries; live-site,
live-playground, general CSS and full print/PDF compatibility remain open.

`CSS-PAINT.md` connects shared RGB/HSL/hex/named colors and inherited foreground
to native glyphs, solid block/inline backgrounds and HTML canvas propagation.
The actual colored document fixture responds to interpreted style changes and is
visually inspected. This remains a restricted normal-flow profile, not full CSS,
public-site capture acceptance or full print/PDF compatibility. The export checkpoint adds a
partial CLI screenshot path.

`DOCUMENT-LAYOUT.md` connects normal-flow heights, margin collapse and source-mapped
lines to document-positioned blocks/glyphs. A bounded painter produces actual native
text captures, not manually placed panels. The paint extension adds solid colors
and backgrounds with the built-in font. Restricted CLI PNG export and client
rectangles are now connected; full CSS, coordinate actions and print layout remain pending.

`TEXT-LAYOUT.md` connects inherited typography and interpreted style writes to
source-mapped lines measured with the actual built-in font. Supported whitespace,
wrapping, tabs, alignment and mixed-size baselines now have bounded block-relative
geometry. The document stage now adds normal-flow block Y layout and restricted
text paint; client rectangles and complete page painting/screenshots remain pending.

`BITMAP-RENDERER.md` adds an original built-in ASCII pixel font, shared glyph
metrics, bounded RGBA painting and a dependency-free PNG encoder. An actual
generated atlas is recorded and visually inspected. The text stage now uses the
same metrics; restricted CLI screenshots now use them too. General font coverage
remains pending; PNG payloads now use the bounded compressor with stored fallback.

`FORMATTING-TREE.md` adds bounded display decomposition: anonymous blocks,
inline splitting, contents/root handling and deferred unsupported modes.
An issue-free restricted profile can derive block widths and horizontal offsets
from the document itself. The separate document stage adds restricted heights and
text paint; unsupported styling is not silently treated as normal flow.

`BLOCK-WIDTH.md` adds normal-flow horizontal sizing under an explicitly known
containing block: percentages, auto margins, min/max constraints, sizing edges
and LTR/RTL overflow. The later document stage connects normal-flow heights;
general layout modes and client geometry remain pending.

`CSS-BOX.md` adds author-cascade sizing inputs for future layout: dimensions,
margin/padding, box-sizing and supported unit computation. Interpreted inline
writes and logical resize affect the same native values. Percentages remain
unresolved at this computed-style stage. The subsequent layout, paint and capture
stages resolve supported sizing and produce restricted native PNGs.

`LOCATOR-GENERATION.md` adds verified `generate-locator` output and a literal
`locator('CSS')` target form. Generated expressions round-trip through native
actions; positional fallbacks are explicitly marked and not promised stable
after DOM reordering. Actual experimental-core fixture checks pass; CLI wire,
public-site and upstream parity acceptance remain open.

`NODE-VIEW-CACHE.md` documents immutable native-read reuse and equivalent
three-trial resource comparisons: the 5,000-row native workload median drops
from 745.2 to 451.5 ms and peak RSS from 226.7 to 164.3 MiB. Churn peak memory
does not improve; these are not full-browser measurements.

`SESSION-RESOURCES.md` measures native session workloads and documents remaining
memory costs. It exposed a large-page search cutoff: `find` now streams semantic
entries with bounded result/context storage rather than first materializing a
10,000-entry snapshot. JavaScript/real-site resource acceptance remains open.

`HTML-INSERTION.md` adds outerHTML replacement and all four insertAdjacentHTML
positions using the existing contextual parser. Existing adjacent nodes retain
identity and control state; replacements create fresh nodes; inserted scripts
remain inert. Quota/parse failures leave committed state unchanged.

`DOM-MUTATIONS.md` adds interpreted append/prepend/replaceChildren, sibling
before/after/replaceWith and replaceChild over the same native document. Moving
nodes preserves references and listeners; bounded hierarchy checks reject invalid
replacements. Native and actual-interpreter in-memory checks pass.

`EXTENSION-RUNTIME.md` describes the new public SafeJS extension adapter: owned
browser globals, explicit console authorization, callbacks and lifecycle cleanup.
Its mock-contract tests pass; released-artifact acceptance remains unrun. The
CLI/service still uses the existing experimental runtime, with no dependency change.

`SNAPSHOT-SEARCH.md` adds `find` with literal/bounded-regex matching, actionable
refs, context and explicit resource/truncation metadata. It runs natively,
without page evaluation, and preserves snapshot-diff state. Regex/CLI parity
remains partial.

`SCRIPT-FORMS.md` adds live form/control collections, radio-group value access,
and reflected form/control properties. Interpreted configuration feeds native
form request preparation. Guest submit/reset/validation methods remain missing.

`SELECTION-STATE.md` makes native selectedness persistent across option moves,
removal, mode changes, cloning and resets, with separate default/dirty state.
Interpreted mutations and native form submission/reset share the same state.

`SCRIPT-SELECT.md` adds interpreted select/option properties and stable live
option collections backed by native form state. Scripted selection reaches
native submission and actions; full option dirtiness/mutation rules remain open.

`ACTION-WAITING.md` adds bounded pre-dispatch waiting to shared-host click,
fill, select, check and uncheck. Waiting respects command deadlines and session
closure without replaying dispatched actions. Layout stability, hit-testing
and full ARIA actionability are not implemented.

`TARGET-LOCATORS.md` adds literal role, test-ID, text, label, placeholder, alt-text
and title targets to the shared native action/inspection path, without evaluating
locator expressions. Text/label queries use bounded complete candidate matching;
password fields can be addressed by labels without manufacturing textbox roles.
Native and actual experimental-core action checks pass; broader locator grammar,
ARIA conformance and full Playwright CLI parity remain open.

`DOM-INSPECTION.md` adds a bounded `dom` API/CLI command and a shared-session
playground DOM pane. It inspects real post-script structure, stable refs, hidden
nodes and current controls, with password/file value redaction and explicit
truncation. Native, command-host and actual experimental-core checks pass;
the new pane's visual interaction gate remains unverified.

`CLASS-LISTS.md` adds live, bounded classList mutation and iteration. An actual
interpreted handler now reveals a CSS-hidden action, preserves its stable
reference, lets the agent activate it, and hides it again without fetching a new
document. This remains a partial DOMTokenList implementation, not full framework
or public-site compatibility.

`PAGE-STORAGE.md` binds explicit local/session Storage methods and document.cookie
to the session's real stores and cookie jar. An interpreted, agent-driven todo
fixture survives reload and verifies origin/tab/session isolation and HttpOnly
protection. `STORAGE-EVENTS.md` adds bounded cross-tab notifications and interpreted
UI synchronization without reload. Named properties remain unsupported; #549
requests the missing upstream named-mutation capability. Evidence is in-memory, not new
public framework/site acceptance.

`PAGE-HISTORY.md` adds finite-JSON History state and push/replace methods with
session-wide length. Reload and cross-document restoration happen before parser
scripts, and interpreted traversal events preserve prefix order. Guest
back/forward/go use a bounded, cancelable session task queue shared with Location
navigation; evidence uses in-memory IO, not new public-site acceptance.

`PAGE-URLS.md` adds live page Location reads, DOM baseURI and reflected hyperlink
and resource URLs. Location methods, Window/document setters and component writes
now navigate through the owning session. Fragment URLs update synchronously with
deferred events; replace preserves adjacent history. Bare global assignment,
full task ordering and navigation conformance remain incomplete.

`PAGE-FETCH.md` adds bounded document-owned `fetch` to explicitly configured
SafeJS page runtimes. Ten real-interpreter in-memory checks verify Promise/JSON
callbacks updating the DOM, shared diagnostics and pending-request cancellation.
This uses existing SafeJS extension hooks without SDK edits or dependencies.
`PAGE-CORS.md` extends it with preflights, checked cross-origin responses and
redirect state, with fifteen interpreter checks. XHR, streams, guest AbortSignal,
full conformance and live-site acceptance remain unfinished.

`ROUTING.md` adds session-owned `route`, `route-list` and `unroute` fulfillment,
with bounded matching, real replacement content and explicit redirect limitations.

`NETWORK-JOURNAL.md` adds `requests`, `request <index>` and a playground Network
pane. Bounded metadata records document/script/stylesheet requests, redirects,
failures and callback-level policy blocks, with query/credential redaction.
Focused in-memory fixtures pass; no new public-site or live UI acceptance is
claimed. Fetch/XHR, headers/bodies, waterfalls and full network parity remain open.

`EXTRACTION.md` adds bounded live-document `extract` output as Markdown or a
structured JSON tree with stable references. Seven real-SafeJS in-memory checks
verify script-created content and later interpreted click mutations. It does not
fetch again or export form values. Separate CLI, public-site and download gates
remain unverified; this is partial structured extraction, not full conformance.

`TERMINAL.md` adds an interactive `terminal [url]` frontend: keyboard selection,
native link/form actions, history, URL entry and shared-session observation, plus
wrapped row scrolling and literal forward/backward search. Backend literal/regex
search can reach beyond the retained prefix; results require fresh scoped
inspection before activation. Mock-stream tests and an actual experimental-core
in-memory probe cover search, interpreted clicks, stale refs and cleanup. Real PTY/public-site
validation remains unverified because permission review denied that probe; this
is not yet a terminal acceptance claim. No new runtime dependency is added.

`SAFEJS-COOPERATION.md` adds host scheduling checkpoints without releasing the
active guest job or relaxing production limits. Both tested public documents now
remain readable instead of failing the heartbeat, although their automatic
JavaScript still times out. Native links recover after script shutdown. Browser
tests pass 1128/65 files; 46 owned-process probe checks pass, not general dynamic
website acceptance. The extension lifecycle and full requested UI/API scope remain
unfinished.

At the preceding Date checkpoint:

`SAFEJS-DATE.md` adds guest-owned Date values, calendar operations, JSON and
explicit/journaled clocks in the local SDK candidate. Both real jQuery sources
now pass their Date blockers in bounded diagnostics, reaching String.replace
coercion and Object.defineProperty gaps. Both production navigations at that
checkpoint failed the unchanged heartbeat. Forty local automatic-script checks pass, not
public dynamic-site acceptance. Date snapshots and locale formatting stay open.

The preceding local retention optimization preserves memory/compile accounting
and adds 19 deterministic SDK regressions. Books' bounded diagnostic evaluation drops
from about 8.9 seconds to 3.4–4.0 seconds in measured runs, but production
navigation still fails the unchanged two-second heartbeat. Effective scheduling
remains a blocker; this is not a general JavaScript compatibility win.
See `SAFEJS-RETENTION-PERFORMANCE.md` for the exact limits and evidence.

The preceding `DOM-ATTRIBUTES.md` checkpoint adds live Attr/NamedNodeMap identity
and real attribute mutation. Its generic SDK primitive is documented in
`SAFEJS-NAMED-HOST-OBJECTS.md` and filed as #546. At that checkpoint, diagnostics
reached Date on both sites, but Books failed the production heartbeat because
retained-graph accounting dominates execution (`SAFEJS-RETENTION-PERFORMANCE.md`).
Neither site passes automatic compatibility; no watchdog was relaxed.

`INLINE-STYLES.md` adds live element.style declarations, attribute-backed mutation,
priority/shorthand handling and indexed enumeration. Thirteen native-browser
anchors and actual SafeJS page-script/action checks exercise the subset. Its
earlier Books blocker was DOM attribute objects. Full CSSOM/layout remain unfinished.

`LIVE-COLLECTIONS.md` adds live tag/class queries and children, with native-node
identity, indexed reads, item/name lookup and iteration. The generic SDK capability
is documented in `SAFEJS-INDEXED-HOST-OBJECTS.md` and filed as #545. Its earlier
Books blocker was element.style.cssText. Full collection/DOM semantics remain open.

`SAFEJS-OBJECT-PROTOTYPE.md` adds realm-owned type inspection, Object construction
and ordinary/null prototype reflection. Its earlier checkpoint reached the DOM
collection gap. Complete intrinsic graphs, coercion and snapshot support remain unfinished.

`SAFEJS-FUNCTION-OBJECTS.md` adds guest function properties and bounded constructor
inheritance in the local SDK candidate. Its earlier intrinsic blockers were filed
as #543/#544. This is not a complete JavaScript engine or finished extension API.

`PAGE-TIMERS.md` adds page-owned timeouts/intervals with cancellation, callback
budgets and real guest argument identity. The identity-preserving SafeJS primitive
is documented in `SAFEJS-GUEST-REFERENCES.md` and filed upstream as #542. This
requires the explicitly rebuilt candidate; it does not upgrade the installed SDK.

`PAGE-CONSOLE.md` adds bounded, page-owned console diagnostics, severity-filtered
CLI reads and shared Console/HTML playground inspectors. Actual visual checks
pass; the HTML download's file-transfer gate is unverified because the test
browser disallows downloads. No policy was changed to bypass that restriction.

`HTML-CONTENT.md` adds contextual `innerHTML`, bounded HTML serialization and an
`html [target]` CLI/API command for the live tree. Inserted scripts stay inert;
full HTML fragment conformance and outerHTML replacement remain unfinished.

`DOM-FRAGMENTS.md` adds document fragments, shallow/deep node cloning and
root-scoped detached controls, exercised by actual page scripts and CLI actions.
Complete native cloning semantics remain unfinished.

`DOCUMENT-WRITE.md` adds bounded parser-integrated write/writeln and written
external scripts. Its checkpoint passes 983 browser tests. Real Books to Scrape now executes
its fallback loader. The later function-object checkpoint records the current
intrinsic blockers. Nested inline and post-parse writes remain unsupported.

`SCRIPT-LOADING.md` adds opt-in automatic classic scripts: parser-blocking,
deferred and async resource paths, shared native callbacks and lifecycle events.
Actual HTTP fixtures pass; Books to Scrape and Quotes to Scrape still fail script
compatibility and are recorded as failures, not dynamic-site successes. Default
automatic scripting remains off. This is not complete browser JavaScript support.

`PROCESS-CLI.md` documents opt-in process-backed CLI sessions and persistent manual
`eval`, with the same realm visible through the paired playground API. Sixteen
earlier actual-SDK CLI/API real-site checks pass. `PAGE-PROCESS.md` describes shared
DOM ownership, hard deadlines and idle
heartbeat supervision. Broader script loading and compatibility remain unfinished.

`NATIVE-SCRIPT-ACTIONS.md` records interpreted guest listeners driving native
controls, forms, keyboard and real-page link actions in explicit probes. The CLI
uses the new async action paths. Automatic scripts require the additional explicit
classic-mode selection documented in `SCRIPT-LOADING.md`.

Early browser core: owned sessions load plain text, JSON and a bounded HTML subset.
The original TypeScript parser supports real link/form workflows (`HTML.md`), but
website JavaScript, full HTML semantics and CSS rendering remain unfinished.
A bounded CSS visibility cascade now filters snapshots/actions and supports
guarded stylesheet loading and logical viewport changes (`CSS.md`). A partial executable CLI
now controls named sessions through a package-owned loopback service (`CLI.md`).
A real shared-session playground is available (`PLAYGROUND.md`). No new dependencies
have been added. `TASKS.md` contains the 72-hour milestones, security boundaries,
dependency decisions, real-site test plan and completion gates. The user-approved
existing Poe SafeJS runtime now has a tested experimental adapter (`JS-RUNTIME.md`);
it is not yet connected to website script execution. No new packages are installed.
An experimental live DOM binding now uses the separately extended SafeJS core
(`SCRIPT-DOM.md`). Explicit test scripts mutate real parsed pages and snapshots;
automatic website-authored script execution remains disabled.

Implemented foundations have 860 passing tests on Node: Playwright-style
argument parsing, a bounded document tree, stable references, snapshots/diffs,
terminal-safe text, guarded HTTP transport, isolated local/session storage,
bounded host-only cookie jars, native-control helpers, form serialization, event
propagation and control interactions, label activation, form reset, bounded DOM
queries, same-document history, cancellable session navigation and executable
named-session commands. Build,
typecheck and lint pass. `HISTORY.md` documents state/fragment traversal and 172
portable-core Bun checks. These do not enable Bun networking. `SELECTORS.md`
documents query scope and fixture resource measurements; `EVENTS.md` describes
the dispatch/action boundary. `SESSION.md` documents owned tabs, atomic document
replacement, cancellation and explicit document loaders. `HTML.md` documents the
default HTML loader, real-site evidence and remaining parser gaps. Page JavaScript
is still disabled. Native form submission now connects validation,
submit events and GET/POST navigation (`FORM-NAVIGATION.md`), with explicit gaps.
`FORM-ACTIONS.md` documents label/reset behavior and 73 focused passing Bun checks;
output reset, intrinsic FileList state and full native input semantics remain missing.
`KEYBOARD.md` documents focus/caret state, `type`, `press`, implicit Enter submission
and `fill --submit`, with 65 portable Bun checks and two public keyboard POST probes.
This remains a bounded native-control subset, not full keyboard/browser parity.
`COOKIES.md` documents redirect-aware cookie transport, 55 passing Bun cookie checks,
and conservative missing Domain/Partitioned/registrable-domain support.
The earlier portable-core Bun diagnostic has 161 passing checks and one failure in
Bun's independent multipart reader (missing uploaded filename). This failure
is preserved, not skipped; Node is the supported host.

The Node transport has DNS/address pinning, TLS hostname verification before
HTTP transmission, private-network policy, redirect handling, cancellation and
compressed-body quotas. Four real HTTPS sites pass transport-only probes; see
`reports/README.md`. This is not evidence of functioning website JavaScript or
browser actions. Bun networking is disabled after a local negative TLS test
exposed unsafe verification ordering; `NETWORK.md` documents the evidence.

Two public demo POSTs verify URL-encoded and multipart form payloads, including
file contents. An additional two demo POSTs verify event-driven control values
and a host input listener's mutation. Two further POSTs verify label activation,
reset defaults and subsequent refilling before serialization. Documents are constructed fixtures, not
parsed websites; they do not prove browser form submission. `STATE-FORMS.md` documents the
storage/control/serialization contracts and missing browser integration.
Four public cookie-session assertions pass using six requests: redirect setting,
persistence, isolated jars and deletion. No page JavaScript or HTML parsing runs.
Public RFC text and JSON now also load through the session into actual document
trees. Reload replaces the old tree; unsupported formats preserve the current page.
The session/history/text-loader core has 59 passing focused Bun checks; another
46 dispatcher/parser checks pass on Bun. The CLI/network host remains Node.
Eleven public CLI assertions pass across separate processes, including named
storage isolation, text/JSON navigation and complete test-service cleanup.
Fourteen end-to-end playground assertions pass at both desktop and narrow widths,
using real JSON/RFC documents and separate CLI invocations. The existing browser
service is only a UI test tool; it is not part of the new engine.
Two additional public demo POSTs now run through session click/requestSubmit and
load the echo JSON as a new document, verifying listener-updated values, explicit
multipart file contents and safe refusal to replay POST on reload. The controls
are constructed fixtures; this is not parsed-website form compatibility.
All 40 focused submission/core tests also pass on Bun without enabling its
unsupported networking adapter.

Cross-document back/forward now works through the session, CLI and playground,
preserving bounded JSON history state and keys while reloading fresh documents.
The history checkpoint's public CLI probe has 13 assertions and UI probe has 16, including
actual JSON/RFC traversal (`NAVIGATION-HISTORY.md`). BFCache, native page history
bindings, full lifecycle events and automatic POST replay are not implemented.
The 46 focused document/archive/session-history tests also pass on Bun.

The later HTML checkpoint has 17 passing public CLI assertions and 17 UI assertions
at desktop/mobile widths. Example Domain and Hacker News produce parsed semantic
content; a real Books to Scrape link is followed by ref and traversed back. A parsed
public httpbingo form submits synthetic values through native actions without adding
controls or bypassing validation. All 76 focused parser/decoder/form tests pass on
Bun, without enabling Bun networking. See `HTML.md` and `reports/README.md`.

Snapshots have byte/entry/depth/string budgets and targeted credential redaction.
Their role/label/visibility rules remain a subset, not a standards-complete
accessibility tree. Only the documented CLI subset executes. The playground now
provides text/snapshot inspection, navigation, session/tab controls, resource
counters and a quoted CLI input over that same API. Local CLI approval connects
each UI window without exposing the private service token. HTML/JS rendering,
exports and full Kitesurf playground parity remain missing.

## Development

From `~/project/agent-browser`, using the existing development tools:

```bash
npm run build
npm run typecheck
npm test
npm test -- src/playground-capture.test.ts
npm run lint
```

The default test command uses `native-tests.json`, an explicit native-fixture
allowlist. Public-site, socket, real-terminal and SafeJS probes are separate opt-in
checks; they are not run by `npm test`. Historical investigation documents describe
their original environments and authorization requirements.

Build first; package exports point to compiled ESM/declarations in `dist/src`.
The already-installed development tooling was copied offline. No new runtime
dependency, registry download or link back to the automations workspace is added.
