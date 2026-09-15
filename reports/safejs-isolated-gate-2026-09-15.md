# Isolated SafeJS release gate — September 15, 2026

## Outcome

**The compatibility gate fails.** The explicitly selected
`@poe-platform/safe-js@0.1.599` imports successfully and completes 11 of the
19 required core checks. Execution stops while attempting the twelfth check:
evaluate new source after a callback's synchronous prefix has completed but its
asynchronous tail remains pending. The retained error is
`Sandbox object is already running.` The remaining seven checks are not reached.
The ten-check in-memory
browser-extension fixture is **not run**. No SDK retry or default activation.

This is new compatibility evidence, not a general claim that SafeJS is broken,
that JavaScript websites now work, or that 0.1.599 is the latest release.
The overall browser objective remains active. No website was browsed during
SDK execution and no credentials, profiles, passkey devices or TTY were used.

## Authorization and isolated staging

Approval `remote-1789464736117360030-2441178` returned `Approve isolated gate`;
the recorded observation is September 15 at 12:26:09 UTC. The unchanged scope is
the private `source-redirect-runtime-september15/SAFEJS-APPROVAL.md` record.
This gate is no longer waiting for that approval; its blocker is the observed
contract failure, with additional launcher hardening required before reuse.

The existing pinned SDK tarball is copied into a separate physical package store,
outside project dependency resolution. Fourteen dependency packages are acquired
through the native browser's transport: **28 GETs, all HTTP 200, no redirects**.
Every request and socket has a matching close event; all acquisition children and
groups close. No cookie jar or credential headers are supplied, and returned
cookies are not replayed. No npm install, lifecycle scripts, new direct browser
runtime dependency, or global/project resolution changes.

| Package | Selected version |
| --- | --- |
| `@poe-platform/safe-js` | `0.1.599` |
| `@poe-platform/safe-fs` | `0.1.599` |
| `@formatjs/bigdecimal` | `0.2.7` |
| `@formatjs/intl-durationformat` | `0.10.18` |
| `@formatjs/intl-localematcher` | `0.8.13` |
| `@formatjs/fast-memoize` | `3.1.7` |
| `@formatjs/intl-numberformat` | `9.4.0` |
| `@petamoriken/float16` | `3.9.3` |
| `@types/node` | `25.2.2` |
| `undici-types` | `7.16.0` |
| `jose` | `6.1.3` |
| `temporal-polyfill` | `1.0.4` |
| `temporal-spec` | `1.0.1` |
| `temporal-utils` | `1.0.2` |
| `yaml` | `2.8.2` |

Exact declarations are retained; simple caret/tilde ranges select their explicit
floor, not the newest satisfying release. All 19 dependency edges resolve to
their pinned package directories. None of these packages declares optional or
peer dependencies. SHA-512 tarball integrity, available SHA-1 metadata, extracted
file hashes and link targets are checked. Total: 11,195,779 downloaded bytes;
2,686 package files containing 137,923,752 bytes. The final audit also rejects
extra physical package files/symlinks and extra compiled-runtime files.
These checks are byte/provenance records, not publisher attestation verification.

Two earlier acquisition harness attempts fail local cookie-context validation
before dispatch: each observes zero HTTP requests. Both are retained. The third
harness omits the unused cookie context and completes the above acquisition.

## Preserved host controls

Each control uses only synthetic owned files and does not import the SDK.
The original attempts and input hashes are retained, not relabeled as successes.

| Control | Result | Reason / correction |
| --- | --- | --- |
| `runtime/guard-control` | Exit 1 | Host supports Landlock ABI 1, not the required ABI 3. Stops before Node. |
| `runtime02/guard-control` | Exit 13 | ABI1-compatible guards install; Node's OpenSSL config read is denied. Stops before preload/SDK. |
| `runtime03/guard-control` | Exit 1 | Empty owned OpenSSL config permits startup; arrow-function Worker denial throws TypeError before recording the expected diagnostic. No worker starts. |
| `runtime04/guard-control` | Pass | Constructible denial wrapper records and throws; every synthetic assertion passes. |

