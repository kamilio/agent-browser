# Native foreign-content integration

Status: selected isolated validation passes, with the explicit pre-existing
exceptions below. A fresh Wikipedia observation gets past the old SVG rejection
but fails later in CSS selector work. Full website loading and interaction remain
unverified; parser support is not SVG/MathML painting support.

## Implemented behavior

- Store actual SVG/MathML namespaces and case-preserved local names in native
  document nodes. Ordinary HTML creation remains HTML, even for a tag named svg.
- Apply namespace-sensitive foreign insertion, integration points, HTML breakout,
  end handling, name/attribute adjustments, inert scripts and CDATA handling.
- Preserve namespace metadata through fragments, templates, clones, attribute
  records, mutations, equality, script reflection and bounded collections.
- Keep foreign elements with HTML-looking names out of HTML forms, controls,
  validation, activation, focus defaults and document metadata/resource loading.
- Match and serialize existing selector/HTML-serialization features according
  to the actual namespace, without adding unsupported CSS namespace syntax.
- Report foreign layout as unsupported rather than silently painting foreign
  nodes as HTML boxes or widgets. This is not an SVG/MathML painting feature.

The native HTML parser still does not execute foreign scripts. Namespace-aware
DOM storage does not imply support for createElementNS, setAttributeNS, arbitrary
XML documents, SVG geometry/animation, MathML layout, or full SVG hyperlink APIs.
Those features and real SafeJS/device/website validation remain independent work.
Attaching two attributes with the same qualified name but different namespaces
is explicitly rejected before mutation; the current attribute storage cannot
represent both. This limitation does not silently discard an existing attribute.

## Source and validation boundaries

The namespace integration uses the previously pinned native WHATWG parsing
capture and its foreign-content section. Additional bounded native source work
is under `node_modules/.cache/native-validation/native-svg-parser-reference-september11/`.
Source excerpts and synthetic tests are not conformance or live-site proof.

The first combined validation preparation rejects two test paths absent from
`native-tests.json`: interactions.test.ts and html-document-write.test.ts. No
build or test run starts from that setup. The rejected configuration and runner
error remain under
`node_modules/.cache/native-validation/native-foreign-content-september11-initial/`.
Follow-up validation must use only explicitly listed native files and preserve
this failed setup. Unrelated worktree changes, including pre-existing styles
edits, must remain outside the tested/staged feature snapshot.

The separately preserved round02 passes production compilation but stops on an
unchanged pre-existing strict typing error in src/snapshot.test.ts:83. No runtime
tests run in that lane. The follow-up keeps that file in the native runtime
selection but excludes it from the narrower strict-test roots; production and
all feature test files remain typechecked.

Round03 reaches 6202 selected tests: 6189 pass and 13 fail. The preserved failures
identify two remaining stale CDATA expectations, two stale SVG rollback fixtures,
five attribute-collision assertions needing the explicit unsupported boundary,
two foreign hidden-attribute default-style bugs, a foreign keyboard-scroll
fallback and one pre-existing host-object-count assertion.

A separate unmodified HEAD baseline at f5e3405 reproduces the exact host-object
failure (expected 6, observed 8): 23 of its 24 tests pass. Evidence is under
`node_modules/.cache/native-validation/native-foreign-focus-baseline-september11/`.
Round04 explicitly excludes only that test name, not the rest of its file, and
must report the skip rather than claim a wholly passing full native suite.

Round04 passes 6200 tests with that one documented skip and one failure: the new
foreign keyboard test incorrectly forbids ordinary activation cleanup calls
with null. The corrected assertion forbids activation of any element while
allowing cleanup and checking the final inactive state. The failed run remains
unchanged; a separate round05 is required for acceptance.

## Accepted isolated validation

`node_modules/.cache/native-validation/native-foreign-content-september11-round05/`
records September 11, 2026, 08:00:14.102–08:01:46.552 UTC:

- 6201 passing tests, zero failures and one explicitly excluded baseline test,
  across 105 files selected from the 548-entry feature native manifest.
- Production compilation, strict checking of 104 selected test roots, and
  formatting of 62 feature files pass. This is not a lint or full-suite claim.
- The unchanged snapshot.test.ts typing error and baseline host-object assertion
  remain outstanding; neither is silently fixed or reported as passing.
- The 1004 source files are unchanged before/after validation. The feature-only
  styles version and manifest exclude unrelated pre-existing worktree edits.
- Native network guards remain installed. No real website, socket, PTY, SafeJS,
  credential, passkey-device or rendering acceptance follows from this suite.

The 1788 compiled files are pinned under
`node_modules/.cache/native-validation/native-foreign-content-compiled-september11/`.
Their ledger SHA-256 is
`a3b97082d107c961886c6fc58e655304e83e82ac2266e16792d4f4086be7c129`.

## Fresh Wikipedia observation

`node_modules/.cache/native-validation/native-wikipedia-foreign-recovery-september11/`
records a separate native run at 08:02:05.269–08:02:05.545 UTC. One public GET
returns HTTP 200 with 119573 decoded bytes, 28755 gzip-encoded bytes, no redirects,
no classified response-header challenge and no supplied credentials or scripts.
The body hash is identical to the original failed Wikipedia capture:
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.

This run still fails: `Query work limit exceeded`. No search discovery, fill or
submission completes. Its receipt SHA-256 is
`6af58201371b930e9337e390c5461e7b182995888c2410538459a7aaa4c4dcbf`.
Source/compiled pins remain unchanged; the transport closes with zero active
requests. The original SVG-rejection receipt is not rewritten or promoted.

## Offline diagnosis and next work

`node_modules/.cache/native-validation/native-wikipedia-query-diagnostic-september11-followup/`
records a guarded zero-network replay at 08:04:30 UTC. Browser loading reproduces
the CSS matching failure; a separately labeled parser-only replay succeeds with
2708 nodes, 21 actual SVG nodes, one HTML form and 13 HTML inputs. These counts
do not establish browser-level form actionability or painting.

The failing selector is `.overlay-banner-main-message-greeting`, on the 193rd
matching call. Its remaining work budget is 1360 and recorded work reaches 1363.
The structural index builds once for 2708 nodes. Optimize repeated stylesheet
selector candidate matching without raising limits, then validate and run a
separate fresh website check.

The replay serves one captured response and denies six external image-resource
attempts without networking. Its receipt SHA-256 is
`a7bddd1a2dfc0dd2b5de2cc81c8ceddb604e7d7cea15564bde8bda3ed8b99b85`;
parent/source/build pins and cleanup checks pass. The initial diagnostic under
`native-wikipedia-query-diagnostic-september11/` remains failed: it incorrectly
counted all seven transport attempts as served mocks and its final assertion
rejected that count. Do not use those initial mock metrics as successful evidence.
