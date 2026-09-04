# Page CSS utilities

September 4 feature-query continuation: `CSS-SUPPORTS.md` adds bounded
`CSS.supports()` overloads and shared stylesheet `@supports` decisions. It
supersedes the initial missing-supports flag below; the escape checkpoint's
measurements remain historical, not new runtime or browser-equivalence evidence.

September 4, 2026. Page bindings now expose a document-owned `CSS` namespace with
`CSS.escape()`. This addresses application-generated selectors without adding a
runtime dependency, evaluating host code on behalf of pages, or outsourcing queries
and layout to another browser.

## Identifier escaping

The utility serializes a CSS identifier: NULL becomes U+FFFD, controls and leading
digits use terminated hexadecimal escapes, a lone hyphen and punctuation are
escaped, and ordinary identifier characters are retained. This implementation
chooses the DOMString form of CSSOMString and preserves UTF-16 surrogate code
units, including unmatched surrogates. Empty input returns an empty string.

Primitive string conversion includes explicit undefined, null, Boolean, number
and BigInt values. Missing arguments and Symbols throw TypeError; extra arguments
are ignored. Object/function coercion remains explicitly unsupported at the native
capability boundary and does not execute user-defined conversion hooks.

The same namespace object is reachable through the page's global `CSS` binding
and `window.CSS`. Each document gets an independent owner. Retained namespace
methods and the Window getter reject use after binding, document or realm closure.
Failed or reentrant provider publication closes already-created capabilities.
The existing public runtime adapter is used without private SDK changes.

Escaping is for an identifier embedded in a selector, not arbitrary HTML,
JavaScript or CSS declaration sanitization. It does not turn a multi-token class
attribute into one class, recover a NULL-containing identifier, make an empty ID
selector valid, or override the query engine's independent resource limits.

## Native integration and bounds

Native tests consume the escaped result through page querySelector, matches and
closest, plus the shared query engine and stylesheet selector matching. They
verify targeted DOM mutation, native width changes and exclusion of unrelated
elements when source identifiers contain punctuation resembling selector or rule
syntax. Existing selector parsing requires no changes.

Fixed per-call bounds are 65,536 UTF-16 input code units and 65,536 output code
units. Expanded output size is checked before assembling the result. Rejected
calls do not mutate the document or poison subsequent calls. There is no retained
identifier cache, callback registration or asynchronous work queue. These limits
are not whole-process RSS or interpreter instruction measurements.

Command capabilities advertise `cssUtilities.escape`, the bounds and a partial
profile. `CSS.supports()` is not implemented and is not exposed; its capability
flag is false. Full CSS namespaces, feature queries and prototype/descriptor
compatibility remain separate work.

## Research and evidence

Read-only primary research on September 4:

- `https://drafts.csswg.org/cssom/#serialize-an-identifier`
- `https://drafts.csswg.org/cssom/#the-css.escape()-method`
- `https://raw.githubusercontent.com/web-platform-tests/wpt/master/css/cssom/escape.html`

The new native test file contains 51 cases; all 51 fail on isolated prior HEAD.
Coverage includes serialization and conversion, all non-NULL ASCII controls and
punctuation through selectors, Unicode, namespace identity, DOM/style/layout
integration, quotas, ownership revocation and failed/reentrant publication.
The persistent-realm fixture's explicit global list includes `CSS`.

Focused native validation passes 197 tests / four working files and 191 tests /
four isolated files. Full authorized native runs pass 9,790 tests / 273 working
files and 8,644 tests / 251 isolated files. Both trees pass typecheck, build,
strict checking of both changed tests and five-file lint. Results are also recorded
in `TASKS.md` and `SEVEN-DAY-PLAN.md`.

The isolated tree contains committed HEAD plus this checkpoint,
not unrelated pending base64, layout or capability changes. Its unchanged reports
directory references the earlier isolated snapshot to conserve scratch space;
source and build outputs remain separate. Historical reports are not rewritten.
Approved cleanup removes the completed reproducible pending-state scratch snapshot
to relieve disk pressure, not its separately retained logs or backups.

No live website, reference browser, socket, real TTY/PTY or SafeJS execution probe
ran. Native host-object fixtures and specification research do not establish
released-SDK behavior or browser equivalence. The denied SafeJS probe remains
unrun; original compatibility and runtime acceptance gates remain open. The full
seven-day browser objective stays active.
