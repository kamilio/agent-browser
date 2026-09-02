# Session ownership and document navigation

Status: September 1, 2026, 17:46 UTC. The host SDK now owns tabs, cookie/storage
state, document replacement and cancellable navigation. The original text loader handles
plain text/JSON; the later `loadBrowserDocument` adds partial HTML (`HTML.md`).
That loader now returns a Promise and receives an optional scoped
`fetchStylesheet` callback. Sessions supply guarded subresource retrieval and
validate the bounded CSS visibility cascade before committing a document. Pages
expose `styles`, navigation results include its diagnostics, and `resize` retains
each tab's logical viewport across navigation/reload. See `CSS.md`; this is not
full layout, DOM CSSOM, website JavaScript or a window-resize event implementation.
This is not the finished HTML/JavaScript browser,
Playwright CLI superset or playground; those requirements remain open.

The later `CLI.md` checkpoint connects this core to a real foreground command
service and separate CLI processes. That frontend now loads partial HTML and remains
partial, not full browser/CLI parity.

## Constructing a session

```ts
import { BrowserSession, loadBrowserDocument, renderSnapshot } from "@automations/browser-agent";
import { NodeNetworkTransport } from "@automations/browser-agent/node";

const session = new BrowserSession({
  createTransport: (cookieJar) => new NodeNetworkTransport({ cookieJar }),
  loadDocument: loadBrowserDocument,
});

try {
  const tab = session.createTab();
  await session.navigate(tab.id, "https://httpbingo.org/json");
  console.log(renderSnapshot(session.snapshot(tab.id)));
} finally {
  session.close();
}
```

Build the package first. These imports work from this package's ESM context; no
workspace-link installation or publication has occurred. The example's snapshot is
bounded semantic output, not a full dump of large text documents.

Both adapters are explicit trusted-host configuration. `createTransport` receives
the session's own jar; the Node adapter must be constructed with that jar to enable
automatic session cookies. The session owns and closes the returned transport.
An adapter factory that fails before returning must dispose of its own allocations.
Malformed returned adapters with a close method are closed on rejection.

`loadDocument(response, context)` returns a fresh live `DocumentTree` at the final
response URL, with limits no larger than `context.limits`. The context contains
the tab ID, cancellation signal and frozen document limits. Ownership transfers
to the session. Reusing an already adopted tree is rejected without closing its
rightful owner's document. Rejected fresh trees and late canceled results are
closed; a loader that throws before returning must clean up its own partial tree.

No loader callback is website JavaScript. The approved-parser/runtime integration
still needs implementation; this seam does not grant page code host capabilities.

## Tabs, state and actions

- `createTab({ opener?, select? })` creates an empty tab and optionally copies an
  opener's session storage. Local storage and cookies are shared within the session;
  independent sessions do not share them. IDs are not reused within a session.
- `tabs()` returns frozen metadata, not mutable internal tab objects. `selectTab`
  changes the selected tab. Closing it selects the first remaining tab.
- `page(tabId)` exposes the current trusted-host document, interactions, queries
  and same-document history. `snapshot` captures that document's semantic state.
- `navigate(tabId, url, { signal? })` resolves relative URLs against the committed
  document URL, not a base element. An empty tab requires an absolute HTTP(S) URL.
  URL controls/credentials and unsupported protocols are rejected.
- `reload` fetches a fresh document, including at fragment URLs, except committed
  POST results require explicit resubmission and are not automatically replayed.
- `click` executes the current document's native interaction. Same-tab, top and
  parent navigation targets are followed through the loader; these are top-level
  tabs without frame trees. Form submission uses `requestSubmit` and the guarded
  navigation pipeline (`FORM-NAVIGATION.md`). Other targets and picker actions remain
  explicit pending intents. They are not reported as completed navigation.
- `requestSubmit` performs supported validation, cancelable submit events and
  current-value serialization, then GET/POST navigation. Invalid/canceled forms
  return metadata without navigation. Unsupported constraints fail explicitly.
- `stop`, `closeTab` and `close` cancel owned work. Session closure also closes its
  transport, jar, storage and all committed documents. Cleanup continues after
  callback failures; only an error count is exposed, not callback data.

The `page`, `cookies` and `storage` objects are host capabilities, not safe page-VM
bindings. Do not manually close adopted trees or share the owned transport with
another session. A future page bridge must enforce document/origin/lifetime checks.

