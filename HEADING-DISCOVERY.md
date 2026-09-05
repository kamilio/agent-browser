# Bounded native heading discovery

The research browser accepts `--headings` to discover native h1–h6 titles and
structural CSS selectors before choosing a `--section`. It avoids requiring a
successful full-document extraction or an offline raw-source locator workaround.
Discovery itself performs no follow-up navigation or automatic retry.

## Interface and workflow

- `--headings` combines with `--reader` and `--capture-body`, but not `--selector`,
  `--lines` or `--section`. Duplicate flags and invalid combinations fail before
  session setup. Existing argument shapes remain unchanged when it is absent.
- `researchNavigation` adds an optional eighth boolean `headings` argument,
  default false. Nonboolean values reject without truthy coercion. Existing seven
  arguments retain their meaning.
- A discovery report uses `selection: { method: "heading-outline" }` and a
  `headings` object instead of `extraction`. The object contains `method`, native
  `document` reference, `revision`, `partial: true`, `entries`, `scannedNodes` and
  `truncated`. Each entry has `ref`, numerical `level`, `title`, `titleTruncated`,
  `selector`, and an explicit unavailable reason when no selector can be supplied.
- Choose an entry, then use its nonnull selector with `--section` and the same
  loader profile. A later navigation is a new retrieval: verify the selected title
  and content, and retain separate receipt times. Structural paths are not stable
  identities across page changes or different parsing profiles. Native references
  belong only to their current document, not a later CLI invocation.
- No-heading results use `empty-extraction`; nonempty outlines remain
  `extracted-unverified`, even when limited. HTTP and semantic barriers retain
  their failure outcomes. `contentSuccess` is never true. A page can contain useful
  non-heading content despite an empty outline.

The core `discoverDocumentHeadings(tree, options)` lives in `src/extraction.ts`.
The lower-level collector receives trusted admission callbacks; public callers
should use the validated core wrapper. No package dependency or page script is added.

## Admission, titles and selectors

Ordinary extraction, section selection and discovery share the existing admission,
visibility and leaf rules. Skipped subtrees and visible image/break/separator leaves
are not descended. Invisible containers can still admit visibility-restored
descendants. ARIA roles are not substituted for native h1–h6, and attributes,
form values and image alternatives are not heading text.

Each active heading receives its admitted visible descendant text in document
order, including nested headings. The collector keeps only a bounded raw UTF-16
prefix, then the wrapper escapes terminal controls, collapses whitespace and trims
the displayed title. `titleTruncated` describes missing source text, not rendered
width, grapheme count or a byte-exact title. Cleanup can shorten or expand that
prefix. Entry-limit termination inside a heading also marks its title incomplete.

Selectors are anchored structural paths from the observed native tree. The first
document element uses `tag:root:nth-child(1)`; later document elements use
`:root ~ tag:nth-child(N)`. Descendants add ` > tag:nth-child(N)` segments.
Element positions include skipped/hidden siblings but not text or comments;
allocation IDs are not document order. Positions are tracked during traversal,
without rescanning sibling arrays for every heading. No page IDs, class names or
other attribute values are echoed into paths. Unsafe/overlong ancestor tags yield
`selector: null, selectorUnavailable: "unsupported-ancestor"`; excessive paths
yield `"selector-limit"`. Paths also obey the native selector parser's 256-component
budget: the anchored root uses three components and each descendant uses two.
Entries are retained rather than assigned guessed paths.

The collector performs one iterative document-order traversal with bounded active
title and ancestor-path state. It does not copy full body text or enumerate later
siblings after the entry boundary. Scan counts are not a measurement of all engine
work: existing style preparation and immutable node-view construction still apply.

## Limits and trust

Core defaults are 50,000 scanned nodes, depth 128, 256 entries, 256 raw title code
units, 4,096 selector code units and 262,144 serialized output bytes. The CLI keeps
its existing 256,000-byte output ceiling. Core options are integer-validated; their
upper bounds are 50,000 nodes, depth 1,024, 256 entries, 1,024 title units, 4,096
selector units and 1,048,576 bytes. Existing full network/reader/document admission
still happens first. No new mode raises those source limits.

`truncated` is set only when another admitted visible heading is encountered after
the entry cap; reaching the cap exactly is not sufficient. Node, depth and final
serialized UTF-8 byte excesses fail with `resource-limit`, rather than pretending
the outline is complete. The byte ceiling includes metadata and JSON escaping.
An outline with many long selectors can still exceed its output budget.

