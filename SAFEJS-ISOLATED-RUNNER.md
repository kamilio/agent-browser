# Explicit isolated release runner

`scripts/run-isolated-safejs-gate.ts` connects the lifecycle supervisor to the
POSIX process adapter, pinned inputs and concrete fixture evidence. Importing
the runner does not launch a process or import SafeJS. There is no default SDK
selection, dependency installation, website access or browser-engine fallback.

This is preparation for native Zoom support, not a working meeting notetaker.
Real process/kernel controls and SDK execution require their own authorization.
Native mocked-process tests do not satisfy those gates.

## Ordered checks

The runner attempts each stage once, stopping at the first failure:

1. Pinned synthetic filesystem/preload control, without importing the SDK.
2. The existing public release core fixture, with all 19 expectations unchanged.
3. The existing native page-extension fixture, with all 10 expectations unchanged.
4. Seven synthetic HTML-module checks: loading, independent inline scopes,
   imported dependency, duplicate suppression, null currentScript, error
   propagation and closed fixture owners. Transport is in-memory only.

Every stage gets a fresh output directory, empty HOME/TMP, explicit environment,
ignored stdin, exclusive output files, 384 MiB Node heap and a 45-second
cooperative deadline. Ownership is registered before spawning. Group termination,
reaping and absence checks run independently of caller cancellation. Parent
terminal and final records are outside the child's writable output subtree.
Both persisted and final supervisor outcomes are retained; there are no retries.
HOME/TMP are outside all granted trees, matching the historical guard's broad
home exclusion; the fixtures do not receive writable home or temporary storage.
Input files are opened nonblocking/no-follow before their regular-file check,
so substitution with a FIFO cannot block while opening the input.

Acceptance requires exit zero, completed cleanup, empty stderr, exact preload
attempts, matching kernel policy/streams, unchanged inputs, empty HOME/TMP and
the exact ordered fixture checks. A passed count alone is insufficient.

## Operator-reviewed plan

After separate authorization and prerequisite qualification, run the compiled
script with an absolute JSON plan and its explicitly approved SHA256:

```sh
node dist/scripts/run-isolated-safejs-gate.js /private/plan.json \
  --approved-plan-sha256 PLAN_SHA256
```

The flag is an operator assertion, not a mechanism for obtaining user consent.
Do not produce an approved plan or passing prerequisite receipt merely to get
past the checks. Missing dependencies, changed bytes or a failed earlier gate
must be resolved and reviewed before a new authorized attempt.

Plan format 1 requires these fields, with no extra command/environment options:

- `version`: exact SafeJS version, never a floating/latest selector.
- `scope`, `node`, `python`, `guard`, `preload`, `control`, `prerequisites`:
  objects containing an absolute canonical `file` and lowercase `sha256`.
- `runtimeRoot`: compiled tree containing the three release fixture scripts.
- `sdkRoot`: isolated package directory with the expected name/version.
- `outputParent`: owned mode-0700 directory, disjoint from every input tree.
- `inventories`: two to sixteen `{root, manifest, read}` objects. Each manifest
  is a pinned JSON object mapping relative paths to `{sha256}` or `{link}`.
  Inventory walks reject extra/missing files, changed bytes, escaping symlinks,
  special files, excessive depth and excessive entry counts. `read: true`
  grants the verified tree to the child; keep source-only inventories false.

The pinned prerequisite receipt must record `passed`, `dependencyClosureVerified`
and `sourceAndBuildVerified` as true, with matching `version` and `scopeSha256`.
Those fields represent separately reviewed evidence; this runner does not
acquire packages, resolve their dependency graph or qualify its own compiler.
Runtime and SDK roots must be covered by read-only inventories. Use fresh
isolated stores, not the working repository or credential-bearing directories.

The historical ABI-1 Python guard, preload and synthetic control remain at
their original evidence paths under
`node_modules/.cache/native-validation/safejs-isolated-gate-september15/`.
Select and review their exact hashes in the plan; do not silently rewrite old
artifacts or substitute another guard. They are not imported by native tests.

## Explicit limits

- Approved plans, prerequisite receipts, guard code and operator-selected
  inventory contents are trusted. This is not a hostile-code security boundary.
- Fixed OS library/zoneinfo paths are readable and are not content-pinned.
  Guard installation and child-written reports are not tamper-proof evidence.
- The historical kernel guard does not filter exec/clone/fork or ioctl.
  The JS preload denies known process/worker APIs, not every possible escape.
- Numeric process groups cannot eliminate PID reuse or escaped descendants.
  Hard wall-clock/resource containment needs an external supervisor; host timers
  cannot interrupt arbitrary synchronous filesystem stalls.
- No real socket/TTY, credentials, passkeys, audio, website script, Zoom
  admission, recording, transcription or delivery acceptance is implied.
  Top-level-await scheduling is not covered by the module fixture.

As of September 18, 2026, SafeJS 0.1.640 is a locally pinned candidate, not a
claim about the latest release. Its exact safe-fs dependency is still missing
from the audited local artifacts. No updated real-SDK gate has run.
