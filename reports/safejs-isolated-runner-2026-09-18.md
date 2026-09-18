# Native SafeJS release runner preparation — September 18, 2026

## Outcome and scope

Implemented a concrete POSIX process adapter and an explicit, pinned four-stage
release runner. Its sequence is synthetic guard control, unchanged 19 public
core checks, unchanged 10 page-extension checks, and seven finite HTML-module
checks against the real SDK when separately authorized. The new module fixture
uses only an in-memory transport and preserves primary and cleanup failures.

**No updated real SDK, kernel/process control, website, credential, device,
meeting, audio, recording, transcription or delivery gate ran.** The Zoom
notetaker use case is not operational. No package/runtime dependency was added,
default SDK changed, Chromium fallback introduced, or changes pushed.

## Native qualification

Evidence phase:
`node_modules/.cache/native-validation/safejs-guarded-adapter-september18/`.
Final immutable candidate:
`/tmp/agent-browser-safejs-adapter-uqszEG/candidate`.

- `native-core03/EXECUTION.json`: **442 passed, 0 failed in 8 files**, 2.826 seconds.
  The three new files contribute 227 cases: process42, evidence127, runner58.
- `CHECK-core03.json`: build, selected test types, formatting and lint exit zero.
  All validation children/groups close without forced cleanup or timeouts.
- `RUNTIME-core03.json`: 1,662 source and 2,460 compiled pins; 1,654 unchanged
  canonical source pins. Preserve all 42 pre-existing dirty tracked and 700
  pre-existing untracked files. Source/build pins describe this candidate only.
- Explicit native manifest: 1,041 entries, 22 missing committed paths. The eight
  selected files are not a complete-manifest run or a real-process acceptance.
- Native HOME/TMP remain empty. Quality-tool HOME contains an empty Biome cache
  directory; quality TMP contains a Node compile cache. Both are owned temporary
  outputs inventoried in the runtime receipt, not secrets or SDK output.

The first candidate had 428 passing native cases but type/format/lint failures;
those receipts remain. The second had 439 passing cases and clean quality checks
but failed source review. Neither is relabeled as the final qualification.

## Review and negative evidence

`REVIEW.md` records two findings: HOME inside the output grant conflicts with
the historical kernel guard's home exclusion; blocking input open can hang on
a substituted FIFO before its regular-file check. Final code places HOME/TMP in
a non-granted sibling and opens inputs with O_NONBLOCK/O_NOFOLLOW. Three native
regressions cover policy placement, open flags and descriptor closure on a
nonregular input. `native-red01/EXECUTION.json` records **0 passed / 2 expected
failures** when the two distinguishing regressions run against the old runner.

`REVIEW-FOLLOWUP.md` confirms both source fixes and the fourth-stage seven-label
acceptance path, with no new scoped blocker. This is source review, not kernel
isolation or actual module execution evidence. `AUDIT01.json` retains a separate
audit mistake: assuming compiler/formatter caches would remain empty. The final
audit inventories those outputs rather than deleting them or hiding the finding.

## Dependency audit and next acceptance

The corrected local audit verifies all 380 SafeJS0.1.640 package files
(43,728,393 bytes) and its 8,666,098-byte archive against the recorded SHA256
`f464a1db14b8b08deeb558c152e93846e89e1c1664eda8237b380966278d0eeb`.
Twelve prior exact dependencies and cached yaml2.9.0 are available; the exact
safe-fs0.1.640 archive remains missing in the bounded cache search. The
15-package/19-edge traversal uses cached metadata for that missing package;
it is not a fully artifact-backed, staged dependency closure.

The original parent audit prompt omitted the publication directory's `safejs-`
prefix. Preserve `DEPENDENCIES.md/json` and `DEPENDENCIES-CORRECTED.md/json`;
the original missing-path result is not evidence of deletion or storage loss.
Local hashes do not establish trusted publisher identity or current/latest
registry state. No network fetch, package installer or SDK import occurred.

The requested new bounded authorization remains pending. After approval, obtain
the exact missing public artifact, qualify a fresh isolated dependency closure
and approved plan, then attempt the four stages once, stopping on any failure.
The old September 15 SafeJS0.1.599 failed core attempt and skipped page gate
remain historical facts; the new native tests do not supersede them.

## Boundaries

See `SAFEJS-ISOLATED-RUNNER.md` for the operator plan and limits. Approval receipts,
guard code and fixed OS libraries are trust inputs. Child-written reports are
not tamper-proof; the historical guard does not filter exec/clone/fork or ioctl;
numeric PGIDs and cooperative timers do not provide hostile-code containment.
No live socket, TTY, website scripts, top-level-await timing or native Zoom
media capability is claimed.
