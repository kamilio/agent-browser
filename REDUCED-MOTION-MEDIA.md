# Native reduced-motion media queries

The native media evaluator recognizes `prefers-reduced-motion` as a discrete
preference feature. Stylesheets and native page `matchMedia` bindings use the
same evaluator. The initial native UA profile deliberately reports
`no-preference`; this is not a measurement of the user's operating system.

| Query | Fixed native result |
| --- | --- |
| `(prefers-reduced-motion: no-preference)` | true |
| `(prefers-reduced-motion: reduce)` | false |
| `(prefers-reduced-motion)` | false |
| `not (prefers-reduced-motion)` | true |

`src/native-motion-preference.ts` contains the frozen profile and explicitly
records that system integration and site overrides are absent. No environment
variable, account preference, browser profile or device setting is read. There
is currently no preference-changing API. Viewport changes do not change this
fixed preference or emit motion-query change events on their own.

The feature participates in the existing bounded media parser's comments,
case normalization, comma alternatives, negation and Boolean combinations.
Only `reduce` and `no-preference` are accepted values. Unknown values, `min-` and
`max-` variants, and range comparisons retain the existing unsupported fallback;
this change does not broaden the media grammar or erase unrelated diagnostics.
`hover`, `pointer`, other preferences and actual animation support are not added.

This is preference reporting, not an animation-capability assertion. The lack
of an animation engine does not imply that a user requested reduced motion.
Conversely, recognizing a site's motion query does not implement transitions,
keyframes or the other declarations inside it. Those retain their own support
checks and can still prevent full-page geometry or rendering.

## Source and tests

The implementation follows a bounded native semantic extraction from the exact
Media Queries Level 5 response originally received September 5, 2026, at
06:57:25.980 UTC. This is retained-source research, not a latest-publication
claim or a new network request. Source URL:
`https://drafts.csswg.org/mediaqueries-5/`.

Seven admitted native scopes establish the discrete values, preference intent,
the meaning of no known preference, and the explicit Boolean-false treatment
of `no-preference`. The fixed-UA choice is an implementation policy derived
from these definitions. The bounded extraction does not independently admit
the full grammar rules for rejecting range/min/max forms; those conservative
fallbacks are covered by native regression tests, not claimed as full grammar
conformance.

Evidence: `node_modules/.cache/native-validation/native-motion-source-september13/`.
Source-body SHA256: `13710d9352b367231363ef2445541cbf17a443f7e7af2f0707949f95a523546c`.
Evidence-ledger SHA256: `b6188a903a42258154ac556a5400a25b1ea19832a1327f038b057679c4d50db4`.

`src/reduced-motion-media.test.ts` covers the fixed profile, Boolean and value
semantics, responsive combinations, malformed/discrete-range fallback, valid
comma alternatives, unchanged preference across viewport sizes, and actual
stylesheet color selection. `src/page-media.test.ts` adds native binding parity
and unchanged-query notification behavior. These host-backed tests are not
evidence of a real SafeJS page-runtime run or a live website rendering pass.
