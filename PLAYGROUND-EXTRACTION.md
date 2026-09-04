# Playground extraction downloads and examples

September 4, 2026. The shared-session playground now offers Markdown, structured
JSON and semantic snapshot downloads through its existing native command API.
This is integrated UI/command code with mounted native fixtures, not a real
browser download, live website or released-runtime acceptance claim.

## Using the controls

Connect and select a session, then inspect a document. The footer exposes the
three extraction buttons alongside PNG/PDF/HTML. Copyable command hints name the
selected session and inspected root. Changing session, navigating or disconnecting
cancels pending reads and discards stale responses. Other navigation controls
remain usable while an extraction is pending.

Markdown/JSON call the existing root-scoped extract command; snapshots use
snapshot --observe so export does not mutate the CLI snapshot-diff cache. Every
reply must match schema, command, session, document root and scope. Parent review
added the scope check, with failures tested for all three formats before any
download URL or anchor is created.

Native bounds are 65,536 bytes and depth 64, with a 2,000-node extraction limit.
The complete downloadable wrapper is limited to 262,144 bytes, never sliced into
invalid JSON. JSON/snapshot files retain native data and metadata inside a
schemaVersion/session/kind/limits wrapper. Markdown retains exact native content
after an inert metadata comment whose angle brackets are escaped. Markdown and
HTML content are not sanitized merely because they were downloaded.

Snapshot truncation remains visible in data and status; extraction-limit errors
do not fabricate fallback output. Session-derived filenames do not trust page
titles/URLs. Anchors are removed on success or failure, and object URLs are
revoked after a short delay or earlier on invalidation/pagehide. Duplicate export
activation and overlapping refresh/export reads are guarded.

## Example discovery

All ten cards navigate the selected native session and are explicitly UNVERIFIED.
They cover JSON, RFC documentation, Example Domain, Hacker News, Books to Scrape
and TodoMVC Vanilla/React/Vue/Angular/Preact. The TodoMVC routes are copied from
the official upstream index, not guessed from framework names. Vanilla uses its
JavaScript ES5 example; Angular uses the distinct dist/browser route, not AngularJS.
Source provenance is retained in the markup. Upstream master is not an immutable
revision pin, and source-established links do not prove current site availability.

No TodoMVC application was loaded or executed for this work. All example-click
tests use fixture documents through the native backend. Prior historical site
evidence retains its original dates, measurements and scope.

## Validation

The integrated seven-file focused runs pass 190 tests in each tree. The two new
files contribute 28 tests, including mounted command-backed exports, corrupt
scope/identity rejection, truncation, limits, stale successes/errors, retry,
anchor failure and URL cleanup. Typecheck, builds and strict new-test checks pass.
Four-file formatting and three-file Biome checks pass after parent fixes to new
test assertions; the existing playground import-order diagnostic remains separate.

Parent reviewed the generated native DOM evidence, including all ten enabled
example targets, selected-session command calls and a snapshot download envelope.
It is an HTML-parser snapshot plus mounted in-memory state, not a raster/UI image.
Evidence uses the playground-integration prefix in node_modules/.cache/native-validation;
the worker's original evidence and handoff remain under parallel-playground-extraction.
Authorized full combined native runs pass 9,882 / 286 isolated files. Working
validation reports 11,027 passes and the unchanged pending Window-onload assertion
failure / 308 files. Its source still matches the preexisting backup. The same
22 preexisting uncommitted test files are absent from the HEAD archive; no native
test path was removed to manufacture an isolated pass.

## Open gates

Actual browser saving, responsive layout, real keyboard focus traversal, visual
UI review, sockets and shared human/agent arbitration still need acceptance.
Root identity rejects replaced documents but does not freeze same-document
mutations or concurrent external actions. Download limits do not bound the
existing API client's entire fetch/JSON decoding allocation. No streaming export,
CDP endpoint, alternate engine, framework conformance or new runtime dependency
is claimed. No gated probe ran; the previously denied SafeJS probe remains unrun.
