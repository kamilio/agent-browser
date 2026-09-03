# Verified locator generation

September 2, 2026. The native `generate-locator` command turns a current element
reference, CSS selector or supported literal locator into a reusable locator
expression. It reads our document model; it does not evaluate website code or
use Playwright, Chromium, a remote browser or a new dependency.

## Commands and API

```sh
agent-browser generate-locator e17 --json
agent-browser --raw generate-locator e17
agent-browser generate-locator '#save' --raw
agent-browser click "$(agent-browser --raw generate-locator '#save')"
agent-browser fill 'locator("[id=account]")' 'Example input'
```

Structured results include `ref`, `revision`, `locator`, `strategy`, `structural`
and `partial`. The ordinary command envelope still identifies the session and
command. `--raw` prints only the locator expression plus a newline in the CLI;
the structured host/API continues returning metadata. `--raw` is accepted before
or after the command. Raw output is implemented only for this command; other
ordinary host commands reject the option, and combining it with `--json` is
rejected. Existing help/version frontend handling is unchanged.

The exported TypeScript function is `generateLocator(tree, queries, target)`.
Generated expressions have no `page.` prefix: for example,
`getByTestId("save")`, `getByRole("button", {name: "Save", exact: true})` or
`locator("[id=\"account\"]")`. They can be fed directly to our existing target
arguments, or used as expressions on a Playwright page in user-authored code.
We have not established cross-engine matching equivalence.

The target parser now accepts `locator('CSS')` as a literal alias for the
existing bounded CSS engine. Only one string argument is accepted. Options,
concatenation, expressions, chains, `.first()`, XPath and other selector engines
are not enabled by this alias. It never runs host or page JavaScript.

## Selection and correctness

The generator tries, in order:

1. Exact `data-testid`.
2. An exact role/name from the implemented semantic candidate model.
3. An exact CSS `id` attribute selector.
4. Exact placeholder, alt-text or title locators.
5. A document-anchored child-position CSS path.

Every returned expression is resolved through the ordinary strict target
resolver and must uniquely match the original reference. Missing or ambiguous
candidates are skipped; incomplete/budget-exhausted candidate searches fail
rather than proving uniqueness from partial results. A hidden element can
receive a CSS/test-ID locator even when excluded from role candidates; existing
actionability checks still govern actions.

CSS paths count element siblings, not text/comments, and anchor the first
element against having an element ancestor. This also supports the native
document model's multiple top-level elements. Generation does not add marker
attributes, change revisions, activate controls or consume snapshot diff state.

JavaScript literal escaping and CSS string escaping are separate. Quotes,
backslashes, control characters, bidi controls and non-BMP format characters
cannot turn page attributes into executable source or raw terminal controls.
NUL-containing IDs skip the CSS-ID candidate instead of silently substituting
the CSS replacement character. Literal test-ID matching can preserve NUL.

## Stability and limits

Uniqueness is verified **at the returned document revision**, not forever.
Semantic/ID locators can survive moves and a new page with equivalent markup;
they still resolve anew and can become ambiguous or identify a replacement.
Stable element references and reusable locators serve different purposes.

`structural: true` explicitly marks positional fallback. Inserting or moving
siblings can make a positional locator select another element. A dedicated
test demonstrates this; do not treat a saved structural locator as persistent
identity. Inspect/regenerate it when the relevant structure changes.

Generation permits at most 50,000 owned nodes, including detached allocations;
locator source is bounded to 8,192 UTF-16 code units. Structural paths have at
most 64 element levels and a 100,000-unit sibling-walk guard. Existing CSS,
role/name, text, result and work limits remain independently enforced. A larger
document can fail a semantic candidate scan before reaching a CSS fallback.

This is a partial generator, not upstream codegen parity: automatic label/text
candidate discovery, ancestor semantic combinations, configurable test-ID
attributes, frame/shadow-root traversal and cross-engine equivalence are open.
No overlay, highlight, screenshot or layout support is implied.

## Evidence and reference

1,475 tests pass across 67 files, including 27 generation cases. Package build,
strict changed-test checking, focused formatting and diff checks pass. The final
experimental-core runs pass 50 checks (13 new fixture checks and 37 existing
locator/search/mock-terminal regressions).

`locator-generation.test.ts` covers native round trips, escaping, candidate
priority, hidden/duplicate elements, mutation, navigation, structural instability,
resource failures, raw option validation and the shared command host.
`check-locator-generation.ts` passes 13 actual experimental-SafeJS checks:
generated actions reach interpreted handlers, preserve listeners across moves,
respond to new ambiguity, handle hostile attribute literals, preserve diff
baselines, re-resolve after reload and close the owned page runtimes.

The fixture uses an in-memory transport. CLI wire/terminal output, new public
sites and released-SDK acceptance remain unverified; this is not a substitute
for the denied live-terminal/public-site acceptance gate. Build then run:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/approved/experimental/safe-js \
  node packages/browser-agent/dist/scripts/check-locator-generation.js --trace
```

The package command is `check:locator-generation`. Evidence is in
`reports/locator-generation-*.json`.

Reference syntax was rechecked September 2, 2026 against Microsoft's CLI skill
and test-generation guidance (moving main branch, not a parity-suite pin):

- https://github.com/microsoft/playwright-cli/blob/main/skills/playwright-cli/SKILL.md
- https://github.com/microsoft/playwright-cli/blob/main/skills/playwright-cli/references/test-generation.md
