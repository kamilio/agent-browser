# Website test inventory — September 13, twenty-fourth update

**New W3C content coverage and a verified generated-positioning fix. Overall
browser and research acceptance remain OPEN.** This update continues
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-THIRD-UPDATE.md; it does not replace
historical website captures, failure reports or the earlier inventory chain.

## Website checks in this increment

| Website/page | Operation | Observed result | Not established |
| --- | --- | --- | --- |
| W3C CSS centering examples, https://www.w3.org/Style/Examples/007/center.en.html | One new native GET, then one retained-source semantic-reader load | HTTP200; 484 reader nodes, 10 headings, 43 links, 11 preformatted examples | CSS examples executing, visual centering, resources/scripts |
| TestPages HTML Tag Table, https://testpages.eviltester.com/pages/basics/html-tag-table/ | Retained HTML+CSS diagnosis and independent before/after native formatting replay | 26 absolute generated labels now carry actual positioning metadata at both widths | Full-page geometry/raster or interactive-site acceptance |

Only the W3C check makes a new website request in this increment. TestPages
reuses the unmodified September13 HTML/CSS captures; it is not another live
site success. No linked pages or external fonts were fetched.

## W3C reader evidence

Received 2026-09-13T13:56:35.716Z: 20483 decoded /6199 encoded bytes;
SHA256 4e36b55cab8cf0781ae46278aafbf58ae36339dfcebe767ac7fd0f0a2ca93a69.
One actual GET, no redirects/retries/subresources, empty fresh cookie jar,
credentials omitted; no challenge/rate-limit signal and no bypass.

Default long-v1 reader succeeds. Three native queries use13406query-work units;
1701label-walk units produce24complete labels/1621text units. These are bounded
operation counters, not whole-browser speed benchmarks. Native source examples
are retained as text; they do not demonstrate corresponding layout support.
Conditional full-DOM fallback was not run because the reader did not fail.

This check imports the previous audited datetime runtime (19476pass/3fail/2skips),
not the new positioning runtime. Full detail and exact isolation/pins are in
W3C-CENTERING-NATIVE-CHECK-SEPTEMBER-13.md. Its50-entry repository-relative
DIGESTS.sha256 ledger is df60599f9931425ae5f5f69a1b50725d114faec7e06889c81dc6323bc8dc01f5.

## Shared native functionality

- Supported before/after boxes now use existing native relative, absolute and
  fixed coordinators, including physical insets, hypothetical static position,
  containing boxes, stacking and viewport-stable fixed painting.
- Out-of-flow display blockification preserves the hypothetical static display;
  float computes to none and clearance is inapplicable only for those boxes.
- Generated paint targets its actual originating DOM element even when that
  origin has display:contents. No synthetic DOM references or editable pseudo
  text ranges are introduced. Existing origin pointer-event filters remain.
- Unsupported sticky/generated flex/Grid/table layouts, relative flex/Grid
  generated items, positioned Grid containing boxes, inline containing boxes,
  overflow/clipping/decorations and coordinator limits remain explicit.

Contract: GENERATED-CONTENT-POSITIONING.md. No new runtime dependency, website
HTML/CSS rewrite, browser impersonation, fingerprint spoofing or CAPTCHA solver.

## Validation results

| Gate | Actual result |
| --- | --- |
| Corrected unchanged baseline, 11suites | 424pass/49fail; all49failures in the67new cases,18new controls pass |
| Fixed focused run, 11suites | **473pass/0fail/0skips**, including all67new cases |
| Expanded selected native run | **19589pass/THREE unchanged failures/TWO unchanged skips** |
| Selection | 381suites/380strict roots/747manifest entries;366entries not selected |
| Build, strict compilation, formatter | Pass; stable source inputs |

Selection adds67new generated-position cases and46previously unselected existing
pointer-event cases. Full run 2026-09-13T14:11:23.693Z to
2026-09-13T14:15:55.505Z. Native command exits1, not0. The separate audit accepts
only the exact previously recorded failures; it does not make the suite green:
two research-section h2::before rejection expectations and the table-source
negative string assertion matching a globally preserved id. Existing
focus-provisioning and media-fallback skips remain; no new skips/exclusions.

