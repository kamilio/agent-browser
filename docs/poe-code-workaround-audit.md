# Poe Code Workaround Audit

## Browser base64 Window bindings (September 3, 2026)

`packages/browser-agent/BASE64.md` adds native TypeScript binary-string codecs
without introducing an SDK workaround. Actual experimental-SafeJS probing passes
ten functional checks, including guest listeners reached through agent fill/click,
but fails global/Window function identity and detached Window method invocation.
The latter reports `TypeError: Illegal live host object method receiver.`
Read-only selected-core source inspection and a public-core reproduction confirm
the separate receiver-checked closure boundary already observed for matchMedia.
Global detached functions and caught exception names work.

The completed probe retains overall false and exit 1. No private SDK mutation,
alias injection, property-wrapper bypass, release acquisition or issue publication
was used. An additional runtime/report/audit request was rejected after sandbox
process spawning failed; it was not retried through another execution route.
The source, local reproduction and native regression evidence are documented,
while runtime parity and original acceptance gates remain open.

## Browser guest-loop cost diagnosis (September 3, 2026)

`packages/browser-agent/HIT-TESTING-PERFORMANCE.md` records the still-failing
default stress probe, a local CPU profile dominated by retained-state traversal,
and repeated arithmetic/identity controls that time out without host calls.
Native 256-query baselines succeed without rebuilding layout. This narrows the
next investigation to shared experimental-runtime cost; it does not establish a
defect in a locally verified current release or resolve browser compatibility.
No runtime modification, disabled accounting, relaxed deadline, archive download,
SDK switch or new issue is used. The prior performance-publication denial and
current no-issues instruction remain respected; evidence stays in local reports.

## Browser Window function identity (September 3, 2026)

The new matchMedia integration exposes the same native callable in the global
binding map and Window method definition. Actual production PageScripts using the
existing experimental core at `/tmp/agent-browser-safejs-13.0.10/packages/safe-js`
reports `matchMedia === window.matchMedia` as false. Width/orientation matching,
live dimensions and the remaining 13 responsive callback/DOM/PNG/cleanup checks
pass. The complete probe retains the failed assertion, overall false result and
exit status 1; see `packages/browser-agent/MEDIA-QUERIES.md` and its reports.

Read-only inspection of that existing core's `src/interp/host-bridge.ts` shows
live host-object methods constructed as separate receiver-checked sandbox closures.
This identifies a selected-runtime compatibility gap; it is not a reproduced
defect in an installed current release. No SDK changes, wrapper bypass, guest
alias injection, source archive download, runtime switch or new issue publication
is performed. The user's no-issues workflow restriction and prior specific denied
actions remain respected. Native reference equality tests are not substituted
for the failed interpreted equality check.

The subsequent final probe retains that same failure with explicit receiver and
target checks passing. A separate nine-assertion actual agent-command probe also
passes resize-driven callbacks, snapshots, PNG changes/restoration and session
cleanup over mocked transport. Neither changes the identity requirement or
establishes released-SDK compatibility.

## Browser console extension ownership (September 2, 2026)

Update, 19:34 UTC maintainer comment: #550 remains open and reports implementation
pushed at `7984fa903602e6561b342a140f472978827094b7`, with release jobs queued.
Read-only pinned source inspection confirms `builtinOverrides.console` names an
authorized extension owner while preserving ordinary collision checks. The browser
now has a public-contract adapter using that API, with 19 mock-contract tests.
It does not patch the SDK, rewrite source, mirror console or switch the service
default. Its released-artifact probes compile but have not run. The existing
experimental runtime still passes 92 in-memory regression checks through the
legacy adapter; those checks do not validate the new adapter. See
`packages/browser-agent/EXTENSION-RUNTIME.md` for the remaining acceptance gates.
Previously denied download and live terminal/public-site actions remain untouched.

Pinned upstream source `c458b92d312580a2f9b32c9aa5e84b3aed77ea5e` rejects an
extension global named console before setup because the builtin already owns
that name. The builtin exposes log/error via a sink, which does not supply the
browser console's richer methods or shared console/window.console identity.
This is the strict conflict policy explicitly requested in resolved issue #540,
not a regression or a defect reproduced against an installed release.

