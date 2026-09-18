# SafeJS callback-prefix source scheduling proposal

September 18, 2026. **Isolated source proposal, not SDK acceptance or a browser
compatibility pass.** No SDK module, SDK test, native test, page script, website,
socket, TTY, device or credential operation was executed for this contribution.
The parent owns client-page capture. There are no browser transport or redirect
policy changes here.

For the parent's separate, still-pending execution and integration gates, see
[Pending isolated qualification](QUALIFICATION.md). That document is maintained
by the parent and is not modified by this revision.

## Deliverables and pin

- Review patch: `safejs-browser-scheduling.patch`, relative to the upstream
  `poe-code` repository root, not this browser repository.
- Read-only upstream checkout: `/home/kjopek/project/poe-code`.
- Local base commit: `0bafd4f3849f0450481db0f02349c3506c4ab168`.
- `packages/safe-js` Git tree: `dfc1f6e54f06d363eacd19a355fdc591ee2fc6cb`.
- Package manifest identity: private workspace `@poe-code/safe-js@0.0.1`;
  manifest SHA-256
  `5667777c222660b0c55bfa5cf9425c548d593bfd4e769aa10239d0ed56303db8`.
- Isolated root: `/tmp/safejs-browser-scheduling-september18-zjioJ5`.
- Unmodified baseline: `/tmp/safejs-browser-scheduling-september18-zjioJ5/base`.
- Directly edited candidate:
  `/tmp/safejs-browser-scheduling-september18-zjioJ5/candidate`.
- Archive: `/tmp/safejs-browser-scheduling-september18-zjioJ5/upstream-source.tar`;
  SHA-256 `25bfe9d66a9720b35b0093eb9271e48a9c0a69bbd6a68815bfb59483faafcf60`.

The archive contains the pinned root instructions and tracked package files.
Both copies were extracted from it; source and tests were then edited directly
with `apply_patch` in the candidate. Package-scoped upstream status was empty
when pinned. No neighboring dirty work was copied into this patch or modified.
This is a local committed-source observation, **not** a latest-release check or
an equivalence claim about any installed/published `@poe-platform/safe-js` SDK.

## Proposed public contract

Use the explicit construction option:

```ts
const realm = createRealm({ callbackScheduling: "after-prefix" });
const invocation = realm.startCallback(callback);
await invocation.synchronous;
const later = await realm.evaluate("return 1;");
const result = await invocation.result;
```

The example assumes an already registered callback. The host must observe result
rejections and arrange any work needed to resolve its tail before awaiting the
result. This is a public `RealmOptions` addition, already re-exported through the
SDK's existing root and `core` exports; it is not an extension grant or guest
binding. A construction option keeps the existing source/result API and selects
one realm-wide lifetime policy, rather than creating a second evaluator whose
ownership could disagree with ordinary `evaluate` calls.

Intended admission rules:

1. Omitting the option retains existing default source reentry denial while an
   external callback remains pending. Unknown option values reject.
2. In the opt-in realm, all admitted callbacks must have completed their actual
   initial prefix. The marker is set at the existing synchronous-prefix signal,
   immediately before resolving the public `synchronous` handle. Host implementation
   awaits and work inside a joined nested operation do not set it.
3. Later external source may run without awaiting callback results. It may itself
   resolve the guest promise awaited by a callback. `invokeCallback` tracks the
   same boundary even though it only exposes the result promise.
4. Another active source, including suspended top-level await, still rejects
   overlap. Calling ordinary `evaluate` from an active guest-owned host phase is
   rejected. Rejected work is not silently queued or replayed.
5. Source and guest jobs use the same existing FIFO execution queue, scope,
   compilation owner and budgets. No wrapper source, new realm, source replay,
   private browser state access or dropped callback is involved.

The existing browser adapter and nineteen-check released-SDK fixture are **not
changed**. They do not select this new option today. The unchanged default would
therefore still deny ordinal12. A separately authorized integration must explicitly
select the public option while retaining ordinal12's original success expectation;
default-denial coverage must remain separate. This proposal does not turn an
expected denial into a browser acceptance pass.

## Ownership, results and cleanup design

- `active` remains the source owner in opt-in realms. Callback records separately
  retain closures, prefix state and result promises. Source finalization clears
  its owner only if it still owns that exact promise; callback completion does
  not clear a source owner.
- Script evaluation enters a real queued job and uses the existing internal
  joined execution path, without changing source text, declarations or result
  export. The public authorized-nested-operation checks remain in force.
