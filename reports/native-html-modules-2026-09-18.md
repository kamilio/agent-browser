# Native HTML module integration

Audited candidate: `/tmp/agent-browser-html-modules-He6Ygy/candidate`, at
2026-09-18T00:34:55.602Z, based on canonical commit
`81dd1f37b3a68bb8eeacd4f5b09e9932404b3ec0` plus explicitly owned changes.

**Outcome: HTML module loading is wired through the native loader and page
runtime, with isolated contract qualification. Actual SafeJS and website
execution remain unverified. No Zoom meeting was joined or audio captured.**

## Changed behavior

- Explicit `AGENT_BROWSER_PAGE_SCRIPTS=module` requires the extension adapter
  and a configured SafeJS package root. Classic and disabled modes retain their
  behavior; legacy module selection fails before SDK/process activation.
- Parser-inserted module entries now reach the document-owned module registry
  through `PageScripts`, then evaluation with the exact registered identity.
  Inline entries have non-fetchable identities and separate captured import
  bases. External identities remain requested URLs, while imports use final
  response URLs as bases.
- Roots and dependencies share bounded source/request caches and credential
  contexts. External loads use policy-aware CORS, JavaScript MIME, UTF-8 and
  original-byte SRI. Cached response digests allow integrity checks without
  keeping body arrays or repeating a fetch. Source-only configured entries
  cannot satisfy integrity without those response digests.
- Module-capable mode skips classic `nomodule` scripts, defers modules by
  default, supports explicit async scheduling, suppresses duplicate external
  entry evaluation and keeps module `currentScript` null. Modules receive no
  parser `document.write` insertion capability.
- Review caught a host-input admission defect: inherited Proxy traps could
  cancel or close a scope and still allow late inline registration. The fix
  uses shared descriptor-only input checks, rejects Proxy ancestors before
  traps can run, bounds prototype traversal and rechecks liveness before state
  changes. The same introduced lookup hazard is removed from `PageScripts`.

See `HTML-MODULES.md` for configuration and remaining behavior boundaries.
No runtime dependency, alternative interpreter or browser fallback was added.

## Qualification

Final guarded native run: **818 passed, 0 failed, in 23 files**. Of these,
184 cases are in the five new files:

| New test file | Passed |
| --- | ---: |
| `page-html-modules.test.ts` | 87 |
| `script-loader-modules.test.ts` | 35 |
| `html-module-runtime.test.ts` | 24 |
| `cli-module-mode.test.ts` | 11 |
| `node-session-module-mode.test.ts` | 27 |

The remaining selected files cover existing module registries, runtime adapters,
classic loading/policy, parsing, CLI/session contracts, CORS fetching and SRI.
Build, test types, formatting and lint all exit zero. The run takes 10.986
seconds; that is test duration, not a measured website-performance improvement.
Process/group closure passes, with empty private native HOME/TMP directories.

The audit verifies **1,655 source and 2,444 compiled hashes**, including 1,634
unchanged canonical inputs. The 1,038-entry native manifest retains 22 absent
committed paths. This is not a full-manifest pass. Existing process/CLI suites
`node-session-process.test.ts`, `cli.test.ts` and `node-session.test.ts` are
excluded because they are not in the native manifest; new mocked wiring tests
do not replace those separate process/runtime acceptance gates.

## Negative controls and preserved evidence

- Restoring only the prior classic-only loader makes all three selected
  loader/pipeline regression cases fail. The final loader passes them.
- The seven new prototype-admission regressions fail against pre-fix core02
  production and pass in the final core03 candidate.
- Core01 retains its original 810/1 native result, CLI literal-union type error
  and formatting/lint failures. The close test expected abort for a document
  that explicitly closes; its corrected expectation retains settlement,
  canceled signal, no late execution/event, and no resurrected state assertions.
- Core02 retains its 811/0 result and green quality checks, but the independent
  review found the admission defect afterward. Green tests were not treated as
  proof that review was unnecessary.
- The core03 static followup confirms the admission correction and identifies
  no new scoped blocker. It does not independently execute or certify the tests.
- All original review, raw executions, failures, manifests and negative controls
  remain under `node_modules/.cache/native-validation/html-modules-september18`.
  Companion JSON records their paths, hashes, scope and exact outcomes.

All 42 pre-existing dirty tracked files and 700 individual untracked files are
preserved. The existing `command-host.ts` user changes are checked as an exact
normalized diff separately from this feature. The prior WebSocket runtime and
its source/compiled pins remain unchanged. No historical website result is
rewritten or presented as a new live validation run.

## Not yet established

The integration tests use deterministic transport and fake SafeJS contracts.
They do not execute general JavaScript in another interpreter or prove module
execution in a published SafeJS release. The existing single evaluation promise
also cannot model top-level-await and DOMContentLoaded phases fully; a module
waiting for a delayed lifecycle event can hit the existing deadline.

Import maps, general dynamic script insertion, actual SDK/runtime acceptance,
real process/socket behavior and live-site interoperability remain open. The
previous Zoom entry capture still has zero extracted Markdown bytes; no new
Zoom request, authentication, admission, audio, recording, transcription or
delivery happened in this phase. Native media and the complete notetaker outcome,
the research tasks, wider website validation and credential/passkey gates remain
part of the unfinished browser objective.
