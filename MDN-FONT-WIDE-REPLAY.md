# Captured MDN font-wide recheck

September 14, 2026. **Native diagnostic completed; interaction remains unproven.**
The browser rechecks the original September 11 MDN querySelector capture on
committed runtime `fefbb8b083e83587b7b45e8ca19e9719c1c8f447`, following genuine
font-wide inheritance and the deferred-shorthand serialization correction.
No captured HTML/CSS body is interpreted outside the native browser.

The native observation runs **07:55:01.554–07:55:01.963 UTC**: all 19 original
resources/270,288 decoded bytes served once, zero wire requests, denials, scripts
or clicks. Scope is one navigation, one default formatting build, one cached
diagnostic read, one hint query and existing bounded attribution. No width
resolution, geometry, rasterization, second page or new assets are attempted.
This is a fresh offline observation, not a new live visit.

## Measured result

Comparison is against `MDN-TEXT-DECORATION-REPLAY.md`; its original evidence is
unchanged. The retained matched `font:inherit` failure is absent after the fix.
The aggregate applicable count falls by two, demonstrating again that the older
bounded sample count was not a complete occurrence inventory.

| Native observation | Previous | Font-wide runtime |
| --- | ---: | ---: |
| Raw unknown-property occurrences | 134 | 132 |
| Applicable unknown-property occurrences | 70 | 68 |
| Raw invalid/unimplemented-value occurrences | 31 | 31 |
| Applicable invalid/unimplemented-value occurrences | 15 | 15 |
| Formatting issue categories | 10 | 10 |
| Overlapping formatting issue occurrences | 212 | 210 |
| Retained diagnostic occurrences | 128 | 128 |
| Omitted instrumented occurrences | 39 | 37 |
| Native cascade work units | 4,206,150 | 4,206,307 |

All other raw/applicable issue counts and all formatting metrics remain
unchanged: 1,954 visited DOM nodes, 2,054 boxes including seven outside markers,
15,270 text units, 83,210 formatting work and 65 deferred subtrees. The diagnostic
read reuses cascade build 1 without changing before/after read metrics. The
157-unit cascade-work increase and elapsed observation are not a normalized
performance, memory or speedup measurement.

Sampling remains `truncated:true`, `exhaustive:false`. No retained `font` rejection
remains, but that is not proof of full font grammar or exhaustive CSS support.
The native implementation explicitly keeps full/system font syntax and unsupported
reset-only features outside its supported subset. Later samples enter the bounded
window, including another matched `padding-block` occurrence; this is not a newly
introduced page failure. Existing wavy-decoration rejection remains intact.

## Verification and outstanding work

Prepared verification and independent parent verification pass. They check final
native/source bindings, original fixtures, counters, bounds, cache identity,
owner cleanup, removed private directories and absent supervisor process group.
Historical evidence is unchanged. The runtime separately passes 22,741 selected
native tests with two unchanged exclusions; its actual inheritance/control/raster/
hit regressions and deliberate limits are recorded in `FONT-WIDE-INHERITANCE.md`.

Lane: `node_modules/.cache/native-validation/mdn-font-wide-preparation-september14/`.
It contains the completed single run despite its preparation-oriented name.

- Result SHA-256: `f2709c329c3b466fd77cda108b6d22031210d04b5b3bf17936f6df155a081ad0`.
- Verifier SHA-256: `65ea5abb7209d9f44e80c3cd8168c6c5bd85afde58b60ae20b6d3f08ad261f0a`.
- 35-entry evidence ledger: `edb2dfbbba7ef1ac5fb45d356201339d178ad9daee5b8aeb36e9879351a5ca82`.
- Parent proof in `font-wide-work-september14/MDN-PARENT-OUTCOME-VERIFICATION.json`
  under the same cache: `a068ba62958564e144abb7df15fbbf31603a69653d5c645ac789d4251914db38`.

Next, broaden current-code diagnostics to the existing Wikipedia portal capture,
then address logical spacing/units and remaining sampled features. Its old logo
asset gap must not be confused with unsupported PNG decoding or silently filled
with a new network request. MDN's querySelectorAll destination remains uncaptured.
Broader live sites/forms, original research, credentials/devices, SafeJS, socket,
real terminal and challenge gates remain open. No interaction or CAPTCHA success
is claimed. The project volume is nearly full; preserve historical evidence and
use separately scoped scratch capacity for future large validation artifacts.
Overall goal active; nothing pushed.
