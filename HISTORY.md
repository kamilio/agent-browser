# Same-document history and fragment navigation

Status: September 1, 2026. This connects our document model, Window event target,
query state and semantic snapshots. It makes no network requests and does not
parse HTML or run website JavaScript. `BrowserSession` now owns loading/reloading
through an explicit adapter, with a supplied text/JSON loader (`SESSION.md`).
The later `NAVIGATION-HISTORY.md` checkpoint adds combined cross-document traversal
to the session, CLI and playground. Page DOM bindings and full history lifecycle
semantics remain unfinished; this document describes the local document layer.

## Host SDK contract

`DocumentHistory(tree, events, limits?)` requires the same document's active
Window-enabled `DocumentEvents`. `DocumentInteractions.events` enables that
Window target automatically. Only one history instance may own a document at a
time. The initial entry records its current HTTP(S) URL and null state.

- `pushState(state, url?)` adds an entry and discards forward entries.
- `replaceState(state, url?)` replaces the active entry without discarding forward
  entries or changing its key.
- `back()`, `forward()` and `go(delta, signal?)` queue a traversal and return a promise for
  the resulting snapshot. Out-of-range traversal is a no-op; `go(0)` explicitly
  fails because reload requires a document loader.
- `navigateFragment(url, replace?, signal?)` resolves an anchor destination and navigates
  only if its non-fragment URL equals the current document URL. Other targets
  fail as cross-document navigation, not as successful no-ops. An aborted signal
  rejects the queued operation before URL/history/target mutation.
- `snapshot()` returns isolated state plus URL/key/index/length. `list()` returns
  entry metadata without payloads. `metrics()` reports retained bytes, queued
  work, operation count, evictions and lifecycle state.

These are internal host/agent SDK signatures, **not** the native `window.history`
WebIDL signatures. The page bridge must adapt them, including the unused title
argument, task scheduling, structured cloning and exception types. No page
`History` or `Location` object is exposed yet.

## Ordering and URL policy

Push and replace synchronously update the document URL without firing popstate
or hashchange. Traversals execute FIFO using bounded host microtasks and emit
popstate before hashchange when the fragment differs. Fragment navigation creates
null-state entries and emits both events; an unchanged URL reselects the target
without adding another history entry or emitting those events. Null versus empty
fragments are distinguished. State passed to an event cannot mutate retained
history state. Listener exceptions are recorded by the event dispatcher; closure
or exhausted dispatch budgets stop delivery rather than continuing on dead state.

The microtask queue is an SDK scheduling choice, not a complete browser task or
rendering loop. Scroll position restoration, focus changes, pagehide/pageshow,
beforeunload, Navigation API interception, nested frames and BFCache are absent.

State URLs resolve against the shared document base URL. Omitted, null or empty
state URLs retain the current URL. Rewrites cannot change scheme, host, port,
username or password. The shared lower-level rewrite helper also encodes the
restricted file/opaque URL rules, but `DocumentHistory` currently requires an
HTTP(S) document. It never opens files or invokes host protocol handlers.

`DocumentTree.setUrl` validates input and canonical URL lengths, enforces rewrite
rules and records a location revision without replacing element references.
Changes outside the active history owner are detected, not silently reconciled.
Snapshots, links, form plans and history now share base-URL resolution. Forms also
inherit the first base target; explicit empty targets remain `_self`.

## Fragment target is not just the URL hash

The document's target element is separate state. `setUrl`, pushState and
replaceState do not automatically change `:target`. Fragment navigation and
traversal explicitly select it. Selection first checks the raw fragment, then
its percent-decoded UTF-8 form, preferring IDs over legacy named anchors in each
pass. Empty or unmatched fragments clear the target. IDs and anchor names are
compared in tree order.

Changing/removing an element's ID does not silently redirect the stored target
to another element. The next fragment selection can choose a new target.
`DocumentQueries` reads the stored target, and existing semantic snapshot entries
mark it with `targeted: true`. Selecting a target does not imply scrolling,
ancestor revealing, focus movement, text-fragment handling or CSS rendering.
Initial document-load target selection is still the future loader's job.

## State format, ownership and bounds

State is currently **finite JSON data**, not the whole structured-clone domain.
Strings, booleans, finite numbers, null, dense arrays and plain objects are copied
into bounded serialized storage. Getter/setter properties, custom objects,
non-enumerable/symbol properties, sparse or extended arrays, undefined, functions,
BigInt, cycles and non-finite numbers fail explicitly. No toJSON method is called.
Prototype-like keys remain ordinary data. Returned state is a separate mutable
copy; stored state is never handed out by reference.

This validation is for trusted host values. It is not a sandbox for arbitrary
host Proxy traps; untrusted page objects must remain inside the approved VM and
cross a separately validated bridge. History may contain private state and URL
tokens: callers must not automatically print or publish snapshots or list output.

Default limits are 128 entries, 1 MiB UTF-8 serialized state per entry, 4 MiB
aggregate serialized state, depth 32, 10,000 state nodes, 64 pending/running
operations, 10,000 total operations and 16,384 code units per canonical URL.
The byte counts are serialized payload sizes, not JS heap or peak memory usage.

At the entry-count cap, pushes evict the oldest added entry while preserving the
initial one. A one-entry configuration permits replacement but rejects pushes.
Byte/complexity failures preserve the current entry and forward branch. Closing
clears retained state, unregisters ownership and rejects queued work. Operation
and queue limits also bound asynchronous listener-triggered traversal loops.

## Evidence

- `src/history.test.ts`: 20 cases covering ordering, state ownership, hostile
  values, URL policy, eviction, queues, closure and fragment-driven routing.
- `src/document-url.test.ts`: 20 cases covering rewrite rules, base resolution,
  canonical URL bounds, fragment decoding and target selection.
- `src/events.test.ts`: 23 cases including optional Window paths and isolation.
- `src/selectors.test.ts`: 110 cases including stored target state.
- `reports/unit-node-2026-09-01-history.json`: 383 Node tests across 16 files,
  zero failed/pending at 17:05 UTC.
- `reports/history-core-bun-2026-09-01.json`: the four relevant portable suites
  pass all 172 checks on Bun. This does not enable Bun networking.

The routing fixture follows an interaction's anchor intent, updates our document
URL and `:target`, invokes a trusted host listener, changes document text, then
goes back while retaining the same element ref. It is not a parsed real website
or proof of website JavaScript execution. No browser parity row is completed.

Primary references consulted:
`https://html.spec.whatwg.org/multipage/nav-history-apis.html`,
`https://html.spec.whatwg.org/multipage/browsing-the-web.html#scroll-to-fragid`,
`https://html.spec.whatwg.org/multipage/semantics-other.html#selector-target` and
`https://dom.spec.whatwg.org/#concept-document-get-parent`.