Header and bounded document-prefix classification run before discovery; a bounded
joined-title diagnostic runs afterward. These checks cannot prove absence of a
barrier outside their inspected text. Detected barriers keep stop/handoff behavior.
Optional body capture remains the full original response with its existing privacy
and size limitations. Session/transport cleanup also runs on the outline return path.

Native reader omissions, unsupported hidden-content semantics, partial HTML/CSS
and disabled page scripts remain explicit. An outline is not a full accessibility
tree, rendered HTML outline, source mapping or browser-compatibility guarantee.
It does not clear any actual credential, device, SDK, TTY/socket or denied gate.

## Scoped validation

The clean post-review candidate derives from commit `4f6a1e0`. Its exact twelve
manifest-listed heading/extraction/research suites have **939 passes and three
failures**, with no skipped tests. All **250 new cases pass**: 40 collector,
51 core-wrapper and 159 CLI cases. The three pre-existing selector diagnostic
expectation failures also occur on untouched base4f6a1e0: three selected failures,
115 unselected cases. They are not hidden or repaired in this increment. Build,
strict typing of the three new suites and six-file Biome checks pass.

Independent review found unanchored selector collisions, unaccounted native
selector-component limits and incorrect final3xx HTTP classification. The fixes
add root anchors, syntax accounting, real-query uniqueness/boundary regressions
and 28 non-2xx cases across empty/nonempty outlines and both loader profiles.
Earlier validation had three additional fixture defects; those initial failures,
the original review and the initial candidate remain preserved rather than
overwritten by the corrected results.

Evidence lives under
`node_modules/.cache/native-validation/heading-discovery/`; the initial, final and
baseline candidates are separate sibling directories. This scoped synthetic
matrix is not a whole-manifest pass or proof of live website/browser parity.

## Separate live workflow evidence

Two separately authorized native-browser GETs used the reviewed final build and
the same historical January 30, 2019 CTAP2 source. The heading request received
HTTP200 at **September 5, 2026 22:59:53.320 UTC**, returning 116 entries after
11,352 scanned nodes, without entry truncation. Its structured USB HID entry was
`8.1. USB Human Interface Device (USB HID)` with selector:

```text
html:root:nth-child(1) > body:nth-child(2) > main:nth-child(11) > h3:nth-child(195)
```

A separate section request using that exact selector received HTTP200 at
**September 5, 2026 23:00:34.562 UTC**. It matched one heading and returned
24,455 Markdown bytes (8,074 scanned nodes, 1,321 selected, four context nodes).
Both reports remain partial/extracted-unverified with `contentSuccess: null`;
each records one real request, zero redirects and closed transport/session state.
No captured raw HTML was inspected to discover the selector, no automatic
follow-up or fallback ran, and no page script or device/credential was activated.

Artifacts are under the feature cache's `research/ctap2-headings/` and
`research/ctap2-section/`. `evidence/live-receipts-integrity.json` independently
checks wrapper exits, receipt/body hashes, structured selection and extracted
bytes without making another request. The saved pretty-printed outline is
27,569 bytes. SHA256s, in heading-request then section-request order:

- Receipts: `ffedf2aea9ebddeea8541efafd67a1ae4e627ed8e73b972064e52ed3232d3e9b` and `649be9df2b9be107b16a56df8a975f314b5bdad39e2572768695a260afdf0c9a`.
- Decoded bodies (332,248 bytes each): `ba8d931f64a6f24dfded8b5178d9d7dcde5e70c60a51b94b2c6cb3ca4eb6aa1b` and `a6a9c60695d23ab1ee31331698ce3c31c9b7d0c0169be2b326f5082664cb6543`.
- Saved outline JSON: `aaa2212740b409e437a46c6bed74c68e316dccbc53e14e0ca081b7770e862c5d`.
- Selected Markdown: `527902104d1b22278ddf0973f2e2b4fa0f66d832b692d69cd45671519e698d64`.

The two response bodies differ; the selected Markdown matches the older USB
section extraction. This does not make the earlier failed full-document receipt
a success, guarantee cross-request identity or establish latest-spec status.
All historical section/source measurements and denied/stopped lanes remain intact.