The explicit ABI1 guard retains filesystem restrictions and compensates for
missing truncation mediation by denying truncate/ftruncate/creat/openat2 and
O_TRUNC on open/openat. Cross-directory link control is denied. The successful
control checks allowed reads/writes, denied synthetic reads, append/truncate/link
operations, and denied process/Worker construction. It does not probe sockets or
private paths. No system OpenSSL configuration access is added.

The core process uses the same kernel guards, explicit environment allowlist,
fresh empty HOME/TMP, no native addons, 384 MiB Node old-space limit and a
45-second external deadline. Kernel syscall rules deny network operations;
host wrappers additionally record prohibited I/O attempts. The core records no
such attempts, no stderr, unchanged pins, empty HOME/TMP, and a reaped child with
its process group absent. It exits 1 after about 0.552 seconds; this is failure
timing, **not a performance benchmark**. No runtime HTTP request is made.

These controls are not a hostile-host-code sandbox. The heap setting is not a
total-RSS bound; system-library trees remain readable; metadata/ioctl restrictions
are incomplete; exec/clone/fork are not kernel-denied. The report is not
tamper-proof. Independent review identifies future launcher work: unconditional
exception-safe group cleanup, non-assert prerequisite enforcement, and terminal
records even after pin/schema/launch errors. Actual recorded groups all close,
and actual core assertion enforcement is evidenced by the final driver failure.
Do not reuse the launcher as a production isolation boundary.

## Compatibility boundary and next steps

The canonical fixture is `scripts/check-released-safejs.ts`; check twelve is at
line 265. The clean pinned build's 1,452 committed source/configuration inputs
match `daf359f53c86c8f4e93e8189b9396fe236e5603b`. Dirty working-tree browser
bindings are not used. The checked-in fixture expectations are not weakened.

The first eleven checks establish scoped host-object identity/live properties,
mutation rules, nested-operation ordering, close behavior and callback progress
while an earlier callback's tail remains pending. They do not establish that a
new top-level source evaluation can progress in that state: that is exactly the
operation whose assertion is not reached. The fixture's finally-close can replace
an original exception, so the artifact does not prove the private SDK throw site
or distinguish an evaluation error from a replacement cleanup error. Later
callback-result, reference, cancellation and console checks are unverified.

Static review maps this boundary to the browser's existing prefix-versus-tail
scheduling contract and its fake-core regression. The public SDK documentation
does not expressly guarantee fresh source admission during a suspended callback.
This is an adapter compatibility blocker, not proof of a violated SDK promise.
Clarify the supported public scheduling operation before speculative adapter
changes; do not treat restricted nested evaluation as a documented substitute.

Before another SDK run: resolve the pending-callback/new-evaluation contract,
harden the launcher, and obtain an explicit follow-up execution scope. Do not
patch SDK internals, queue away the required progress, silently lower expectations,
or enable the default runtime on these partial results. Live scripted websites,
provider/passkey integration, interactive/TTY/service acceptance, broader research
and crawler-friction improvements remain separate open work.

## Evidence and preservation

Private lane: `node_modules/.cache/native-validation/safejs-isolated-gate-september15/`.
It includes approval, scopes, every staging/control failure, native HTTP events,
package file/link pins, core JSON, reviews, verification and an isolated-store
archive. `runtime04/core/ACCEPTANCE.json` records the actual failed contract;
`VERIFIED.json` means evidence verification, **not SDK compatibility success**.
The structured public companion is `reports/safejs-isolated-gate-2026-09-15.json`.

All 383 original staged-SDK persistence records remain byte-identical. All 42
pre-existing dirty tracked files and the 697 original untracked-file records are
preserved; some previously adopted paths are now tracked, so 697 is not a new
untracked-status count. No production code or native-test manifest changes are
part of this gate. No fresh native-test/build pass or push is claimed.