- Module results still use the existing namespace exporter. Registration and
  linking are queued in opt-in mode. A per-source import group joins that source's
  dynamic imports, while callback invocation exits that group; an independent
  callback import must not force the later source to await its tail.
- Source and callback work are tracked separately from public promises that may
  be awaiting cleanup. The queue also tracks the full lifetime of normal and
  nested jobs, including suspended jobs. After cancellation, disposal joins those
  lifetimes and module work before releasing realm resources.
- Pending callbacks hold a conservative budget-reconciliation lease. Compiled
  tickets are not discarded, graph reconciliation is deferred, and provisional
  rollback cannot erase another operation's allocations while held. Normal
  reconciliation resumes only when there are no callback records or source owner,
  or after interrupted work has unwound during disposal. Limits stay cumulative.
- Callback errors in the opt-in mode abort other work. A failed callback rejects
  without awaiting global disposal, because a host operation may be awaiting that
  very callback. An external `close()` observes completed cleanup and cleanup
  errors. New work during cancellation fails immediately rather than joining
  disposal from within a live caller.
- Completed opt-in callbacks now run the same unhandled-guest-rejection check
  used by ordinary operation settlement, after their raw invocation completes
  and before their public result succeeds. A discarded guest `Promise.reject`
  rejects that result and enters the existing poison/background-disposal path,
  even if the callback itself returns a successful value. This checkpoint does
  not acquire a source owner, drain the realm queue, or join other callback tails.
- Ordinary rejection checkpoints are operation-aware in opt-in realms. Each
  source and callback has a distinct internal attribution token propagated through
  async work. A checkpoint includes its own records, unowned records and records
  from completed operations, but excludes other still-active operations. Fatal
  budget/reentry errors remain realm-wide. Default checkpoints remain global.
- Resumable frames refresh attribution from their actual resumer; ordinary jobs
  and registered promise reactions retain their captured attribution. This changes
  rejection metadata, not execution ownership or which work a checkpoint joins.
- Reentrant `close()` from an active guest-owned host operation initiates abort
  but rejects with `code: "reentry"`. External close joins disposal. This avoids
  claiming that cleanup completed while that host call still retains guest frames.

No guessed microtask count determines admission or prefix completion. The pinned
SDK's existing queue-drain and unhandled-rejection-flush routines are retained for
ordinary evaluation settlement; they are not newly introduced prefix detectors.
This patch does **not** establish that those inherited routines are a deterministic
general quiescence protocol. The new full-lifetime join is used only after abort
for disposal, never to admit later source by draining callback tails.

## Source and test files in the patch

All paths below are relative to the pinned upstream root:

| File | Change |
| --- | --- |
| `packages/safe-js/src/realm.ts` | Public option, prefix admission, source ownership, callback lifetime tracking, cancellation and delayed cleanup. |
| `packages/safe-js/src/interp/jobs.ts` | Track job lifetimes and capture rejection attribution, refreshing explicitly resumed frames. |
| `packages/safe-js/src/interp/budget.ts` | Conservative reconciliation/disposal holds shared across budget views. |
| `packages/safe-js/src/interp/values.ts` | Suppress compiled-value graph reconciliation during a hold. |
| `packages/safe-js/src/interp/promise-tracker.ts` | Attribute promises to operation contexts and filter ordinary rejections at owned checkpoints. |
| `packages/safe-js/src/interp/promise.ts` | Preserve registration-time attribution for independent promise reactions. |
| `packages/safe-js/src/interp/promise-tracker-ownership.test.ts` | Authored filtering, resumed-frame, independent-continuation, completed-owner and fatal-error regressions. |
| `packages/safe-js/src/modules/source-graph.ts` | Separate source/callback import completion groups and queue module preparation. |
| `packages/safe-js/src/realm-browser-scheduling.test.ts` | Authored public SDK contract and lifecycle cases. |
| `packages/safe-js/src/interp/budget-reconciliation-hold.test.ts` | Authored held-ticket and overlapping-allocation accounting cases. |
| `packages/safe-js/README.md` | Proposed user-facing option and lifecycle contract. |

Authored coverage includes pending-tail/later-source progress with guest-driven
resolution, declarations and identity, unchanged default denial, immediate and
host-blocked unfinished prefixes, simultaneous sources, source-owner races,
callback FIFO order, retained arguments and compiled locals, step/data exhaustion,
source/callback error, abort/close, queued cancellation, joined callback failure,
cleanup failure, late module resolution, module namespaces, top-level-await
ownership and source-versus-callback dynamic-import completion.

