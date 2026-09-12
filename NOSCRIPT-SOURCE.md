# Native primary sources: noscript rendering and parsing

Captured September 12, 2026, using only the repository's native semantic reader.
This is source acquisition, not rendering, parser-implementation, script-runtime,
SafeJS, device, provider, or general browser acceptance.

## Rendering rule and importance

The exact captured rule in **15.3.1 Hidden elements** is:

```css
@media (scripting) {
  noscript { display: none !important; }
}
```

Source document: `https://html.spec.whatwg.org/multipage/rendering.html`.
Section anchor: `rendering.html#hidden-elements`.
Native heading: `e739`; native selector:
`html:root:nth-child(1) > body:nth-child(2) > h4:nth-child(32)`.
Extraction: `rendering-capture-section-1.jsonl` in the evidence lane below.

The condition and importance are both explicit. This is not an unconditional
normal-priority `noscript` display default. Under CSS's important-origin ordering,
a UA-important display declaration beats author declarations, including
author-important declarations. That priority conclusion applies established CSS
cascade semantics to the captured rule; a separate CSS-cascade document and the
complete media-feature definition were outside the authorized source set and
were not captured. Do not infer this rule from parser behavior alone.

The second rendering extraction is **15.1 Introduction**,
`rendering.html#introduction-17`, native discovery heading `e342`, selector
`html:root:nth-child(1) > body:nth-child(2) > h3:nth-child(6)`.
It describes rendering guidance in CSS terms and expects implementations using
other presentation mechanisms to approximate those rules. It also expects agents
without author CSS support to act consistently with the stated CSS rules.
Extraction: `rendering-capture-section-2.jsonl`.
The section's general discussion of author styles does not remove the explicit
importance in the separate hidden-elements rule.

## Disabled versus enabled scripting

**4.12.2 The noscript element**, `scripting.html#the-noscript-element`:
native heading `e5592`, selector
`html:root:nth-child(1) > body:nth-child(2) > h4:nth-child(122)`.
Source document: `https://html.spec.whatwg.org/multipage/scripting.html`.
Extraction: `scripting-capture-section-1.jsonl`.

- With scripting enabled, the element represents nothing; with scripting
  disabled, it represents its children.
- Outside `head`, disabled-scripting content is transparent fallback markup,
  with nested `noscript` prohibited. Enabled-scripting HTML content is text,
  subject to the section's authoring-conformance constraints, rather than real
  descendant elements parsed from that source text.
- In `head`, disabled-scripting contents are restricted to `link`, `style`, and
  `meta`. The enabled case is text with a separate fragment-parsing conformance
  requirement. This is not the same content model as ordinary body fallback.
- The text explicitly ties these differences to the parser's scripting mode at
  invocation. It also says actual children are not exempt from form submission
  or scripting merely because they are under a `noscript` element.
- Script execution failure is not itself disabled scripting. The section warns
  that enabled scripts can fail and recommends progressive enhancement instead
  of relying exclusively on `noscript`.

## Fragment parser: source of scripting state

**13.4 Parsing HTML fragments**, `parsing.html#parsing-html-fragments`:
native heading `e28622`, selector
`html:root:nth-child(1) > body:nth-child(2) > h3:nth-child(524)`.
Source document: `https://html.spec.whatwg.org/multipage/parsing.html`.
Extraction: `parsing-capture-section-1.jsonl`.

The captured specification uses a **parser scripting mode**, not merely a
boolean flag. The optional fragment argument defaults to `Inert`, and its
incoming value must be `Inert` or `Fragment`. Context is the target element, or
the target fragment's host. The algorithm obtains `contextDocument` from that
context's node document. If that document has scripting disabled, it overrides
the mode to `Disabled`; the resulting mode is then assigned to the new parser.

For a `noscript` context, any non-disabled mode selects `RAWTEXT`; disabled mode
leaves the tokenizer in the data state. Therefore hardcoding enabled parsing
loses the context document's disabled-scripting branch. Conversely, an inert
fragment does not imply disabled-scripting fallback parsing.

**13.2.4.5 Other parsing state flags**, `parsing.html#other-parsing-state-flags`,
native discovery heading `e5629`, selector
`html:root:nth-child(1) > body:nth-child(2) > h5:nth-child(103)`.
Extraction: `parsing-capture-section-2.jsonl`.
It initializes a document parser to `Normal` or `Disabled` from the associated
document's scripting state when the parser is created. It distinguishes four
modes: `Normal`, `Disabled`, `Inert`, and `Fragment`. Inert scripts remain enabled
for parsing but are marked already started to prevent execution; this is the
fragment default. Fragment mode is used by `createContextualFragment()` and
executes inserted scripts without the normal async/defer scheduling behavior.

