# Literal agent target locators

Status: September 2, 2026. Role, test-ID, text, label and attribute targeting share the existing
native command/action path. This adopts a useful part of Playwright CLI's target
syntax, **not its full locator engine, accessibility conformance or auto-waiting**.

## Supported forms

```bash
agent-browser click "getByRole('button', { name: 'Submit', exact: true })"
agent-browser fill "getByRole('textbox', { name: 'Full name' })" "Agent input"
agent-browser check "getByRole('checkbox', { name: 'Enabled' })"
agent-browser dom "getByTestId('name-field')"
agent-browser snapshot "getByRole('heading', { name: 'Welcome' })"
agent-browser fill "getByLabel('Account secret', { exact: true })" "Agent input"
agent-browser click "getByText('Buy item', { exact: true })"
agent-browser fill "getByPlaceholder('Your name')" "Ada"
agent-browser dom "getByAltText('Shop logo')"
agent-browser snapshot "getByTitle('Name field')"
```

Existing stable refs and CSS selectors are unchanged. These forms also work in
the playground command box and shared target fields because resolution happens
in the backend. Commands that accept a target, including native actions and
subtree DOM/HTML/snapshot/extraction reads, use the same resolver.

- `getByTestId('value')` matches the exact `data-testid` value. The attribute is
  fixed, not configurable. Values are compared as data rather than interpolated
  into a CSS selector; quotes, brackets, Unicode and NUL cannot change the query.
- `getByRole('role')` uses the engine's supported semantic role/name subset.
  `name` is an optional string; default name matching is a normalized,
  case-insensitive substring. `exact: true` requests a normalized, case-sensitive
  whole-name match. Normalization currently follows the engine snapshot rules.
- Arguments and option keys may use single or double quotes. Common escaped
  quote/backslash/control characters and `\xNN` / `\uNNNN` escapes are accepted.
  This is a small literal grammar, not a general JavaScript parser.

Only `name` and `exact` role options and `exact` text/label/attribute options are
implemented. Regex arguments, templates, executable expressions, unlisted
`getBy*` methods, `includeHidden`/state filters,
chaining, frames, `first`/`nth`/`filter`, and custom test-ID attributes are rejected
explicitly. A locator string is never passed to native `eval`, `Function`, a host
VM, or the page interpreter. No dependency or browser engine evaluates it.

## Resolution and safety

Every call resolves against the current document; changes to text, labels,
attributes and supported visibility rules are observed on the next call. Zero
matches fail with `not-found` for immediate reads; supported host actions wait
as described in `ACTION-WAITING.md`. Multiple matches fail with `not-actionable`.
There is no implicit first match. Saved refs still fail after removal/replacement.

Role candidate traversal includes descendants normally collapsed below semantic
leaf roles in the human-readable snapshot. It therefore does not silently miss a
second matching button merely because a snapshot hides its ancestor's children.
Incomplete descendant/label text propagates into a truncated-candidate failure,
rather than allowing a clipped accessible-name prefix to falsely prove uniqueness.
Ordinary snapshot presentation and snapshot-diff baselines remain unchanged.

Role candidates exclude the semantic layer's hidden/inert/ARIA-hidden and
CSS-hidden content. Test-ID lookup itself includes hidden elements; native action
checks prevent dispatch to hidden or disabled targets, with bounded host action
waiting for readiness. Password/file/date-like inputs
do not acquire manufactured implicit textbox/button roles in locator mode;
use `getByLabel`, a ref, CSS selector or test ID for password inputs. Explicit roles and
list-associated inputs use the implemented native role rules.

The shared host now implements partial pre-action waiting, without action replay
(`ACTION-WAITING.md`). Accessible-name calculation,
hidden-reference naming, contextual roles, full ARIA states and semantic coverage
remain partial. These limitations are not evidence of Playwright parity. Native
event, focus, control, navigation and policy checks still govern resolved actions.

## Text, labels and attributes

The five additional literal methods use native document records rather than a
possibly truncated semantic snapshot or page evaluation:

- `getByText` matches normalized descendant text. Whitespace collapses, edge
  whitespace is trimmed, and zero-width space/soft hyphen are removed. Default
  matching is a case-insensitive substring; `exact: true` is a case-sensitive
  whole normalized string. Elements with a matching child element are omitted,
  so a nested text span can be the target instead of its containing button.
  Text across siblings is concatenated without inventing spaces. Comments,
  scripts, styles, noscript and head content do not supply match text.
- Submit/button/reset input values participate and follow current native state.
  Ordinary input and password values do not become text. This is not an
  accessible-name lookup: aria-label and image alt are not text descendants.