The focused rejection-settlement revision additionally authors paired default
and opt-in cases for discarded versus handled guest rejections. The discarded
case requires result rejection, denial of the next callback without intervening
source evaluation, automatic exactly-once cleanup before external close, and an
unchanged completed prefix. Separate cases cover cancellation of another pending
tail and a host-joined callback without waiting on its source owner. The existing
pending-tail/later-source and ownership-race cases are retained unchanged.

## Validation and exact limitations

Only source-level checks are authorized and performed. Worker checks:

- TypeScript **5.9.3** `createSourceFile` syntax parsing of all ten changed/new
  TypeScript files: zero parse diagnostics. The compiler was imported, not the
  SDK or tests. This worker check did not resolve modules, typecheck, emit or run
  tests; the parent's separate semantic comparison is recorded below.
- Whitespace/diff inspection and patch applicability checking against the isolated
  pinned baseline. Applicability is not semantic validation.
- Receipt location:
  `node_modules/.cache/native-validation/zoom-client-evaluation-september18/scheduler-worker/`.

### Focused review correction (revision one)

The independent source review at
`node_modules/.cache/native-validation/zoom-client-evaluation-september18/scheduler-review/REVIEW.md`
identified a real omitted check: an opt-in callback returning `1` after discarding
`Promise.reject("callback rejection")` bypassed ordinary operation settlement.
The fix changes only `src/realm.ts` and `src/realm-browser-scheduling.test.ts`
within the candidate package. Ordinary `perform` still drains the queue and
checks rejections in its original order; the callback only reuses the rejection
check, not `perform`, its owner, queue drain or disposal wait. A new callback-side
open-state check also prevents successful settlement after concurrent cancellation.
The underlying rejection tracker's existing flush implementation is unchanged;
no new guessed microtask count or prefix-completion heuristic is introduced.

Pre-fix candidate snapshot:
`/tmp/safejs-browser-scheduling-september18-zjioJ5/rejection-fix-before`.
Fresh syntax/applicability receipts and revision-only patch:
`node_modules/.cache/native-validation/zoom-client-evaluation-september18/scheduler-worker/rejection-settlement-fix/`.
Earlier receipts and parent snapshots are preserved rather than relabeled as
post-fix evidence. The contribution patch is regenerated against the same pinned
upstream base. Parent-reported pre-fix semantic V2 results do not qualify this
revision; the parent owns the fresh semantic comparison and generated type-only
declaration inputs. This worker has not copied those inputs or run that comparison.

### Rejection ownership correction (revision two)

`scheduler-review/FOLLOWUP.md` identified a new concrete defect in revision one:
a successful callback could scan an unfinished source's ordinary rejection and
abort that source before its later catch. Revision two adds operation attribution
inside the existing rejection tracker and passes the appropriate token from both
source and callback completion checkpoints. This is not a blanket exemption for
callbacks during active source execution.

Each promise record retains the token from its first tracking registration;
retracking an outcome does not transfer ownership. Tokens remain active through
their operation's checkpoint and finish in `finally`. Other active owners are
excluded only for ordinary rejections. Completed-owner records are not removed,
so their late rejections, including new promises from late async continuations,
remain eligible at the next completion checkpoint. The active-token registry is
a `WeakSet`; this is not a new strongly retained list of completed operations.

The actual prefix signal, public API, source owner, raw-work/disposal joins and
default global-check policy are unchanged. No new queue/tail drain or wait for
another operation is introduced. The tracker's existing flush is not changed.
Fatal budget/reentry notification and detection remain unfiltered and realm-wide.
This does not define native JavaScript unhandled-rejection event timing: a late
ordinary rejection with no subsequent checkpoint does not gain a new idle-time
watcher in this revision.

New authored tests retain the follow-up's gated scenario in paired default/opt-in
modes, cover source-versus-callback and two-callback interference, queued jobs and
guest-await propagation, successful and failing joined callbacks, and late
rejections from previously completed source/callback owners. Focused tracker
cases cover default global checks, unowned records, retracking, newly created
late-continuation promises and unfiltered fatal failures. Earlier idle rejection,
cleanup and pending-tail/later-source tests remain unchanged. None is executed.

Pre-ownership snapshot:
`/tmp/safejs-browser-scheduling-september18-zjioJ5/ownership-fix-before`.
Fresh receipts and four-file revision-only patch:
`node_modules/.cache/native-validation/zoom-client-evaluation-september18/scheduler-worker/rejection-ownership-fix/`.
Only candidate `src/realm.ts`, `src/realm-browser-scheduling.test.ts`,
`src/interp/promise-tracker.ts` and `src/interp/promise-tracker-ownership.test.ts`
change in this revision. Original review, prior receipts and parent snapshots
are preserved. Fresh semantic checking is required after this freeze.