No production change is prescribed or made here. In particular, these sources do
not require publishing incomplete parse diagnostics merely to retain early
internal scripting state. Parent owns implementation decisions and tests.

## Evidence and provenance

Private `0700` lane:
`node_modules/.cache/native-validation/native-noscript-source-september12/`.
All extraction and receipt filenames above are relative to this lane. Native
selectors refer to the captured reader tree, not an alternate browser's DOM.
Replay-local references can differ from discovery references; section selectors,
titles, and returned section-selection metadata are preserved without rewriting.

Pinned runtime: Node `v22.22.0`. Pinned release:
`43202e3a0bb22bd072a2a2d2356a68b2e74cd3e1`, at
`native-optional-image-september12-round01/snapshot01/dist` under the cache root.
The release's 20 gate receipts, all 1,091 source and 1,928 compiled inventory
entries, native results, and both commit-owned inputs were independently checked
before use and again around each child. Historical gate: 11,504 passed,
0 failed, 2 excluded; 204 selected suites, 203 strict roots, 599 manifest entries.
No rebuild, gate rerun, shared-document edit, implementation edit, or commit.

| Document | Received UTC, September 12, 2026 | Decoded bytes | Encoded bytes | Headings | Sections |
| --- | --- | ---: | ---: | ---: | ---: |
| rendering | 02:33:40.930Z | 366253 | 54444 | 48 | 2 |
| scripting | 02:33:48.794Z | 261949 | 42954 | 12 | 1 |
| parsing | 02:34:10.032Z | 787795 | 105313 | 140 | 2 |

Exact decoded-response SHA256 values:

- rendering: `d7b02615f70194b29caf5daaac20432cf2c540806636146539036a4c52d4173e`
- scripting: `b0e10ca817d56f7b45f10ee89ea73f541499e264fe48771a9eef632e9cd88d87`
- parsing: `311d356f10fcb9fbeedfa90964845568575f1802e2d7f34eba1f8fbc95c86e99`

Exactly three actual bodyless GETs, one per authorized document; all HTTP 200,
zero redirects, zero mocks, no Retry-After or classified barrier. The native
reader made no script/subresource requests, and credentials were omitted with
empty cookie jars. Public-address checks, TLS verification and native identity
were retained. Captures were sequential with at least 250ms pacing.

All five offline sections came from the exact captured receipt bodies, with
kernel seccomp socket denial plus JavaScript network/process guards. No offline
network requests or denied attempts occurred. Each child had a 30-second limit
plus 5-second termination grace, 6MiB file/output cap, private empty HOME/TMP,
explicit environment allowlist and no stdin/TTY. Native admission remained
`long-v1` without capacity increases. The lane has a 20MiB cap and requires 64MiB
free space; final measured values are recorded in `CHECKS.json`.

An initial harness defect rejected the browser's own native User-Agent before
transport dispatch. That failed launch remains under `rendering-live.*` and
`rendering-LIVE-AUDIT.json`; its native request wrapper was called once, but
transport requests and actual wire GETs were both zero. Original harness versions
were Buffer-archived before correction. `PREWIRE-CORRECTION.json` records the
scope. Successful captures use a distinct `*-capture-*` namespace: this was a
pre-wire harness correction, not a repeated HTTP request or limit bypass.

Task, reference, release, and preservation-rule archives retain their original
bytes with immediate length/hash checks. `CHECKS.json` validates cross-file claims
and this report's actual saved hash. `EVIDENCE.sha256` and `FINAL-RECEIPTS.sha256`
are independently checked final ledgers; the latter also binds the former.
An incorrect introduction anchor in the unsealed report draft was corrected
against the native extraction; `REPORT-DRAFT-CORRECTION.json` retains the check
and byte-identical original draft. No acquisition was repeated for that fix.

## Limits

Coverage is bounded to two rendering sections, one element section, and two
parsing sections. The detailed body tree-construction algorithm, CSS cascade
specification, complete scripting-media-feature semantics and callers beyond
the fragment/state sections were not extracted. No coverage is claimed for them.
All heading lists were untruncated and all selected sections succeeded, but the
native semantic reader still reports partial/unverified semantics: it does not
execute scripting or styling and does not implement hidden-content semantics.

Stored bodies are original **transport-decoded bytes**, not compressed socket
frames; headers preserve the complete native normalized multivalue map, not
original capitalization, order, or raw HTTP serialization. Native receipts carry
encoded-byte accounting. No raw-HTML search, alternate HTTP client/browser,
protected `native-source-heading-source-10` payload access, or capacity workaround
was used. Acquisition of the conditional rule is not proof that the repository
currently renders it correctly.
