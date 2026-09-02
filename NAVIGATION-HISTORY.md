# Cross-document session history

September 1, 2026. Back/forward now traverses the engine's actual text/JSON
documents, including their same-document state entries. This extends the earlier
`HISTORY.md` layer; it is not full browser session-history or website-JS parity.

## CLI, playground and SDK

```bash
node packages/browser-agent/dist/src/cli.js -s=research open https://httpbingo.org/json
node packages/browser-agent/dist/src/cli.js -s=research goto https://www.rfc-editor.org/rfc/rfc9110.txt
node packages/browser-agent/dist/src/cli.js -s=research go-back
node packages/browser-agent/dist/src/cli.js -s=research go-forward
```

A foreground `serve` process must already be running (`CLI.md`). The playground's
Back/Forward buttons call those same commands, not the observer browser's history.

- `session.go(tabId, delta, { signal? })` traverses the combined tab history.
  `back` and `forward` use -1/+1. Out-of-range movement is a no-op; zero reloads.
- Same-document movement preserves the DOM and refs and uses the existing queued
  history/event implementation. Cross-document movement fetches the target URL
  and creates a fresh document; the old DOM remains closed, not cached.
- `session.history(tabId)` returns combined index/length, entry keys/URLs, active
  flags, POST-resubmission flags, retained encoded bytes and eviction counts.
  It does not expose state payloads. Returned metadata is detached.
- Reload replaces the active document without appending history and preserves
  its state, keys, position and forward entries. Ordinary navigation after back
  discards both same-document and later-document forward branches.

The local `page.history` object still exposes only that document's entries.
An eventual page `window.history` bridge must route combined traversal/length
through the session and implement native scheduling/WebIDL semantics. The current
host signatures are not an assertion that this browser API already exists.

## Restoration and lifecycle

`DocumentHistory.capture()` produces frozen metadata with serialized JSON state,
not DOM nodes or live script objects. `restore(archive)` accepts only a fresh
document history, checks unique keys, canonical absolute URLs, origin rewrite
policy, entry/state/depth/total limits and the active loaded URL before adopting
anything. State reads remain detached JSON data. Archives are sensitive host
capabilities and must not be printed indiscriminately or exposed to untrusted code.

The tab retains bounded groups of entries belonging to each logical document.
Those groups are synchronized from the live document when inspected, navigated
or traversed. New pushState entries invalidate later-document branches even if
local traversal returns to an earlier entry before synchronization. replaceState
does not discard a forward branch.

Traversal captures the source history revision. If it changes while loading,
the stale result cannot commit. Stop, newer navigation, caller cancellation and
session closure use the same owned-job cancellation and late-result cleanup as
other loads. HTTP 204/205 and failed loaders/network requests leave the current
document and traversal position in place. They do not undo server/cookie effects.

Same-origin redirects can update the target entry's loaded URL. A redirect that
changes the target entry's origin fails explicitly rather than restoring its
old-origin state into another origin. Ordinary history movement between previously
visited different origins works; it is the target's origin-changing redirect
restoration that is unsupported.

POST documents are never silently re-fetched as GET or automatically reposted.
Same-document traversal while such a document is still live works, but returning
to a closed POST document fails with a resubmission-required error before I/O.
The existing 301/302/303 conversion and 307/308 preservation rules still apply.
No request-body archive or resubmission confirmation UI is implemented.

## Bounds and limitations

Default session limits add `maxHistoryDocuments: 32` and
`maxHistoryBytes: 8_388_608` **per tab**. The encoded byte budget counts serialized
state, URLs and keys; it is not a process-heap cap. Inactive groups are evicted
from the oldest end, or the newest end when the active group is oldest. The active
document is never evicted to satisfy the budget; an individually oversized archive
fails. The live document's separate limits still apply (normally 128 entries and
4 MiB total JSON state). In-flight captures and object overhead are additional.
Closing a tab/session releases retained archives as well as documents.

Missing: HTML parsing and isolated website JS, BFCache, saved DOM/form/scroll
state, beforeunload/pageshow/pagehide/load sequencing, frame/joint histories,
cross-origin redirect restoration, full structured clone, native history bindings,
POST confirmation and crash-persistent profiles. Concurrent direct session
navigation calls remain latest-wins; the command host serializes CLI commands.
No full Kitesurf or Playwright compatibility row is completed by this subset.

## Verification

- `history-archive.test.ts`: capture/restoration, detached state, key/URL/state/
  budget rejection, one-time restore and queued traversal cancellation.
- `session-history.test.ts`: combined traversal, state/refs, branching/reload,
  failure/204/redirect handling, mutation/stop/supersession races, bounds, POST
  replay protection, metadata isolation and actual command dispatch.
- `node-session.test.ts`: real HTTP history traversal with state and cookie-jar
  preservation.
- `scripts/check-cli-sites.ts`: 13 assertions across separate CLI invocations,
  including public JSON/RFC back/forward, service exit and private-file cleanup.
- `scripts/check-playground-ui.ts`: 16 real-site UI assertions, including Back/
  Forward inspecting the semantic view's actual document content.

See `reports/README.md` for dates, portable-core runs, UI captures and the retained
first CLI report whose old expected-count check was corrected from 11 to 13.
The observer browser is only a UI test tool; our engine performs website requests.

References inspected: WHATWG navigation/session history and the History interface:
https://html.spec.whatwg.org/multipage/browsing-the-web.html#session-history
https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-history-interface
