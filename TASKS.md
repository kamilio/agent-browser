# Agent browser: 72-hour implementation tasks

Started: September 1, 2026, approximately 14:58 UTC.
Work window: through September 4, 2026, approximately 14:58 UTC.
Status: active; foundation work, not a completed browser.

Scope additions confirmed by the user: cover all Kitesurf features, provide a
playground comparable to `https://kitesurf.cloudflare.app/`, and make the agent
interface a Playwright-CLI-like superset. `COMPATIBILITY.md` is the explicit
feature ledger. "Better than curl" is the first milestone, not the final gate.

## Latest checkpoint

September 2, capability-construction checkpoint: `PageBindings` now constructs
the browser's native capabilities through a narrow context, independently of SDK
realm creation, evaluation, Budget and error constructors. `PageScripts` keeps its
existing public behavior while delegating this setup and cleanup. Both timer
surfaces now use returned retention registrations. Partial setup failure revokes
constructed capabilities; guest shutdown preserves native document interactions.

954 tests pass across 43 files, including twelve construction/lifecycle cases.
Seven actual experimental-core binding checks pass, plus the 19 storage/event,
21 navigation, 24 fetch/CORS and 14 class-list regressions. This advances the
released-SDK migration structure without claiming that migration has run. No
dependency, SDK patch/download, live-site/PTY run or service activation was added.

September 2, released-SDK probe preparation: a separate public-extension consumer
now requires an explicit local `@poe-platform/safe-js` artifact and exact version.
It prepares callback-phase, guest-retention, host-property, nested-operation and
cleanup gates without silently selecting the old experimental core. See
`SAFEJS-UPSTREAM-MIGRATION.md` for the command and remaining adapter differences.

942 tests pass across 42 files, including 24 release-loader selection tests.
The compiled probe is verified to exit nonzero and report zero completed checks
when no artifact is selected. These are loader/failure-path tests, **not released
SDK acceptance**. No package download, install, live-site/PTY execution or browser
runtime switch occurred. The previously denied download still needs permission;
upstream implementation/source observations are not a substitute for that gate.

September 2, class-list checkpoint: classList is now live and identity-preserving,
with bounded token mutation, value forwarding, indexing and iteration. Attribute
changes update the same native selectors/CSS/snapshots/actionability state. The
actual interpreter fixture reveals, activates and re-hides an action through
native agent clicks without another response. Atomic validation, resource limits,
cache reuse/recovery and old-owner revocation are tested in `CLASS-LISTS.md`.

918 tests pass across 41 files, including 35 class-list cases. Fourteen actual
interpreter checks pass, as do the earlier 19 storage/event, 21 navigation and
24 fetch/CORS checks. Strict compilation, formatting and diff checks pass.

DOMTokenList iterator helpers/prototypes and exception/coercion parity remain
incomplete. No SDK patch, dependency, native engine, live/PTY probe or service
activation was added. Full framework and broader browser acceptance remain open.

September 2, storage-event checkpoint: successful native mutations now capture
change records and notify eligible documents through a bounded session queue.
Source exclusion, origin/tab isolation, event-area identity, candidate commit,
cancellation, no-op suppression and capacity/lifetime limits are tested. The
actual SafeJS todo fixture now rerenders a second tab after an agent action in the
first, without reloading or fetching another response. `STORAGE-EVENTS.md` records
the contract, resource drops and explicit administrative-write semantics.

723 tests pass across 37 files. The coordinator/observer suite has thirteen cases;
the page-storage integration suite has thirty. Typechecking and formatting pass.
Nineteen interpreted storage/event workflow checks pass, as do the 21-check
navigation and 24-check fetch/CORS regressions.

Evidence uses in-memory responses and the existing experimental core. No new
dependency, SDK modification, live/PTY probe or service activation was added.
Named Storage properties, full scheduler/event conformance, frames, released-SDK
migration and the broader browser acceptance gates remain open.

September 2, page-storage checkpoint: parser/realm-owned localStorage and
sessionStorage methods now use the existing native stores, and document.cookie
uses the existing jar with HttpOnly protection. Origin/tab/session isolation,
opener copying, quotas, state import and revocation are tested. An actual SafeJS
todo fixture supports agent add/toggle/remove and reload persistence; it is our
own fixture, not public TodoMVC/framework acceptance. See `PAGE-STORAGE.md`.

707 tests pass across 36 files; twelve actual-interpreter workflow checks pass,
with the named-write gap recorded separately rather than counted as a feature.
The 21-check navigation and 24-check fetch/CORS interpreter regressions also pass.

Named Storage writes were tested and do not persist in the experimental core.
Current upstream named providers are read-only; enhancement #549 was filed and
its exact body verified, with no Proxy/state-mirror workaround. #547 was verified
closed with upstream release 0.1.36, but local released-package migration is still
unverified. Storage events, named properties, broader compatibility and denied
live/PTY gates remain open. No new dependency or service activation was added.

September 2, Location-navigation checkpoint: methods, Window/document setters and
URL components now use owned navigation; same-resource fragment URLs change
synchronously with deferred events. Cross-document replacement preserves adjacent
entries, and parser pushState branching discards forward history. Queue admission,
archive budgets, cancellation, policy, candidate retirement and diagnostics are
shared with guest History work. `PAGE-URLS.md` records the exact partial contract.

615 passing tests across 33 files are in `page-navigation-focused-2026-09-02.json`;
21 actual existing-core checks are in `page-navigation-safejs-fixture-2026-09-02.json`.
No new dependency, SDK modification, live connection, PTY or service activation.
Bare global Location assignment, full browser scheduling/component semantics,
released-SDK migration and denied live acceptance gates remain open. The 72-hour
goal is still active and the full requested browser is not complete.

September 2, guest-traversal checkpoint: History back/forward/go now queue owned
session navigation rather than rejecting or using only the local document list.
Parser requests wait for commit, current event dispatch finishes before traversal, and
retired/failed sources lose queued work. Stop/explicit navigation cancel requests;
per-tab pending/lifetime bounds and existing session/network policies apply.
Metrics and sanitized navigation-console records expose asynchronous outcomes.

592 tests pass across 32 files; eleven existing-core SafeJS checks exercise actual
interpreted back/forward/reload, cross-document parser requests, restoration and
cancellation over in-memory responses. No dependency, SDK change, live network,
service activation or previously denied gate was added. Location navigation,
complete task semantics, full cloning/identity and the full browser goal remain
unfinished. `PAGE-HISTORY.md` records the implemented contract and limitations.

September 2, page-History checkpoint: `PAGE-HISTORY.md` adds session-owned finite-JSON
state, push/replace methods and session-wide length to interpreted pages. Document
initialization restores state before parser scripts; reload/back branches retain
or discard forward documents correctly. Candidate initialization is idempotent,
validated and cleaned up on failure/cancellation without harming the old page.

Same-document traversal now delivers interpreted popstate/hashchange data in
prefix order; canceled event waits release the history queue. 557 tests pass
across thirty files, plus thirteen actual experimental-core SafeJS fixture checks.
No new dependencies, SDK changes, real network, service activation or previously
denied gates are involved. Guest traversal, Location navigation, complete cloning
and state identity remain open; the original full browser goal is unchanged.

September 2, page-URL checkpoint: `PAGE-URLS.md` records shared live Location
reads, DOM baseURI and reflected hyperlink/resource URLs. Interpreted code can
inspect the actual document URL and change a link's destination before the owning
browser follows it. Same-document navigation preserves the realm; replacement
revokes it. Location writes fail explicitly rather than pretending to navigate.

356 tests pass across twenty files; fifteen existing-core SafeJS checks verify
the real interpreter, DOM and navigation over in-memory responses. No dependency,
SDK change, service activation or denied live gate is involved. History and
Location-triggered navigation remain open; the document records the required
loader/session ownership integration instead of misrepresenting document-only
history as full browser history. The full browser goal remains incomplete.

September 2, redirect-mocking checkpoint: route fulfillment now accepts a single
Location header. Entirely mocked redirect chains use the native driver's method,
URL, deadline and resource policies; interpreted fetch retains per-hop CORS and
manual/error behavior. Duplicate Location declarations fail atomically. Adapters
without native route-aware redirects reject automatic mocked navigation rather
than committing a redirect body or silently falling through to the network.

