# Guarded playground tab integration

September 4, 2026. This integrates displayed-tab identity guards and consistent
inspection failure handling into the standalone playground. It is native
UI-fixture evidence, not a live browser, socket or deployment acceptance run.

## Displayed tab ownership

The selector and Close tab button retain validated immutable tab rows from the
same list used to render their options. Selection sends the displayed index and
opaque expected key. Closure sends the displayed selected tab's explicit index
and key, rather than closing whichever tab another client most recently selected.
The command host checks that identity inside its serialized operation.

Options and their retained keys change together. A pending viewport read cannot
attach newer keys to older options. Session changes, disconnects, command starts
and failed refreshes discard retained tab actions; delayed replies cannot restore
them across a frontend generation change. Missing, oversized or duplicated keys,
invalid selection and noncanonical option values never cause an unguarded fallback.
Command errors refresh the display but do not retry a failed tab mutation.

## Consistent inspection and recovery

The pending UI could combine list metadata from one document with a snapshot from
another after external navigation or tab selection. It could also retain old page
content, capture previews, action drafts and enabled controls after a list or
snapshot failure.

The integrated refresh rejects a valid viewport whose key differs from the listed
tab, including recreation of a named session with the same tab ID. Snapshot
document identity must match the selected row before its content is displayed.
A failed current-generation refresh clears page inspectors, reference/value
drafts, capture URLs and confirmed viewport state, and disables document controls
and tab actions. A user-edited URL stays intact while its field has focus. Click
and fill handlers also reject form/event submission without a verified document.
A later successful refresh restores the controls.

Late errors from an invalidated generation do not clear a newer session's data.
An invalid or unavailable viewport response still disables viewport controls
without necessarily disabling independent document inspectors, preserving the
existing capability boundary. The tab key check applies to successfully validated
viewport responses; the snapshot document check remains independent.

These checks establish a consistent observed projection, not an exclusive session
lease or a lock against subsequent external navigation. Manual command-box use
remains explicit and does not automatically gain expected-key guards. Other
inspector and human/agent input arbitration requirements remain open.

## Assets and native evidence

The asset loader and server share their explicit dependency-path table. The tab
projection and its existing error dependency are served as local JavaScript
modules. An injected loader/compiler test verifies the frontend's static import
closure; mocked HTTP handlers verify delivery, response policy and foreign-Origin
rejection for the tab module. No socket is opened by these tests.

The thirteen existing host/session-backed tab UI cases are promoted unchanged.
Ten new consistency cases cover external selection/navigation/closure during
snapshot retrieval, transport and metadata failures, recovery, session recreation
between list and viewport, and late failure after session switching. The isolated
pre-fix integration fails nine of these ten; its existing generation protection
already passes the tenth. All ten pass after correction.

Two additional asset cases cover foreign-Origin rejection and module closure;
the existing delivery test now includes the tab module. Focused runs pass 130
tests across five working-tree files and 117 across five isolated files. The
thirteen-test difference is unrelated pending wheel/targeted-key UI coverage.
Both trees pass build, typecheck, strict checking of the two affected test files
and five-file lint. The same explicit native manifest is used in both trees;
there are no newly inferred test globs or runtime dependencies.

Authorized full native runs pass 9,557 tests across 266 working-tree files and
8,300 across 240 isolated-commit files. Authorization is for native validation
under actual filesystem ownership, not for a live/runtime acceptance gate.

## Remaining gates

Next integrate the remaining keyboard/wheel UI controls and verify their
stale-owner and cancellation behavior. Full human/agent arbitration, real browser
interaction, sockets, public sites, SafeJS execution and the complete compatibility
ledger remain open. No gated probe ran; the denied SafeJS probe remains unrun.
Historical `PLAYGROUND-TABS.md` and other reports retain their original context
and measurements. Pending tracing, capture, wheel and targeted-key changes are
preserved. The complete seven-day browser goal remains active.