### Parent semantic comparison (revision one, before ownership correction)

The parent separately checked the revision-one frozen correction with the existing
TypeScript 5.9.3 compiler, strict NodeNext settings and no emission. Fresh source
snapshots receive the same four pinned existing generated Intl `.d.ts` files;
no generated JavaScript, SDK module, test body or generator is executed.

| Targeted source selection | Semantic errors | Compiler-loaded files |
| --- | --- | --- |
| Unmodified source, without the new tests | 0 | 562 |
| Unmodified source plus the final new tests | 9 | 594 |
| Corrected candidate plus the same new tests | 0 | 594 |

All nine baseline-with-new-tests diagnostics refer to absent proposed APIs:
five budget-hold references and four callback-scheduling option references.
This is static old-API incompatibility, not a runtime red/green test result.
Those seven revision-one TypeScript roots and their resolved dependencies passed this
targeted semantic check; no full SDK build or browser typecheck is implied.

Exact final stages, compiler/source/declaration hashes and execution receipts:
`node_modules/.cache/native-validation/zoom-client-evaluation-september18/TYPECHECK-FINAL-STAGES.json`.
All three children/groups close with no IO attempts, no socket probe, empty
private HOME/TMP and zero compiler writes. Initial V1/V2 diagnostics remain
preserved, including the incomplete-declaration runs; they are not relabeled
as successful checks. The preserved snapshot root is
`/tmp/agent-browser-scheduler-final-types-XdxNEy`. Revision-one worker receipt
hashes describe its earlier README; the parent-added semantic section did not
alter that revision's frozen source patch. These results are not a semantic
pass for revision two or its added tracker/test roots.

### Parent semantic comparison (revision two)

The first revision-two comparison preserved one candidate TS2769 diagnostic in
the new tracker test: a union argument did not match the overloaded
`SandboxError` constructor. The parent moves the unchanged conditional outside
the constructor, selecting the same two error values through their respective
overloads. No SDK implementation or test assertion changes in that correction.
The cumulative patch is regenerated and passes `git apply --check` against the
same pristine base. The worker's frozen receipts retain their original hashes.

Fresh no-emit semantic results after that test-only correction:

| Targeted source selection | Semantic errors | Compiler-loaded files |
| --- | --- | --- |
| Unmodified source, without the new tests | 0 | 562 |
| Unmodified source plus the three new test files | 55 | 595 |
| Corrected candidate plus the same new tests | 0 | 595 |

The candidate's nine TypeScript roots and resolved dependencies pass this
targeted strict check. The old-source diagnostics concern the unavailable new
contract; they are not behavioral red/green evidence. Exact source/declaration
pins and executions are recorded in
`node_modules/.cache/native-validation/zoom-client-evaluation-september18/TYPECHECK-FINAL-OWNERSHIP-STAGES.json`.
The prior one-error candidate remains under `TYPECHECK-OWNERSHIP-STAGES.json`;
the test-only correction is recorded in `parent-test-type-fix/README.md` in the
same phase. All final children/groups close with no IO, no socket probes, empty
private HOME/TMP, zero compiler writes and no SDK/test execution. These results
do not replace runtime qualification or constitute a full SDK build. They precede
the generator-attribution correction below and do not qualify its changed source.

### Resumable-frame attribution correction (revision three)

`scheduler-review/OWNERSHIP-FOLLOWUP.md` traced a suspended generator's native
async context to its first resumer. A callback resuming it while that source was
still gated could incorrectly attribute its newly discarded rejection to the
source, excluding it from the callback checkpoint. Revision three replaces the
tracker's private operation store with job-local attribution metadata, keyed by
tracker. An explicit operation scope overrides its current frame without
mutating that frame's ordinary execution owner.

Ordinary queued/prefix jobs capture immutable attribution maps. The existing
resumable-context reconnection also refreshes that frame's map from its actual
resumer, after the existing ancestry-cycle guard. Native awaits in the same
generator body therefore read the refreshed map, while a separately spawned
async job keeps its original map through suspension/reacquisition. Authorized
joined prefixes preserve their invoking attribution even when sharing another
job's execution token. No admission, prefix, budget, cancellation or cleanup
rule changes; realm code and the ownership filter are untouched in this revision.

