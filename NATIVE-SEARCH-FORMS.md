# Public search through native form APIs

The source reader intentionally unwraps forms and removes input controls. A
readable search page is not necessarily a fillable native document. For a native
form workflow, keep a `BrowserSession` open and load the source with the inert
`parseHtmlDocument` parser. This does not execute page scripts or supply remote
styles, images or a rendered-browser compatibility guarantee.

## Procedure

1. Read the authored form action/method and its associated controls. Select the
   actual intended form and field, recording duplicate matches rather than
   treating an ID as unique. Reject account/password forms and unexpected methods.
2. Establish the permitted public GET destination independently from those source
   fields. Restrict transport before dispatch: exact phase URL, origin, method,
   body absence, public headers and credential omission. Keep native network
   bounds and redirect policy; do not silently retry or rewrite redirects.
3. Fill the existing text/search control through `fillAsync`, then submit its
   actual form through `BrowserSession.requestSubmit`. The expected destination
   is a transport assertion, not a replacement URL passed to `navigate`.

```ts
const page = session.page(tabId);
await page.interactions.fillAsync(fieldRef, "transformer inference");
const result = await session.requestSubmit(tabId, formRef);
```

`fieldRef` and `formRef` refer to the inspected live source document. The public
query is a literal constant, not a secret. This excerpt assumes an already
configured session, transport restrictions, source loading and validated targets;
it is not a standalone safe browser launcher.

4. Inspect `result.form` and `result.navigation`. A canceled or invalid submission
   stays on the original page. The API serializes successful controls, including
   defaults, checked radios and hidden values, after controlled submit listeners
   complete. A named submit button is included only when explicitly supplied as
   the submitter. Do not rewrite hidden values or validation to force a result.
5. Read the resulting document separately. An HTTP200 response, a completed form
   action or nonempty text does not establish that the site returned search
   results. Preserve JavaScript-only shells, barriers and failures distinctly.
6. Close the session and verify documents, event listeners, transport, request
   sockets and supervising processes are released.

## Limits exposed by real source

arXiv's captured abstract-page header form sits inside an authored hidden overlay.
Native fill correctly refuses it without submitting. Removing `hidden` would
not validate that UI. A separate public search-results page contains a visible
main form with its own `/search/` action; using that form is a distinct workflow,
not execution of the header's JavaScript toggle.

Python documentation's server search response previously supplied a JavaScript
shell. Native form serialization cannot manufacture results absent from that
response. The static index workflow in `SOURCE-SEARCH-WORKFLOWS.md` remains a
different named-item lookup, not a full-text search implementation.

The synthetic regressions are in `src/native-search-submit.test.ts`. The dated
live report, `reports/native-search-forms-2026-09-16.md`, distinguishes form/API
completion from content review, records every attempted URL and retains failures.
No password, passkey, SafeJS, page-script or real-UI acceptance is implied.

## Lightweight arXiv search entry

A separate September 16 follow-up starts at `https://arxiv.org/search/`, reads
the freshly returned main GET form, fills the literal query `transformer
inference`, and submits that actual form. It succeeds with two HTTP200 responses
and a 50-record search listing. The full initial source parser, exact destination
gate, credential omission and resource limits remain unchanged.

This is a practical alternative entry workflow, not an automatic retry or proof
that the previous different-URL timeout was fixed. Both requests have positively
observed TCP connect, authorized TLS, local request completion, response headers
and closure. No inference about the earlier timeout or a partial-DNS fix follows.
See `reports/arxiv-search-phases-2026-09-16.md` for URLs, timings, content limits,
isolated checks and the unchanged original 100-page validation results.
