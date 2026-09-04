# Scoped native editing Range lifetimes

September 4, 2026. Native editing now releases private, synchronous live-Range
registrations when each operation returns or throws. Repeated inline replacement,
paragraph insertion and Range content deletion/extraction no longer exhaust the
4,096-live-Range allowance merely because temporary ranges await garbage collection.
This fixes deterministic quota exhaustion, not a measured heap-retention problem.

## Ownership and unchanged behavior

DomRangeOwner.withTemporaryRange copies a source Range into a newly registered
private Range, keeps it live through synchronous mutations, and removes exactly
that registration in finally. A weak-key registration index makes this cleanup
direct without retaining public ranges strongly. Owner close clears both the
registration set and the weak index; later cleanup cannot reopen the owner.

The helper is a trusted native implementation seam, not a page method or guest
callback facility. Its current callers are synchronous content deletion/extraction,
keyboard replacement and paragraph splitting. It does not promise asynchronous
scope lifetime, revoke externally published objects, or provide transaction rollback.
Mutation/allocation exceptions may still leave effects permitted by the existing
nontransactional document APIs; cleanup only releases private Range registrations.

Keyboard replacement uses two scoped ranges and its nested deleteContents uses
one more. Paragraph insertion uses one private caret range; deletion/extraction
uses a private collapse range. All count against the unchanged live limit while
active, including nested operations. A failed nested allocation releases its
already-created outer temporary range.

Public createRange/cloneRange, shared selected Range identity, mutation adjustment,
retained observer ranges and the existing quota are unchanged. Public detach
remains a no-op; it cannot be used to recycle a still-live public Range. This
matches the reviewed WHATWG DOM Standard, section 5.5, detach method steps. Native
Selection operations that replace their publicly observable Range are not changed
into object pooling or private temporaries.

## Reproductions and validation

Nine new native tests exercise repeated inline editing, repeated Enter, direct
deleteContents/extractContents, injected mutation/allocation exceptions, nested
quota failure, public detach behavior and owner close during a private scope.
They hold 4,092–4,095 public ranges alive explicitly and reuse the selected Range;
none forces GC or depends on elapsed timers. Before the fix, seven actual editing
or quota-cleanup cases fail; the new helper-close test also fails because the
helper is absent, while the public-detach test already passes. Those distinctions
are retained rather than calling every baseline failure a reproduced old bug.

The first baseline invocation omitted the new explicit test-list entry and found
no tests. That log is preserved, not counted as validation. After registration,
the expanded baseline reports eight failures and one pass. The earlier two-case
reproduction is also retained; the replacement fixture was then corrected to
reserve all three nested private slots so its first operation can succeed.

Verified focused runs pass 287 tests / eleven files in both trees. Both project
typechecks/builds, the strict new-test check and four-file Biome check pass. The
isolated explicit native suite passes 11,016 tests / 327 files. Working validation
reports 12,147 passes with the same fifteen pending failures / 349 files. Both use
the same 349-entry native manifest; the same 22 preexisting uncommitted test files
are absent from the isolated archive, not selectively removed from its allowlist.
The unchanged failures remain thirteen positioning expectations, one pending
command-capability assertion and the byte-identical Window-onload test.

A sandboxed child-process wrapper initially produced empty logs with misleading
zero statuses. Those results are not accepted as passes. The corrected wrapper
checks spawn errors and requires an actual Vitest summary; the authorized rerun
uses temporary-ranges-integration-verified prefixes. Existing native-only probe
restrictions remain in force.

Fresh eleven-phase actual native-host captures before and after the change are
byte-identical in every PNG. DOM, Range and element geometry, scroll, selected file
metadata, click counts, upload reservations and all raster metrics also match.
The fixture covers paragraph merging, plaintext Enter/replacement, selection and
carets, double-click, native uploads, root scroll and canceled defaults. It uses
injected transport and synthetic file bytes, and releases owned artifacts through
the existing command path without raising quotas. This checks ordinary behavior
separately from the quota-pressure tests; it is not a live/runtime acceptance run.

## Evidence and remaining work

The integrated archive is temporary-ranges-integrated.qNjTkx under
node_modules/.cache/native-validation. Logs use temporary-ranges-integration;
fresh capture/comparison files use browser-sprint-before/after-temporary-ranges
and browser-sprint-temporary-ranges-comparison. Prior selection/caret captures
and their counts retain their original paths and meaning.

No dependency or budget was added. No SafeJS, live website, socket, real TTY/PTY
or service-process probe ran. Broader editing, mixed-node highlights, network API
coverage and original browser/playground gates remain in TASKS.md; this resource
fix does not close them.
