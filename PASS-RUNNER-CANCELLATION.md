# Default pass runner cancellation

The host-only default `PassSecretProvider` runner now starts the explicitly
configured executable in a fresh POSIX process group/session. It still uses fixed
`show` arguments, no shell, ignored stdin, bounded piped stdout/stderr and disabled
password-store extensions. No new dependency, root API, executable discovery or
credential source has been added. The agent still supplies constant references;
the broker's origin checks and command host's session sealing are unchanged.

## Lifetime and platform policy

- The default runner fails closed on Windows before spawning. Emulated branch
  tests are not Windows OS acceptance. A trusted custom `runner` remains supported
  with unchanged responsibility for its own execution and cancellation behavior.
- Cancellation, timeout, output overflow and child/pipe errors request one group
  `SIGKILL` using the PID captured immediately after spawn. Only integers from 2
  through 2,147,483,647, excluding this process's PID, may be negated for that call.
  Zero, -1, self-targets, unsafe values and later mutations of the child PID are
  not used as group targets.
- Missing/invalid PIDs or group-signal errors use the existing owned child handle
  as best-effort fallback. Kill and stream-destruction errors cannot expose their
  messages or escape the cancellation callback. Both streams are destroyed and
  the operation rejects generically; rejection does not wait indefinitely for
  a child `close` event.
- Cleanup is idempotent. Close retires the signal target before settling the
  runner. Late error callbacks cannot signal it again; late chunks are wiped and
  are not forwarded. Normal close does not trigger a group signal. Successful
  first-line selection, status checks, UTF-8 handling and output quotas remain.
- The child is not unreferenced. Detachment does not mean background execution
  has become an accepted resource-lifetime policy.

Process groups are not a sandbox or universal descendant guarantee. A helper may
escape its group/session, and an already-running external agent such as gpg-agent
is not owned by this runner. Fallback can stop only the direct child; permissions,
scheduling, PID/group reuse and OS errors remain constraints. There is no atomic
PID-handle group-signal primitive here, no verified arbitrary descendant cleanup,
and no general cleanup guarantee for descendants after normal completion.
Real vault interaction, pinentry/consent and actual credential strings remain
separately gated. Existing plaintext-at-rest and JS string-zeroization limitations
are unchanged.

## Verification

Evidence is under
`node_modules/.cache/native-validation/pass-runner-cancellation/`.

The clean baseline at d6fe7ce reproduces two targeted synthetic regressions:
missing detached launch and missing group cancellation. The other 41 cases in the
new suite were intentionally not selected for that baseline run. No real process
or signal was involved in those failures.

The clean candidate passes 296 tests across exactly four manifest-listed suites:
43 new default-runner cases, plus 253 existing provider/broker/config cases.
Spawn, process signaling and provider file entry points are mocked in these
suites. Tests cover launch isolation, cancellation timing, failure sanitization,
output limits/zeroing, repeated/late events, PID admission/fallback and concurrent
group isolation. Build, strict new-suite types and two-file Biome checks pass.
This is not a full-manifest or real-vault result.

A separately authorized Linux/Node 22.22.0 probe ran September 5, 2026 from
12:38:30.639085744 to 12:38:30.725253700 UTC. It called the real default provider
with an explicitly synthetic Node executable instead of pass. That executable
created one Node helper. Before abort, nonce-bound readiness records and /proc
checks established PID/start-time identity, parentage, exact script arguments,
and a group/session shared by both fixtures but separate from the harness.

After cancellation, both process records were absent within the 21 ms observation
window, and the provider rejected with only its generic error. Exit 0 and empty
stderr are retained. This observation precedes the fixtures' 7-second self-exit
deadlines. It proves this one synthetic cancellation observation, not every OS
schedule, descendant, actual pass implementation or keyring. Missing /proc records
do not prove a particular wait/reap mechanism; the probe makes no reaping claim.

The raw report's `cleanupSignals` field describes **additional harness cleanup**:
none was issued. It does not mean the provider sent no cancellation signal, nor
that the observed early disappearance was attributed to the self-exit timers.
The report, source, timestamps and outcomes remain unmodified.

The pinned official Node 22 documentation was separately read through the native
browser, with captured bytes/hash verification and partial/extracted-unverified
status. Local installed Node source/header inspection supports the signed 32-bit
and negative-group-ID admission details. These are source checks, not substitute
process or vault probes. See `research/node-process/REPORT.md` and
`research/local-process-semantics.md` within the evidence directory.

The selected SafeJS runtime, passkey/RP policy, stopped research lanes and existing
denied acceptance gates are untouched. The complete browser goal remains open.
