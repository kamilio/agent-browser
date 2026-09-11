# Native UA color preference

The native browser has an explicit host-controlled color preference. It does not
read the operating system, environment, credential providers or device settings.
Its default is `null`: a known absence of active preference, whose effective
`prefers-color-scheme` value is `light`. This is not an inference from a page's
paint, and does not turn unknown media conditions into false conditions.

## Host API

- `BrowserSessionOptions.colorSchemePreference`: optional `"light"`, `"dark"` or
  `null`; omission selects the native default. Invalid values reject before
  transport creation.
- `session.colorSchemePreference(tabId)`: current raw tab preference.
- `session.setColorSchemePreference(tabId, preference)`: validate and update the
  tab, its displayed document and an initialized loading document. Return the
  raw preference. Each new tab starts from the session default, not another tab.
- `styles.colorSchemePreference` and `styles.setColorSchemePreference(value)`:
  standalone document state. Direct document changes do not rewrite session
  configuration; use the session setter for persistence across navigations.
- `styles.mediaEnvironment`: frozen dimensions and raw preference used by CSS
  and media query lists. `styles.viewport` keeps its dimension-only shape.
- `styles.metrics().colorScheme`: explicit native profile, raw/effective values,
  and `systemIntegration: false`, `siteOverrides: false` limitations.

Preference is installed during document initialization before returning to the
loader, survives navigation/reload/history and resize, and is isolated by tab.
No-op preference updates preserve presentation caches. Changes invalidate style
and layout presentation; light and null can still have identical query results.

## CSS and media observers

Light/dark conditions use the same effective preference for stylesheet
applicability and native `matchMedia()` bindings. Inactive dark-only unsupported
declarations can be excluded from applicable layout diagnostics in light mode;
their raw source diagnostics remain visible. Dark mode does not silently accept
those unsupported declarations. Other unknown media features remain conservative.

The bare `(prefers-color-scheme)` query is true for the native profile's effective
light/dark values. Unknown values, including the legacy `no-preference` keyword,
retain the unknown result through logical operations: negating unknown does not
make it match. See `MEDIA-BOOLEAN-SOURCE.md` for the three offline native source
sections, truth table, grammar boundaries and unverified areas.

`onMediaChange()` observes geometry or preference changes. `onViewportChange()`
still observes geometry only. Both sets share the existing bound of sixteen
listener registrations and are cleared on close. Native media query lists read
current matches immediately and schedule coalesced change delivery only when the
reported match changes. Preference-only changes do not fabricate resize events.

## Boundaries

This is per-tab host emulation of a native UA preference, **not** the draft
origin-scoped `navigator.preferences` permission/override API. Resetting the host
preference to null explicitly selects no active preference; it is not clearing a
website override and discovering an OS preference. No CSS `color-scheme`/used
color-scheme implementation, embedded SVG inheritance, forced-colors mapping,
Client Hint, theme persistence, CLI command or system preference detection is
claimed. Native host-binding tests are not SafeJS runtime acceptance.

Primary preference requirements and research limitations are recorded in
`PREFERRED-COLOR-SCHEME-SOURCE.md`. The original source lane was mode0775 during
research and tightened to0700 before seal; its runtime HOME/TMP were0700. This
permissions exception is preserved rather than recast as a fully private run.

## Validation on September 11, 2026

The clean old production baseline fails a genuine native checkbox click at the
width-profile guard before touching any new preference API. The patched default
profile passes the same click; a dark-only unsupported property still blocks
layout when dark is active. Focused native validation passes914 checks across19
selected suites, with one existing exclusion, including148 new tests.

The isolated release at
`node_modules/.cache/native-validation/native-color-scheme-september11-round01/`
passes build, strict compilation, configured formatting and10715 native checks,
with two unchanged exclusions. It selects182 manifest-listed suites and181 strict
test roots from583 clean manifest entries. The gate runs from22:48:42.919 to
22:50:59.687 UTC with stable1071 source inputs and1912 compiled outputs;1058
tracked inputs are unchanged and three pre-existing dirty source residuals are
excluded and verified intact. This is not a pass of every repository test.

The source research consists of one native W3C navigation/GET and five offline
native sections in two lanes, not tests of a real OS preference or website
override. New live-site acceptance remains separate from these native gates.
