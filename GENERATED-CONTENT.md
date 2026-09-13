# Native before/after generated content

This is a bounded native formatting feature, not a second browser engine or a
page script. It supports terminal `::before` and `::after`, including legacy
`:before` and `:after`, with string-valued `content` and ordinary cascade rules.

## Matching and cascade

- Pseudo-elements have their own selector specificity and cascade targets.
  `DocumentQueries.matchingStyleSpecificities` returns separate ordinary-element,
  before and after maps in one work-budgeted operation. Pseudo maps contain
  originating element IDs, not new DOM IDs.
- Ordinary DOM queries, matches and closest never return a pseudo-element.
  An ordinary branch of a mixed selector list remains independently matchable.
  Unknown or unsupported branches still invalidate an unforgiving whole list.
- Normal/none content does not generate a box. An empty string does generate an
  empty box. Adjacent CSS string tokens concatenate; escapes are decoded and
  serialized as CSS strings without lowercasing or collapsing their text.
- String content participates in specificity, importance, source order,
  CSS-wide resets, custom-property inheritance and bounded substitution.
  Invalid substituted content does not fall back to an earlier declaration.
- Inheritable styles come from the originating element. Non-inherited
  properties use their initial values unless explicitly inherited. Pseudo rules
  do not change the originating element's computed style.
- Tree, stylesheet, media and relevant native control-state changes invalidate
  cached pseudo styles through the existing cascade revision mechanism.

## Native formatting boundary

Generated content belongs to the formatting tree, not the DOM. It must not
change DOM child counts, text content, query identity, document revisions or
actionable-control targets. Its text and boxes consume the existing formatting
text, depth, work and box limits. Pseudo matching shares the selector result and
work ceilings; pseudo cascade/substitution and lazy style work are also bounded.

The initial profile targets static inline, block, flow-root and inline-block text/empty
boxes with native typography, paint, borders and padding. Replaced origins do
not produce before/after content. Unsupported generated layouts retain explicit
formatting diagnostics rather than silently claiming full rendering support.

## Still unsupported

Counters, quote-control keywords, `attr()`, resource-valued content, alternative
text syntax, other pseudo-element kinds, nested/chained pseudo-element selectors
and pseudo-element CSSOM objects are outside this profile. Ordinary-element
replacement through `content` is not implemented and retains an explicit
diagnostic. Positioned/floated and complex generated layouts, effects requiring
DOM-backed paint metadata, full accessibility exposure, selection and hit-testing
of pseudo content require separate work and acceptance evidence.

The CSS Content draft's `contents` redistribution and complete ordinary-element
computed-value rules are not implemented. Explicit inheritance is supported
within the native string/neutral-value subset, not as a claim of complete draft
conformance. Closed details suppress generated body content; open details retain
the browser's summary-first profile, which still needs independent shadow-tree
and `::details-content` conformance work.

Primary-source captures establish only the specific admitted rules in their
reports. Native unit tests, retained website replay, fresh HTTP capture and
full-page rendering are separate gates; none substitutes for the others.

## Verified September 13, 2026

The isolated focused gate passes 1,019 tests. The canonical native gate passes
18,903 tests with zero failures and two unchanged exclusions: 370 selected files,
369 strict roots and 741 manifest entries. The historical strict-root omission
and exclusions are not relabeled as newly accepted gates. New coverage comprises
120 content-parser, 36 selector, 40 generated-style and 52 formatting/layout/
raster/range/caret cases. Native fixtures establish actual pixels, not only
selector acceptance or removed diagnostics.

An unchanged-byte TestPages HTML/stylesheet replay reduces applicable selector
failures from 169 to 43, creates 31 generated boxes plus 31 text nodes, and
restores universal mixed-list `box-sizing: border-box` on the body and table.
Its full-page geometry remains unsupported; positioned/floated pseudo content,
uncaptured fonts and other page limitations remain explicit. No new HTTP request,
credential operation, SafeJS execution, real TTY or challenge solve occurs in
that replay. See `WEBSITE-TEST-INVENTORY-SEPTEMBER-13-EIGHTEENTH-UPDATE.md` for
receipts and the separate primary-source capture/reader failures.