290 tests pass across fourteen files; twenty-four existing-core SafeJS fixture
checks pass with in-memory transport. No dependencies, released-SDK verification,
service changes, public websites or previously denied live gates are involved.
Routing remains partial and the full browser goal remains incomplete.

September 2, native routing checkpoint: the Node adapter now offers the optional
`requestWithRoutes` transport capability. Session rules are checked inside the
existing redirect driver before DNS/exchange, preserving its policy, cookie,
method/body and lifetime handling. Mock bodies share transport byte budgets;
mock-only metric subsets distinguish them. Synchronous route work also receives
an absolute elapsed-time check. Other adapters retain the safe manual fallback.

284 tests pass across fourteen files, including twenty-one native-driver cases
with mocked DNS/wire exchange, real in-memory stream consumption, and actual
session HTML loading. Strict package/new-test compilation and formatting pass.
No live HTTP/TLS/site, service activation, dependency or SDK migration is claimed.
The full browser and previously denied live acceptance gates remain incomplete.

September 2, routing checkpoint: `ROUTING.md` adds session-owned route fulfillment,
listing and removal. Matched requests receive bounded replacement content without
calling the transport; the journal/Network pane records route IDs. Actual HTML,
stylesheets and interpreted JSON fetch use these responses in memory. URL matching
uses our bounded state machine. Rule matching/delivery failures cannot fall back
to the network, and automatic transport redirects fail closed while rules exist.

263 focused tests pass across thirteen files. Twenty existing-core SafeJS checks
also cover routed CORS responses, manual redirect hops and removal. No dependency,
SDK migration, service activation or previously denied live acceptance was added.
Header rewriting, binary/redirect/cookie mocks and full routing parity remain open;
the full browser goal is unchanged and incomplete.

September 2, 15:35 UTC: filed and verified poe-code #547 for explicit public
callback synchronous-prefix completion, separate from final async settlement.
The Markdown issue body matches GitHub. An in-memory probe against the existing
experimental public core passes eight contract checks, including pending-tail
listener progress, sync/async failures and close cancellation. This is not
released-SDK verification; the issue clearly requests API guidance/enhancement
rather than claiming a reproduced release defect. No completed issue was reopened.
`SAFEJS-UPSTREAM-MIGRATION.md` records the remaining integration and release gates.

September 2, CORS diagnostic checkpoint: page fetch reports per-hop permission
outcomes through a trusted observer to the owning navigation journal. HTTP
completion remains distinct from CORS permission, including a successful 204
preflight that prevents the actual request. CLI/API details and playground text
show the separate result. One-shot bounded annotations cannot revive evicted or
closed records; observer failures do not change fetch policy.

228 tests pass across twelve files, and sixteen existing-core SafeJS fixture
checks pass with in-memory transport. Package and changed-test strict compilation
pass. No dependency, SDK migration, public network, server, PTY, service restart
or upstream publication is involved. Published-SDK and denied live acceptance
gates remain outstanding; the full browser goal is not complete.

September 2, upstream migration audit: the authenticated GitHub API confirms
#540–#546 are closed. `SAFEJS-UPSTREAM-MIGRATION.md` records the inspected public
API at `3192ef3c52ea16f7b31704a70e75497049516787` and the integration gates.
Our installed SDKs are older; no released artifact was downloaded or tested.
Migration is not a package-name-only change: capability setup, tagged results,
lifetime cancellation and callback dispatch phases need explicit adaptation.
The public callback API exposes final completion, not the browser's separate
synchronous-prefix handle. Verify that boundary before replacing the adapter.
Previously denied download and live acceptance actions remain unperformed.

September 2, approximately 05:08 UTC: `PAGE-CORS.md` extends page fetch with CORS
response permission, unsafe-header/method preflights, exposed-header filtering,
credential-sensitive wildcards and redirect state. Origin-changing redirects strip
Authorization; tainted chains serialize Origin as null and do not restore default
cookies when returning to the original origin. Preflights share deadlines/body
bounds and cannot send the later request after permission denial or cancellation.

215 tests pass across eleven files; fifteen real-SafeJS mock-transport checks
include cross-origin PUT/preflight/JSON/DOM and denied-DELETE behavior. Strict
package and changed-test builds pass; Biome checks 168 files. No dependency, SDK
change, server, PTY, child-process/public-site probe, activation or publication.

The journal distinguishes preflight attempts but does not yet attach CORS response
visibility outcomes to completed HTTP entries. Permission caching, broader CORS
conformance, XHR/signals/streams and actual wire/multi-origin/site acceptance remain
open. Denied live gates were not rerun via another route. Full goal stays active.

September 2, approximately 04:58 UTC: `PAGE-FETCH.md` adds a document-owned fetch
port and bounded same-origin fetch/Response capabilities to configured SafeJS
page runtimes. The global and Window binding share ownership, cookies remain
host-controlled, redirects are checked hop by hop, response headers exclude
Set-Cookie, and consumption/cloning/deadlines/close release bounded body retention.
The request journal records fetch hops. CSP fails closed rather than being bypassed.

198 focused tests pass across ten files; ten real-SafeJS mock-transport checks
prove parsed script → Promise/JSON → interpreted callback → current DOM plus
pending-fetch cancellation without transport cooperation. Strict package and
changed-test builds pass; Biome checks 166 files. This reuses existing public
SafeJS hooks without changing the SDK or adding dependencies. No new server,
PTY, child-process/site probe, service activation or publication was performed.

This is an implementation stage, not reduced completion criteria. Next required
network work includes CORS/preflights/redirect tainting, XHR, iterable/constructor
APIs, guest signals, binary/streaming and real wire/multi-origin/site acceptance.
Previously denied gates remain unverified and were not rerun by another route.
The full 72-hour browser/playground/Playwright-superset goal remains active.

September 2, approximately 04:45 UTC: `NETWORK-JOURNAL.md` adds bounded redacted
metadata for document/script/stylesheet requests, CLI/API `requests` and
`request <index>`, and the playground Network pane. Journal ownership is explicit:
the latest network attempt per tab, including failures that retain the old page.
Same-document navigation retains the log; supersession, abort and close cannot
reintroduce late entries. Headers/bodies are not retained; paths are not generally
secret-scrubbed. The real HTML loader is exercised through an in-memory adapter.

The focused journal/session/command/parser/playground/mock-actor suite records
130 passes across six files. Strict package and changed-test builds pass; Biome
checks 163 files. No new dependency, SDK change, server, PTY, subprocess/site probe,
service activation or upstream publication. New live UI/CLI/site acceptance is
unverified; previously denied gates were not rerun through another route. Full
network traffic, fetch/XHR, interception and original superset scope remain open.
The 72-hour goal remains active.

September 2, approximately 04:32 UTC: `EXTRACTION.md` adds `extract [target]`
with Markdown or typed JSON-tree output from the current retained document.
Both formats carry stable refs and live metadata, enforce byte/node/depth bounds,
exclude field values and executable/hidden content, and filter link destinations.
Extraction neither fetches again nor consumes snapshot diff baselines. Empty
items, nested lists/quotes, code fences, URL entity escaping and inline flow have
regression coverage; documented structure/style limitations remain.

Ninety-five focused tests pass across five files, including 14 extractor cases;
strict package/changed-test builds and the 161-file Biome check pass. Seven checks
using the actual selected SafeJS interpreter verify script-created content and
later native-action callback mutations in memory. Two Bun public-core fixture
checks pass too. These create no HTTP server, PTY or browser service and are not
a substitute for denied public/terminal acceptance. New separate-CLI and download
gates remain unverified. No dependency, SDK, service activation or publication
changes. The original full browser/playground/superset goal remains active.

September 2, approximately 04:15 UTC: the terminal now wraps long entries,
scrolls by displayed rows and supports literal forward/backward search, including
multiple matches inside one entry. Stable action refs survive scrolling; character
anchors survive resize and unchanged observer refreshes. Protected values stay
out of the projection/search. Row metadata is per entry rather than per displayed
row, so a one-column million-row document does not require a million row objects.

