# Python CSS nesting replay — September 13, 2026

**The native nesting fix removes one applicable CSS value error. The actual
Tutorial click still fails.** This is a same-capture comparison, not a fresh
Python website visit or a complete rendering pass.

## Exact scope

One native BrowserSession navigation loads `https://docs.python.org/3/` through
the existing transport's fixture routes. All eight captured resource bodies and
their metadata are identical to the earlier complete-asset replay: seven from
September 11 and the missing `basic.css` from September 13. The source report is
`PYTHON-GENERATED-CLEAR-REPLAY-SEPTEMBER-13.md`; the exact original
receipt lane is `native-python-complete-assets-september13-after/` under
`node_modules/.cache/native-validation/`.

The new phase has eight accepted fixture requests, 72,064 decoded bytes and
**zero wire requests**, redirects, retries or destination fallbacks. It uses one
actual discovered `Tutorial` link, native reference `e375`, pointing to
`https://docs.python.org/3/tutorial/index.html`, and calls Session.click once.
That action fails before any destination request. No manual direct navigation
is counted as a successful click.

The parsed document remains 853 nodes / revision 860, title
`3.14.7 Documentation`. This is the captured document's title, not a claim about
the latest Python release. No stylesheet or source bytes are rewritten.

## Observed before and after

| Native observation | Earlier runtime | Nesting runtime |
| --- | ---: | ---: |
| Applicable unsupported CSS properties | 9 | 9 |
| Applicable invalid/unsupported CSS values | 3 | 2 |
| All parsed property diagnostics, including nonapplicable rules | 54 | 57 |
| All parsed value diagnostics, including nonapplicable rules | 9 | 7 |
| Charged CSS rules | 579 | 584 |
| Charged CSS declarations | 1,071 | 1,075 |
| Cascade work units | 93,131 | 93,132 |
| Visited DOM nodes / formatting boxes | 576 / 669 | 576 / 669 |
| Formatting text units / work | 4,074 / 8,294 | 4,074 / 8,294 |
| Deferred subtrees | 9 | 9 |
| Actual Tutorial click | Fails | Fails |

Raw diagnostics are retained, including the additional property errors exposed
by parsing previously malformed nested content. This is not a global drop in
every error counter or a diagnostic filter. The prior exact attribution identifies
the motivating nested `.good pre`, `.bad pre` and `.maybe pre` block inside
`div.body`; native regression fixtures independently prove those nested border
styles produce correct dimensions and pixels with unchanged outside elements.
The homepage replay itself does not prove those descendant examples are present.

The remaining actual click error lists nine unsupported properties, two
invalid/unsupported values, two inline vertical-alignment issues, one position
issue and one overflow issue. Prior attribution points to hyphenation and its
vendor forms, cursor, border radii, underline offset, justification and the
underline-width shorthand. Raw formatting also retains float 8, display 9 and
clear 3 markers; these coordinator markers are not eight/nine/three independently
proved fatal failures. Generated clear-both blocks remain emitted correctly.

## Execution and integrity

The observation runs `16:23:52.152–16:23:52.414 UTC`, process exit 0,
45,393 combined stream bytes. Exit 0 means the bounded observation completes;
`flowPassed` is **false**, with the original action error preserved.

The final runtime is `native-css-nesting-september13-round02/snapshot01/dist`,
validated by 19,960 native passes / zero failures / two unchanged skips. Exact
runtime/audit pins are in `CSS-NESTING.md` and the lane authorization. Scripts,
SafeJS, alternate browsers, credentials/passkeys, real sockets, TTY/PTY,
fingerprint spoofing and challenge solving are not exercised.

Complete source/compiled, framework and fixture inventories remain unchanged
before/after execution. Query/document/image/session owners close; zero nodes,
pending loads, active/queued requests, cookies or storage entries remain. Empty
private HOME/TMP directories are removed; the process group is absent. Network
and process-denial counters are empty. Single-run timings are not benchmarks.

Lane: `node_modules/.cache/native-validation/native-python-css-nesting-september13/`.
Internal `before` filename prefixes are retained solely to reuse the identical
wrapper; the enclosing lane and runtime identify the new after-fix observation.
The 28 lane-relative payload entries are sealed by `EVIDENCE.sha256`:
`d1253636b31be53558e6cac7b7ae626ad7238168d762e755a8e3d903f6d0ad60`.
`COMPARISON.json` SHA-256:
`495cc72e228bae9dd77415da0aaba71993951a554ebe9fb58ad600480619602a`.

Historical failures, the first full nesting gate and the later review failures
are retained. This advances one website-derived compatibility defect without
claiming that the browser or the Python navigation flow is finished.
