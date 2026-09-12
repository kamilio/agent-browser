# Native font-size keywords

The native text parser accepts all eight absolute font-size keywords and the
parent-relative `larger` and `smaller` keywords. This closes an unsupported-value
case present in captured GnuPG and Lua styles; it does not by itself make either
website navigable.

## Native sizing policy

| Keyword | Computed size |
| --- | --- |
| `xx-small` | 9.6px |
| `x-small` | 12px |
| `small` | 128/9px, serialized with native numeric precision |
| `medium` | 16px, unchanged |
| `large` | 19.2px |
| `x-large` | 24px |
| `xx-large` | 32px |
| `xxx-large` | 48px |

Absolute keywords become canonical pixel declarations. Relative keywords remain
specified until computed-style resolution: `larger` multiplies the computed
parent size by 1.2 and `smaller` divides it by 1.2. Zero and fractional sizes are
preserved. Inherited computed values are not scaled again. Existing CSS-wide
keywords, root/rem resolution, custom properties and frozen identity reuse retain
their existing behavior. Stylesheet/inline CSS canonicalization owns casing;
the direct helper's input contract is not broadened.

These constants are an explicit native policy, not verified CSS Fonts 4
conformance or parity with another browser's font-selection heuristics. A
reference lookup did not return inspectable specification text and is not
conformance evidence. The native monospace font profile remains unchanged.
Font-family/style/shorthand restrictions, malformed values, layout work limits,
the 16,777,216px layout-length ceiling and the 512px bitmap-font ceiling remain
independent guards; relative keywords do not raise or clamp those limits.

## Isolated validation

One unchanged synthetic fixture using `font-size:x-large` fails on the preceding
clean release, then passes with actual computed pixels, geometry, raster and hit
ownership. Three new suites add 57 cases. The focused clean-snapshot selection
passes 477 cases with no failures. Tests cover absolute and relative sizes,
nested inheritance, CSS-wide values, root/rem line heights, invalid inputs,
resource limits, custom properties, media/supports applicability, mutation,
float/inline-block sizing and mocked native control activation/cleanup.

The explicit-manifest release selection passes **12,094 cases, zero failures,
and two unchanged exclusions** across 227 selected suites. Production build,
226 strict test roots and formatting checks pass. The clean manifest contains
621 entries; this is not a claim that every manifest suite was selected.

Native gate UTC: September 12, 2026, 06:21:48.691–06:24:19.927. Evidence is in
`node_modules/.cache/native-validation/native-font-size-september12-round01`:
`AUDIT.json`, `RECEIPTS.sha256`, source/compiled ledgers and immutable command
outputs. The audit verifies 1,117 source files, 1,944 compiled files and 1,111
unchanged tracked inputs. Runs use pinned Node22.22.0, private HOME/TMP and
kernel socket denial. Pre-existing uncommitted changes are excluded and retained.

The exclusions remain the separate total-host-object pressure case and the
pre-existing real unsupported-display/media case. No live site, real SafeJS,
credential/provider, passkey-device, TTY or challenge acceptance follows from
these isolated tests. Current GnuPG and IANA observations used the earlier
12,037-case release, not this implementation. Non-floating clearance and
float/flex/grid/table coordination remain outstanding independent site blockers.