Eighty focused tests pass across four files (27 terminal cases); strict package
and changed-test builds pass, and Biome checks 158 files. Three local synthetic
projection/resource cases pass bounded-frame, readable-tail and search checks.
They are not real browser, TTY, network or JavaScript compatibility measurements.
The denied real PTY/site gate remains unverified and is not rerun by another route.
No new dependencies, SDK edits, service activation or publication. Full terminal,
playground and engine compatibility scope remains active.

September 2, approximately 04:08 UTC: `TERMINAL.md` adds the `terminal [url]`
frontend for an existing named session. It projects stable semantic references,
supports keyboard link/form actions, URL entry and history, and observes agent
changes without consuming snapshot diffs. Bracketed paste cannot trigger hotkeys;
protected prompts, output escaping, bounded redraw/backpressure and detach cleanup
have focused tests. Native API request cancellation is additive.

Seventy focused tests pass across four files, including 17 terminal cases.
The separate API/server suite passed 19 tests, including explicit cancellation.
Strict package and changed-test compilation pass, and Biome checks 157 files.
The actual CLI/PTY/local-form/public-site probe is implemented but **not run**:
approval review denied its actual PTY, filesystem, loopback and session mutations
under the workspace dry-run rule. This is not real-terminal or site acceptance.
Two formatter command groups remain tracked after stdin stalls; stopping the
first group was denied. They are not claimed stopped; a regular-file-input
formatting pass completed without touching their processes.

No dependencies, SDK edits, services, commits, pushes or upstream publication.
Next: explicit permission for the real terminal acceptance gate, then remaining
terminal usability, playground and engine compatibility. The broader goal stays
active; the existing full scope is not reduced to this frontend.

September 2, approximately 03:53 UTC: `SAFEJS-COOPERATION.md` records cooperative
AST checkpoints that keep the guest job owned while allowing host deadlines and
heartbeats to progress. The source timeout, step/data bounds and process watchdog
are unchanged. Script shutdown now preserves native document interactions;
native navigation recovers a timed-out realm in the same actor. Failed realm
initialization also releases Date ownership before Budget reuse.

SDK focused/full runs pass 73/8104 tests; the existing 30 failed assertions,
54 failed files and six skips have identical failure identities. Browser tests
pass 1128/65 files, event-focused tests 70, strict builds and Biome 152 files.
All 46 automatic-script probe checks pass. Books/Quotes navigate in 1551/1479 ms
and remain readable, but both scripts time out: this is responsiveness and native
recovery, not dynamic-site compatibility. Timer/CLI checks pass 17/22.

No dependencies or production limit relaxation. Performance publication remains
paused; the separately tracked obsolete test process is not claimed stopped.
Next: remaining throughput and intrinsic gaps, extension lifecycle and the
original terminal/playground/Playwright-superset ledger. The 72-hour goal remains
active. Earlier checkpoint failures below remain historical evidence.

September 2, approximately 03:32 UTC: `SAFEJS-DATE.md` adds guest-owned timestamps,
realm-owned prototypes, calendar operations, coercion/JSON and explicit clocks.
Run current-time reads use the existing journal so completed reads replay without
re-reading the host clock. No native constructor/prototype is exposed to guest
code; temporary host calendar primitives remain an explicit implementation choice.
Date snapshots/copies and locale formatting reject instead of losing state.

Twenty-two new SDK tests pass; focused Date/random/JSON and Date/regex-boundary
runs pass 71 and 56 tests. The verified full SDK has 8089 passes and exactly the
prior 30 failed assertions/54 failed files, with six skips. An intermediate
snapshot regression was fixed; the legacy regex fixture now expects the additive
default Date binding while preserving its exact hash/graph checks. Browser tests
remain 1126/65, strict core/new-test/package builds pass, and Biome checks 152 files.
The combined contribution patch is refreshed and applicability-checked.

Forty local owned-process script checks pass, including Date state updated by a
native click. Both public diagnostic scripts pass their Date sites: Books reaches
String.replace coercion at offset 35950 (3301 ms), and Quotes reaches missing
Object.defineProperty at offset 30470 (8531 ms). **Both production navigations
fail the unchanged heartbeat**, at 2010/2011 ms. These are not successful public
dynamic-site gates. Timer/CLI checks pass 17/22; probe actors/services close.

No dependency, installed SDK, production bound, commit, push or upstream
publication changes. The detailed performance publication remains paused. One
obsolete first full-suite test process remains separately tracked after its
termination request was denied; it is not claimed cleaned up or used as final
verification. Next: remaining accounting/scheduling, descriptor/coercion gaps,
Date snapshot support and the original terminal/playground/superset ledger. The
72-hour goal stays active.

September 2, approximately 03:13 UTC: local retained-graph optimization preserves
primary memory checks, mutable children/prototypes and compile ownership while
reusing immutable shapes/descriptors and same-scope capture enumeration. Nineteen
new deterministic regressions pass; the focused SDK run passes 25 tests. The full
SDK has 8067 passes, with exactly the preceding 30 failed assertions/54 failed
files and six skips. Browser tests remain 1126/65, strict builds pass, and Biome
checks 152 files. The combined contribution patch is refreshed and verified
against the exact base (`SAFEJS-EXTENSIONS.md`).

Separate Books diagnostics drop from 8926 ms to observed 3424–4048 ms, but owned
navigation still fails the unchanged two-second heartbeat at 2009 ms. Both sites
still reach missing Date; automatic-site acceptance remains failed. Production
script probes pass 38 local checks plus one public reporting check. Timer checks
pass 17; CLI/paired API checks pass 22. Owned actors and temporary services close.
`SAFEJS-RETENTION-PERFORMANCE.md` distinguishes deterministic scan
work from variable timing evidence. No new dependency, installed SDK edit,
production limit change, upstream publication, commit or push. Performance issue
publication remains paused. Next: remaining cost/scheduling, Date and the original
terminal/playground/Kitesurf/Playwright-superset ledger. Goal stays active.

September 2, approximately 02:51 UTC: `DOM-ATTRIBUTES.md` adds document-owned
Attr identity, live named/indexed maps, value mutation, replacement/detachment and
script APIs. Browser tests pass 1126 cases across 65 files. The new generic SafeJS
named capability is filed as #546 (`SAFEJS-NAMED-HOST-OBJECTS.md`); nineteen new
SDK tests pass, with 8048 full-suite passes and exactly the prior 30 failed
assertions/54 failed files. The lightweight public core and new tests compile
strictly; the combined patch is refreshed and applicability-checked.

The automatic process probe passes 38 local fixture checks plus one public
reporting check. Quotes still stops at Date. Books repeatedly fails the unchanged
two-second heartbeat (2009 ms measured), so it does NOT pass owned navigation.
Separate diagnostics reach +new Date after about 8.9 seconds of evaluation.
Profiling identifies retained-graph accounting as the hot path; a minimal
public-core benchmark reproduces scaling without DOM/network/getter execution.
`SAFEJS-RETENTION-PERFORMANCE.md` preserves the evidence. Approval review denied
publishing that detailed performance report; no performance issue was created.
The Date evidence was added to #543 through an approved comment. Timer and CLI/API
regressions pass 17 and 22 checks, with owned actors/services closed. No new
dependencies, installed SDK changes, production limit changes, commits or pushes.
Next: bounded efficient accounting, effective scheduling, Date and the original
feature ledger. The complete 72-hour goal remains active, not narrowed to these
partial DOM/SDK additions.