User-authorized enhancement `poe-platform/poe-code#550` requests explicit,
host-authorized replacement of builtin console with an owned extension host
object, retaining default collision protection. Created September 2 at 19:12:15
UTC; its open state and exact JSON body were verified against
`packages/browser-agent/contributions/safejs-console-override-issue.md`.
Recent upstream issue bodies and #540 were checked for overlapping scope first.
No SDK patch, private import, lexical rewrite, mirrored console or sink-only
parity claim was added. The browser's runtime lifecycle boundary is being
separated from its legacy SafeJS adapter without switching dependencies.

The same inspection confirms #549 closed at 17:47:48 UTC; its later maintainer
comment recommends poe-code 14.0.17. That is an upstream observation, not an
installed version or a newly executed release gate. Previously denied download
and live terminal/public-site actions were not retried or substituted.

## Browser storage named mutations (September 2, 2026)

The browser binds explicit Storage methods and document.cookie to its existing
session stores and cookie jar. Actual interpreted agent-driven todo actions and
reload restoration work, but the experimental core's named property assignment
does not update native storage. It must not be advertised as full Web Storage.

The earlier upstream source at `521363bf16bdc9ae63f60f7ba47d57c03f2011fc` has
read-only named host providers and only fixed setters. User-authorized enhancement
`poe-platform/poe-code#549` requests generic bounded named setters/deleters; its
creation and exact body were verified at 17:05 UTC. No native Proxy, copied guest
storage mirror, predeclared-key workaround or additional dependency was added.
Body: `packages/browser-agent/contributions/safejs-named-mutations-issue.md`.
Validation: 707 browser tests across 36 files and twelve actual-interpreter todo/
isolation checks pass. The named-write non-persistence observation is recorded
separately, not counted as a passing named-property feature.

At 17:37 UTC the maintainer reports the implementation pushed as
`c458b92d312580a2f9b32c9aa5e84b3aed77ea5e`, with synchronous named setters/deleters,
upstream tests passing and release jobs running. Source inspection confirms the
optional provider fields. The browser's new release-contract probe is prepared,
but no released artifact has been downloaded or runtime-validated here. Its 24
loader selection tests use inert module stubs; the broader 942-test browser run
does not imply this upstream API is integrated. No new workaround was introduced.

The callback phase request #547 is separately verified closed at 16:19:22 UTC;
its maintainer reports release 0.1.36. Local release migration remains unverified
and the previously denied SDK download was not repeated.

## Cooperative realm execution (September 2, 2026)

The isolated SDK candidate yields to host scheduling every 256 AST entries while
retaining the active guest job. Cancellation cleans up its timer/listener; guest
callbacks cannot interleave synchronous work. Legacy run/replay behavior and
production source/step/data/heartbeat limits remain unchanged. Failed realm
initialization also releases Date ownership roots before Budget reuse.

The browser script adapter now borrows rather than closes native document events.
Guest shutdown interrupts pending guest dispatches but native links can recover
in the same actor. See `packages/browser-agent/SAFEJS-COOPERATION.md`.
SDK focused/full passes are 73/8104, with exactly the existing 30 failed assertions
and 54 failed files. Browser tests pass 1128/65; all 46 owned-process probe checks
pass. Both public documents remain readable but their scripts time out; neither
dynamic-site compatibility nor interpreter throughput is declared fixed.

No dependency, installed SDK, publication, commit or push changes. Detailed
performance publication remains paused; prior generic issue authorization is not
used to override its denial. The obsolete Date test process whose stop was denied
is not claimed cleaned up. Original extension and browser scope remain active.

## Sandbox-owned Date (September 2, 2026)

The isolated candidate for the existing #543 request now owns Date timestamps,
prototypes, calendar/JSON operations and explicit clocks. Run current-time reads
use the existing host-call journal; no browser-specific dummy Date, native guest
constructor, evaluator or new dependency is introduced. Host Date calendar
primitives operate only on converted inputs and temporary private native values.
Date object snapshots/copies and locale formatting remain explicit limitations.
See `packages/browser-agent/SAFEJS-DATE.md`.

