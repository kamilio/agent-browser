# Native search without complete page layout

The September 14, 2026 Lobsters search checks establish a useful content-first
workflow: native HTML forms can work even when unrelated CSS prevents pointer
geometry. Use the existing explicit keyboard operation, not a fabricated click,
rewritten search URL, or weaker layout admission rule.

## Practical workflow

After inspecting and opening a public, read-only search form, an existing
`BrowserCommandHost` can select a radio, fill a constant and submit:

```ts
await host.execute([
  "press", "Space", "--target", 'input[name="what"][value="stories"]',
]);
await host.execute(["fill", 'input[name="q"]', "local llm"]);
await host.execute(["press", "Enter", "--target", 'input[name="q"]']);
```

Selectors must resolve uniquely to eligible controls. Space focuses and activates
the actual radio; native radio-group state and form serialization determine the
query. Enter follows native validation, cancellation and submission behavior.
Keyboard activation may dispatch a non-pointer click event; it does not fabricate
mouse/pointer gestures. Disabled targets and canceled events remain effective.

This is an explicit alternative action, not an automatic fallback inside
`session.click`. Pointer clicking still requires supported geometry and hit
testing. Reader mode is appropriate for retrieving content and following links;
these form checks instead use the full native HTML/CSS loader with scripts off.
None of this implies SafeJS execution, password access or passkey validation.

## Live observations

All three bounded native flows use runtime `0dc3c27`, an empty cookie jar,
credential omission and only bodyless same-origin public GETs. Each initial
document loads three CSS resources and one SVG. No other browser is involved.

| Flow | UTC time | Result |
| --- | --- | --- |
| Fill `local llm`, then Enter | 22:03:09–22:03:12 | Native default Comments/Newest search; 202 result matches reported by the page; 28,949 Markdown bytes of result content. |
| Click the Stories radio label | 22:06:59–22:07:00 | Initial document succeeds, then the native issue-free layout gate rejects the pointer action. No query request or result extraction occurs. |
| Space on Stories, fill, then Enter | 22:12:58–22:13:00 | Radio becomes checked; native GET contains `what=stories`; 399 result matches reported by the page; 11,560 Markdown bytes. |

The reported match counts are page totals, not a claim that every matching item
was retrieved. The two successful flows each perform ten real requests; the
pointer failure performs five. All responses are HTTP 200, with zero redirects,
mocked requests or accepted cookies. Closed transports and zero retained
document nodes are checked after every flow. Original failures remain intact.

Three actual links from Stories results then yield checked article/thread content
through the native reader. See
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-THIRTY-THIRD-UPDATE.md` for exact URLs and
measurements. This supports getting useful content; it is not completed research
or a claim that every website, layout or interaction works.

## Regression coverage

Five new cases in `src/targeted-press.test.ts` protect the observed workflow using
a small synthetic search form and unsupported CSS on an unrelated element.
They require the pointer attempt to reject while keyboard selection, deselection,
constant filling and correctly encoded GET submission work without pointer
gestures. Keydown, keyup, click cancellation and disabled controls do not change
the radio group or navigate.

Parent validation passes 321 tests across eight explicitly manifest-listed files,
with the socket-denying native guard, no retries and default five-second test
limits. Production compilation, eight strict test roots and owned-test formatting
pass. The worker separately passes the 25-case targeted file. No production API
or pointer behavior changes in this increment; it documents and protects the
existing working alternative. The complete native release suite is not rerun.

## Remaining optimization

Both successful flows download the four assets again after submission. Header
inspection finds explicit `public, max-age=31536000` only on the hashed stylesheet
and logo; the two other stylesheets have no explicit freshness lifetime. A
read-only review recommends only bounded, opt-in reuse with effective credential
and policy checks, expiry, ownership and honest transfer accounting. No cache is
implemented and no request-saving or speedup is claimed from this observation.

## Evidence

Working evidence remains under `/dev/shm/agent-browser-<name>-september14/`;
byte-verified durable copies live under
`node_modules/.cache/native-validation/<name>-september14/` for:

- `lobsters-search`, `lobsters-radio`, `lobsters-keyboard`: scope, runtime hashes,
  one-shot supervisor receipts, response captures and native action results.
- `search-followups`: discovered URLs, public reader captures and exit receipt.
- `native-search`: independent content verification, source overlay, regression,
  typecheck/build/format logs and dirty-work preservation audits.
- `asset-reuse`: the read-only cache feasibility review, not implementation proof.

The form flows and reader batch use separate bounded network scopes. Native unit
results do not authorize or prove live/socket/TTY/SafeJS/device acceptance gates.
