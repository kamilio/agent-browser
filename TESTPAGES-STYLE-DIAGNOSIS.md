# Native TestPages stylesheet diagnosis

After the thirteenth September 13 inventory, another sealed native replay narrows
the remaining style failures. It is not a new website visit. The same public
158,955-byte response is loaded without resource callbacks; no HTTP occurs.

Execution: September 13, 2026, 09:34:44.415–09:34:44.625 UTC, exit zero.
Runtime: audited 18,149, `native-reader-anchors-september13-round00/`.
Source: the unchanged `native-testpages-table-september13/response-2.body`,
SHA256 `67a13131a7e17cca96ebc7f6e80bbcd21917675d4b99768030e980e3a6c39f16`.

One native load retains 3,153 nodes. Three selectors inspect 13 link elements,
one embedded stylesheet and one inline-style attribute, using 45,849 query-work
units. The browser's own CSS parser processes 442 source code units; diagnostic
excerpts retain only 63 units. No raw-body search or alternate parser is used.

## Resource requirement

Native link `e72` is the single active stylesheet link. Its observed attributes
are `crossorigin="anonymous"` and
`integrity="sha256-tumzdaO9iXFGfYmo7g6S/x+c+qWqbO4sM/Jdivgvsw0="`.
Its href is
`/scss/main.min.b6e9b375a3bd8971467d89a8ee0e92ff1f9cfaa5aa6cee2c33f25d8af82fb30d.css`.

The offline loader context deliberately supplies no resource-fetch callbacks.
Consequently this link produces the policy-callback and unloaded-stylesheet
diagnostics. This is not evidence that the browser lacks all SRI/CORS support:
the native session already provides `fetchStylesheetWithPolicy`, and the loader
requires that callback rather than bypassing the resource policy. An actual
resource-backed native session or explicitly captured resource replay remains
needed. This diagnosis neither fetches the CSS nor verifies its integrity.

## Actual CSS gap

Embedded stylesheet `e2997` has 358 code units and three rules; the native parser
reports no issues. The two invalid/unsupported-value diagnostics instead come
from native `div` `e2598`, whose inline style contains:

```css
border-bottom: dashed thin green;
border-top: dashed thin green;
```

Current native border parsing/layout supports `none`, `hidden` and `solid` only;
`thin` is already normalized to one pixel. Supporting these authored borders
requires deliberate dashed-border parsing, geometry and rendering work—not
dropping the declarations, substituting solid borders or suppressing diagnostics.
Collapsed-table border conflict rules and unsupported styles also need to stay
explicit when extending the supported profile.

## Evidence and next action

Lane: `node_modules/.cache/native-validation/native-testpages-style-diagnosis-september13/`.
Ledger SHA256: `4adf0975f9da443a629ba0de6437e32606bf4090073d7f3f7263a8e3bf5ab011`.
Runtime pins match before/after; owners close to zero nodes, guard/process attempts
are zero, the process group is absent, and private HOME/TMP is removed empty.
Zero stylesheet requests, geometry calls, actions, raster, credential/device,
SafeJS, TTY or challenge operations occur. Inspection success is not rendering
success, and the earlier failed geometry evidence remains unchanged.

Next: implement and test the missing border style through the native pipeline,
then separately validate real stylesheet loading with existing policy checks.
Broader research and website coverage remain open in TASKS.md.
