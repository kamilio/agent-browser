# Native width blockers

September 13, 2026. Unsupported page widths now report the blocking formatting
issue codes and counts after the existing advisory/coordinated-display filter.
The error remains AgentBrowserError with code unsupported and retains its old
message prefix. Layout admission, geometry and rasterization semantics do not
change; no placeholder rectangles or CSS rewrites are introduced.

For example, two unsupported sticky-positioned boxes produce:

```text
Document width resolution requires an issue-free supported formatting profile: position-layout-not-supported (2)
```

The diagnostic lists at most eight issue types, truncates each code to96 UTF-16
code units, and reports the number of additional issue types when omitted.
Counts are native formatting diagnostics, not necessarily affected DOM-node
counts. No source text, element attributes or credential values are attached.
Advisory CSS issues and already coordinated display categories are not falsely
listed as blockers; unsupported categories still reject the operation.

## Real website motivation

An independent offline replay of the captured Wikipedia portal fails before
pointer/raster interaction. A separate native formatting inspection finds twelve
raw issue categories. Eight independently block widths; media-query diagnostics
are advisory, and existing positioning/float coordination handles three other
categories. Those coordination markers are not evidence of absent float or
positioning engines.

The portal's search input exists in the DOM but lacks a formatting node because
its fieldset ancestor is deferred. Other independent gaps include rejected CSS,
overflow, vertical alignment, direction and deferred elements. Suppressing a
guard would not provide the missing search-field geometry. This change improves
diagnosis only; a successful native fill/GET-submit flow remains distinct from
pointer actionability and full site rendering.

Evidence: `node_modules/.cache/native-validation/native-wikipedia-pointer-september13/`
preserves the original error; `native-wikipedia-formatting-diagnosis-september13/`
under the same parent records the independent native issue map, computed nodes,
source declarations and unchanged input ancestry. Neither operation fetches
assets/scripts, uses a remote browser, or performs credential/device/TTY work.

## Validation

Four new manifest-native tests cover real blocker counts, geometry propagation,
advisory filtering, coordinated display filtering and bounded diagnostic output.
Focused build, strict checks and formatting pass with291tests/0failures/0exclusions
across seven explicitly selected manifest suites. The runner verifies that all
seven selected suites actually appear in the result.

The initial formatting-only failure remains preserved. A second attempt reports
255 passing cases in six suites, but one intended suite was absent from the
historical snapshot; that is not reported as seven-suite coverage. The corrected
scope uses an existing inline-flex suite and enforces input/result completeness.
No unrelated test or source is modified to obtain the focused pass.

Focused evidence: `node_modules/.cache/native-validation/website-flows-work-september13/diagnostics02/`.
Earlier diagnostics00/01 lanes retain those separate outcomes. The native test
manifest itself is unchanged. Broader validation and captured-page diagnostic
recheck are separate evidence, not live-site rendering acceptance.

The clean broad snapshot subsequently passes17840tests/0failures with the same
two historical exclusions, across344 selected manifest suites and343 strict
roots. The722-entry manifest leaves378 entries outside that broad run. The
excluded total-host-object ceiling and unsupported-display/advisory-media cases
remain open; they are not hidden by the new diagnostic. Build, strict, format,
source immutability and1249 unchanged tracked inputs are audited. The compiled
snapshot has1252 source and2080 compiled files. Root dist was not rebuilt.
Evidence: `node_modules/.cache/native-validation/native-layout-diagnostics-september13-round00/AUDIT.json`.

At05:43:08.723–05:43:09.005UTC, one new socket-sealed native geometry call on
the same captured portal uses that audited17840 snapshot. It still rejects
widths, now naming exactly the eight independently blocking categories and
their counts. Advisory media and coordinated position/float/clear markers are
absent. No rectangle, raster, action, HTTP or rendering success is produced.
The diagnostic check exits0, closes the tree to zero nodes, preserves source/
runtime pins and records no network/process guard attempts. The earlier pointer
failure remains unchanged. Evidence:
`node_modules/.cache/native-validation/native-wikipedia-width-diagnostics-september13/RESULT.json`.