Promise reactions and captured notification schedulers explicitly preserve the
registration-time map. This is necessary because their native async context can
also retain the mutable generator frame: a later resumer must not relabel an
independent reaction registered earlier. Existing promise records still keep
their first-registration owner. Default checkpoints and fatal budget/reentry
behavior remain global. There is no new drain, idle watcher or guessed wait.

Five added tests require: the review's exact gated-source/callback generator
failure and cleanup without releasing the source; the reverse callback/source
direction without releasing the callback; an earlier generator-registered
reaction remaining with its registering source; existing-record ownership plus
new child work under the resumer; and an independently suspended async job not
acquiring the owner that releases its gate. Tests were authored first and are
not executed. Earlier cases and the parent's constructor-overload correction
remain intact.

Pre-fix snapshot, including that parent correction:
`/tmp/safejs-browser-scheduling-september18-zjioJ5/generator-fix-before`.
Fresh receipts and the five-file revision-only `revision.patch`:
`node_modules/.cache/native-validation/zoom-client-evaluation-september18/scheduler-worker/generator-attribution-fix/`.
The cumulative patch now contains eleven source/test/doc files; syntax parsing
covers its ten TypeScript files. Only syntax, whitespace and patch applicability
are checked by this worker. Fresh parent semantic comparison and separately
authorized runtime qualification remain pending after this freeze. In particular,
generator delegation/return/throw, custom promise species, independent reaction
ordering and cleanup termination are not execution-qualified by these receipts.

### Parent semantic comparison (revision three)

Fresh snapshots of the generator correction use the same strict no-emit compiler
and four pinned existing Intl declarations as earlier comparisons. Results:

| Targeted source selection | Semantic errors | Compiler-loaded files |
| --- | --- | --- |
| Unmodified source, without the new tests | 0 | 562 |
| Unmodified source plus the three new test files | 72 | 595 |
| Generator-corrected candidate plus those tests | 0 | 595 |

The candidate checks ten TypeScript roots. All 72 baseline diagnostics occur
in test files using the unavailable new contract. No SDK/test body or generator
is executed, and no compiler files are emitted. All three children/groups close
with no IO attempts or socket probes and empty private HOME/TMP directories.

Exact stages and source/declaration pins:
`node_modules/.cache/native-validation/zoom-client-evaluation-september18/TYPECHECK-GENERATOR-STAGES.json`.
The parent also verifies that the cumulative patch exactly equals the canonical
diff of the pristine base and candidate, applies cleanly, has no whitespace
errors, and matches all ten semantically checked source roots; see
`PATCH-VERIFICATION.json` in that phase. The patch SHA-256 is
`90f741bee2349f8841e3bb3f97a043d8227bac63139102859ad167fc23d1c1a8`.
Earlier diagnostics and worker freeze receipts remain unchanged. These are
targeted static checks, not full-build, runtime or browser qualification.

**Every behavioral claim above is intended, not execution-verified.** In
particular, there is no evidence here that the new tests pass, that the code
passes a full SDK build, that cancellation always terminates, or that default SDK behavior,
module graphs, weak references, budget accounting and cleanup remain regression-free.
The source proposal is not ready to activate in the browser on these receipts.

Known policy differences and review obligations:

- Held accounting is deliberately conservative: data/peak usage can be larger,
  and finite data limits may fail earlier than with exclusive execution. Exact
  allocation/reclamation equivalence is not preserved or claimed.
- All callback errors abort an opt-in realm, including failures of callbacks
  joined from host operations. This is stricter than the legacy nested-callback
  path; compatibility with hosts that catch and recover from such failures needs
  review. Reentrant-close rejection is also an explicit opt-in policy difference.
- Import-group propagation, pending-import failure and cyclic-module ordering
  need dedicated runtime review. Shared graph statistics can include module work
  caused by a concurrently progressing callback; isolated per-source cost attribution
  is not provided by this proposal.
- Cancellation joins guest work, not an arbitrary uncooperative native host
  promise forever. Native cleanup hooks must terminate and must not await their
  own enclosing close. Late resolver/host completion suppression remains an
  unverified acceptance obligation, not a successful probe.
- Full default and opt-in SDK regression, full SDK build validation, the
  browser's **nineteen unchanged core expectations**, the separate ten extension
  checks and later scripted-site gates remain outstanding. Authored cases and a
  syntax receipt satisfy none of those execution gates.

No production browser file, native manifest, `TASKS.md`, existing report/evidence,
installed SDK, Git index, commit or push is changed. No new dependency is added.
