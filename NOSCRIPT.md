# Native noscript fallback and scripting state

The native HTML document's parsing profile determines whether `noscript` is
fallback content or hidden raw text. This change removes the unconditional
deferred-layout guard for HTML `noscript`; it does not enable page scripting or
make a site's other unsupported layout features work.

## Implemented behavior

- Scripting-disabled documents parse and lay out fallback children through the
  ordinary inline, block and `display: contents` paths. Normal author styling,
  visibility, wrapping, painting, geometry, hit testing and activation apply.
- Scripting-enabled documents retain their existing raw-text parsing behavior.
  HTML `noscript` computes to `display: none`, including when an author requests
  another display with `!important`. A foreign-namespace namesake does not gain
  this HTML-specific rule.
- The parser initializes the document's internal scripting flag before its
  initialization or mocked script callbacks. Public `htmlParseInfo` remains
  unavailable until parsing finishes. Closing the document clears both states;
  changing completed metadata's flag invalidates cached presentation.
- HTML replacement uses the destination document's scripting flag for fragment
  parsing. It does not execute inserted scripts or change the standalone
  fragment API's explicit/default scripting option.
- HTML serialization defaults to the current node owner's scripting state.
  Disabled fallback text is escaped instead of becoming new markup on a later
  insertion. Enabled fallback text remains literal. Explicit serialization
  overrides still work; foreign text remains escaped. Template-content owners
  use their own retained/default state rather than their outer document's flag.
- Text and label locators include disabled fallback descendants and exclude
  active HTML `noscript`. Head/script/style exclusions and the existing policy
  of retaining CSS-hidden body text are unchanged. Locator matching is not a
  visibility or actionability guarantee.

## Focused regression evidence

The corrected one-case baseline at clean
`d1805b5eb99c464943f3c938a09ca87896eb6dea` fails on the original unsupported-width
guard. Its fixture has an explicit body and verifies actual fallback parentage,
geometry, native glyph output and hit ownership. The exact same fixture bytes
pass with the implementation.

An earlier baseline fixture omitted the explicit body. Head-noscript parser
recovery moved the supposed fallback out of `noscript`, so that fixture passed
and did not reproduce the bug. It is retained, not counted as a failing baseline.
`noscript-work-september12/INITIAL-BASELINE-NOTE.md` records this correction.

The final focused run, September 12, 2026, **02:51:23.370–02:51:30.351 UTC**,
passes **570 tests across 16 suites**, with no failures or exclusions and stable
source inputs. Three new suites contain **58 tests**:

- `src/noscript-fallback.test.ts`: one unchanged baseline regression.
- `src/noscript.test.ts`: 23 layout, rendering, mutation and activation checks.
- `src/noscript-scripting.test.ts`: 34 scripting-state, fragment insertion,
  serialization, escaping, locator and lifecycle checks.

The preceding focused run passes 569 tests and fails one revised locator test:
its substring query for `script-only` also matches the now-searchable text
`noscript-only`. The final test requests exact matching; production matching
semantics are not changed to conceal the overlap. Both runs are retained.

Private paths are under `node_modules/.cache/native-validation/`:
`noscript-work-september12/baseline02`, `fixed04` and `fixed05`. Native execution
uses private HOME/TMP directories and kernel socket denial. Mock parser hooks
are not a real SafeJS acceptance run.

## Isolated release gate

`native-noscript-september12-round01` runs from **02:51:57.479 to
02:54:22.980 UTC on September 12, 2026**. Build, strict checking of 207 selected
test roots, scoped formatting and 208 selected native suites pass. Results are
**11,599 passing tests, zero failures and two unchanged exclusions**. The clean
explicit manifest contains 602 paths; this does not claim that all 602 suites
were executed. The added 95 passes relative to the preceding gate comprise the
58 new noscript checks and 37 existing text-locator checks newly selected here.

The two existing exclusions remain the total-host-object pressure ceiling and
the media-fallback unsupported-display case. Separate legacy grid failures
outside this established selection remain outstanding; no new exclusion is
added. The gate uses 1,094 immutable source files and 1,928 compiled files, with
1,082 unchanged tracked inputs outside this patch and its manifest additions.
The pre-existing `src/styles.ts` edits are excluded from the candidate and
independently verified as preserved in the working tree.

`AUDIT.json`, `RECEIPTS.sha256`, `compiled.sha256` and `results/SUMMARY.json` in
that private gate retain exact inputs, timings, checks and result hashes.

## Primary-source evidence

`NOSCRIPT-SOURCE.md` records three native public WHATWG document GETs and five
offline native sections. `NOSCRIPT-SERIALIZATION-SOURCE.md` records one additional
offline serialization section from the already captured parsing response, with
zero new HTTP requests. They retain separate scopes, original acquisition times,
raw receipts, parser limitations and complete file/hash inventories.

Parent read-only checks independently reproduce all 16 original source checks
and all five serialization checks, including both lanes' complete ledgers:
123/124 and 42/43 entries respectively. Parent verifier setup failures are kept
in separate work-lane directories; the sealed source lanes remain unchanged.
These are source-acquisition checks, not website rendering acceptance.

## Remaining boundaries

- This is the native boolean scripting profile, not an implementation or
  acceptance test of all four scripting modes in the current HTML specification.
- The forced HTML-noscript display behavior does not add general CSS
  `scripting` media-query support or a complete UA-important cascade engine.
- Template-owner defaults and foreign guards are native behavior tests; the
  separately linked node-scripting definition was not captured in the bounded
  serialization source task.
- Unsupported tables, foreign layout, logical floats, overflow and other
  existing layout guards remain guarded. No unsupported CSS is deleted.
- The prior Man7 live run included a deferred noscript among several independent
  guards. These isolated tests do not establish that its date(1) click now works,
  nor that Debian, OpenBSD, NetBSD or any other site renders successfully.
- No provider secrets, passkey device, real TTY, real page runtime, CAPTCHA
  bypass or fingerprint spoofing is exercised or authorized by these checks.
