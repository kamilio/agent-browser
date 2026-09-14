# Captured MDN CSS rejection details

September 14, 2026. **Native diagnostic completed; interaction remains unproven.**
The browser reads its new bounded CSS diagnostic snapshot on the original MDN
capture using committed runtime `ea13cf6600dbd3dd53d6e40d719a8310fa6acaa1`.
No captured HTML/CSS body is interpreted outside the native browser.

The observation runs at **06:54:58.360–06:54:58.763 UTC**: one navigation, one
default formatting build, one cached diagnostics read, one hint query and the
existing bounded attribution. All 19 captured resources/270,288 decoded bytes
are served once. Zero wire requests, denials, scripts or clicks occur. There is
no width resolution, geometry, rasterization or destination navigation.

## What the new API reveals

The snapshot retains **128 occurrences and reports 51 omitted instrumented
occurrences**. `truncated` is true and `exhaustive` is false. Other diagnostic
categories remain outside this initial detail instrumentation.

| Retained sample classification | Occurrences |
| --- | ---: |
| Applicable, matched selector, active media | 53 |
| Unmatched selector, active media | 60 |
| Inactive media, selector not evaluated | 13 |
| Applicable, matched selector, uncertain media | 1 |
| Applicable, unresolved selector, active media | 1 |

These are emitted diagnostic samples, not distinct bugs or proof of visible,
winning declarations. In particular, omitted later applicable rules may still
block layout even if their properties are absent from this table.

Representative **matched/active** samples now identify concrete compatibility
work rather than only generic rejection counts:

| Property or group | Sample count | Example retained values |
| --- | ---: | --- |
| `-webkit-text-decoration` | 5 | `underline`, `none` |
| `font` | 1 | `inherit` |
| `mask-image`, `mask-size`, `mask-repeat`, `mask-position` | 15 | SVG URLs, `contain`, `no-repeat`, `center` |
| `transform` | 2 | `translateY(calc(.5lh - .5em))`, `rotate(90deg)` |
| `letter-spacing` | 2 | `0`, `.025rem` |
| `content` | 1 | generated string with slash-separated alternative text |
| `margin-left` | 1 | `.5ch` |
| `min-height` | 1 | `100svh` |

Other retained matched/active properties include logical padding/margins,
scroll behavior/margins, font feature settings, color scheme, scrollbar gutter,
aspect ratio, background image/position/repeat/size and box shadow. This is not
the complete rejected-property list. Image/mask support may require additional
asset captures; the existing 19-resource fixture does not authorize new fetches.

## Unchanged behavior and verification

The diagnostic read reuses **cascade build 1**. Before/after native metrics are
identical, and the preceding replay's formatting object and count/work metrics
are unchanged: 10 formatting categories/220 overlapping occurrences, 2,054 boxes
including seven outside markers, 15,270 text units and 83,210 formatting work.
The cascade still reports 147 raw unsupported-property and 30 raw invalid/unimplemented-value
occurrences, versus 78 and 15 conservatively applicable occurrences. The new
API exposes failures; it does not suppress them or claim a speedup.

The prepared verifier and independent parent verification pass. They recheck
final native-gate/source bindings, the exact original fixtures, sample bounds,
scope/counters, cached-read identity, owner cleanup, removed private directories
and supervisor process-group absence. Earlier evidence remains unchanged.

Lane: `node_modules/.cache/native-validation/mdn-css-diagnostics-preparation-september14/`.
It now contains the completed single run despite its preparation-oriented name.

- Result SHA-256: `a53b7c68ccbb25083848dfd8f5dd4ddc76a0da03e321931ebacced2aa9caadc8`.
- Verifier SHA-256: `aa18fb46672e4da5d742a3e01cf5cdb619b29587f63b02860be60f4b396688a4`.
- 35-entry evidence ledger: `6c256059619d82678e8c7f35311c2b4798389dd2f9df770bbec86bc5ca5c563b`.
- Parent proof in `css-diagnostic-details-work-september14/MDN-PARENT-OUTCOME-VERIFICATION.json`
  under the same cache: `8771de7429e7aadde4094678e9efd6ce9881b7f66705161fd1e73e184e035c2b`.

The implementation separately passes 22,392 selected native tests with two
unchanged exclusions; see `CSS-DIAGNOSTIC-DETAILS.md`. Next: implement real
compatibility behavior, starting with the sampled prefixed text-decoration and
font-inheritance cases, then recheck native semantics and captured actions.
Do not merely remove guards. MDN destination capture, broader live sites/forms,
original research, credentials/devices, SafeJS, socket, real terminal and
challenge gates remain open. The overall goal stays active. Nothing pushed.