## Navigation behavior

A failed load leaves the previous committed document usable. HTTP 204/205 do not
replace it; HTTP error bodies can become documents if the loader supports their
type. HTTP 304 without a cache and attachment/download navigation fail explicitly.
Successful loading initializes interactions, queries and history, selects the
fragment target, commits the new page, then closes the old document. Old refs and
page capabilities become stale rather than accidentally addressing the new page.

Same-resource fragment navigation retains the document and uses `DocumentHistory`.
Its optional abort signal is checked inside the queued job before mutation.
Cancellation cannot roll back host event-handler mutations already performed.
The later `NAVIGATION-HISTORY.md` checkpoint adds combined `go`/`back`/`forward`
and restores bounded JSON history state into fresh documents. Reload preserves
entries rather than appending. BFCache and saved DOM/scroll/form state remain absent.

New navigation supersedes earlier work in the same tab. Cancellation initiated
inside an old job's abort handler cannot overwrite a newer reentrant navigation.
Signals/options are captured before asynchronous work. Deadlines and external abort
listeners are removed when work stops, even if an adapter has not settled.

Default limits are 32 tabs, 500 navigation attempts, 8 outstanding navigation jobs
and a 30-second whole-navigation deadline. A canceled adapter that ignores its
signal still occupies an outstanding-job slot until it settles. Its eventual tree
cannot commit. This prevents unlimited abandoned asynchronous work, but **does not
preempt synchronous hostile host code**. Future page VMs need their own CPU/memory
interrupts; host callbacks are trusted. Metrics retain outstanding-job counts after
close until actual settlement, rather than pretending cleanup has completed.

## Native text loader

`loadTextDocument` accepts one explicit Content-Type: `text/plain`,
`application/json`, or an `application/*+json` type. It decodes supported HTTP
charsets/BOMs, bounds encoded and decoded text, and creates literal text inside a
preformatted element. It does not parse JSON into invented HTML, auto-link text,
evaluate markup, or run scripts. HTML, XHTML, SVG, scripts, CSS, binary and missing/
ambiguous types fail explicitly in this deliberately narrow loader. The default CLI
now uses `loadBrowserDocument`, which dispatches explicit text/html to our partial
parser and other supported types to this text loader. MIME sniffing and complete
HTML decoding remain pending; see `HTML.md`.

Semantic snapshots may truncate and normalize this text. The document retains the
bounded full text, but terminal preformatted layout/paging is not complete.

## Evidence and remaining work

- `src/session.test.ts`: 26 lifecycle/ownership/navigation cases, including late
  loaders, reentrant cancellation, invalid candidates, quotas and cleanup failures.
- `src/text-loader.test.ts`: 13 literal-text/MIME/decoding/budget cases.
- `src/node-session.test.ts`: two real local-HTTP workflows, including redirects,
  cookie sharing/isolation, document replacement and unsupported HTML preservation.
- `src/history.test.ts`: 20 cases including abort-before-fragment mutation.
- `reports/unit-node-2026-09-01-session.json`: 519 Node checks in 23 files pass.
- `reports/session-core-bun-2026-09-01.json`: 59 focused portable checks pass;
  Bun's network backend remains unsupported.
- `reports/session-sites-node-2026-09-01.json`: public RFC plain text and JSON load
  into real owned documents; reload invalidates the prior tree; expected HTML
  rejection preserves the current page. Four requests, three document commits,
  zero outstanding loads/cleanup errors after closure. One unsupported Domain
  cookie was rejected during the probe, preserving the known cookie limitation.

The public RFC response was 502,941 bytes, loaded in 154 ms in this run, with a
632-byte semantic snapshot. Instantaneous whole-process RSS was approximately
78–79 MiB during these checks. These are observations, not peak/isolated memory
measurements or an HTML/JavaScript-browser performance claim.

Build, production typecheck, focused new/changed test-source typechecks and lint
pass. The separately documented pre-existing TLS test-source typing issue is
unchanged. Complete HTML parsing, isolated page JavaScript, lifecycle/DOMContentLoaded/load
events, beforeunload/unload, full submission/history semantics, frames,
named targets/noopener and CLI service persistence still need work. The partial
playground now exists (`PLAYGROUND.md`), without rendering/export parity.
No compatibility row is completed by the text-only session evidence.

Reference navigation algorithms inspected:
`https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate`.
