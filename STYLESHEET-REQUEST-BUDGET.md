# Explicit per-navigation stylesheet request budget

`BrowserSessionOptions.limits.maxStylesheetRequests` controls how many stylesheet
retrieval attempts one document navigation may initiate. The default remains
**8**. Callers may supply a positive safe integer from **1 through 128**; invalid
values fail during session construction before the transport adapter is created.
The session copies and freezes its limits.

For a known multi-stylesheet document, a host can explicitly configure a larger
bounded allowance while supplying its usual transport and document-loader adapters:

```ts
const session = new BrowserSession({
  createTransport,
  loadDocument: loadBrowserDocument,
  limits: { maxStylesheetRequests: 24 },
});
```

This is an SDK/session option, not a new CLI flag or an automatic per-site retry.
Existing callers retain their eight-attempt behavior. A fresh document navigation
gets a fresh allowance, including replacements and separate tabs; attempts are
not pooled across concurrent document jobs. Fragment-only navigation does not
reload stylesheets.

## Independent safeguards

- The allowance is checked before URL parsing and transport retrieval. Rejected
  mixed-content/invalid requests and failed retrievals still consume attempts.
  Catching an over-budget error cannot reset or replenish the allowance.
- Exceeding it raises the existing `resource-limit` error and preserves request
  journaling. The native HTML loader retains its existing partial-stylesheet
  diagnostic behavior; the option does not suppress that diagnostic.
- Transport request/byte/concurrency/origin policies, navigation deadlines,
  cancellation, stylesheet storage/code-unit bounds and CSS/query work budgets
  remain independent. An allowance of 24 does not grant 24 network requests if
  the transport permits fewer, nor does it enlarge the style owner's sheet cap.
- No credentials, scripts, page runtime, redirect exemption, network permission
  or alternate browser is granted by changing this count.

The observed motivation is MDN's stylesheet coverage gate documented in
`MDN-CUSTOM-NOOP-LIVE.md`. That historical run remains failed. Configurability
alone is not proof that the complete MDN flow, rendering or challenge avoidance
works; isolated tests and a separately scoped live attempt provide distinct
evidence.

## September 11, 2026 validation

The clean `0606cf6` snapshot in
`node_modules/.cache/native-validation/native-stylesheet-budget-september11-round01/`
overlays only `src/session.ts` and `src/session.test.ts`. Build, strict checking,
formatting and 112 explicit native files pass from 10:26:42.533 to 10:28:20.425
UTC: **6717 passed, zero failed, one existing baseline assertion excluded**.
All 76 session cases pass, including 28 new allowance cases. The 1006 source files
remain stable; the 549-entry native manifest is unchanged.

The new cases exercise actual native HTML/CSS loading through an in-memory
transport, not live sockets. They cover 12/18 stylesheet links with default-eight
and explicit 1/12/24 allowances, applied visibility, partial diagnostics, reset
on replacement/separate tabs, blocked/failed attempts, repeated over-budget calls,
transport resource errors, invalid inputs, both valid endpoints, and frozen copied
configuration. Higher admission does not hide lower-layer failures.

The unchanged-code baseline with the new tests in
`node_modules/.cache/native-validation/native-stylesheet-budget-baseline-september11/`
passes 57 and fails 19 cases. Those failures include the newly exposed default
field and previously ignored configured limits; they do not imply that the old
default-eight request behavior itself was broken.

Strict checking covers 111 roots with the previously documented snapshot typing
exception; that file still runs at runtime. The excluded focus-provisioning-pressure
assertion remains an acknowledged baseline failure. Native tests deny networking
and do not establish live website, rendering, credential, SafeJS or TTY/PTY
acceptance. The new MDN flow is independently scoped and preserves all original
resource-completeness and native-click checks.
