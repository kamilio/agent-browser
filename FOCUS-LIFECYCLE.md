# Focus setup lifetime guards

Combined validation continuation: `UPLOAD-LIFECYCLE.md` includes this guard's
four-case setup matrix in the subsequent native suite. The focused measurements
below retain their original source base and scope.

September 4, 2026. Independent native review found a reentrant teardown gap while
PageBindings constructs its PageFocus registration pool. The completed owner is
assigned only after registration returns; closing the document during registration
could therefore miss that in-progress owner. A lifecycle that closes during setup
must also stop subsequent registration/publication, not return unusable bindings.

PageBindings now checks its document/binding/runtime lifetime before and after
delegating each setup registration. A reentrant close throws inside PageFocus's
existing constructor cleanup, revoking the partial pool. The registered operation
and returned identity are unchanged. No public API, slot recycling, quota increase
or alternative runtime was added.

The reviewer supplied one final-registration document-close reproducer. Parent
extends it to first/final registration with both document and runtime-lifecycle
closure. All four fail against the independently archived 9751201 baseline and
pass after this guard. Both focused runs pass 214 tests / ten files, including
publication, pressure, callbacks, runtime adapter and focus regressions. Both
project typechecks/builds, strict test checking, new-test Biome and existing source
formatting pass. Existing unrelated source import ordering remains untouched.

This guard has focused native validation; the next combined full-suite checkpoint
will include it. The preceding 10,934-test isolated caret checkpoint is not
relabelled as a run of this newer source. Main logs and archives use the
focus-lifecycle-integration/focus-lifecycle-integrated prefixes under
node_modules/.cache/native-validation. The reviewer's original 96f7af1 archive,
REVIEW.md, failing reproducer, 225-test adjacent run and patch remain unchanged in
final-focus-review. Parent added cases do not overwrite that evidence.

This demonstrates native setup revocation, not a released-SafeJS exploit, measured
GC/RSS retention, actual guest scheduling or general lifecycle safety. Original
runtime, constructor, live-site, socket and real TTY/PTY gates remain open. No
such probe ran. TASKS.md retains the browser outcome and outstanding work.
