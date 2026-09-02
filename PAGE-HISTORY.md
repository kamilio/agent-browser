# Session-owned page History

Status: September 2, 2026. The normal browser-session document loader now installs
History state before parser scripts execute. `history` and `window.history` share
one owned capability with `state`, session-wide `length`, `pushState` and
`replaceState`. This is a partial implementation, not the complete History API.

## Available behavior

```javascript
history.replaceState({ view: "initial" }, "");
history.pushState({ view: "details" }, "", "/details?item=1");
document.querySelector("#status").textContent = location.pathname;
```

The state methods return `undefined`, update the actual document URL without
fetching, preserve the document/realm, and participate in the owning browser's
history. The unused second argument is required. Omitted, null and empty URLs
retain the current URL; supported primitive URL values are resolved against the
document base with the existing same-origin URL-rewrite checks.

`length` accounts for retained entries across session documents, including the
candidate being loaded. It is not the current document's local entry count.
Reading prospective state does not mutate the committed session archive.

Reloads and cross-document traversal restore archived state **before** interpreted
parser scripts read or mutate it. A script may replace that restored state or
create a new branch. New branches discard obsolete forward entries/documents;
replacement alone preserves them. A parser-time `pushState` hash change does not
retarget the original navigation's fragment.

Agent commands and guest History traversal use the same session navigation path.
Their same-document transitions dispatch `popstate` and `hashchange` through
the asynchronous event dispatcher, preserving interpreted synchronous-prefix
ordering. Event capabilities expose `state`, `oldURL` and `newURL`. History jobs
remain serialized while those event prefixes run.

## Guest traversal

`history.back()`, `forward()` and `go(delta)` now return `undefined` and enqueue
work in a session-owned per-tab task queue. They do not return a host promise or
synchronously change history. `go()`/`go(0)` request reload. Primitive deltas use
signed 32-bit conversion; objects, functions, symbols and BigInts are rejected
without executing conversion hooks on the host.

The queue runs later, waits for the current document's event dispatch to finish,
and uses the normal session controller for same-document movement, cross-document
loading and reload. Requests made by parser scripts wait until that candidate
commits; failed candidates lose their queued work. Document replacement cancels
remaining requests from the retired source without aborting the successful
navigation that replaced it.

There are at most eight pending/active requests and 256 accepted requests over a
tab queue's lifetime, shared with Location navigation and fragment notifications
(`PAGE-URLS.md`). Cancellation and document replacement do not reset these
budgets. Existing session/network/POST-resubmission policies still apply. No
request falls back to an unchecked transport or a document-only history list.

Stop, tab/session closure and starting valid explicit navigation cancel queued
work and signal active work. Fresh requests from the old page are rejected while
explicit navigation is pending. Cancellation cannot undo effects already applied;
an uncooperative loader is still tracked by the session and its late document is
disposed through the existing lifecycle.

`metrics.pageTraversals` exposes per-tab counts, pending/active status and one
bounded last result. Asynchronous failures leave a sanitized error-code entry
with console source `navigation`; they do not include raw host errors or URLs.
Observers cannot prevent later queued work by throwing while reporting an error.
These host tasks and event-idle boundaries are not a claim of complete browser
task/microtask equivalence, including all interpreter cooperative-yield cases.

## Loader and ownership contract

`DocumentLoaderContext.initializeDocument(tree)` is a synchronous trusted-loader
hook. HTML parsing calls it before script ownership; text loading calls it before
building content. A custom loader that executes scripts must call it before
creating the page runtime. A non-scripting loader may omit the call: the session
initializes its returned document before committing it.

The hook claims exactly one unowned candidate, checks its response URL and limits,
restores state and installs an owned History port. Repeating it for the same
active candidate is idempotent; it does not reset parser-time state. A mismatched,
late, canceled or invalid unowned candidate is disposed without stealing or
closing another session's document. Failed candidate work leaves the prior page
and its committed archive intact.

History state and URL changes are validated against the session's prospective
retention budget before committing. The native document-history layer supplies
a detached frozen prospective archive to that validator. Rejected changes do
not alter state, URL, history revision or forward entries; attempts still consume
the existing operation budget.

Document replacement closes the old page capability. Stopped navigation can
cancel a waiting event prefix and unwind dispatch without permanently blocking
later history jobs. Cancellation does not undo a URL/state transition or callback
effects that already occurred before cancellation.

## Explicit limitations

- State is bounded finite JSON data, not full structured clone. Cycles, functions,
  sparse arrays, accessors, non-plain objects and other unsupported data fail.
- State reads are detached copies. Mutable `history.state` object identity and
  identity shared with `popstate.state` are not implemented.
- Location-triggered navigation and History traversal are session-owned
  (`PAGE-URLS.md`), but complete browser task scheduling and navigation lifecycle
  event coverage remain incomplete.
- Scroll restoration, browser DOMException identities, arbitrary Web IDL object
  coercion, frame joint history, BFCache and complete browser task ordering are
  incomplete or unverified.
- Standalone page runtimes without a session-owned port do not invent History.
  The supported session loader installs the port before constructing SafeJS.

Capabilities report partial support, finite-JSON state, session-wide length,
`guestTraversal: true` and `stateIdentity: false`. No extra dependency or upstream
SDK modification was added.

## Evidence

`reports/page-traversals-focused-2026-09-02.json` records 592 passing tests across
32 files. Added tests cover deferred execution, parser requests, source retirement,
reload/restoration, explicit cancellation, event-idle waiting, delta conversion,
pending/lifetime limits and sanitized asynchronous failures.

`reports/page-traversals-safejs-fixture-2026-09-02.json` records eleven checks with
the existing experimental SafeJS core. Interpreted code queues back/forward/reload,
handles popstate, triggers parser-time cross-document traversal, and observes
restored state. Stop and explicit navigation cancel queued requests; a quota
failure preserves the displayed page and produces sanitized console diagnostics.
All responses are in-memory. The earlier checkpoint reports below remain historical.

`reports/page-history-focused-2026-09-02.json` contains 557 passing tests across
thirty files. Added coverage includes parser-time mutation, restored state,
session-wide length, branch removal/preservation, atomic retention limits,
candidate ownership/cleanup, fragment targeting, event data, prefix ordering and
cancellation. The native routing tests in this run use mocked DNS/exchange.

`reports/page-history-safejs-fixture-2026-09-02.json` records thirteen checks with
the existing experimental SafeJS core. Real interpreted parser code mutates
state/URLs, handles traversal events, reads restored state after reload and
cross-document navigation, and creates a branch that removes a forward document.
All responses come from an in-memory transport.

Strict package and changed-test compilation and formatting pass. These are not
published-SDK, public-site, actual HTTP/TLS, terminal, separate-CLI or deployed
playground acceptance results. Those remaining gates and the full browser goal
are not complete.

The HTML History interface is the conformance target:
https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-history-interface
The partial behavior and limitations above, not the complete standard, are what
this checkpoint implements and verifies.