September 2, approximately 02:28 UTC: `INLINE-STYLES.md` adds bounded, live
element.style declarations backed by real attributes. The browser owns parsing,
priority/shorthand handling, mutation and visibility invalidation; the existing
SafeJS public indexed capability supplies enumeration, with no SDK modification
or new dependency. Thirteen native-reference cases anchor 28 new tests. All
1115 browser tests across 63 files pass, with strict package/new-test compilation
and the configured 148-file Biome check. Automatic owned-process script checks
pass 37 assertions, including three new style/action/snapshot checks and two
public reporting checks. Books advances to missing DOM attribute objects at
`d.attributes[c].expando`; Quotes still needs Date (#543). Neither passes public
automatic JavaScript acceptance. Full CSSOM, getComputedStyle, layout and the
original terminal/playground/superset gates remain open. No installed SDK, live
service, dependency, commit or push changes. The reference session/server and
owned probe actors close. Next: DOM attributes, Date and the feature ledger.
The complete 72-hour goal remains active; this is another partial checkpoint.

September 2, approximately 02:06 UTC: tag/class queries and children now expose
live indexed collections with shared element identity (`LIVE-COLLECTIONS.md`).
The generic SafeJS indexed capability is implemented locally and filed as #545
(`SAFEJS-INDEXED-HOST-OBJECTS.md`), without native proxies or eager per-index
bindings. Browser tests: 1087 passes across 62 files; strict checks and Biome pass.
The final SDK has 8029 passes, retaining exactly the prior 30 failed assertions
and 54 failed files; 17 indexed tests are new. Final public-core probes pass
34 website-script checks, 17 timer checks and 22 executable CLI/paired-API checks.
Books advances to missing element.style.cssText; Quotes still needs Date (#543).
Both remain incompatible. Named properties, live NodeList, collection prototypes,
full DOM/CSSOM and all original terminal/playground/superset gates remain open.
The contribution patch is refreshed and applicability-checked. No dependencies,
installed SDK, live services, commits or pushes are changed. Next: style/CSSOM,
Date and the original feature ledger. The complete 72-hour goal remains active.

September 2, approximately 01:47 UTC: realm-owned Object intrinsics now support
cached type inspection and ordinary/null prototype reflection
(`SAFEJS-OBJECT-PROTOTYPE.md`). The 33 new SDK tests include native comparisons,
isolation, retained budgets and dump boundaries. Final native-config SDK results:
8012 passes, with exactly the same 30 failed assertions and 54 failed files as
the preceding checkpoint. Browser suite: 1075 passes; strict checks and Biome pass.
Final public-core process probes pass 30 website-script, 17 timer and 22 executable
CLI/paired-API checks. Both public sites remain incompatible: Books advances to
missing DOM getElementsByTagName; Quotes still needs Date (#543). The combined
patch is refreshed and applicability-checked. Object's dump binding intentionally
changes from namespace to constructor; intrinsic state serialization is limited.
No dependencies, installed SDK, live services, commits or pushes are changed.
Next: live DOM collection/query support and Date, while retaining all original
terminal/playground/superset acceptance gates. The complete goal remains active.

September 2, approximately 01:30 UTC: guest function properties, constructor
prototypes and bounded inheritance now work in the isolated public SafeJS core
(`SAFEJS-FUNCTION-OBJECTS.md`). Automatic page fixtures and native clicks exercise
the feature. The browser suite passes 1075 tests; 29 website-script, 17 timer and
22 actual CLI/paired-API checks pass. Strict package compilation and Biome pass.
The SDK adds 22 passes (7979 total), retaining exactly the same 30 failed
assertions and 54 failed files; the upstream gate remains non-green. Legacy
restoration-test type diagnostics are unchanged in an explicit baseline comparison.
The combined patch is refreshed and applicability-checked against the pinned base.
Real Books/Quotes scripts advance but still fail at Object prototype inspection
and Date respectively. Upstream #543/#544 are filed and verified open; #540's
extension lifecycle remains unfinished. No dependencies, installed SDK or live
services are changed. Next: upstream handoff and these intrinsic gaps, then the
remaining terminal/playground/Playwright-like superset ledger. Full goal active.

September 2, approximately 01:03 UTC: page-owned timeouts/intervals now support
cancellation, async callback phases, bounded cumulative work and real argument
identity (`PAGE-TIMERS.md`). Actual testing found the ordinary SafeJS host bridge
copied guest arguments; the generic opaque-reference fix lives in the public SDK
candidate, not in private browser imports (`SAFEJS-GUEST-REFERENCES.md`). Upstream
#542 is filed and verified open; #540's composable lifecycle is still unfinished.
The combined contribution patch passes applicability checks against the pinned
base. No dependencies or installed SDK were changed.

The final browser suite passes 1075 tests across 61 files. Strict package/changed
test compilation and the 143-file Biome check pass. Seventeen actual timer-process
checks (15 automatic fixtures plus two controlled public-document evaluations),
22 executable CLI/paired-API checks, and 27 website-script regression checks
(25 fixtures plus two public reporting checks) pass. Books' bounded full text
omits the appended marker, so the timer probe uses a scoped semantic snapshot and
records full-text truncation separately. Owned actors and the isolated CLI service
are closed. No new visual UI run is claimed. Public Books/Quotes automatic scripts
still fail compatibility; controlled timer injection is not dynamic-site acceptance.

The native-config SDK suite passes 7957 tests, with the same 30 failed assertions,
six skips and 54 failed files as the prior checkpoint, verified by report comparison.
Eleven reference tests are new passes; the upstream gate is not green. Next:
review upstream lifecycle/function-object progress and continue browser globals,
network APIs and the original terminal/playground/superset feature ledger.
The full 72-hour goal remains active, not reduced to this timer milestone.

September 2, approximately 00:39 UTC: bounded page-console diagnostics and shared
Console/HTML playground inspectors are implemented. `PAGE-CONSOLE.md` records
capture, filtering, ownership, sanitized failures and limits. The browser suite
passes 1059 tests across 60 files; strict package/test compilation and the
configured 140-file Biome check pass. Twenty actual executable CLI/paired-API
checks, 25 owned-process fixture checks plus two public reporting checks, and
21 watchable UI checks pass. The screenshot was visually inspected. HTML export
requests are implemented, but actual downloaded-file transfer remains unverified:
the observer service prohibits downloads. No access policy was bypassed. Both
public Books/Quotes sites still fail automatic JavaScript compatibility; these
reporting checks are not dynamic-site acceptance. The owned observer session and
isolated service are closed. #540/#541 remain open; no upstream implementation
handoff was verified. No dependencies or SafeJS source changes in this checkpoint.
Next: browser globals/lifecycle and the full terminal/playground/API feature ledger.
The full 72-hour goal remains active.

September 2, approximately 00:13 UTC: contextual HTML fragments, atomic innerHTML
replacement, bounded serialization and the additive `html [target]` command are
implemented. `HTML-CONTENT.md` records contexts, ownership and incomplete parser
semantics. The final browser suite passes 1046 tests across 59 files, including
actual separate CLI invocations and colgroup/BOM/comment regressions. Strict
compilation and the configured 138-file Biome check pass. The owned-process probe
passes 21 fixture checks plus two public reporting checks; the actual executable
CLI/paired-API probe passes 18 checks on public documents and isolated state.
These include real HTML extraction after controlled DOM edits, not dynamic-site
acceptance. Automatic Books/Quotes scripts still fail compatibility. Inserted
innerHTML scripts remain inert and make no script-resource request. #540/#541
were checked and remain open. No dependencies, SafeJS source, production services,
commits or pushes changed. Next: broader HTML/native-DOM conformance and missing
browser globals/lifecycle, alongside the original terminal/playground/API ledger.
The full 72-hour goal remains active.

September 1, approximately 23:57 UTC: document fragments and shallow/deep node
cloning now work through the actual page-owned SafeJS process. `DOM-FRAGMENTS.md`
records ordered child transfer, clone identity/listener separation, aggregate
budget preflights, document-child validation and detached control-root indexing.
The browser suite passes 1004 tests across 57 files; strict package/test compilation
and the configured 134-file Biome check pass. Eighteen actual-process fixture
checks plus two public reporting checks pass. Both public sites still fail dynamic
JavaScript compatibility; no fixture or reporting assertion is counted as site
acceptance. Upstream #540/#541 were checked and remain open without an implementation
handoff. No dependencies, SDK source, production services, commits or pushes changed.
Next: HTML fragment parsing/innerHTML and full native clone semantics, while
continuing the original terminal/playground/API parity and real-site gates.
The full 72-hour goal remains active.

September 1, after the upstream handoff: parser-integrated write/writeln now
supports bounded synchronous markup insertion and written external scripts.
`DOCUMENT-WRITE.md` records 983 passing browser tests, strict compilation/style
checks, and fourteen actual owned-process fixture plus two public reporting
assertions. Prepared written scripts retain their original base/URL/attributes
even if the caller changes or detaches them. Books now executes its fallback and
loads real jQuery, then reaches the same function-object blocker as Quotes (#541).
Neither site passes dynamic compatibility. Nested inline and post-parse writes
remain explicitly unsupported; controlled nested evaluation is requested under
#540. No dependency or installed SDK changes. Next: review upstream progress,
continue browser globals/lifecycle and the full terminal/playground feature ledger.
The 72-hour goal remains active, not reduced to this parser milestone.

September 1, after the 23:09 checkpoint: metered numeric regex backreferences and
lookahead now pass 66 new tests; two older unsupported-feature cases are replaced.
The regex directory passes 190 tests. The full SDK run adds 64 net passes (7946),
with the same 30 fixture failures, six skips and 54 failed file paths. Real jQuery
now parses, then fails at guest function properties/prototypes. Books still needs
document.write. Thirteen owned-process fixture/public-reporting checks still pass;
neither real site passes dynamic-script compatibility.

The user authorized upstream issue filing: `poe-platform/poe-code#540` requests
the public extension/persistent-realm API; #541 requests guest function properties
and constructor prototypes. Both were verified open. `SAFEJS-EXTENSIBILITY.md`
records the handoff, and `upstream-issues/` preserves the published bodies.
The draft extension acceptance tests are preserved separately and are not applied
or counted as implemented. Next: browser-side parser-integrated document.write,
while reviewing upstream progress instead of duplicating its extension framework.
No dependency, installed SDK, PR, commit, push or package publication changes.
The original browser/terminal/playground scope and 72-hour goal remain active.

September 1, approximately 23:09 UTC: actual public-script diagnostics isolate
three concrete compatibility gaps. SafeJS now accepts omitted constructor
arguments and consumes single-statement terminators correctly, including unbraced
do/while and nested if/else. All 37 new TDD cases pass; the parser directory passes
589 tests. The broad SDK suite adds 37 passes (7882 total), with the same 30 fixture
failures, six skips and 54 failed files; no dependencies are installed. Unmodified
public jQuery advances past both errors and now fails on regex backreferences;
Books to Scrape requires document.write. The owned-process loader retains eleven
passing HTTP-fixture checks and two public reporting checks, not passing dynamic
site acceptance. All 962 browser tests, strict package/new-SDK-test compilation
and the 131-file configured style check pass. Next: bounded numeric regex
backreferences and genuine parser
insertion for document.write. Contribution changes remain an unapplied upstream
candidate; no issue, PR, publication or installed-package change. Goal active.

September 1, approximately 22:58 UTC: `SCRIPT-LOADING.md` adds explicit automatic
classic mode inside owned processes. Parser advancement and execution share a
queue; blocking/deferred/async scripts, early native page ownership and basic
readiness/load events are integrated. All 962 browser tests and eleven actual
HTTP-fixture checks pass;
Books to Scrape and Quotes to Scrape expose recorded script-compatibility failures.
Sixteen earlier manual CLI/API real-site checks still pass. New regressions cover
post-parse failure cleanup, detached prepared scripts and URL capture before fetch
slot waits. Next: diagnose genuine site execution failures, then improve DOM,
source-error recovery, microtask fidelity, browser globals and module loading.
No dependencies or installed SafeJS changes; the goal remains active.

September 1, approximately 22:38 UTC: opt-in `AGENT_BROWSER_SAFEJS_ROOT` service
mode now routes actual CLI and paired playground API commands through one owned
process per named session. `PROCESS-CLI.md` records thirteen lifecycle/router
cases, asynchronous service cleanup, shorter external CLI deadlines and metadata
discovery from the running service. All 942 browser tests pass, along with sixteen
actual compiled-SDK CLI/API real-site checks and nineteen default-mode CLI checks.
No dependencies or installed SDK changes. Automatic page-script loading and full
lifecycle/dynamic-site acceptance remain the next substantive gates.

September 1, approximately 22:25 UTC: `PAGE-PROCESS.md` records one persistent
realm per document and an explicit owned-session process API. The entire native
session and DOM live with the interpreter, avoiding duplicated parent/child DOMs.
Hard command deadlines and independent idle heartbeat supervision terminate only
the affected actor and settle after confirmed exit. Eighteen actual compiled-SDK
real-site checks pass, as do 925 browser tests and 58 focused SafeJS source tests.
The contribution candidate also exposes safe structured-result copying through
the lightweight public core. No dependencies or installed SDK changes. CLI/server
process routing, automatic script loading and real dynamic-site acceptance remain
next gates; this is not browser-parity completion.

September 1, approximately 22:01 UTC: native fill/selection/check/click, focus,
keyboard and form actions now share sync/async event-step sequences. Sessions and
CLI commands use the async path. `NATIVE-SCRIPT-ACTIONS.md` records 908 passing
browser tests, seventeen actual compiled-SDK fixture/real-site checks and nineteen
passing actual CLI checks. Real native link clicks honor guest cancellation and
guest-rewritten fragments. A real-site shutdown failure exposed history archival
depending on live events; that root cause is fixed with five regression cases,
including refusal to silently resubmit stopped POST history. No new dependencies
or installed SDK changes. Process-owned page realms, script loading, complete
event-loop fidelity and dynamic-site performance remain next gates.

September 1, approximately 21:46 UTC: actual guest node add/removeEventListener
bindings now drive the owned dispatcher, with live event identity, once/passive
semantics, explicit input/keyboard/focus/submit fields and bounded async errors.
Trusted realm state aborts fatal dispatch; guest-spoofed error codes do not.
`SCRIPT-EVENTS.md` records 885 passing browser tests and forty compiled-core
fixture/real-site checks. The initial deliberate-loop timeout remains recorded;
bounded callback profiling is separate from functionality and not a fast-browser
claim. Retained-DOM callback cost also needs profiling/optimization. Native action
migration, page ownership and website script loading remain
next gates. The full objective stays active, with no new dependencies/publication.

September 1, approximately 21:32 UTC: SafeJS now has a tested persistent-callback
phase API and shared realm job queue. Fifteen new interpreter tests and ten new
browser controlled-dispatch tests pass; the full browser suite is 870/870 across
47 files. Twenty-five compiled-core checks pass, including explicit test callbacks
on two real public HTML loads. `CALLBACKS.md` separates this foundation from the
still-missing guest EventTarget bindings, native default-action integration,
process ownership and automatic website scripts. The broad SafeJS run adds fifteen
passes without new failed files; existing upstream tooling failures remain visible.
No dependency, installed SDK change or upstream publication is made.

September 1, approximately 21:11 UTC: the SafeJS source extension now includes
explicit live host objects, tested with 19 adversarial/functional cases. The browser
has an experimental `ScriptDom` binding to its own document tree, not copied DOM
records. Seven actual compiled-SDK fixture checks and six additional real-site
checks pass on Example Domain and Books to Scrape; injected test scripts modify
only local trees. The browser suite passes all 860 tests in 46 files. `SCRIPT-DOM.md`
records API coverage, resource samples and remaining process/event/script-loading
gates. No dependency is installed and automatic website scripts remain disabled.
An adversarial `then` accessor issue was fixed in SafeJS source, not worked around
in browser code. The broad upstream suite still has unrelated tooling failures.

September 1, approximately 20:51 UTC: an initial reusable SafeJS persistent-realm
extension is implemented in the isolated source checkout. Twenty-one new realm
tests and six compiled public-core consumer checks pass. Lexical state, closures,
object identity and compiled regexes survive separate evaluations without replay;
lifetime budgets, cancellation, retained promises and resource cleanup are tested.
`SAFEJS-EXTENSIONS.md` records the local contribution patch and remaining gaps.
Full upstream validation is not green with available shared tooling; missing
dependencies and Node-typing fixture errors remain visible in the reports. None
are installed to bypass the no-dependencies instruction. The browser foundation
suite has 853 passes in 45 files. Website scripts remain disabled and no runtime
installation, upstream publication or browser-parity claim is made.

September 1, approximately 20:40 UTC: the owned script-process layer now has a
parent-enforced watchdog, bounded protocol, empty environment, Node permission
flags and verified child cleanup. Thirteen focused tests and six installed-SDK
process assertions pass (`SCRIPT-PROCESS.md`). The user authorizes extending
SafeJS with a possible later contribution. A separate source checkout matches
v13.0.10; its scope baseline passes 28 tests and a TDD-first extension plan is in
that checkout's `docs/plans/browser-realms.md`. No installed runtime was patched,
no additional dependency was installed, and nothing was published. Reusable realm
and host-object semantics were still pending at that checkpoint; page scripts remain disabled.

September 1, approximately 20:21 UTC: the user confirmed no new dependencies and
explicitly allowed Poe Code SafeJS. The new experimental single-evaluation adapter
uses its already-installed public SDK, with no package install or lockfile change.
All 840 Node tests and 22 installed-SDK checks pass. `JS-RUNTIME.md` records the
capability boundary, limits, initial adapter-loading failure, and remaining DOM/
page-realm/lifecycle integration. Website scripts remain disabled; this is not
completion of M2 or the full browser goal.

Previous CSS checkpoint (September 1, approximately 20:05 UTC): the own-engine HTML
path now has a bounded display/visibility cascade, guarded external CSS loading,
CSS-aware snapshots/actions/focus, and per-tab `resize` plus `styles` CLI commands.
`CSS.md` records the boundary. All 820 Node regression tests and 243 focused Bun
core checks pass; 19 public separate-process CLI assertions pass, including real
catalog stylesheet application. The initial 813-pass/one-failure run is preserved
and its action-error precedence regression is fixed without weakening the test.
This advances K02/P08, not full CSS layout or full browser actionability. Website
JavaScript, visual rendering/exports and complete Kitesurf/Playwright parity remain
required work. The goal is active; no new dependency is approved or installed.

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
- A JavaScript interpreter is a building block, not a browser engine. The user
  explicitly permits existing Poe Code SafeJS; no other new dependency is allowed.
  Do not execute website code with host eval,
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

Final direction: **no new dependencies; Poe Code SafeJS is explicitly allowed**.
Rebuild other needed functionality ourselves. Use SafeJS's public SDK, not copied
private internals or host eval. The experimental adapter is described in
`JS-RUNTIME.md`; no package was installed or upgraded to use it.

Historical requests, superseded by that decision:

1. `parse5`: standards-oriented HTML parser, already present transitively in the
   repository. Adapt its parsed tree into our document model. Parsing is not a
   full browser implementation.
2. `quickjs-emscripten`: isolated JavaScript evaluation with bounded memory,
   stack and execution time. The browser APIs and document implementation remain
   our TypeScript code. Start with a minimal VM bridge and deny host access.

Do not add either dependency, vendor it, or bypass approval by resolving private
transitive paths. Dependency-free model, policy, snapshots and tests can proceed.

September 1, 2026 update: a CLI permission request to install these two packages
was rejected because trusted user approval was still absent. Neither package was
installed, no dependency declaration was added and the workspace lockfile was
unchanged. Do not retry installation through another route. Explicit user consent
is required for the third-party downloads and manifest/lockfile updates.

HTML checkpoint: an original dependency-free TypeScript parser now enables bounded
real HTML reading/actions. It does not import, copy or vendor either requested
dependency. `HTML.md` documents the intentionally incomplete parser and verified
public workflows. Full parsing conformance and isolated page JavaScript remain
required. The later user-approved SafeJS direction resolves the runtime selection,
not the unfinished browser integration or language-compatibility work.

## Milestones

The time ranges are planning budgets, not a reason to delay working features.

### M0 — architecture and measurable acceptance (hours 0–6)

- [x] Create this task document and a separate `browser-agent` package.
- [x] Inspect current browser interfaces and existing dependencies.
- [x] Research the HTML parser and isolated JS runtime before requesting approval.
- [x] Define serializable agent actions/results, capability reporting and errors.
      The implemented command subset and explicit gaps are documented in `CLI.md`.
- [x] Implement and test our internal document model, stable references and mutation rules.
- [x] Implement bounded semantic snapshot foundations with hidden/password handling.
- [ ] Define navigation/resource policy and explicit runtime adapter contracts.

### M1 — better than curl without JavaScript (hours 6–18)

- [x] Implement a bounded Node host transport with pinned DNS, TLS verification,
      redirects, decompression, deadlines, cancellation and local security tests.
- [x] Probe four public HTTPS sites through that transport and preserve results.
- [x] Parse actual HTML into our document model with element identity preserved.
      The implemented subset and limits are in `HTML.md`; full conformance remains open.
- [ ] Fetch with redirect/timeout/size limits, correct decoding and cancellation.
- [ ] Prevent private-network access by default, including redirects, unusual IP
      syntax and DNS rebinding; tests explicitly opt in to local fixture origins.
- [ ] Implement isolated cookie jars, origin handling and navigation history.
- [ ] Implement click/fill/type/press, links, labels and basic native form actions.
- [ ] Stable references survive non-destructive changes and reject stale pages.
- [ ] Expose useful JSON CLI/library operations and deterministic local fixtures.
- [x] Demonstrate real-site document reading and multi-page navigation by refs.
      The public Books to Scrape CLI workflow follows parsed refs and traverses back.

### M2 — real page JavaScript, not host execution (hours 18–36)

- [x] Select the user-approved existing SafeJS runtime and verify its public SDK.
- [ ] Implement disposable persistent page realms and hard execution containment.
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

### HTML checkpoint — September 1, 2026

- 772 Node tests pass across 39 files. The original TypeScript tokenizer/tree builder
  plugs into CLI/session/playground loading, queries, snapshots, links and forms.
  No parser/runtime dependency or browser-engine fallback was added.
- 76 focused parser/decoder/form cases also pass on Bun; networking stays Node-only.
- All 17 public separate-process CLI checks pass, including Example Domain,
  table-based Hacker News content, Books to Scrape ref-driven product navigation,
  HTML back traversal, unsupported XML preservation and complete service cleanup.
- An actual parsed public httpbingo form accepts type/fill/check/Enter and returns
  all seven expected synthetic fields. No controls are constructed, attributes
  rewritten, listeners injected or validation bypassed. Empty optional email/time
  fields have tested emptiness semantics; nonempty type validation is still missing.
- All 17 UI assertions pass on desktop and at 390×844. Partial-parser/JS-off
  disclosure and real HTML are visible; private screenshots were inspected. The
  owned watchable session is closed/verified absent, the isolated service exited
  zero, and its connection file is gone. No production daemon restart occurred.
- `HTML.md` records omitted parsing states/entities/modes, explicit foreign-content/
  template failures, disabled scripts/resources and incomplete rendering. Basic
  parsing is not full Kitesurf/Playwright parity; the complete goal remains active.

### Keyboard checkpoint — September 1, 2026, 19:14 UTC

- 714 Node tests pass across 36 files; build, production/new-test typechecks and
  formatting pass. Focus, caret editing, cancellation, reentrant mutations,
  readonly/maxlength, tab order, Unicode deletion and implicit forms have tests.
- Separate actual CLI processes preserve focused selection and editing, then
  navigate using Enter and fill --submit. Focus is visible in semantic snapshots
  and queried through :focus/:focus-within. No CLI spelling-only pass is counted.
- 65 focused core/session cases pass on Bun without enabling its network backend.
- Two public keyboard command-host probes pass against httpbingo.org, using
  synthetic URL-encoded/multipart form values on a real loaded JSON document.
  Responses, submitter choice, focused snapshots and event sequence are checked.
  Controls are constructed and callbacks are host code, not parsed HTML or site JS.
- Both existing public label/reset/form echo probes also pass at 19:16 UTC after
  accounting for edited text's change event on focus loss, with zero listener errors.
- `KEYBOARD.md` records scope and gaps, including keyup-before-session-submit
  timing, IME/contenteditable/held-key omissions and code-point rather than
  grapheme/visual caret movement. No full compatibility row is complete.
- HTML parser and isolated-JavaScript dependency approval remains outstanding.
  No new dependency, lockfile edit, browser-engine fallback or daemon restart.

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

### Combined history checkpoint — September 1, 2026, 18:56 UTC

- 665 Node tests pass across 34 files; 46 focused history/archive/session tests
  pass on Bun without enabling its unsupported network adapter.
- Session `go`/`back`/`forward`, CLI `go-back`/`go-forward` and playground controls
  traverse actual combined same-/cross-document entries. Fresh loads restore
  bounded JSON state and keys; old DOMs stay closed rather than forming a BFCache.
- Reload preserves current state/keys/forward entries. New branches discard old
  forward history. Per-tab archive budgets evict inactive documents; origin-changing
  restoration redirects and closed POST entries fail explicitly rather than leaking
  state or silently replaying requests. Stop/supersession/history-mutation races pass.
- Thirteen public CLI assertions pass across separate processes, including real
  JSON/RFC back/forward, clean exit and connection-file removal. The initial report
  retained its stale expected-count failure (11 versus 13); it was corrected and rerun.
- Sixteen real-site UI assertions pass at desktop and 390×844 widths. Visual
  inspection caught and corrected a compressed mobile tab picker. The task-owned
  watchable session is closed and verified absent; isolated test services are stopped.
- `NAVIGATION-HISTORY.md` documents host/native API differences, bounds and gaps.
  HTML/isolated site JS, full history lifecycle/native bindings, BFCache, frame
  histories, POST confirmation and persistence remain open. No full parity row is
  marked complete. No new dependencies were installed; approval is still pending.

### Native form-navigation checkpoint — September 1, 2026, 18:38 UTC

- 638 Node tests pass across 32 files. The 40 new portable form-submission/session
  cases also pass on Bun; Node remains the supported network host.
- Submit-button/label activation now runs supported validation, cancelable submit
  events, current-value serialization and owned GET/POST navigation. Invalid or
  canceled forms return explicit metadata without pretending to navigate.
- A host `requestSubmit` API supports submitter overrides and explicit bounded
  file maps. Session/CLI results omit serialized values and file bytes. Missing
  constraints and new-window/named targets fail before network transmission.
- POST fragments do not take the GET-only same-document shortcut. Newer listener
  navigation, cancellation and late results cannot replace the wrong document.
  Committed POST results refuse implicit reload replay; 301/302/303 conversions
  to GET and 307/308 method preservation are tested with real local HTTP.
- Two public demo POSTs at 18:35 UTC pass through the session engine, load echo
  JSON into fresh trees, verify listener-updated values and multipart file contents,
  close old refs and reject automatic replay. These are constructed controls in
  loaded JSON, not parsed website forms or website JavaScript.
- `FORM-NAVIGATION.md` lists constraints and gaps: FormData/formdata, implicit
  keyboard submission, native FileList, other targets, full validity APIs and
  parsed-site/JS integration remain open. No compatibility row is declared complete.
- Build, production and new test-source typechecks, Biome and diff checks pass.
  No dependencies were installed; parser/runtime approval is still outstanding.

### Shared playground checkpoint — September 1, 2026

- 590 Node tests pass across 29 files, including token expiry/quotas, public shell
  restrictions, CLI-only approval/shutdown, window revocation, actual CLI approval
  and observer reads that do not consume agent snapshot diffs.
- The new UI uses the real command service for named sessions, tabs, navigation,
  semantic text/snapshots, counters, activity and supported CLI input. It neither
  replaces nor delegates document execution to the existing Chromium alternative.
- Connection uses an explicitly approved one-time pairing handle. No credentials
  in URLs/DOM/persistent browser storage; disconnected views are cleared.
- `PLAYGROUND.md` documents the runnable subset, boundaries and repeatable UI probe.
  Public JSON/RFC navigation and cross-process state are checked through the UI,
  not inferred from unit tests. Dated probe reports preserve failures as well.
- All 14 end-to-end UI assertions pass at desktop and 390×844 widths. Visual
  inspection caught and corrected a narrow-sidebar layout issue. The task-owned
  watchable session and isolated test services are closed; metadata cleanup was
  verified. Build, production/test-source typechecks, Biome and diff checks pass.
- This is not full Kitesurf playground parity: HTML/website JS, pixel rendering,
  exports, page console, streaming and full command families remain open. Parser/
  isolated-runtime dependency approval is still outstanding; none were installed.

### Executable CLI checkpoint — September 1, 2026, 18:05 UTC

- 564 Node tests pass across 27 files; 46 dispatcher/parser checks also pass on
  Bun. Build, production typecheck, new test-source typechecks and lint pass.
- The package declares `agent-browser` and supplies a built Node CLI. A foreground
  package-owned service retains named sessions across independent invocations;
  no production daemon, tmux session, dependency or other package was changed.
- Shared command dispatch implements the documented navigation/tab/storage/action/
  snapshot subset, bounded diffs and capability reporting. Unsupported commands,
  options and unfinished defaults fail explicitly; recognized syntax is not parity.
- Session commands are ordered, queued mutations check cancellation, and closing
  is out of band. The loopback API requires bearer auth, exact Host/Origin, bounded
  JSON, body deadlines and private owner-checked discovery files. Disconnects and
  shutdown cancel owned work. No page code can access host execution.
- Actual subprocess tests cover separate CLI invocations and foreground service
  startup/shutdown. Eleven public assertions pass for JSON/RFC text, in-memory
  storage persistence/isolation, reloads, expected HTML rejection and private-file
  cleanup. Test services are closed; credential values are not published.
- `CLI.md` documents how to run the useful subset now. The full scope remains:
  HTML parsing, isolated JavaScript, cross-document history, remaining CLI families,
  automatic service launch/recovery, rendering and the playground still need work.
  Its shared API is implemented, not its UI. No compatibility row is complete;
  parser/runtime dependency approval is still outstanding.

### Document-session checkpoint — September 1, 2026, 17:46 UTC

- 519 Node tests pass across 23 files; 59 focused session/history/text-loader
  checks also pass on Bun. Build, production typecheck, changed/new test-source
  typechecks and lint pass. The pre-existing TLS test-source typing issue remains.
- `BrowserSession` now owns tabs, storage, a cookie jar and transport. Explicit
  loader adapters transfer fresh document ownership; successful loads atomically
  replace the old tree, while errors and 204/205 preserve it. Reload invalidates refs.
- Same-resource fragment navigation retains the tree; cancellation reaches the
  queued history job before mutation. Superseded/closed/timed-out loads cannot
  commit. Reentrant cancellation is ordered; late trees are disposed. Unsettled
  adapters retain bounded job slots, while stopped deadlines are cleared immediately.
- A real text/JSON loader creates literal preformatted documents, never parses
  HTML or executes markup. Local HTTP tests cover redirects, cookie isolation,
  replacement and failed loads. Public RFC text/JSON load successfully, reload
  closes the old tree, and expected HTML rejection preserves the current page.
- Four public requests yield three commits and full cleanup. The 502,941-byte RFC
  load took 154 ms in that run; instantaneous process RSS was 78–79 MiB, not a peak
  or HTML/JS performance claim. A Domain cookie rejection is recorded, not hidden.
- `SESSION.md` documents the host API and loader/ownership contract. General HTML
  loading, page JavaScript, unified cross-document history, form submission,
  lifecycle events, other navigation targets, CLI persistence and playground are
  still incomplete. No parity row is marked complete; dependency approval remains
  outstanding and no dependencies, lockfiles or unrelated packages were changed.

### Cookie-session checkpoint — September 1, 2026, 17:32 UTC

- 477 Node tests pass across 20 files. All 55 cookie unit cases also pass on Bun.
  Build, production typecheck, standalone typechecks of the new cookie tests and
  lint pass. An ad-hoc typecheck of the existing TLS test file found its pre-existing
  `TLSSocket.servername` typing error; runtime TLS tests pass. See `COOKIES.md`.
- Bounded, independently owned cookie jars implement host/path scope, expiry,
  Secure/HttpOnly, prefix checks, conservative SameSite handling, quotas and cleanup.
  Unsupported Domain/Partitioned cookies are rejected and counted, never guessed
  into a broader credential scope. Registrable-domain/PSL support remains missing.
- Node transport now reads/writes jar state only with explicit cookie context.
  It recomputes headers per redirect, retains cross-site/origin redirect taint,
  handles response cookies before body processing and rejects raw Cookie overrides.
  Existing TLS verification still occurs before transmitting cookie-bearing HTTP.
- Public cookie-echo assertions pass for setting through a redirect, persistence,
  isolated jars and deletion through a redirect. Six small GET requests carry
  only fixed synthetic data; sanitized reports show all transports/jars closed.
- This is real HTTP session evidence, not parsed-site/browser acceptance. Page
  cookie bindings, profile lifecycle integration, parser/runtime, browser CLI and
  playground remain incomplete. Dependency approval is still outstanding; no
  dependency or lockfile was changed and no compatibility row is marked complete.

### Label/reset checkpoint — September 1, 2026, 17:20 UTC

- 409 Node tests pass across 18 files; 73 focused form-action/core checks also
  pass on Bun. Build, typecheck, focused test typechecking and lint pass.
- Labels share a revision-cached association index with snapshot names. Explicit
  `for`, implicit first-control associations, duplicate IDs, interactive descendants,
  callback reassociation, cancellation and disabled/inert controls are covered.
- Label forwarding and reset-button activation now execute instead of returning
  placeholder intents. Form reset dispatches its cancelable event, guards recursion,
  uses current form owners/defaults after callbacks and clears supported dirty state.
  It preserves indeterminate state and emits no fabricated input/change events.
- Reset plans are collected before mutations to prevent repeated select-index builds.
  Unsupported output controls fail before partial native reset. Intrinsic FileList,
  specialized input sanitization, custom elements and full DOM bindings are missing.
- Two public synthetic POSTs pass with label activation, reset/default assertions,
  refilling, event order, independently decoded fields/file content and closed transport.
  The documents and callbacks are constructed host fixtures, not parsed website JS.
- `FORM-ACTIONS.md` and new reports preserve these boundaries. HTML/runtime dependency
  approval is still outstanding; no dependency or lockfile change was made. The full
  browser, CLI superset, rendering and playground goals remain active and incomplete.

### History checkpoint — September 1, 2026, 17:05 UTC

- 383 Node tests pass across 16 files; the 172 history/URL/event/query checks
  also pass on Bun. Build, typecheck, focused test typechecking and lint pass.
- Same-document history now preserves isolated JSON state, queues back/forward
  traversal, enforces URL rewrite rules, prunes forward entries, evicts bounded
  old entries and rejects work on closure or quota exhaustion.
- Window event targets are optional in the event core and enabled for interaction
  documents. Popstate/hashchange use Window, not a fabricated document event path.
- Fragment navigation updates stored target state and snapshots without fetching.
  URL rewriting alone does not retarget `:target`. Tests caught and corrected that
  distinction; fragment lookup also checks raw values before decoded values.
- Base URL/target resolution is shared by links, form plans, snapshots and history.
  URL changes retain element references and appear in the document revision log.
- A constructed routing fixture exercises anchor intent, fragment selection,
  trusted host listener updates, semantic state and back navigation. This is not
  website JavaScript execution or parsed-site browser acceptance.
- Evidence: `HISTORY.md`, `reports/unit-node-2026-09-01-history.json` and
  `reports/history-core-bun-2026-09-01.json`. Earlier reports remain preserved.
- Full structured cloning, page History/Location bindings, scrolling/focus,
  cross-document loading, reload, frames, BFCache, CLI and playground remain open.
  Dependency approval remains absent. No new install attempt or workaround was
  made. Full Kitesurf and Playwright superset scope and parity gates are unchanged.

### Query checkpoint — September 1, 2026, 16:48 UTC

- 335 Node tests pass across 14 files, with zero failed/pending tests. The 104
  selector tests also pass on Bun; this does not enable Bun networking.
- `DocumentQueries` implements bounded selector parsing/matching, querySelector,
  static querySelectorAll, matches and closest. Lists, attributes, combinators,
  logical/relative selectors, filtered nth selectors and native control states
  use our document model; there is no external selector engine.
- Mutation-aware node indexes, LRU compiled selectors, memo budgets and close
  cleanup bound retained state. Malformed or unsupported selectors fail explicitly.
- Constructed 100/2,000/10,000-element fixtures verify matching, denial of expensive
  work and cleanup. The largest fixture observed roughly 25 ms construction,
  22 ms cold indexed ID lookup, 8/3 ms cached nth/relational queries and a 98 MiB
  process RSS sample. These are not full-browser or real-site performance claims.
- Evidence: `SELECTORS.md`, `reports/unit-node-2026-09-01-queries.json`,
  `reports/queries-bun-2026-09-01.json` and
  `reports/query-resources-node-2026-09-01.json`. Earlier evidence is preserved.
- HTML parsing and isolated runtime installation still need explicit approval.
  No parsed-site/website-JS/navigation/CLI/playground acceptance gate is complete.
  The full Kitesurf and Playwright superset requirements remain unchanged.

### Event/interaction checkpoint — September 1, 2026, 16:34 UTC

- 231 Node tests pass across 13 files. Build, typecheck, focused test-file type
  checking and Biome checks pass. No dependencies have been added.
- Document events implement capture/target/bubble propagation, cancellation,
  once/passive/abortable listeners, mutation-safe paths, bounded diagnostics,
  cleanup and nested dispatch/invocation budgets. Blocking host callbacks still
  require the future isolated runtime's interruption mechanism.
- Event-driven fill/check/select/click operations update our own control model.
  Checkbox/radio preactivation is visible to listeners and restored on canceled
  clicks. Agent check verifies the final state. Indeterminacy appears in snapshots.
- Link/submit/reset/label/picker defaults are explicit intents, not executed
  operations. No focus, keyboard, hit testing or browser submit pipeline yet.
- Four local HTTP roundtrips now use event-driven interactions. Two public demo
  POSTs at 16:31 UTC verify event order, an input-listener-updated field and form
  values; multipart also confirms file content. These use constructed documents
  and trusted host callbacks, not parsed site HTML or website JavaScript.
- Evidence: `EVENTS.md`, event/interaction tests and
  `reports/form-events-node-2026-09-01.json`. The final 231-test Node run is
  preserved in `reports/unit-node-2026-09-01-events.json`, with zero failures or
  pending tests. Previous reports remain preserved.
- Dependency approval for HTML parsing and isolated scripts remains outstanding.
  Full Kitesurf coverage, executable Playwright CLI superset behavior and the
  playground remain required and incomplete; no parity row is marked complete.

### State/form checkpoint — September 1, 2026, 16:20 UTC

- 195 Node tests pass across 11 files; build, typecheck and Biome checks pass.
- Isolated local/session storage has profile/tab/origin partitioning, opener
  copying, atomic local-state replacement, quotas and invalidated closed handles.
- Connected-document control helpers cover form ownership, inherited disability,
  radio/select state and fill/check/select updates. Snapshots use this state.
- Form planning supports URL-encoded, text/plain and multipart payloads, native
  successful controls, submitter overrides, bounded explicit upload bytes and
  line-ending/header escaping. It does not dispatch events or navigate.
- Document close hooks release control indexes; cleanup continues after failures.
- Four local HTTP peer roundtrips and two public demo POST echoes pass. Public
  checks at 16:15 UTC verify URL-encoded fields and multipart fields/file content.
  These use constructed documents, not parsed websites or browser submissions.
- The portable-core Bun diagnostic records 161 passed and one failed check:
  its native multipart reader loses the uploaded filename. Preserve the failure;
  Node encoding, peer and independent public service checks pass. Bun remains
  unsupported for network execution after the separate negative TLS diagnostic.
- See `STATE-FORMS.md` and `reports/README.md` for contracts, evidence and gaps.
  No browser compatibility row is complete. Dependency approval for HTML parsing
  and isolated page JavaScript is still pending; no dependency has been added.

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
