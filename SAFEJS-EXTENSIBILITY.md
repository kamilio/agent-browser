# SafeJS extension boundary

September 1, 2026. The user asks for an easily extensible SafeJS architecture.
Existing bindings, registered modules, host objects and callbacks are useful
primitives, but are not yet one extension lifecycle contract. This work is part
of the active browser goal, not a substitute for browser compatibility.

## Upstream handoff

September 2, cooperation checkpoint: `SAFEJS-COOPERATION.md` adds cancellable
host scheduling checkpoints while retaining the active guest job, and fixes Date
ownership cleanup on failed realm initialization. This improves local realm
responsiveness, not the composable extension lifecycle requested in #540.
No new upstream issue/comment or publication is made; the performance publication
pause remains in force. Browser-owned native navigation now survives guest shutdown.

September 2, Date checkpoint: `SAFEJS-DATE.md` adds sandbox-owned timestamp slots,
realm-owned prototypes, explicit realm/run clocks and journaled current-time
replay. Calendar calculations use bounded host Date primitives, not native guest
constructors or an evaluator. Date value snapshots, locale formatting and the
unified extension lifecycle remain unfinished. The existing #543 request is not
claimed merged; the new source stays in the local contribution candidate.

September 2, retention checkpoint: the isolated candidate adds exact shallow-shape,
immutable-descriptor and same-scope capture scan reuse, plus a guard against an
unnecessary compile escape scan. These are interpreter internals, not new browser
capabilities or a finished extension lifecycle. `SAFEJS-RETENTION-PERFORMANCE.md`
records deterministic regressions and real-site measurements. Books still fails
the production watchdog. Performance publication remains paused; no new issue,
comment or release is claimed.

September 2, attribute checkpoint: #546 requests bounded dynamic named host
properties, now implemented in the isolated candidate
(`SAFEJS-NAMED-HOST-OBJECTS.md`). DOM attributes stay in the browser package.
Profiling also found costly retained-graph reconciliation; its detailed public
issue submission was denied by approval review. The unposted local evidence is
in `SAFEJS-RETENTION-PERFORMANCE.md`. #543 received approved additional Date
evidence. None of this completes unified extension registration/lifecycle.

September 2, 02:06 UTC: #545 requests bounded indexed live capabilities, now
implemented in the isolated candidate (`SAFEJS-INDEXED-HOST-OBJECTS.md`). The
browser owns collection querying/caching; SafeJS handles virtual index access,
identity, budgets and revocation. No private interpreter imports or native Proxy
workaround is used. This is not a unified extension registry or an upstream release.

September 2, 01:47 UTC: the local candidate adds ordinary Object intrinsics for
#544, including realm isolation, budgets and explicit snapshot limitations
(`SAFEJS-OBJECT-PROTOTYPE.md`). This is another reusable interpreter primitive,
not the unified extension registration/lifecycle contract. Date remains open;
Books now reaches missing browser DOM collection queries. No upstream release
or merge is claimed.

September 2, 01:30 UTC: the local candidate implements a bounded guest-function
object model for #541, documented in `SAFEJS-FUNCTION-OBJECTS.md`. It does not
implement the extension lifecycle below. The next real-site intrinsic blockers
are filed as #543 (Date) and #544 (Object prototype inspection), both verified open.
No upstream release or merge of the local candidate is claimed.

September 2: `poe-platform/poe-code#542`, verified open, requests identity-preserving
guest arguments across deferred host callbacks. `SAFEJS-GUEST-REFERENCES.md`
documents the local public primitive and tests. It complements, but does not
complete or replace, the composable lifecycle request below.

The user subsequently authorized opening Poe Code issues. On September 1, 2026,
the extension/lifecycle work was filed as `poe-platform/poe-code#540`; the separate
guest function-object/prototype blocker is `poe-platform/poe-code#541`. Both were
verified open after creation. Bodies are preserved in `upstream-issues/`.
Current upstream main was inspected at
`1a13eb31dd2671828ed3419d9397d7264b5b6788`; its public core does not yet expose the
proposed realm/extension surface. Do not claim these requests are implemented.

The draft failing contract tests are preserved separately in
`contributions/safejs-extension-contract-tests.patch`, not applied to the working
SDK and not included in its passing-test counts. They describe a proposed API,
not an accepted upstream spelling. Prefer reviewing and integrating the upstream
implementation over developing a competing extension framework locally.

## Boundary

- Keep JavaScript grammar, objects/prototypes, regex semantics, intrinsic globals,
  accounting and interpreter execution in the core. Fix semantics there rather
  than teaching each browser adapter a different JavaScript language.
- Define explicitly selected, versioned, trusted extensions for host APIs. The
  browser owns DOM, events, timers, network policy and storage; SafeJS must not
  import the browser or discover/install plugins implicitly.
- Extension manifests declare names, required capabilities and provided globals.
  Hosts grant capabilities explicitly. Reject incompatible versions, duplicates,
  missing grants and global collisions before running any factory.
- Factories run once per realm and return explicit bindings through the existing
  host bridge. Factory setup is synchronous; exposed operations may be async.
  Each factory gets cancellation, cleanup registration and explicit work charging,
  not raw scope/VM internals or a mutable budget handle.
- Initialize lazily before the first source, inside the realm's owned operation.
  Close without evaluation must not acquire extension resources. Dispose in
  reverse registration order, including partial setup failures; await all cleanup
  attempts before settling close and report cleanup failures.
- Native extensions are trusted code, not sandboxed plugins. Declarations do not
  prevent arbitrary host code from accessing the OS or hanging. Keep external
  process deadlines/isolation and explicit network authorization.

## Tasks and acceptance

- [ ] Public `defineExtension` and versioned manifest/context types, exported from
  the lightweight core and full SDK without additional dependencies.
- [ ] Realm registration, capability checks, conflict detection, factory isolation,
  lazy initialization, reverse disposal and failure cleanup.
- [ ] Regression tests for malformed declarations, capability denial, global
  conflicts, asynchronous factory rejection, cancellation, work-budget exhaustion,
  cross-realm state isolation and post-close capability revocation.
- [ ] Browser DOM/events integration through the contract rather than a second
  browser-specific registration mechanism; exercise the actual compiled SDK.
- [ ] Document consistent integration with `run()` and its existing module
  registry; do not claim that snapshot/replay or module extensions are solved by
  realm-only support.
- [ ] Preserve an apply-checked upstream candidate and record genuine website
  behavior, including failures. Do not publish or install a dependency.

## Preceding compatibility checkpoint

Numeric regex backreferences and positive/negative lookahead now execute in the
existing metered matcher, without native RegExp fallback. Thirty-one backreference
and thirty-five lookahead tests pass; the regex directory passes 190 tests.
The broader SDK run records 7946 passes, 30 fixture failures and six skips; its
54 failed file paths are unchanged from the previous 7882-pass checkpoint.
Real Quotes to Scrape jQuery now parses fully, then fails
when assigning guest function properties/prototypes. Books to Scrape still needs
parser-integrated document.write. Neither is a passing dynamic website.
