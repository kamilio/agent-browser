# Native word-break compatibility

September 14, 2026 increment based on `8c9634b`. The captured Hacker News
stylesheet uses `.title a { word-break: break-word }`; the previous diagnostic
identified one unsupported declaration matching 61 elements. This increment
implements the property rather than filtering that diagnostic.

## Supported behavior

`word-break` is an independent inherited longhand, initially `normal`. The
bounded accepted modes are `normal` and `break-word`, plus the existing supported
CSS-wide keywords. It does not alias or rewrite `overflow-wrap` or `word-wrap`.
The normal registration path supplies stylesheet/inline parsing, cascade,
variables, `all`, native supports queries, computed enumeration and live CSSOM.

`break-word` enables the existing grapheme-aware emergency wrapping path when
white-space permits wrapping. For ordinary tokens its opportunities reduce min-content
width even when the separately computed `overflow-wrap` is `normal` or
`break-word`. Maximum-content measurement stays unbroken. Ordinary word and
discretionary-hyphen opportunities retain priority; `nowrap` and `pre` continue
to prohibit emergency wrapping. The existing transformed-source boundaries,
UTF-16 offsets, Range rectangles and token/line/work caps remain shared.

The production change is limited to registration/default/value parsing in
`src/css-text.ts` and one additional emergency-wrap condition in
`src/text-layout.ts`. No replacement layout engine, runtime dependency,
diagnostic suppression or HN-specific selector branch is introduced.

## Regression evidence

Three explicit native suites add 84 cases: 34 layout/intrinsic/geometry cases,
46 style/CSSOM cases, and four synthetic session/raster/mouse/navigation cases.
The synthetic interaction tests compare native pixels with independently built
fixed-line references and follow discovered links through in-memory transport;
they do not establish a real Hacker News flow or execute the SafeJS runtime.

The unchanged production baseline with all final new tests produces 10 passes
and 74 failures. Registration alone produces eight passes and 26 failures in
the 34-case layout suite: parsing support alone does not repair wrapping or
minimum-content sizes. Full implementation passes all 84 new cases, and the
16-file focused selection passes 599 cases. Production build, strict selected
test types and scoped formatting pass for those successful runs.

The final 485-file native selection passes **23,935 cases, zero failures and
two unchanged exclusions**. Its 484-root strict check, production build and
scoped formatter pass. The clean explicit manifest contains 837 files; this
profile is not a claim that every manifest entry or external gate ran.
The 23,853 prior case occurrences, including both exclusions, retain their
identities and statuses; 84 passing cases are added without name migrations.
All unowned files match the base Git tree; 2,949 source and 2,200 compiled files
are inventoried. The separate failing characterization below remains open.

The full profile runs **16:09:16.417–16:15:43.045 UTC**, with native execution
16:09:36.324–16:15:42.793 UTC. The final audit is at 16:16:04.311 UTC.
Evidence is under `/dev/shm/agent-browser-word-break-september14/`, with the
final gate at `release00/` and a verified durable copy planned under
`node_modules/.cache/native-validation/word-break-september14/`.
`native.stdout` SHA-256 is
`2fe72a97a16c3559923c6187228afc0175eb90eb8f96b16ed39cf8e3a759f9a0`.
`AUDIT.json` records source/compiled hashes and the separate known failure.

The original `registered00` and `green00` attempts stopped at formatting,
before native tests; their records are retained as setup failures, not
browser/test observations. Existing source/capture history is not rewritten.

## Known failing characterization

Independent static review identified a shared soft-hyphen intrinsic-sizing
defect. Two additional isolated characterization runs each produce 35 passes
and two failures. With `ab\u00adcd`, manual hyphens and 6px glyph advance, both
`word-break:break-word;overflow-wrap:normal` and
`word-break:normal;overflow-wrap:anywhere` report an 18px minimum instead of
6px, despite fitting the used layout as four 6px lines. Both maximum widths
remain 24px. The `overflow-wrap:break-word` control correctly retains an 18px
minimum. The more explicit `review01` assertions preserve the measured numeric
mismatch rather than relying only on the review's source trace.

This defect is in the shared, unchanged discretionary-prefix/min-content path;
it is not fixed by registering the new longhand. Its failing reproductions are
retained outside the adopted 84-case suite, not counted as passes or hidden by
changing assertions to the incorrect minimum. Combining emergency wrapping
with manual soft-hyphen intrinsic measurement remains explicitly incomplete
and is the next focused layout correction. The review also records conditional
test-teardown robustness and additional mixed-inline/Unicode coverage gaps;
no ordinary fixture leak was established.

## Limits and next checks

`break-all`, `keep-all`, `auto-phrase`, `manual`, `revert-layer` and other
unsupported values remain rejected; this is not complete CSS Text, language
segmentation, complex shaping or CJK line-breaking conformance. Existing
overflow-wrap/grapheme limitations are not expanded into a broader claim.

HN still has independent layered-background, presentation-hint, image and
table-cell-overflow blockers. A captured recheck must run separately against
the committed, verified runtime before claiming any measured site improvement.
Native success does not satisfy live-network, socket, real TTY/PTY, SafeJS,
credentials/provider, passkey-device, challenge or rendering-acceptance gates.
The overall browser, research and performance goals remain open. No push.
