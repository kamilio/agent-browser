# Website evidence — September 13, 2026, ninth update

This supplements the eighth update without replacing earlier evidence. There
are **no new HTTP requests** in this update. The fresh Selenium GET belongs to
the eighth update. This update adds a fresh offline Wikipedia follow-up and a
separate native reading of previously captured button-layout source.

## Wikipedia diagnostic follow-up

At07:54:37.252–07:54:37.547UTC, one native offline load uses the same119573-byte
portal body, SHA256
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
Runtime: audited17962/baseeb09296, not root dist or a remote browser.

Two queries, one formatting inspection and one geometry request execute.
Formatting now completes and the search input has a formatting node under its
fieldset outer/content pair. DOM nodes2708/revision2712 remain unchanged. The
logo image e51 and rich button e522 are deferred; the rich children are not
flattened, painted or assigned invented rectangles.

| Observation | Historical17863 tree | Fresh17962 tree |
| --- | ---: | ---: |
| Visited DOM nodes | 2083 | 2110 |
| Formatting boxes | 2207 | 2234 |
| Formatting text code units | 4959 | 4997 |
| Counted work | 16492 | 16670 |
| Deferred subtrees | 2 | 2 |
| Search-input formatting node | absent | present |

The fieldset leaves the deferred list and a rich button enters it. Traversing
the newly reachable content exposes additional issues: overflow4→7, positioning
coordination13→16, inline vertical alignment28→31 and HTML direction21→22.
Other issue counts remain the same. These counts are not performance benchmarks
or a claim that the entire issue set shrank.

Whole-page geometry still rejects the unsupported profile. The new process
exits0 because the bounded diagnostic expectations pass; **geometrySupported is
false**. No pointer, raster, form submission or complete site rendering succeeds
in this lane. There are zero scripts/resources/actions and no DOM/CSS rewriting.

The intermediate17945 replay remains failed at its original path: rich-button
description throws before formatting completes, geometryCalls0, exit1. Neither
that failure nor the historical17863 tree is rerun or relabelled in this update.

Evidence: `node_modules/.cache/native-validation/native-wikipedia-rich-control-september13/`.
`RESULT.json` links the historical records by path/hash; runtime pins match
before/after, native owners close, process group is absent, guards record zero
attempts and private HOME/TMP is removed empty. `EVIDENCE.sha256`:
`8eadff6c5553bcfa4aa3fcab520d97053aed31632e221184887cd7878557fb7f`.

## Native correction and tests

Unrepresentable rich HTML buttons return undefined from software-control
description, allowing existing explicit formatting deferral. Resource errors
and plain controls are unchanged. This is not rich-button layout implementation.

The new17-case suite first produces11 pass/6 fail on unchanged production.
Expanded focused335/0/0 covers10 suites and10 strict roots. A related existing
test now asserts deferred/unflattened content while retaining every geometry,
layout, raster and hit-test failure. Its initial broad failure remains in
round00; no exclusion is added to avoid it.

Clean broad round01 passes17962/0/2 unchanged exclusions across348 suites and347
strict roots. The726-entry manifest leaves378 unrun. Build/strict/format/source
integrity pass;1254 unchanged tracked inputs,1258 source and2088 compiled files
are audited. The historical snapshot strict-only omission remains. Root dist
and unrelated pre-existing work are not bundled into this change.

Audit: `node_modules/.cache/native-validation/native-rich-control-deferral-september13-round01/AUDIT.json`.
Source inventory SHA256:
`291e82492a8e41f0552fe101b4046113b9d183e2f3d2a9dc472fdd1a7f04e934`.
Compiled inventory SHA256:
`cb63c9bc561d0bb0f2b3a34fe722af3bb882954810c297f793033db185a2fc1d`.

## Button source research

One sealed native reader load at07:39:38UTC inspects the retained WHATWG body
from the earlier05:51 rendering-chapter GET; no additional source download.
Two native queries retain3332 excerpt code units from actual button-layout and
form-control sections. Parsed nodes9604; conservative visited-node bound39119;
charged work1283414 including151899 selector work. No selected excerpt is dropped
for budget. These are bounded reader observations, not instruction-level cost.

The source specifies display-sensitive independent formatting and fit-content
auto inline sizing. UA declarations include border-box and content/text center.
It does not prescribe the fieldset anonymous-content/padding-transfer model for
buttons; native primitive appearance remains underdefined in those excerpts.
Implementation interpretations are labelled separately from source text.

This investigation uses audited17945 source/compiled pins. One native tree and
query owner close, process exits0 and its group is absent, private directories
are removed empty, and29 artifact hashes verify. No geometry, scripts, SafeJS,
credentials, devices, TTY, external browser or forbidden payload read occurs.

Evidence: `node_modules/.cache/native-validation/native-button-source-september13/RESULT.md`,
`IMPLEMENTER-NOTE.md`, `EXCERPTS.json` and `EVIDENCE.sha256` in the same directory.
Manifest SHA256:
`d9a6d9f270ae005ab4c9b23f281892c324e6f43372b1a06110fb6813909ae9ba`.

The full rich-button feature, complete fieldset/legend support, original hardware/
benchmark/Astra/Poe research, credential/passkey devices, SafeJS, real TTY and
human challenge handoff remain open. No automated CAPTCHA solving is added.