Original failed attempts remain under generated-position-work-september13/:
baseline00 (332pass/47fail), fixed00 (376pass/3fail) and fixed01
(379pass/2fail). Fixed00 exposed two document-versus-viewport test assumptions
and a Grid-containing-box fixture outside the existing contract. Correcting
those did not broaden unsupported Grid support. Fixed01 then proved the actual
boxless-origin hit-target bug, fixed at ownership resolution. Fixed02 preparation
rejected a nonexistent test path before any snapshot/build/probe; its subsequent
missing-runner error is retained. Baseline01/fixed03 are the corrected final pair.
PRESERVED-ATTEMPTS.md documents these outcomes without overwriting old results.

Runtime: native-generated-position-september13-round00/snapshot01/dist.
Base: 59e614469765f6e93e624637c9ce2788dc477694.
Source inventory: a4d0029f602923fa5a13a4e13bdf59b8fd6430adeae06d08f09ed47e9a8d9469.
Compiled inventory: d406e52942320f146b7844fdb6544ba44b7ab3c1691a7309e11db6e2c25bab3d.
Native result: fbaab8b12e816489820ac2e1ab648cd6c97087f7d57885d2abb7a3cc02ad7be4.
Summary: 8ad247be7bc862f7dd74d58e86eb608d2e562a36286d67e090b457e9741554bd.
AUDIT.json and RECEIPTS.sha256 bind exact source/compiled files and outcomes.
Inventories cover1288source/config and2124compiled files;1282tracked inputs
match the base unchanged. Root dist is not rebuilt. All cache paths are relative to
node_modules/.cache/native-validation/ unless otherwise specified.

## Exact retained TestPages proof

HTML158955bytes, captured08:35:48.354UTC September13,
SHA256 67a13131a7e17cca96ebc7f6e80bbcd21917675d4b99768030e980e3a6c39f16.
CSS367810bytes, captured10:03:29.553UTC September13,
SHA256 b6e9b375a3bd8971467d89a8ee0e92ff1f9cfaa5aa6cee2c33f25d8af82fb30d.
Both remain unchanged, using the same native resource policy/SRI path. The
uncaptured Google Fonts resource stays explicitly denied.

Each before/after phase has one native document load, one cached CSS read,
three queries and two style/formatting inspections (800x720 and1280x720).
3153DOM nodes;62generated formatting nodes/31boxes per viewport. No HTTP,
scripts, actions, geometry or raster calls. Heading e2923 remains34px/40px.

| All26label pseudo boxes, each viewport | Before | After |
| --- | --- | --- |
| Computed display | inline-block | block |
| Formatting position | absent | absolute |
| Hypothetical static display | absent | inline-block |
| Independent formatting context | present as inline-block | present as out-of-flow block |
| Generated-position unsupported flags | 26 | 0 |
| Total positioning-coordination markers | 1 | 27 |

Origin references, pseudo names, generated characters/digests, left1.6px and
auto other insets/dimensions match exactly. CSS diagnostics and all other
formatting issues match;10/9deferred subtrees,2generated float issues, overflow,
inline alignment and unsupported CSS still block complete rendering. Removing
position flags is not full-page layout acceptance. Actual geometry/glyphs/pixels
are verified by independent native fixtures, not claimed for this entire page.
Formatting work remains190363/194614 at800/1280; visited DOM nodes, box and
text counts also remain unchanged. This is not a whole-browser speed claim.

All phases exit0, with full pinned before/after inventories, closed DOM/query
owners, empty removed private directories, absent process groups and no guard
attempts.30seconds plus5seconds grace,10MiB output caps, paired kernel/JS offline
denials; no socket self-probe. Source revision only changes for the two deliberate
viewport updates. Evidence: native-testpages-generated-diagnosis-september13/
and native-testpages-generated-position-september13/, RESULT.json/EVIDENCE.sha256.
Proof ledger: bd3984c858136712cf10cee3b21f623801d295660b76af2623a4c2c12941a523.

## Still open

Full-page rendering, modern CSS/script/resource compatibility, reproducible
whole-browser performance and broad crawler/challenge acceptance remain open.
The original hardware/benchmark/Astra/Poe research is not completed by these
checks. Independent SafeJS, TTY/PTY/socket, device, credential and passkey gates
remain separate. No credential or profile access; no push. Pre-existing dirty
work and all historical evidence remain preserved.
