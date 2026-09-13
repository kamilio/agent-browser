# Native responsive font-size calculations

The native text-style pipeline accepts bounded `calc()`, `min()`, `max()` and
`clamp()` length-percentage expressions for `font-size`. It reuses the existing
CSS math parser and layout-value evaluator; no page-runtime dependency or
site-specific stylesheet rewriting is introduced.

```css
h1 { font-size: calc(1.375rem + 1.5vw); }
h2 { font-size: clamp(1rem, 2vw + 1rem, 2rem); }
```

## Computed values

- `em` and percentages use the parent's computed font size.
- `rem` uses the computed root font size; the root's own font computation uses
  the existing initial-font basis, avoiding a self-reference loop.
- `ex` uses the existing native inherited-font x-height metric, or the initial
  font metric for the root's own font size.
- Absolute units and `vw`, `vh`, `vmin`, `vmax` use the same factors as ordinary
  font-size lengths. Expressions resolve completely to pixel font sizes.
- Completed negative calculation results clamp to zero. Intermediate negatives
  remain available to arithmetic and comparison functions; clamping is not
  applied prematurely to individual terms.
- Inheritance passes the computed pixel value, not an unevaluated expression.
  Descendant `em` dimensions therefore use the resulting computed font size.

Existing custom-property substitution, cascade, root/parent relationships and
viewport invalidation feed the same text-style path. The implementation does
not introduce a separate calculation cache or alter DOM ownership.

## Limits and exclusions

The existing CSS math source, computed-source, node, depth and argument limits
remain in force. Non-finite calculations and the existing maximum absolute
layout length are rejected; no limit is increased to admit a website.
Dimensional products, division by zero, unsupported units/functions, malformed
expressions and bare number calculations are not silently accepted as lengths.

Ordinary font-size keywords, lengths, CSS-wide values and invalid-declaration
fallback retain their existing behavior. This change does **not** add calculation
support to `line-height`, media queries or every CSS property. The earlier
font-size-math exclusion in the standalone CSS math notes is superseded only
for this text-style property; other documented exclusions still apply.

## Website coverage

The motivating case is a real retained TestPages/Bootstrap rule. At an 800px
viewport, the previously unsupported calculation left the heading at 16px; an
existing 1200px media override supplied 40px at 1280px. Tests use the exact captured
HTML and stylesheet through native resource-policy/integrity handling, not a
hand-edited replacement. The uncaptured font import remains explicitly denied.

Native computed-font and formatting-tree evidence is not complete website
rendering acceptance. Positioning, overflow and other remaining layout issues
remain reported. Source capture dates and failed wrapper attempts retain their
original records; validation receipts are recorded in the inventory below.

## Validation

All 74 new regression cases pass; the unchanged baseline has 54 failures and
20 passing controls. The expanded corrected focused gate passes all 663 cases. The
expanded selected native gate has 19,343 passes, three explicitly retained
baseline failures and two unchanged skips; build, strict and format pass.
The full selected suite is not green.

On the exact retained TestPages source, the heading now computes to 34px at
800px and remains 40px at 1280px. All 15 font-size-math declaration errors are
removed; other CSS/layout limitations remain. This zero-HTTP source replay
does not establish fresh live-site or full rendering acceptance.

Exact runtime pins, source capture timestamps, before/after measurements and
preserved failed attempts are in
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-SECOND-UPDATE.md.
