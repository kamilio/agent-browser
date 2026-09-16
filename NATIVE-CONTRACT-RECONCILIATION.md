# Native contract reconciliation

This work reconciles native tests with already-committed browser capabilities.
It does not introduce new layout, script execution, fingerprinting, credentials,
network access or challenge handling. Production artifacts are compared byte for
byte with the preceding committed runtime. Exact results and remaining gaps are
recorded in `reports/native-contract-reconciliation-2026-09-16.md` and JSON.

## What the corrected tests establish

- Reader DOM retention of inert class attributes is distinct from narrower
  date/time and table source-metadata allowlists. Exact dictionaries and ignored
  attribute accounting remain checked; active/resource attributes stay excluded.
- Source challenge markers stop normal extraction while preserving the complete
  explicitly requested body capture, barrier diagnostic and policy-denied stage.
  This is a stop/handoff contract, not CAPTCHA or access-control circumvention.
- Complete output-limit captures support bounded selector and section recovery
  with Markdown table rows. Pinned body/receipt identity, no extra request,
  admission restrictions and unchanged original data remain asserted.
- Bounded sticky, Grid, overflow, dashed-border and nested-scrolling features are
  not labeled unsupported merely because older tests predate their implementation.
  Positive tests use explicit geometry and mutation/cache checks. Negative tests
  use remaining real guards, including block-in-inline and unsupported alignment,
  rather than deleting error-path, no-substitute capture or mouse cleanup checks.
- Exact computed-style/global/capability inventories track committed support.
  Virtual Screen values are not physical display identity; cursor keywords are
  not system cursor control; nested wheel scrolling does not imply smooth,
  modifier, native menu or complete OS input behavior.
- Capability cleanup tests distinguish the navigator created first from the
  separately created performance object. They still require constructor errors
  and revocation of already-created capabilities after registration/factory failure.
- Optional code-source contexts fit after mandatory extraction fields. Rustdoc
  budget tests retain exact gutter-free code and check full contexts, a truncated
  empty context envelope, mandatory-only output and rejection below that minimum.
  They do not require optional metadata to force a whole extraction failure.

These are native model assertions. They do not replace an actual SafeJS SDK
gate, rendered reference comparison, real TTY, device, credential or live-site
acceptance. In particular, a fake host-object factory does not establish capacity
or scheduling behavior of the actual page runtime.

## Reproducible isolation

Use a complete committed checkout, including non-runtime fixtures, under a
protected temporary directory. A source-only copy can create collection failures;
workspace ancestors can also violate private-file ownership requirements even
when the final leaf directory is mode 0700.

Put the runner's HOME and TMPDIR beneath the protected temporary root as well.
Making only the checkout private is insufficient when tests create private files
through their temporary directory. Keep environment-file discovery disabled,
use the native unit guard and record invocation, deadline, exit and process-group
cleanup. Native unit isolation remains distinct from kernel-denied offline
replay and from separately authorized live/socket/SDK/device checks.

Retain failed preparation and execution records. An archive buffering failure or
unsafe temporary-directory setup is not a production failure. Correct the
environment in a separately named run with identical source, rather than hiding
the original result or weakening private-file protections.

## Manifest and worktree boundaries

Use the explicit `native-tests.json` list. Check every referenced path against
the committed snapshot before claiming a full gate. A runner can finish green
for the files it finds while listed files are missing; that is not full-manifest
acceptance. Missing files must be named, not silently removed from the list.

This checkout has pre-existing tracked edits and untracked work. Do not import
working-only tests or their helper dependencies into a committed-source run
without separately identifying and pinning them. A dependency admission map is
not evidence that those tests execute or permission to bundle that work.

For an owned correction inside an already-dirty test, apply a narrowly recorded
replacement separately to the committed version and the working version. Test
the canonical version, stage only that canonical blob, and verify reversing the
owned replacement reproduces the original working-file hash. This keeps unrelated
element-offset, base64 and passkey additions outside the commit while retaining
them unchanged in the worktree. Never stage the whole dirty file by convenience.

## Open browser gates

Native test reconciliation does not resolve the documented SafeJS callback/source
admission mismatch. Nor does it establish general modern-site compatibility,
successful research through access restrictions, authenticated password-provider
isolation, passkey/device operation, complete rendering or full research-topic
coverage. Keep those obligations and the overall browser goal in `TASKS.md`.
