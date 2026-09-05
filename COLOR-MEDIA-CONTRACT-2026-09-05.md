# Native color-media contract evidence — September 5, 2026

## Outcome and chronology

The repaired native reader now admits bounded definitions from the previously
captured Media Queries document. This is **offline partial source research**,
not a new live request, actual display measurement or implemented CSS support.
The original source URL is `https://drafts.csswg.org/mediaqueries-5/`, linked
from the earlier CSSOM capture. Its body remains **709,021 decoded bytes**,
SHA-256 `13710d9352b367231363ef2445541cbf17a443f7e7af2f0707949f95a523546c`.

| Phase, all on September 5 UTC | Actual outcome |
| --- | --- |
| Original live receipt, 06:57:25.980 | One HTTP 200 response; old reader depth failure; zero scopes |
| Parent replay, 07:11:46.518 | Fixed reader loads 14,240 nodes; one heading scope, 596 serialized bytes; no new request |
| Worker discovery, 07:13:57.812–07:13:57.991 | Loader succeeds; broad discovery hits its own 22,000-byte metadata guard before extraction; zero additional scopes |
| Direct targeted extraction, 07:17:34.518–07:17:34.721 | Thirty already located native scopes admitted; no discovery rerun, raised guard, transport or request |

`COLOR-MEDIA-RESEARCH-2026-09-05.md` and the original live artifacts remain
unchanged. The discovery failure is also preserved: it is a harness selection
failure, not a website/reader failure or exhaustion of the authorized aggregate.
The direct extraction uses only its recorded candidate roots and checks native
heading text, sibling ownership, tag and text counts against that discovery.
No source IDs are assumed to survive the reader, and no raw-HTML parser is used.

## Admitted definitions

Every root below is in
`node_modules/.cache/native-validation/color-media-targeted/extracted.md` and
its structured `extract.json`, with retained native hrefs and original URL.

| Subject | Native roots | Meaning admitted by these scopes |
| --- | --- | --- |
| Document status | e201 | Working Draft, subject to change and not W3C endorsement. The referenced August 18, 2025 Process date is not this specification's publication date. |
| Range versus discrete | e2474, e2480 | Range values are ordered; comparisons and min/max prefixes are supported forms for range features. |
| Boolean context | e2540 | Zero-valued numeric/dimension features, `none`, and explicitly false values do not make a Boolean feature true. |
| Range context | e2654, e2673, e2689 | Single comparisons test their relationship; chained forms require both relationships. |
| Negative range | e2705, e2708 | Negative values must parse for features defined as false in that range. Equality or an upper bound below zero is false; lower-bound comparisons can be true. Invalid syntax and known-false values are different. |
| `color` | e5525, e5558, e5564 | Integer range feature: bits per color component, zero for a non-color device, false in the negative range. |
| Component precision | e5588, e5591, e5598 | Unequal component depths use the minimum, including indexed-color component precision; total storage bits are not the feature value. |
| Color examples and limits | e5572, e5580, e5601 | Boolean/min-color and at-least-eight-component-bit examples; color depth alone is a superficial capability description. |
| `color-index` | e5622, e5655, e5661 | Integer range feature counting color-table entries; zero without a lookup table; false in the negative range. |
| `monochrome` | e5695, e5728, e5734, e5742 | Integer range feature counting bits per pixel in a monochrome framebuffer; zero for a non-monochrome device; false in the negative range. |
| `color-gamut` | e5776, e5813, e5824, e6032, e6043 | Discrete approximate UA/output-device gamut capability. Values may overlap; it is not a simple count of storage bits. |

The `<integer>` definitions link to
`https://www.w3.org/TR/css-values-4/#integer-value`. These scopes establish that
type reference but do not themselves supply its complete literal/math syntax,
rounding or implementation-range rules. Any separate retrieval needs its own
provenance; no such request belongs to this extraction phase. No publication
date, latest-release check or complete Media Queries/CSS Values conformance is
established. The Working Draft and partial-reader qualifications remain material.

### Separate linked integer read

