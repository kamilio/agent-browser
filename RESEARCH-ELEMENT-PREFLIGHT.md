# Native research element-target preflight

Research `--selector` and `--section` target real DOM elements. Reject CSS
pseudo-element targets before navigation setup or captured-receipt admission,
instead of making a request that can never select those pseudo-elements.

## Shared syntax validation

`validateSelectorSyntax(source, { pseudoElements: false })` uses the existing
bounded selector parser and rejects parsed pseudo-element tests in any selector
list branch. It is not a substring or regular-expression check. Legacy
`:before`/`:after`, double-colon forms, case variants and CSS-escaped names are
handled by the same parser as ordinary stylesheet selectors.

Literal `::before` in attribute values, escaped colons in IDs/classes, and
ordinary logical/relational selectors remain valid when supported by the native
parser. Existing nested-pseudo restrictions and text/component/nesting limits
remain unchanged. This mode checks target kind and syntax; it does not guarantee
a match, a unique match, a heading for section selection, or extractable content.

Default validation still permits supported generated CSS pseudo-elements.
Native DOM queries retain their existing semantics: pseudo-only branches match
no elements, while element branches in a mixed list can still match. Generated
style matching is unchanged. The stricter policy belongs to research preflight,
not global DOM query semantics.

## Research boundaries

- Navigation argument parsing and direct `researchNavigation` calls reject
  invalid targets before session/tab/transport setup or requests.
- Replay CLI parsing rejects invalid targets before receipt input is consumed.
- Direct JSON replay rejects invalid targets before validating or loading the
  supplied receipt. Existing cancellation checks still precede selection.
- Each boundary retains its static invalid-input message without echoing the
  selector. Link-search text is not a CSS selector and remains unaffected.

Mixed lists containing a pseudo-element branch are rejected as a whole for
research selection, even if another branch could match an element. This keeps
unsupported requested targets explicit rather than silently discarding them.

## Validation scope

The explicit native manifest includes `src/research-element-preflight.test.ts`.
Tests cover parsed targets, escaped/literal text, all four research boundaries,
no-setup/no-admission assertions, error redaction, parser limits, link-search
controls and unchanged native DOM/generated-style matching. Existing research
section, selector, replay and generated-content suites provide integration
coverage; synthetic requests are mocked and no websites are contacted.

Avoiding these invalid-input requests reduces unnecessary traffic, but is not
evidence of CAPTCHA compatibility, challenge bypass, website throughput or
completed research. Exact baseline/fixed/broad results and remaining failures
are recorded separately in RESEARCH-PREFLIGHT-VALIDATION-SEPTEMBER-13.md.
