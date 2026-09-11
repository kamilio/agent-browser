# Ordered-list implementation references — September 11, 2026

These are main-agent documentation lookups, not native-browser website tests.
They add no hostname to the native website coverage inventory.

## HTML list numbering

`https://html.spec.whatwg.org/multipage/grouping-content.html#the-li-element`
and the same page's ol section define the non-CSS ordinal model. Ownership uses
the nearest ancestral ol/ul/menu, or the parent otherwise, then the closest
inclusive ancestor producing a CSS box. Rendered list items are processed in
tree order per owner. An ol uses its parsed start value, otherwise one or the
number of owned li elements when reversed. A valid li value overrides the current
number; the next item advances or decrements according to the owner's direction.
Other owners begin at one. HTML ol type distinguishes the numeric, alphabetic
and Roman states; numeric rendering does not imply support for all those states.

## Integer parsing

`https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#rules-for-parsing-integers`
specifies leading ASCII whitespace, optional sign, then an ASCII digit sequence.
Missing digits fail; the first subsequent nondigit terminates conversion. The
native implementation separately bounds input length and exact integer precision.
Those resource bounds are not claimed as limits imposed by HTML.

## Numeric representation

`https://drafts.csswg.org/css-counter-styles-3/#decimal` defines decimal symbols
and the normal negative sign and period/space suffix. Decimal-leading-zero adds
minimum two-digit padding. This does not implement arbitrary CSS counters or
alphabetic/Roman representations. The native renderer uses its existing Agent
Mono glyph metrics and raster limits, not downloaded fonts or another browser.

## Scope of the implementation

The formatting traversal supplies actual rendered list items and box producers;
hidden/non-list-item entries are not blindly counted as DOM li elements. Markerless
rendered items still participate. Numbered markers are generated formatting data,
not DOM text mutations. Unsupported counter styles and CSS counter declarations
remain visible limitations, and layout/actionability guards are not removed.