A separately authorized native request to `https://www.w3.org/TR/css-values-4/`
returned HTTP 200 at **07:20:48.906 UTC**, with no redirects or retries. Original
decoded bytes were archived at **07:20:48.907 UTC**: **823,488 decoded / 130,112
encoded bytes**, SHA-256
`7b6b68c34d00d7f6945e66e4e2efa913266299f597d5825393cae85dac1cc78c`.
The source title is “CSS Values and Units Module Level 4”. Native scope **e3942**
defines literal integers as decimal digits with an optional immediately preceding
sign. **e3963** states nearest-integer half ties round toward positive infinity.
Heading e3929 and introductory e3939 complete this four-scope selection.

The lane extracts **3,177 bytes**; its complete envelope is **5,386 bytes**, within
its separate 24,000-byte allowance. Native revision stays **17,854**, with
**17,855 nodes** and closed query/tree/transport ownership. The literal grammar
does not establish computed-math acceptance, integer overflow/clamping limits or
full CSS numeric conformance; those remain gaps. Evidence is under
`node_modules/.cache/native-validation/css-integer-research/`, including original
body/receipt, retained native hrefs and finalized ledgers covering **18 artifacts,
1,596 fixed-build inputs and two inherited files**. This new source request does
not retry either earlier failure or constitute device/runtime acceptance.

## Native implementation implications and gaps

The current native raster validates RGBA channels as integers 0–255 and stores
four bytes per pixel (`src/raster.ts`). Its PNG encoder writes an eight-bit
truecolor-plus-alpha header (`src/png.ts`). Those are software artifact facts,
not proof of an attached display's component depth or gamut.

A future numeric media implementation must explicitly choose and document its
logical native rendering policy and share consistent values with Screen where
appropriate. **Do not derive media color8 from Screen depth24 alone.** Alpha is
not display color depth; an RGB buffer does not establish sRGB/P3/Rec.2020 output
gamut. Current color/color-index/monochrome/gamut media support remains absent
pending implementation and tests. The separate static review in
`node_modules/.cache/native-validation/color-policy-review/REPORT.md` finds an
explicit logical RGB policy of 8 component bits, zero palette entries and zero
monochrome bits defensible as partial software behavior, not normative physical
or no-output-device conformance. It preserves Screen's fallback meaning and
requires integer/negative-range tests before implementation acceptance.

The previously captured CSSOM Screen fallback remains valid independent evidence.
Actual output-device, guest/WebIDL, identity-wire and denied RP/runtime gates are
not reopened by source research. No hardware fingerprint or challenge acceptance
is claimed. The overall browser goal remains active in `TASKS.md`.

## Integrity, budgets and ownership

The fixed native build is
`node_modules/.cache/native-validation/reader-table-integrated.O7zvlp/dist`,
whose repaired loader SHA-256 is
`cda8f2419aab50d999eb6ec7309b3b0c01fb1b952b583ecdddf04cb6f123205d`.
The reader fix is committed as `1d9551c`; source acquisition still used the older
build and remains a failed live attempt. The direct extractor verifies all
**1,596 fixed-build inputs and eight inherited artifacts** before native imports.

Thirty new scopes contain **27,903 serialized extraction bytes**. The complete
targeted report is **30,707 bytes**; adding the prior **23,130-byte discovery
failure envelope** and **596-byte heading** gives **54,433 native-derived bytes**,
below the unchanged 64,000 phase allowance. There are **31 extracted scopes /
28,499 extraction bytes** across successful phases, not 32 successful scopes.
Each new scope stays below 32,000 bytes. Reader/DOM limits remain unchanged.

Revision is **14,239 before and after** targeted extraction. The tree closes
with zero collectors/notifications. This measured equality applies to the
targeted run; the failed discovery never recorded its post-selection revision.
`color-media-targeted/PLAN.md`, `extract.mjs`, `extract.json`, `extract.log`,
`extracted.md` and `AUDIT.json` preserve the new lane. The readable Markdown is
a derivative view of the same scopes, not another independent source set.

The worker's discovery report/audit existed at shutdown, but its final
`SHA256SUMS` file did not. Parent records that incomplete handoff explicitly and
separately hashes the inherited files; it does not claim the missing ledger was
verified or modify the earlier failure. Artifact checks do not run a browser,
make requests or constitute project tests. No dependency or production behavior
changes belong to this documentation checkpoint.
