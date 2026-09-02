# Page URL bindings

Status: September 2, 2026. Page JavaScript now has session-owned Location
navigation, live URL reads and reflected element URL attributes. These use our document model and the host runtime's
standard `URL` implementation, not a browser engine or another dependency.
This remains a bounded partial browser API, not complete navigation conformance.

## Available behavior

- `location`, `window.location` and `document.location` refer to one page-owned
  capability. `href`, `origin`, `protocol`, `host`, `hostname`, `port`, `pathname`,
  `search`, `hash` and explicit `toString()` read the current document URL.
- Same-document navigation updates those reads without replacing the realm.
  A `<base>` element changes URL resolution, not Location itself.
- `baseURI` reads the owning document's current effective base on DOM nodes.
- Anchors and areas expose `href`, `origin`, URL component getters/setters and
  explicit `toString()`. Attribute reads retain the original relative text;
  component writes update the real `href` attribute and subsequent link actions.
- `link.href` resolves against the document base; `base.href` resolves against
  the document URL without recursively applying itself.
- `src` reflects URL attributes for script, image, iframe, input, source, video,
  audio, embed and track elements. Reflection alone does not fetch a resource.
- URL getters remain live after base/attribute/URL changes and for detached
  elements. Missing and empty attributes remain distinct; invalid URL attributes
  retain their raw text rather than becoming a fabricated valid URL.

These APIs are available to the existing explicitly enabled SafeJS page runtime.
They do not change the default website-script policy.

## Ownership and incomplete behavior

Session-owned runtimes support `location.href`, URL-component writes,
`location.assign(url)`, `replace(url)`, `reload()`, `window.location = url` and
`document.location = url`. Bare `location = url` still fails in the existing
experimental SafeJS core: the global binding cannot be replaced. Capability
metadata reports `locationNavigation: true` and `globalLocationAssignment: false`.
Standalone runtimes without an owned port still reject Location navigation.

URL targets are resolved against the current effective base at the call, rather
than when a later task executes. Component writes start with the document URL.
Non-HTTP(S) targets, embedded credentials, invalid/oversized URLs and unsupported
object coercion fail without starting requests. Cross-origin top-level navigation
uses the ordinary session transport and its network policy, not page-fetch CORS.

Cross-document writes return `undefined` and enqueue owned navigation. Parser
requests wait for candidate commit; parser-time assignment replaces the loading
entry because transient activation is not modeled. Successful replacement revokes
the old realm. Failure keeps the previous page and records a sanitized navigation
error. The shared queue retains its eight-pending/256-lifetime limits, ownership,
event-dispatch-idle boundary and cancellation behavior from `PAGE-HISTORY.md`.

Same-resource fragment writes apply the URL, target and history synchronously
after both queue and archive-budget admission. Their captured URL-change events
run later. Multiple writes have immediate observable URLs but separate queued
notifications. Repeating `location.hash` does nothing; an empty hash write retains
an empty `#` delimiter. Stop can cancel pending notifications but cannot undo the
already-applied URL change.

Cross-document `replace` changes only the active entry, preserving adjacent
entries and forward history. A parser-created pushState branch discards forward
history. Replacement can split retained document archives into segments; the
existing document-retention limit counts those segments. There is no BFCache.
Reload restores state; assigning the identical non-fragment URL loads fresh state
while replacing that entry. Same-document replacement preserves forward entries.

Navigation remains available through the owning browser session and its agent
commands. Reading or editing a resource URL does not bypass network policy or
add dynamic script/image/frame loading. Interpreted hyperlink edits do affect
subsequent ordinary browser link actions, where normal navigation policy applies.

Closing a page realm revokes its Location capability; closing a document revokes
its DOM URL capabilities. A new document receives a different owner. No URL
object from the host runtime is passed directly into the guest.

Full History behavior, guest `URL`/`URLSearchParams`
constructors, arbitrary object-to-string coercion, browser DOMException identity,
implicit stringifier/prototype parity and full hyperlink Web Platform Test
conformance remain unimplemented or unverified. Reflection uses primitive DOM
string inputs; it does not execute guest coercion hooks on the host. Complete
task/microtask scheduling, latest-navigation supersession semantics between
multiple guest writes, navigation lifecycle events, precise URL-component setter
failure behavior and event conformance remain partial or unverified. Queued
requests are FIFO; committing a new document drops remaining old-owner requests.

## Next navigation integration

The initialization/restoration, state-binding, guest-traversal and bounded
Location stages below are implemented. Remaining conformance gates are explicit
above and in `PAGE-HISTORY.md`.

Do not expose the document-only history list as full `window.history.length`,
or call the local history traversal queue as if it covered cross-document history.
The browser already owns a separate session-wide navigation history.

1. Supply a document navigation context during loading, before script execution,
   with explicit candidate/committed/retired ownership.
2. Initialize restored history state before parser scripts can read or mutate it.
   The former post-parser restoration conflicted with the fresh-history invariant
   in `DocumentHistory.restore`; restoration now occurs at document initialization.
3. Bind history state and mutation to that context; expose session-wide length
   and queue traversal through the owning session, including cross-document cases.
4. Route Location writes through the same owned navigation lifecycle, with
   cancellation, policy checks, failure retention and old-realm revocation.
5. Verify parser-time state, reload/restoration, same-document changes,
   cross-document traversal and concurrent navigation before advertising support.

## Evidence

`reports/page-navigation-focused-2026-09-02.json` records 615 passing tests across
33 files in the expanded queue, Location, replacement-history and regression suite. It includes
synchronous fragment changes, deferred events, call-time base resolution,
replacement neighbors, parser branches, ownership, cancellation and atomic limits.
`reports/page-navigation-safejs-fixture-2026-09-02.json` records 21 existing-core
checks, including ten actual interpreted Location cases over in-memory transport.
These cover Window/document setters, hash events, components, reload/state,
replacement, parser assignment, revocation and sanitized failures.

The following reports are historical checkpoints before Location navigation:

`reports/page-urls-focused-2026-09-02.json` records 356 passing tests across twenty
files. Twenty URL-specific cases cover resolution, component writes, base updates,
resource reflection, missing/invalid/non-HTTP values, coercion and cleanup.
Additional page-runtime coverage checks alias identity, current URL and revocation.

`reports/page-urls-safejs-fixture-2026-09-02.json` records fifteen checks against
the existing experimental SafeJS core. Actual interpreted code reads aliases,
updates a base and hyperlink, changes a resource attribute without fetching it,
observes explicit Location mutation failures, and survives same-document navigation.
Following the changed link uses the normal session navigation path and retires
the old realm. All responses are produced by an in-memory transport.

Strict package/test compilation and formatting pass. No live site, actual socket,
HTTP/TLS regression, PTY, deployed playground, service activation or released-SDK
migration is claimed by this evidence. Previously denied live gates remain open.

## Standards targets

- HTML Location: https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-location-interface
- HTML hyperlink APIs: https://html.spec.whatwg.org/multipage/links.html#api-for-a-and-area-elements
- URL parsing: https://url.spec.whatwg.org/

These identify the intended conformance targets, not a claim that the complete
algorithms or Web Platform Test suite have been implemented and verified.
