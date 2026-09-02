# Storage, controls and form foundations

Status: September 1, 2026. These are trusted-host SDK building blocks, not
page-global Web APIs or a working browser controller. All browser compatibility
rows remain pending. The supported host is Node; no dependencies were added.

## Isolated storage

`BrowserStorage` owns an in-memory profile. Local storage is shared by tabs at
the same HTTP(S) origin inside that profile; session storage is additionally
partitioned by tab. Opening a tab with an opener copies its session data once.
Closing a tab invalidates old area handles even when its identifier is reused.
Closing the profile clears everything. Profiles never share state.

Area handles offer `length`, `key`, `getItem`, `setItem`, `removeItem`, `clear`
and immutable `entries` results. Keys and values must be strings. Reads do not
allocate empty stores. Quota failures leave existing state unchanged. Default
limits are 32 tabs, 256 areas, 5,000 entries per area, 20,000 total entries,
5 MiB per area and 16 MiB total. Byte accounting measures UTF-16 keys/values,
not JavaScript heap usage or process RSS.

`exportLocalState` and atomic `replaceLocalState` handle only local-storage
origins and name/value entries. Replacement preserves session stores and counts
them in total quotas. Exports may contain sensitive user values: callers must
not print or publish them automatically. These exports do not include cookies. A
separate `CookieJar` now supports bounded HTTP sessions (`COOKIES.md`);
`BrowserSession` owns cookies, tab storage and document lifetimes (`SESSION.md`).
A complete saved-state controller is still missing. There are no storage events,
disk persistence, frame contexts, opaque-origin inheritance or WebIDL coercion.
This is not yet the Playwright CLI's complete saved-state behavior.

Evidence: `src/storage.test.ts` (10 tests).

## Native-control helpers

The helpers operate on connected nodes in `DocumentTree`. They derive form
ownership, external `form` associations, disabled fieldsets/first legends,
datalist exclusions, radio groups, selected options and current values.
`fillTextControl`, `setControlChecked` and `selectControlValues` reject stale,
disabled or inappropriate targets and update the internal state. Snapshots use
these derived values while retaining password/file-value redaction.

Revision-cached indexes avoid repeated full-tree and sibling scans. Synchronous
trusted-host `DocumentTree.onClose` hooks release cached indexes. Closing runs
all registered cleanup handlers even if one fails, then reports aggregate errors.

This is not a full DOM implementation: detached-node behavior, property/WebIDL
bindings, special date/range/color input semantics, dirty-state reassociation,
focus, page bindings, constraint validation and implicit Enter actions
remain incomplete. The separate `DocumentInteractions` layer now emits host
input/change/click events and plans defaults; `EVENTS.md` describes its limits.
The low-level helpers themselves still do not dispatch events.

`DocumentForms.reset` now restores supported controls' defaults through a
cancelable reset event. Label association is shared by actions and snapshot names.
`FORM-ACTIONS.md` specifies this subset and its missing output/FileList/type-specific
semantics; this is not a complete native form or page DOM implementation.

Evidence: `src/controls.test.ts` (9 tests), `src/document.test.ts`,
`src/snapshot.test.ts`.

## Submission planning, not execution

`prepareFormSubmission` returns a `NetworkRequest`, target and validation flag;
it sends nothing. It collects successful controls in document order, including
external owners and duplicate names. Disabled, unnamed, unchecked and inactive
submit controls are excluded. Submitter overrides are supported. GET replaces
the action query; POST retains it. URL-encoded, text/plain and multipart bodies
use UTF-8 and normalize line endings. Multipart names and filenames escape
header-breaking characters. Random boundaries are collision-checked.

Uploads are explicitly supplied byte arrays keyed by input node ID; this API
never reads files from disk. Bodies own copies of upload bytes. Entry/body quotas
bound preparation. Execution must still pass transport URL/network/body policy;
a prepared request is not a guarantee that transport will accept it. Payloads
can contain credentials and must not be emitted in ordinary logs or snapshots.

Explicit non-UTF-8 charsets, dialog submission and automatic text direction are
unsupported. Base href/target resolution is now shared with links/history;
frame-target execution, cross-document navigation, CSP,
referrer policy, validation and submit/formdata event integration remain absent.
The caller must not treat `skipValidation` as evidence validation has happened.

Evidence: `src/forms.test.ts` (12 tests), `src/node-form-transport.test.ts`
(4 local peer tests) and `reports/form-echo-node-2026-09-01.json` (2 public demo
echoes). Constructed fixture documents are not real-site browser acceptance.
Node's native multipart reader validates file names and bytes; the independent
public service confirms file contents. The failing Bun reader diagnostic remains
recorded separately. The newer `reports/form-events-node-2026-09-01.json` repeats
the public payload checks using event-driven control operations and a trusted
host input listener, still without parsed HTML or page JavaScript execution.

## Specification references

- HTML Web Storage: `https://html.spec.whatwg.org/multipage/webstorage.html`
- HTML forms: `https://html.spec.whatwg.org/multipage/form-control-infrastructure.html`
- Public HTTP echo service: `https://httpbingo.org/`

These references guide the supported subset; citing them does not assert full
standards conformance.
