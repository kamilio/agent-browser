# Solid background shorthand

This historical checkpoint is extended by the native single-layer URL profile
in `CSS-BACKGROUND-IMAGES.md`. Its original paths, measurements and SafeJS
evidence below remain unchanged; they do not validate the newer image profile.

The September 3 checkpoint supports `background: red`, `background: none`,
`background: currentcolor`, and a color with an optional `none` image before or
after it. Accepted color functions use the shared bounded RGBA8 parser. The
shorthand expands to eight components, rather than aliasing `background-color`.
No dependency, rendering engine, service, or default SafeJS runtime changes.

## Contract

- A supported shorthand resets image, position, size, repeat, attachment, origin
  and clip to `none`, `0% 0%`, `auto`, `repeat`, `scroll`, `padding-box`, and
  `border-box`, respectively. An omitted color resets to transparent.
- `initial`, `inherit`, `unset` and the engine's author-cascade `revert` expand
  across all eight components. Foreground color is not reset by `background`.
- Stylesheet and inline parsers share expansion and color validation. Importance,
  source order and specificity apply independently to the resulting longhands.
  Existing `all` expansion includes the seven newly recognized components.
- Inline `.background`, camel-case component aliases, property methods, indexing,
  priorities and removal operate on these real expanded declarations. Serialization
  compacts complete compatible components with uniform priority; it does not
  compact across `all` or hide partial/mixed-priority declarations.
- Live readonly computed styles now expose 31 sorted longhands, plus the existing
  margin/padding shorthands and a background shorthand getter. Background getters
  empty on detachment, resume on reattachment, and revoke on owner close.
- The seven non-color longhands accept only their initial values and the listed
  CSS-wide keywords (`background-size: auto auto` also normalizes to `auto`).
  Every accepted value therefore resolves to the same neutral component state;
  the renderer needs no additional per-element paint state or cache.

## Explicit boundaries

This is a solid-background profile, not full CSS backgrounds. Image URLs,
gradients, multiple layers, general position/size/repeat clauses, alternate clips
or origins, attachment modes, and `revert-layer` remain unsupported. Authored
unsupported declarations retain stylesheet diagnostics and prevent native layout
or capture acceptance. Unsupported inline CSSOM setters are ignored without
partial mutation, matching the existing declaration bridge's restricted profile.

Computed shorthand serialization includes all neutral components. It is an
inspection representation, not a promise that the restricted shorthand parser
accepts every possible CSS serialization. Named/functional colors use this
engine's RGBA8 normalization, not full browser CSSOM serialization equivalence.
Existing screen-layout, font, canvas propagation and currentcolor behavior remain
as documented in `CSS-PAINT.md`; no new image loading or network request occurs.

## Evidence

- `reports/background-focused-2026-09-03.json`: 2,276 passing tests across 102
  explicit safe files, including 30 new background cases. Package compilation,
  strict checks of changed tests, lint and formatting pass.

- `src/css-background.test.ts` covers expansion, reset, importance, ordering,
  CSS-wide keywords, malformed/unsupported values, live owned CSSOM, serialization,
  detachment, native pixels and exact PDF equivalence with background-color.
- `reports/background-safejs-2026-09-03.json`: 13 passing assertions through the
  actual production page bindings and existing experimental SafeJS core. Guest
  changes alter native PNG and PDF bytes; restoring the color restores identical
  files. Readonly/neutral-component/cleanup checks pass.
- `reports/background-safejs-repeat-2026-09-03.json` repeats all 13 assertions
  after formatting/final compilation; `background-computed-regression-2026-09-03.json`
  passes all 13 existing actual-core computed-style assertions with the updated
  31-longhand interface. No live network or socket probe was added.
- The in-memory fixture's blue-state PNG is 109 bytes, SHA-256
  `b451e639ff1a0c7294042581c4be8832b3b396839ba017c0c59023fa15128c4a`;
  its PDF is 1,428 bytes, SHA-256
  `6abbee231a178f655e5033403431fdf55702e214918733e254c66e4d8e598683`.
  These are generated and measured in memory, not saved artifact paths.
- The original `character-data-safejs-2026-09-03.json` failed before assertions
  because it used `background:red`, which was unsupported at that checkpoint.
  That historical report remains unchanged. This implementation addresses that
  specific CSS gap; it does not retroactively turn the old run into a pass.

Reproduce after building:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/existing/experimental/safe-js \
  node packages/browser-agent/dist/scripts/check-background.js
```

These are in-memory/native checks, not new real-website, Worker, released-SDK,
full Kitesurf, or Playwright-superset acceptance. The larger goal remains active.

Specification reference: https://www.w3.org/TR/css-backgrounds-3/#the-background
