# Image-aware native source headings

`headingInlinePolicy: "balanced-source-elements-v2"` adds one explicit capability
to native source-heading discovery and source-section extraction: an `img` start
inside a heading is treated as a void source element. It addresses the concrete
SWE-bench heading-image refusal documented in WEBSITE-COMPATIBILITY-SEPTEMBER-11.md.

## Contract

- Defaults and `balanced-source-elements-v1` retain their previous behavior,
  including rejecting images within headings. There is no automatic fallback.
- Under v2, normal, self-closing and ASCII-case-normalized image starts contribute
  no title text, separator or stack frame. `A<img>B` has lexical title `AB`.
- Every image attribute is ignored, including alt, src, event handlers and ARIA.
  This is not an accessible-name calculation or a rendered-heading claim. An
  image-only heading has an empty lexical title. No image is fetched or executed.
- Image end tags remain unsupported. Other void/raw/special element exclusions,
  malformed surrounding balance and earlier tokenizer refusals remain in force.
- Reports retain lexical-not-dom semantics, partial true and null contentSuccess.
  The selected v2 policy adds `image-elements-and-alt-omitted` to the existing
  headingInlineLimitations tuple. The policy is preserved through section
  selection and section reports; source identity and anchors are still checked.
- No source, window, work, operation, issue, depth, extent, title, section, output
  or deadline budget increases. Image markup still consumes source/window/work
  budgets even though attributes and image contents are not title text. Report
  disclosures count toward the existing encoded-output limit.

Select v2 explicitly in `discoverResearchSourceHeadings` options and carry the
same `headingInlinePolicy` into `extractResearchSourceSection` selection's
`headingPolicies`. Other required section policies remain as in SOURCE-SECTIONS.md.
The strict own-data option/selection validation remains unchanged: no coercion,
proxies, getters, unknown fields or unknown policy versions.

This does not change the DOM reader, admit failed captures to JSON replay, solve
the separate SWE-bench reader.text limit, or add a website/CAPTCHA workaround.

## Validation

At 05:11:30.133–05:11:42.181 UTC on September 11, 2026, production build, strict
types for two test roots, three-file lint and 1,312/1,312 explicit native tests
pass. All 984 isolated source inputs remain unchanged. The source-heading file
has 1,084 cases and source-section has 228: 79 and 11 new cases respectively.

The committed 794583a baseline independently passes all 1,222 cases in these
files. All 1,221 identically named retained cases still pass. One previous
unknown-policy fixture moves from v2 to v3 because v2 is now explicitly supported;
new tests separately preserve default/v1 rejection behavior and hostile admission.

Coverage includes nested formatting, image-only titles, whitespace/clipping,
ignored attribute getters, exact source anchors, immutable reports, accounting,
cursor cleanup, malformed closes, unchanged exclusions, bounded output and
section projection/boundaries/identity. Only the two files from native-tests.json
run here; this is not a full repository or live website acceptance result.

Evidence: `node_modules/.cache/native-validation/native-heading-image-policy-september11/`
and `node_modules/.cache/native-validation/native-heading-image-baseline-september11/`.
No network, credentials, SafeJS or real TTY/PTY probes are part of those tests.
