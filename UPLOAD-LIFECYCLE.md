# Upload acknowledgement and activation lifetime guards

September 4, 2026. Independent native review and one parent-requested follow-up
reproduced three upload lifecycle gaps. The fixes retain the existing transport,
file-owner policy, limits and commit uncertainty semantics.

## Guarded boundaries

- After upload-begin awaits the command adapter, the host revalidates the captured
  target before recording per-session reservations. An intervening native clear
  can already have invalidated the transfer. It now rejects/cancels rather than
  acknowledging a dead transfer and consuming ghost session capacity.
- Activating a new or retained document rechecks manager openness after the
  previous owner's invalidation callbacks. Reentrant manager closure cannot
  resume ownership publication. An unadmitted new owner's subscription is removed
  on failure; the manager does not dispose an owner it never admitted.
- The retained-document branch also checks whether its target owner closed during
  that callback while the manager stayed open. It cannot republish a closed,
  removed owner; the previous live binding remains usable.

These are native ownership/bookkeeping defects, not demonstrated remote CLI or
guest-runtime exploits. No claim is made that a remote user can install the native
invalidation callback or obtain the private transfer manager. Listener-authored
effects are not rolled back, and resource counters are not measured process RSS.

## Native evidence

Four exact regression cases fail against an independent 9363bf7 archive and pass
after the guards: one-byte/one-transfer begin invalidation before acknowledgement,
new/retained activation closing the manager, and retained-target closure with the
manager still open. They check reusable capacity, ownership/reservations, retained
bindings and all sixteen available listener slots for an unadmitted owner.

Both core focused runs pass 197 tests / six files, including the preceding focus
setup teardown matrix. Both extended runs pass 267 / nine files, adding actual
native CLI/private-file/client-to-host cases with injected HTTP. Both project typechecks
and builds, strict regression-test checking, two-file Biome and host formatting
pass. Existing unrelated host import ordering remains unchanged.

Final combined explicit native suites pass 10,942 tests / 324 isolated files,
including both lifecycle fixes. Working validation reports 12,073 passes and the
same fifteen pending failures / 346 files. The same 22 preexisting uncommitted
working test files are absent from the archive, not removed from the manifest.
The pending positioning/capability/onload assertions remain unbundled.

Main logs/archives use upload-lifecycle-integration, upload-lifecycle-integrated
and upload-lifecycle-baseline under node_modules/.cache/native-validation. The
reviewer's original 96f7af1 archive, REVIEW.md, v1 patch/results and all seventeen
checked v1 artifacts remain intact in final-upload-review. REVIEW-FOLLOWUP.md and
proposed-v2.patch separately record the retained-owner correction requested during
parent review. Only the complete replacement v2 source delta is integrated; its
isolated TASKS.md paragraph is not substituted for this parent's evidence.

No live website, socket, actual service/subprocess, real TTY/PTY or SafeJS probe
ran. Chooser/guest File APIs, service authentication, external/runtime compatibility
and the full browser outcome remain open in TASKS.md and UPLOAD-COMMANDS.md.