Twenty-two new SDK cases pass. The full verified run has 8089 passes with the
same 30 failed assertions and 54 failed files as before. Legacy checkpoint
expectations add the default Date binding without weakening hashes/graph checks.
Browser regression remains 1126/65, and forty local automatic-script checks pass.
Both public scripts advance past Date in bounded diagnostics, to String.replace
coercion and Object.defineProperty respectively. Both production navigations still
fail the unchanged heartbeat. Timer/CLI checks pass 17/22.

No upstream publication, installed SDK change, dependency, commit or push is made.
The performance publication denial remains respected. A separate stop request
for obsolete owned test PID 2154641 was denied; that first run is not claimed
cleaned up, and the independently completed verified run supplies the final
regression evidence. The full browser goal and extension lifecycle remain open.

## Local retention optimization (September 2, 2026)

The isolated SafeJS candidate now reuses immutable shallow shapes/descriptors and
same-scope capture enumeration within a measurement. Primary retained-memory
checks, live descendants/prototypes and positive compile-charge escape scans are
preserved. Nineteen deterministic regressions were added; the 25-case focused run
and strict core/tests pass. Browser regression remains 1126 passes across 65 files.
The combined contribution patch is refreshed and applies to the exact v13.0.10
base. No installed package, dependency, service, production bound or native
evaluator changes are involved.

Books diagnostic evaluation improves from 8926 ms to observed 3424–4048 ms,
but its production actor still times out at 2009 ms. Both sites still encounter
missing Date. This remains partial mitigation, not resolved browser acceptance.
See `packages/browser-agent/SAFEJS-RETENTION-PERFORMANCE.md`. The denied detailed
performance publication remains local; no new issue or alternate comment was
posted. Existing generic issue authorization is not treated as approval to
circumvent that rejection.

## Browser named capabilities and accounting cost (September 2, 2026)

The approved request `poe-platform/poe-code#546` covers bounded dynamic named
host properties. The local SDK candidate adds it without native Proxy, eager
property tables, dependencies or private interpreter imports in the browser.
Nineteen new SDK tests pass; the full run has 8048 passes with exactly the earlier
30 failed assertions and 54 failed files. The browser owns Attr records and live
maps, with 1126 passing browser tests and real automatic-script/action fixtures.
See `packages/browser-agent/SAFEJS-NAMED-HOST-OBJECTS.md` and
`packages/browser-agent/DOM-ATTRIBUTES.md`.

Both public scripts reach missing Date in separate diagnostics; approved comment
5503524836 adds this to #543. Production Books navigation still hits the existing
heartbeat at 2009 ms. Profiling found about 67% of self-samples in retained-data
traversal and a no-DOM public-core benchmark reproduces scaling. No accounting
checks, heartbeat bounds or external supervision were removed to hide the issue.
Publishing the detailed performance issue was denied by approval review; no such
issue was created. `packages/browser-agent/SAFEJS-RETENTION-PERFORMANCE.md` retains
the evidence locally pending explicit publication approval. This is not a green
browser acceptance gate or a completed extensibility contract.

## Browser indexed live capabilities (September 2, 2026)

The user-authorized SafeJS request is filed as `poe-platform/poe-code#545`.
Live DOM collections need changing indexed reads, not snapshot arrays or tens
of thousands of declared getters. The local SDK candidate adds a bounded public
indexed capability; it does not install a dependency, use native Proxy or import
private interpreter objects into the browser. Generic lookup, enumeration,
iteration, identity, limits and revocation are covered by 17 new SDK tests.
The full SDK adds 17 passes (8029 total), with exactly the preceding 30 failed
assertions and 54 failed files. The browser owns bounded collection queries and
revision caches, with 1087 browser passes and real public-core process probes.
`packages/browser-agent/SAFEJS-INDEXED-HOST-OBJECTS.md` and
`packages/browser-agent/LIVE-COLLECTIONS.md` record limits and evidence. Books
advances to a style/CSSOM gap; Quotes still needs Date. No upstream release,
installed SDK change, PR, commit, push or publication is claimed.

## Browser Object intrinsics (September 2, 2026)

