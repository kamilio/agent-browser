# CSS visibility and viewport subset

Later checkpoint: `MEDIA-RANGES.md` adds bounded compiled media comparisons,
chained bounds, grouped Boolean conditions, aspect ratios and native resolution.
Page queries share this evaluator and reuse their compiled predicates.

Later checkpoint: `MEDIA-QUERIES.md` connects the shared media evaluator to live
page queries and responsive event delivery, and adds orientation and initial-font
em/rem dimension tests. Full Media Queries Level 4 conformance remains unproven.

Later checkpoint: `BACKGROUNDS.md` supports solid-color/none background shorthand
with eight-component resets and shared inline/computed CSSOM. It remains a partial
profile: image layers and non-default non-color components are not implemented.

Later checkpoint: `COMPUTED-STYLES.md` connects the current cascade and supported
normal-flow layout to readonly live page-JavaScript computed declarations. The
historical visibility-only checkpoint below is not the current layout/API ceiling.

Later checkpoint: `TEXT-LAYOUT.md` adds five inherited typography properties,
matching inline writes and a separate bounded block-relative line stage. Global
and target style inspection now report the implemented text subset separately.

Later September 2 checkpoint: `CSS-BOX.md` adds a separately reported author
cascade for dimensions, margin/padding and box-sizing, with supported unit
computation. The visibility model below remains in use; complete page layout,
client geometry and document painting remain unimplemented.

Checkpoint: September 1, 2026. The independent TypeScript engine now uses a
bounded author-style cascade for `display` and `visibility`. This improves what
agents read and which elements they can act on; it is **not a CSS layout engine**,
complete computed style, pixel rendering or full Playwright actionability.
The visibility cascade does not execute website JavaScript or use an external
browser. The later `INLINE-STYLES.md` bridge lets independently executed page
scripts mutate actual inline declarations; it adds no dependency.

## Agent API

With the foreground service already running:

```bash
node packages/browser-agent/dist/src/cli.js -s=demo open https://books.toscrape.com/
node packages/browser-agent/dist/src/cli.js -s=demo styles
node packages/browser-agent/dist/src/cli.js -s=demo styles 'ol.row > li:first-child img.thumbnail'
node packages/browser-agent/dist/src/cli.js -s=demo resize 390 844
node packages/browser-agent/dist/src/cli.js -s=demo snapshot
```

`styles` is an agent extension returning bounded diagnostics, source/work counts,
viewport, loaded external-sheet count and `partial: true`, `layout: false`.
`styles <ref-or-selector>` returns the unique connected target's computed
`display`, `visibility`, `displayed` and `visible`. These are visibility-subset
values, not a hit-test result or guarantee that a real browser can click there.
Unsupported selectors and ambiguous targets fail rather than selecting arbitrarily.

`resize width height` sets the selected tab's logical CSS viewport; each dimension
must be an integer from 1 through 16,384. Defaults are 1280×720. The value survives
navigation/reload, and tabs have independent viewports. Resize affects supported
media rules, not a physical window, screenshot size or `window.resize` event.
The existing playground command input can issue the same commands to its shared
session. Its text view uses the same filtered snapshots; no new visual renderer
is claimed by this checkpoint.

The SDK exposes `documentStyles(tree)`, `DocumentStyles`, `StyleLimits` and
`VisibilityStyle`. Pages expose `page.styles`; navigation results expose `styles`
diagnostics. `DocumentQueries.matchingSpecificities` returns the greatest matching
selector-list branch specificity under an explicit work budget.

## Implemented behavior

- Embedded `<style>`, inline `style`, and eligible external `<link rel=stylesheet>`
  participate in document order. Importance, inline priority, selector specificity
  and source order determine winners. Inheritance and the supported properties'
  `initial`, `inherit`, `unset`, `revert` and `all` behavior are implemented.
- Existing supported selectors drive matching. `:where()` contributes zero,
  `:is()`/`:not()`/`:has()` use their most specific argument, and supported
  `:nth-child(... of ...)` includes its selector specificity. The parser-inserted
  relative `:has()` scope does not incorrectly count as an author pseudo-class.
- `display:none` excludes a whole subtree from semantic snapshots and direct
  actions. `visibility:hidden`/`collapse` suppress the node, while a descendant
  explicitly using `visibility:visible` can appear. Focus/tab traversal skip
  CSS-hidden controls. Label-forwarded activation can still toggle a hidden
  associated control without incorrectly focusing it.
- Embedded styles, attributes, checked/focus state, external-sheet registration
  and viewport changes invalidate the cascade. Plain text-control value edits can
  retain cached styles because the supported selectors do not depend on that
  value. This is not a complete browser style-invalidation system.
- `@media` and sheet `media` attributes support screen/all/print, comma-separated
  alternatives, `not`/`only` and `and` with width/height/min/max features in pixels
  (or unitless zero). Unsupported/invalid queries do not match, including when
  negated, and produce diagnostics. This is not full Media Queries support.

## Resource and security boundary

`loadBrowserDocument` is now asynchronous. A session supplies its scoped
`DocumentLoaderContext.fetchStylesheet` callback; standalone callers may omit it
and receive an explicit fetch-unavailable diagnostic. Parsing and text-only
loading remain available without networking.

