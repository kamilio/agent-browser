# Content retrieval and native clicks

The complete100-entry validation checklist is
`reports/agent-citation-revalidation-v2.md`, with machine-readable JSON/CSV beside
it. It covers citation-derived host entry pages, not measured worldwide agent
page visits. Every entry has an outcome and a content review; only33 were judged
useful source content in that original run. Keep failures and historical dates.

## Reader content is not full-page interaction

Use the semantic reader for bounded public-source content extraction. Opt-in
`main-content-v2` can avoid treating a lone promotional article as the whole
homepage. See `CONSERVATIVE-CONTENT-FOCUS.md`. Nonempty output, a title or HTTP200
alone is not proof of useful content, complete articles, current facts or access.

Reader DOM and full source DOM are different interaction environments. The
reader removes layout material and does not retain all original anchor
attributes. Native click success on its reconstructed DOM must not be described
as successful physical activation on the original full page. Earlier native
link activation evidence used that reader DOM; its recorded results remain
valid within that scope and are not rewritten.

The September16 full-source follow-up uses inert native HTML parsing, unchanged
source attributes and default CSS/geometry checks. It finds:

- Home Depot stops at the CSS source limit during initial navigation.
- Wikipedia identifies the featured-article anchor, but clicking stops on
  unsupported formatting, including unloaded external stylesheets.
- CNET identifies the audited article anchor, but clicking stops at the SVG
  clip-reference node limit.

These are offline captured-source fixtures, not fresh website failures. Each
stops before a click event or second fixture response. See
`reports/native-content-clicks-2026-09-16.md` for exact evidence and limitations.

## Do not turn failure into an invisible fallback

Do not force clicks, remove visibility/style attributes, silently relax budgets,
or substitute direct destination navigation and call it click success. A
separately labeled, source-linked navigation workflow is content retrieval,
not evidence that scrolling, hit testing or the original page interaction works.
Stop at authentication/access barriers; do not treat scripts, embedded payloads,
metadata or diagnostic prefixes as admitted complete destination content.

Outstanding work includes bounded SVG reference-index efficiency, configurable
and explicitly admitted style budgets, supported full-page layout, external-style
coverage and distinct semantic navigation. Preserve the current failures while
testing fixes; do not claim fresh live recovery from an offline replay.
