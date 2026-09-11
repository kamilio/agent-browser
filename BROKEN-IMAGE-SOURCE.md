# Native HTML broken-image source — September 11, 2026

## Source-stated rendering expectations

The native browser retrieved the primary WHATWG HTML rendering chapter and
extracted observed §§15.4.2 and 15.4.3. The extracted language says **expected**;
this report does not promote it to an unconditional quoted MUST requirement.
The following are source rules, not a newly implemented fallback policy.

§15.4.2 selects the **first applicable** case:

1. An element representing an image is replaced and follows CSS image rendering.
2. Without a represented image, retain replaced rendering if an image is expected
   to become available, if `alt` is missing, or if quirks mode applies and natural
   dimensions already exist, including the source's dimension-attribute/CSS examples.
   Its content is represented text, if any, with an optional loading indication.
3. A stable `img` representing text is non-replaced phrasing content, optionally
   with a missing-image icon.
4. A stable `img` representing nothing remains replaced with zero natural
   dimensions. The source qualifies invisibility with absence of further styles.

§15.4.3 maps the image's dimension-attribute-source width/height to CSS width,
height and aspect-ratio hints. Specified dimensions alone are not an unconditional
switch to replaced fallback; §15.4.2 explicitly names the quirks condition. Zero
natural dimensions also do not imply that authored used dimensions must be zero.

## Proposed bounded native policy — not source-confirmed implementation

- Preserve loaded-image rendering and distinguish final broken/unsupported state
  from an image still expected to become available. Do not label a final decode
  failure as a pending download merely because both lack decoded pixels.
- Keep attribute **presence** distinct from value: missing `alt` has an explicit
  replaced branch. As an initial bounded policy, a present nonempty alternative
  can supply text and a present empty alternative can supply no content, but only
  after the earlier loaded/loading/missing-alt/quirks branches are considered.
- For a stable text alternative, coordinate non-replaced phrasing text rather
  than allocating a loaded-image surrogate; do not silently turn all failures
  into a fixed 300×150 box or a mandatory icon. Missing-image icons are optional
  in the extracted source, not an implemented requirement here.
- For a stable no-content alternative, keep the replaced classification and
  zero intrinsic dimensions separate from the existing CSS/hint used-size
  pipeline. Do not drop the element solely because its intrinsic size is zero.
- Keep undecided loading/current/pending-image or quirks cases explicit until
  their state and sizing contracts have dedicated tests. No code implements this
  proposed policy in this task.

### Remaining source and measurement gaps

These rendering sections refer to what an element *represents*, but do not
contain the full image-element semantic algorithm that maps all source/request
states and nonempty/empty alternatives into text, nothing or an image. The exact
HTML current/pending-image transitions, full dimension-hint parsing/aspect-ratio
mapping algorithm, CSS replaced/non-replaced used sizing and chapter-wide
conformance prelude were not separately extracted. Do not treat the proposed
alt/state classification above as a complete normative mapping or infer another
browser's behavior from it.

`PYTHON-DOCS-FORMATTING.md` records visible images `e283` and `e759` as
broken/unsupported, complete and undecoded after a shared HTTP-200 SVG response;
that is unsupported decoding, not failed fetching. The report does not establish
their alt-presence/value or all dimension/quirks predicates. Consequently this
source run does not prove their exact rendering branch or used geometry. It
neither decodes SVG nor establishes browser equivalence or native conformance.

## Retrieval and exact observed selections

New evidence lane:
`node_modules/.cache/native-validation/native-broken-image-source-september11/`.

The requested/final URL was
`https://html.spec.whatwg.org/multipage/rendering.html`, already referenced in
`IMAGE-LAYOUT.md`. One bodyless, credentials-omitted native GET returned **HTTP
200**, with **366,253 decoded bytes / 54,444 encoded bytes**, no redirects and no
subresource requests. Safe headers, source metadata, body and hashes are retained.

Live child UTC: **15:58:20.567–15:58:20.910**, exit zero, process group absent.
Reader result: partial `extracted-unverified`, barrier `null`, **48 observed
headings**, outline not truncated; `contentSuccess: null`, not rendered success.

Offline child UTC: **15:58:48.099–15:58:48.514**, exit zero, process group absent.
Exactly two observed-section extractions succeeded, selecting one heading each:

| Receipt | Observed heading / selector | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `section-1.jsonl` | `e4263`, §15.4.2 Images; `html:root:nth-child(1) > body:nth-child(2) > h4:nth-child(173)` | 19,224 | `41bd476f04c9e595a69025f0c3363b1fe08571b8c01c093899232108d29108fe` |
| `section-2.jsonl` | `e4493`, §15.4.3 Attributes for embedded content and images; `html:root:nth-child(1) > body:nth-child(2) > h4:nth-child(186)` | 29,456 | `6056248bd76e3d69c8d98b08753ef2db8c50331577721d47418619b1aad21a74` |

Body SHA-256:
`d7b02615f70194b29caf5daaac20432cf2c540806636146539036a4c52d4173e`.
Live-receipt SHA-256:
`882ab70b4b3a94231652f0c854351097cf632d39c2faaf297aadcb5acf8c6121`.

## Build, limits and cleanup

The authorized immutable **8339-pass / zero-failure / one-exclusion** build is
`native-session-request-queue-september11-round02/snapshot01`, independently
checked without rebuilding: **137 manifest-listed selected files / 136 strict
roots**, **1018 source / 1816 compiled files**. Its four committed source pins
match the prior Python diagnosis. The historical test count is not a new test run.

- Source inventory SHA-256:
  `2576328a126835f4089729df176108358d997ade8ebf93e3545fed6da874e0f8`.
- Compiled inventory SHA-256:
  `a546339fe83ce9cf8d8c649e77a783cd20cbfaa167357e58ecf72da9595deeb4`.

The original `long-v1` admission, separate omitted-raw policy, 4,000,000-byte
response/capture ceiling, source/text/token/document caps, 15-second transport
timeout, 20-second navigation timeout, 30+5-second child timeout and 6 MiB
output/file caps remain unchanged. The native request wrapper restricts the
underlying admission to exactly the one authorized GET. No retries, raw-HTML
fallback, alternate HTTP/browser, page scripts, SafeJS or credentials were used.

Live transport: one actual request, zero mocked requests, zero redirects, closed
with zero active requests. Offline: two extractions, zero navigation/wire requests
or guard/process attempts; each document closed to zero nodes. Both private
home/tmp pairs were empty and removed; both process groups are absent, with no
timeout or cap breach. `VERIFICATION.json` checks original limits, capture/body
pins, source/build inventories, prior receipts and this report's hash.

Only this new report and private lane changed. Production, tests, TASKS,
manifests, prior evidence and commits were untouched. The immutable build was
reused in place, not duplicated.