- `getByLabel` first considers valid aria-labelledby ID references, then a
  nonblank aria-label, then native wrapping/for labels. Each referenced or native
  label is matched independently, not concatenated into an accessible name.
  Duplicate IDs use the first connected document match. Hidden label text is
  available; native hidden inputs are not labelable, while ARIA labels can name
  arbitrary elements. Label text uses the same normalization/exact option as
  text queries. Native associations are recalculated after document mutations.
- `getByPlaceholder`, `getByAltText` and `getByTitle` compare their corresponding
  attributes as data, with case-insensitive substring matching by default or raw
  case-sensitive equality for `exact: true`. Unlike text queries, whitespace is
  not normalized. Attribute values cannot inject selector syntax.

Text, label and attribute candidate matching includes hidden elements. Two
matching nodes remain ambiguous even when one is hidden; there is no implicit
visible-first choice. Native actionability/waiting still governs dispatch after
resolution. Smallest text targets use the existing bubbling/default-action path.
These methods do not add shadow DOM, frame traversal or broader ARIA conformance.

The matching profile was checked against Playwright's locator documentation and
its public `selectorUtils.ts`, `injectedScript.ts`, `roleUtils.ts` and
`stringUtils.ts` source on September 2, 2026. This is independently implemented
bounded native matching, not an imported Playwright runtime. It has not passed a
pinned upstream CLI/browser parity suite.

- https://playwright.dev/docs/locators
- https://github.com/microsoft/playwright/blob/main/packages/injected/src/selectorUtils.ts
- https://github.com/microsoft/playwright/blob/main/packages/injected/src/injectedScript.ts
- https://github.com/microsoft/playwright/blob/main/packages/injected/src/roleUtils.ts
- https://github.com/microsoft/playwright/blob/main/packages/isomorphic/stringUtils.ts

## Bounds

Locator source is limited to 8,192 code units and decoded strings to 4,096. The
role projection accepts at most 50,000 native document records, 10,000 semantic
entries, depth 1,024 and a 1 MiB serialized projection, with 16,384-code-unit name
limits. Truncation fails with `resource-limit`; it is never interpreted as a
complete candidate list. The semantic projection may fail conservatively because
of unrelated large content. Existing document/style/query budgets also apply.
Test-ID lookups retain the native selector engine's candidate/result limits.

Text/label/attribute traversal accepts at most 50,000 connected native records and
charges at most 8,000,000 work units. Cached descendant strings have a 262,144-
code-unit per-node cap and a 4,000,000-code-unit aggregate cap. Needed text is
joined once per node, not repeatedly copied as a growing sibling prefix. Label
queries construct only the referenced/native label subtrees, so unrelated large
page text does not prevent a small label lookup. Attribute queries do not build
descendant text. Each aria-labelledby list is limited to 16,384 code units and
1,024 tokens before deduplication. Exceeding a bound fails with resource-limit;
no clipped prefix or partial candidate list is accepted as unique. These are
conservative work/memory guards, not hard preemption of all native operations.

## Evidence and remaining gates

`text-locators-focused-2026-09-02.json` and
`text-locators-safejs-fixture-2026-09-02.json` add native parser/targeting/resource
checks plus actual experimental-core shared-host actions. They cover password
label fill, checkbox labels, placeholder input events, title/alt inspection,
smallest-span click bubbling, interpreted label changes, delayed text targets,
hidden duplicates, rejected executable input and preserved snapshot diff state.
Native cases additionally cover independent labels, ID precedence, normalized
versus raw matching, unrelated large text and fail-closed content/reference caps.

`reports/target-locators-focused-2026-09-02.json` records literal parsing,
executable-input rejection, exact test-ID data comparison, role/name matching,
labels, hidden and duplicate candidates, live updates, truncation, native
command-host actions and browser regressions: 1,035 passes across 47 files,
including 28 parser/resolution cases.

`reports/target-locators-safejs-fixture-2026-09-02.json` records eight actual
experimental-core checks. Role-targeted fill runs an interpreted input handler;
a test-ID-targeted click reveals a hidden action, which is then found by role and
activated through its actual listener. Interpreted ID/DOM changes are observed,
and a new duplicate makes subsequent resolution fail safely.

All fixtures are in memory. No separate CLI/IPC process, visual playground,
public website, live terminal or released-SDK acceptance is claimed. Full P05 and
the original Playwright-CLI-superset goal remain open.

## References checked September 2, 2026

- Playwright CLI README, “Targeting elements”:
  https://github.com/microsoft/playwright-cli/blob/main/README.md
- Playwright locators and role options:
  https://playwright.dev/docs/locators
  https://playwright.dev/docs/api/class-page#page-get-by-role
- ARIA in HTML, input role mappings:
  https://www.w3.org/TR/html-aria/

These are source/specification references, not downloaded dependencies or a
pinned, executed upstream parity suite.