The local SDK candidate now implements ordinary Object intrinsics requested in
`poe-platform/poe-code#544`. It uses realm-owned prototypes rather than native
prototype traversal, browser-side type tags or rewritten jQuery. Reflection hides
interpreter fields; mutation retention and cleanup are budgeted. Unsupported
boxing, descriptor maps and exotic reflection reject explicitly. Intrinsic dumps
remain limited, and Object's diagnostic binding changes from namespace to
constructor. Existing source-replay constructor behavior is regression-tested.
The final SDK adds 33 passes (8012 total), retaining exactly the prior 30 failed
assertions and 54 failed files. Browser and actual public-core process checks pass.
`packages/browser-agent/SAFEJS-OBJECT-PROTOTYPE.md` records boundaries and evidence.
Books advances to missing browser DOM getElementsByTagName; Quotes still needs
Date (#543). No new dependency, installed SDK change, publication, PR, commit or
push is made. This does not complete #540's unified extension lifecycle.

## Browser guest function objects (September 2, 2026)

The isolated SDK candidate implements bounded guest function properties and
constructor inheritance for `poe-platform/poe-code#541`, without native prototype
traversal or a browser-side jQuery patch. Modified prototype/function state fails
snapshot/replay explicitly. The SDK gains 22 passing tests (7979 total); the same
30 failed assertions and 54 failed files remain. Browser and owned-process
regressions pass. `packages/browser-agent/SAFEJS-FUNCTION-OBJECTS.md` records
boundaries and the refreshed source artifact. Unmodified public scripts advance
to missing Date and Object prototype intrinsics. User-authorized issues #543 and
#544 were filed and verified open; source bodies and reproduction reports are
retained. #540's extension lifecycle is not implemented. No dependencies, installed
SDK, PR, commit, push or publication are changed.

## Browser guest-reference arguments (September 2, 2026)

Actual page-timer testing exposed object identity loss across the default SafeJS
host conversion. The user-authorized upstream report is `poe-platform/poe-code#542`,
verified open. The local SDK candidate adds explicit opaque retained arguments and
release APIs instead of importing private interpreter objects or keeping detached
copies in the browser. It preserves the default copy boundary for other bindings.
Realm ownership, retained-data/count budgets, revocation and native-error cleanup
are covered by 11 new tests. The full native-config SDK run adds 11 passes (7957),
with exactly the same 30 failed assertions and 54 failed files as the preceding
candidate. The upstream gate remains non-green; no missing test dependencies are
installed or mocked. `packages/browser-agent/SAFEJS-GUEST-REFERENCES.md` documents
the public primitive and artifact; `packages/browser-agent/PAGE-TIMERS.md` records
the browser-side scheduler and actual-process acceptance boundaries. No PR,
commit, push, publication or installed SDK modification is made.

## Browser SafeJS extension (September 1, 2026)

The browser user authorizes SafeJS as the only interpreter dependency and asks to
extend it for a possible later contribution. The isolated v13.0.10 checkout adds a
public persistent-realm API instead of importing private interpreter paths from
the browser or replaying old source to imitate persistence. The local patch and
validation boundaries are documented in `packages/browser-agent/SAFEJS-EXTENSIONS.md`.
No installed SDK is modified and no extra dependency is installed. Existing upstream
test dependencies absent from the shared tooling remain explicit validation failures,
not mocked replacements. The user subsequently authorized upstream issue filing:
`poe-platform/poe-code#540` requests a public composable extension/realm lifecycle,
and `poe-platform/poe-code#541` reports guest function-property/prototype semantics
blocking real jQuery execution. Both issues were verified open. No PR is opened.

The browser's parser-integrated `document.write` subset now uses the experimental
public core without bypassing its reentry guard. Nested inline written scripts
fail explicitly until SafeJS supports narrowly authorized, budgeted nested source
execution; that requirement was added to #540. Source issue bodies and limitations
are retained in `packages/browser-agent/upstream-issues/` and
`packages/browser-agent/DOCUMENT-WRITE.md`. Neither issue is claimed implemented.
The browser checkpoint passes 983 tests and 16 owned-process checks; both public
dynamic-site probes still fail compatibility, now at guest function properties.

The extension now includes opaque live-object grants, identity-preserving callback
conversion and explicit rejection of snapshot/copy operations on live capabilities.
Adversarial validation exposed native promise assimilation of an ordinary `then`
accessor. The fix is in SafeJS's host-bridge source: inspect data descriptors without
invoking accessors. No browser-side wrapper suppresses the failure or relaxes the
capability boundary. The combined local patch remains unpublished.

The same candidate now adds persistent callback phases and a shared realm job
queue, rather than browser code guessing when interpreted synchronous work has
finished. Callback identity/retention and cancellation cleanup are fixed and tested
inside SafeJS. The browser consumes the public `startCallback` export only in an
explicit compiled-core probe; it does not patch the installed runtime or enable
website JavaScript. `packages/browser-agent/CALLBACKS.md` records 56 focused source
passes, unchanged broad-suite tooling failures and 25 real-document/fixture checks.

The browser now exposes node add/removeEventListener through those public APIs,
without further SDK patching. Forty compiled-core checks include ordinary and
asynchronous errors, spoofed fatal error codes and actual budget exhaustion.
`packages/browser-agent/SCRIPT-EVENTS.md` retains an initial 50-second deliberate-loop
timeout and separate bounded deadline/step measurements. A smaller functional-test
budget is not represented as an interpreter performance fix; callback cost with
retained DOM capabilities remains an explicit profiling/optimization task.

## Meeting preview launch configuration (August 31, 2026)

The September 2 Zoom mention runtime reuses this existing isolated-home setup:
only authentication/provider settings are copied, safety settings stay in the
private config, and public `spawn` supplies the sole scoped MCP server. It does
not mix application `-c` arguments with generated MCP arguments, patch poe-code,
or add a new launch backend. Both the temporary home and prompt workspace are
removed after each turn, including native session logs.

The meeting preview uses public `poe-code.spawn("codex", ...)`, the production
meeting processor, and the existing dry-run adapters/ledger. It does not patch
poe-code, introduce another mock system, or replace the agent backend.

Integration testing caught a configuration-placement conflict: generated MCP
`-c` options before `exec` were lost when the preview also supplied `-c` options
after `exec`. The application now puts its safety settings in its isolated
`CODEX_HOME/config.toml` and leaves MCP CLI configuration to poe-code. Required
MCP startup checks and a regression assertion against mixed `-c` arguments
prevent silent tool-less previews. No upstream package change is installed.

The repository's no-issues workflow applies; no external issue was created.

## Provider-usage compaction (August 28, 2026)

The installed `poe-code@4.0.48` bundles a compaction plugin, but it is not exported by `poe-code/agent`, uses locally estimated tokens, and runs only after an iteration. At-mention scheduling also needs a durable provider-usage trigger checked before a resumed model request, since terminal tools stop before post-iteration hooks.

At the user's explicit request, `apps/daemon/src/lib/mention-compaction-plugin.ts` implements an application-owned plugin using public `AgentPlugin` iteration hooks and `context.complete`. It follows the original summary/system-message/recent-user-turn behavior but triggers at 200,000 reported input-plus-output tokens and atomically archives original messages with the compacted database checkpoint. It does not patch poe-code, use private production imports, or add a dependency. This is the requested application policy, not a hidden replacement of the bundled plugin or a claimed upstream fix. No upstream issue was filed.

Audited on June 9, 2026, updated on June 12, 2026 after adopting
`poe-code@3.0.254`, and updated on June 22, 2026 after adopting
`poe-code@3.0.393`.

## Resolution Status

Every original poe-code issue that prompted this audit is resolved, and the
repository now requests and locks `poe-code@3.0.393`.

- `3.0.237`: external code-review profile catalogs, resolving
  [#383](https://github.com/poe-platform/poe-code/issues/383).
- `3.0.238`: public Markdown prompt-document resolver, resolving
  [#385](https://github.com/poe-platform/poe-code/issues/385).
- `3.0.239`: public code-review prompt preview, resolving
  [#384](https://github.com/poe-platform/poe-code/issues/384).
- `3.0.242`: public neutral/native trace APIs and Codex MCP auto-approval,
  resolving [#390](https://github.com/poe-platform/poe-code/issues/390),
  [#391](https://github.com/poe-platform/poe-code/issues/391), and
  [#392](https://github.com/poe-platform/poe-code/issues/392).
- `3.0.247`: public per-spawn environment overrides, resolving
  [#393](https://github.com/poe-platform/poe-code/issues/393).
- `3.0.393`: Codex yolo/auto resume now uses
  `--dangerously-bypass-approvals-and-sandbox`, which matches the current
  Codex CLI `exec resume` interface and replaces the stale
  `-s danger-full-access` resume argument shape that caused analyzer resumes to
  fail.

## Local Follow-Up Issues

- [quora/bug-analyzer#23](https://github.com/quora/bug-analyzer/issues/23):
  remove the local `packages/agent-code-review` fork using released APIs.
- [quora/bug-analyzer#24](https://github.com/quora/bug-analyzer/issues/24):
  finish removing global `process.env` mutation after the composable-agent API
  regression tracked by
  [poe-platform/poe-code#520](https://github.com/poe-platform/poe-code/issues/520)
  is resolved. The runtime implementation in `3.0.393` still forwards
  `AgentRunOptions.env`, but the published `poe-code/agent` declaration no
  longer exposes that property.

## Removed Workarounds

Automations previously wrapped Bun MCP servers in
`apps/daemon/src/lib/codex-mcp-proxy.mjs` for Codex runs and documented a direct
Bun stdio handshake incompatibility in `DEBUGGING.md`.

A live disposable probe on June 9, 2026 started a Bun MCP server directly from
Codex CLI `0.133.0`, called its tool successfully, and returned
`BUN_MCP_OK:direct`. No proxy was used. This workaround appears stale, so no
upstream issue was submitted. Local cleanup was tracked by issue #21.

The proxy script, Codex-only wrapping, temporary proxy environment files,
related tests, and the known-issue entry in `DEBUGGING.md` were removed on June
12, 2026. Normal and resumed `spawn.pretty(...)` calls now use the released
per-spawn `env` option, and the channel agent now uses restricted `edit` mode
with released MCP auto-approval.

A disposable live probe on June 12, 2026 ran `poe-code@3.0.254` with Codex CLI
`0.133.0`, `--mode edit`, and a direct Bun `packages/tools/src/mcp.ts` server.
Codex called `tools.poe_models_age` successfully and returned
`RESTRICTED_MCP_OK`. A second disposable probe exposed a side-effecting MCP
tool that wrote only under `tmp/`; Codex auto-approved and executed it in
`edit` mode, returning and writing `SIDE_EFFECT_MCP_OK`.

The isolated composable `poe-code/agent` runtime still lacks per-run environment
overrides, and normal spawns cannot unset inherited variables through the public
per-run env option. Narrowly scoped temporary environment/serialization remains
for those cases pending #404 and #405; ordinary normal/resumed spawns use the
released isolated env path and no longer serialize by default.

On June 22, 2026, `poe-code@3.0.393` was verified with the current Codex CLI:
`codex exec resume --help` accepts
`--dangerously-bypass-approvals-and-sandbox`, and a disposable
`spawn.pretty("codex", mode: "yolo", resumeThreadId, useStdin: true)` smoke
run resumed an existing Codex thread and exited successfully with
`POE_RESUME_SMOKE_OK`.

## Reviewed But Not Filed

- Codex runs pass `--disable multi_agent`. The repository does not document a
  failure caused by poe-code, and the flag was introduced as a local nested-agent
  policy. There is not enough evidence for an upstream issue.
- Repository-local provider branches that map supported poe-code options, such as
  resume, MCP configuration, and `useStdin`, are not workarounds by themselves.

## Validation

```sh
bun --bun node_modules/vitest/vitest.mjs run \
  apps/daemon/src/lib/agent.test.ts \
  apps/daemon/src/interactive-triage.test.ts \
  apps/daemon/src/channel-agent.test.ts \
  packages/agent-code-review/src/review.test.ts
bun run typecheck
```

Result after the June 12 cleanup: 4 focused test files passed, 37 tests passed,
and the root workspace typecheck passed.

Result after the June 22 upgrade: daemon typecheck passed, focused analyzer and
finalization tests passed, and a live Codex resume smoke passed on
`poe-code@3.0.393`.

The June 9 direct Bun MCP probe used a disposable SDK server and `codex exec`.
The June 12 restricted-mode probes used `poe-code spawn codex --mode edit` with
servers configured as `command = "bun"`; both tool calls completed successfully.