The session allows at most eight stylesheet retrieval attempts per navigation.
Requests use the owned transport, cancellation signal, redirect/address/TLS
policy and cookie jar. Cookies use subresource rather than top-level-navigation
context. HTTPS documents cannot request HTTP sheets; downgrade redirects also
remain forbidden by the transport. Base-relative sheet URLs work. No ambient
host filesystem, private-origin exemption, caller request body or arbitrary
headers are granted to stylesheets.

External responses must be successful and have one explicit `text/css` MIME
type. Decoding uses HTTP/BOM information, with document encoding as fallback;
the CSS `@charset` byte-sniff algorithm is not implemented. Missing/empty hrefs,
alternate/disabled sheets and unsupported types do not trigger retrieval.
Sheets with integrity or crossorigin attributes are skipped with a diagnostic:
we do not pretend to enforce SRI or the CSS CORS mode. CSS `@import`, font/image
URLs, scripts, iframe documents and other resource types are not fetched.

Transport/MIME/resource-loading failures normally leave usable HTML with partial
CSS diagnostics; cancellation aborts the candidate. Exhausting the retrieval
budget stops remaining links. CSS parsing/cascade budget failures reject the
candidate before replacing the committed document. The previous page survives.

Default per-document style limits:

| Limit | Default |
| --- | ---: |
| Combined active CSS source, UTF-16 code units | 524,288 |
| Parsed rules | 8,192 |
| Parsed declaration statements | 16,384 |
| Cascade/query work units | 5,000,000 |
| Registered external sheets in the SDK | 32 |
| Automatic retrieval attempts per navigation | 8 |
| CSS component nesting | 32 |
| Nested rule parsing depth | 16 |

The rule ceiling admits bounded utility stylesheets larger than 4,096 rules.
Rules in nested or unsupported groups still consume the parser budget; this is
not filtering or partial stylesheet application. Source, declaration and cascade
work ceilings remain independent and unchanged. Captured-site measurements and
native boundary/control regressions are recorded in `CSS-RULE-CAPACITY.md`.

External source storage has its own aggregate bound. Queries receive the remaining
aggregate cascade work budget, not a fresh unlimited budget per rule. Unsupported
declarations are counted/reported without doing irrelevant selector matching.
Diagnostics are codes/counters, not retained page CSS, credentials or response
headers. Documents release their registered sheets and caches when closed.

## Deliberate gaps

Only the two properties participate. There are no dimensions, positions, boxes,
overflow/clipping, fonts, colors, generated content, flex/grid/table layout,
hit testing, stacking, painting, transitions or animations. A known `display`
keyword can be retained without implementing its layout algorithm. `collapse`
has a conservative visibility treatment, not table-specific layout semantics.

Custom properties/`var()`, cascade layers, `@supports`, scoped/container rules,
imports, full CSS token/escape/error recovery and arbitrary media conditions are
not implemented. Unsupported selectors/properties/values/at-rules have explicit
counters; zero counters still do not imply conformance. A bounded inline
declaration CSSOM is now available (`INLINE-STYLES.md`), including custom token
storage without var() resolution. There is still no stylesheet/rule CSSOM or
website `getComputedStyle` binding. Changing a registered link URL requires
reloading rather than silently refetching. Complete sheet loading events, CSP,
referrer behavior and browser resource scheduling remain pending.

Existing HTML `hidden`/`inert` and accessibility exclusions are conservative and
can still exclude an element despite an author CSS override. Focus events on
style-driven disappearance are not a complete native lifecycle. This profile
must not be described as full computed accessibility or complete actionability.
Website JavaScript remains disabled, and the Kitesurf/Playwright superset is
still an active goal rather than an achieved compatibility claim.

## Verified evidence

- `reports/unit-node-2026-09-01-css.json`: 820 passing tests in 41 files. New tests
  cover cascade/specificity, media and viewport, real local HTTP CSS redirects and
  cookies, MIME rejection, private-origin denial, mixed-content denial, eight
  request limits, cancellation, CLI dispatch and committed-page preservation.
- `reports/css-core-bun-2026-09-01.json`: 243 portable HTML/CSS/selector/snapshot/
  keyboard/focus checks pass. This does not enable Bun networking; the historical
  negative TLS result remains applicable and retained.
- `reports/css-cli-sites-2026-09-01.json`: 19 actual separate-process public CLI
  assertions pass. Books to Scrape loads three stylesheets (227,815 source code
  units; 2,433 rules; 3,916 declaration statements; 1,859,545 work units). Its first
  thumbnail computes to `display:block`, proving more than a stylesheet download.
  The report also retains 3,735 unsupported-property, 10 unsupported-at-rule and
  23 unsupported/invalid-selector diagnostics. It is not a screenshot comparison
  or broad CSS-conformance result.
- The initial full-suite run recorded 813 passes and one error-message regression.
  `reports/unit-node-2026-09-01-css-initial.json` preserves that failure. Restoring
  HTML action checks before CSS checks fixes the existing error contract without
  weakening assertions; the final suite also includes six later tests, including
  CSS media modifier whitespace cases.
- `reports/css-html-form-node-2026-09-01.json`: a post-CSS regression probe parses
  the actual public httpbingo form, types/fills/checks and submits with Enter. All
  seven synthetic echoed fields match; no controls are fabricated, attributes
  rewritten, validation bypassed or website scripts executed.

## Primary references

- https://www.w3.org/TR/css-cascade-5/#cascading
- https://www.w3.org/TR/selectors-4/#specificity-rules
- https://www.w3.org/TR/css-display-3/#visibility

These standards informed original implementation and bounded fixture tests.
No standards test suite pass or complete standards implementation is claimed.
