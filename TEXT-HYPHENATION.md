# Native discretionary hyphenation

The native engine supports inherited `hyphens: none | manual | auto`, with
initial value `manual`, and real discretionary U+00AD soft-hyphen layout.
This addresses the four remaining hyphenation-property occurrences in the
captured Python documentation stylesheet; parser acceptance alone is not the
implementation or evidence of a completed website flow.

## Native profile

- Unused U+00AD has no ink and zero advance. Its source reference, UTF-16 offset
  and length remain available to range/caret geometry. At a chosen break, that
  same source character owns the visible native hyphen-minus glyph, styling and
  advance. DOM text and range copying are not rewritten to contain ASCII minus.
- `none` disables discretionary hyphenation without displaying the hidden
  marker. `manual` uses explicit markers. No automatic language resource is
  installed, so `auto` retains explicit markers but does not generate guessed
  hyphenation points, even when `lang` is known. Its computed value stays `auto`.
- Greedy fitting includes the visible marker and inline closing edges. Enabled
  opportunities participate in min-content measurement; max-content measures
  the unbroken rendering. Existing inline-block shrink-to-fit sizing consumes
  those measurements. This does not add `width:min-content/max-content` syntax.
- `nowrap` and `pre` suppress these soft wraps. Forced breaks remain distinct.
  Valid fitting discretionary points precede emergency `overflow-wrap` splits;
  emergency splits do not acquire a hyphen. `anywhere` and `break-word` retain
  their distinct existing intrinsic-sizing behavior.
- Ordinary inline boundaries preserve word/source ownership. Soft-hyphen
  prefixes use float-shortened intervals when they fit and move below an
  obstructing float when necessary. The shared line entries then supply inline
  fragments, document paint, hit regions and range/caret consumers.
- Tokens, line counts and every new scan retain the existing resource limits.
  Candidate prefix measurements on the float path are explicitly charged.
  Ordinary words without discretionary markers do not enter the new splitting
  loop. No new dependency, font engine or script runtime is added.
- `-moz-hyphens`, `-ms-hyphens` and `-webkit-hyphens` canonicalize to `hyphens`
  through stylesheet parsing, live inline styles and computed styles. Legacy
  IDL accessors share that state, including both `MsHyphens`/`msHyphens` and
  `WebkitHyphens`/`webkitHyphens`. These aliases are native compatibility policy,
  not a requirement claimed from CSS Text.

## Limits

This is the existing bitmap-font engine's bounded discretionary profile, not
universal language-correct typography. The visible marker is ASCII hyphen-minus;
language-specific before/after markers, spelling substitutions, dictionary
resources, automatic word analysis, complex shaping and full Unicode line
breaking are not implemented here. In particular, known language alone does
not establish automatic hyphenation support. Existing unconditional-hyphen and
punctuation line-breaking limitations are not removed by this feature.

Other unsupported properties, layout profiles and actionability guards remain
effective. Support for this CSS property is not permission to treat a partially
formatted page as successfully painted or clicked. Performance and complete
source conformance have separate acceptance requirements.

## Focused evidence

`hyphenation-work-september14/fixed01` passes **721 tests, zero failures and
zero skips** across 17 selected files on September 14, 2026,
00:19:30.983–00:19:51.407 UTC. There are 39 new feature cases and 682 existing
cases. Compilation, strict test compilation, formatting and source integrity
pass. Tests cover inheritance/cascade/aliases, actual source-preserving breaks,
range reflow/copying, pixels/hits, UTF-16 ownership, whitespace, emergency wraps,
intrinsics/shrink-to-fit, floats, inline edges, mutations and limits.

The same-final-test parser-only snapshot `parser01` has 685 passes and 36
failures; actual text layout changes resolve those failures in `fixed01`.
Initial `parser00`/`fixed00` artifacts remain unchanged. One existing test's
hardcoded ten-property `all:initial` expectation is updated for the expanded
explicit registry, without changing its case count. Two new fixtures mistakenly
used unsupported width keywords; supported shrink-to-fit geometry replaces
those fixtures rather than admitting unrelated CSS syntax.

## Broader native gate

`native-hyphenation-september14-round00` passes **21,590 tests, zero failures
and two unchanged skips**, September 14, 2026,
00:20:18.754–00:25:18.553 UTC. It selects 421 files with 420 strict roots from
the explicit 775-entry manifest; 354 files remain unselected. The separate
host-object-ceiling and advisory-media exclusions remain skips.

Compilation, strict test compilation, formatting and complete inventory checks
pass: 1,323 source files, 2,152 compiled files, 1,317 unchanged tracked inputs.
AUDIT SHA-256:
`15a45b59b349dd8d49b79b935c8b39acc8cdb10f3535267fc028614ea9c530bb`.
The 20-entry receipt ledger SHA-256 is
`ea87e7a18e9c5a0702d2ba97e6f44186303b82131fd48d7db0bd8ff0d081dead`.

The snapshot and feature preserve pre-existing root changes separately; native
passing tests are not live website, automatic dictionary, credential/provider/
device, SafeJS, real-TTY, socket or performance acceptance.

## Native-read primary source

A separately bounded native offline parse runs on September 14, 2026,
00:16:13.330–00:16:13.554 UTC, using the unchanged W3C CSS Text Level 3 body
captured on September 13 at 23:42:24.402 UTC. **No new HTTP request** occurs.
Native metadata identifies the August 14, 2026 Candidate Recommendation Draft;
no latest-edition claim is made. The original 540,326-byte body SHA-256 is
`17c26f1b41455947f106dac81736944b12da328ee4892c7c5b601f5b65ced55a`.

The source read retains 23,999 code units in 74 blocks, including the complete
5,998-unit hyphenation section with no omissions. Two native queries and
bounded traversal use 509,091 aggregate work units. Other sections retain their
explicit omissions. Requirements distinguish normative text from fitting,
conditional-rendering and resource-less fallback inferences; exact glyph
metrics and complete max-content construction are not certified by the read.

Source lane: `native-hyphenation-source-september14`; root evidence SHA-256:
`527147f4a7b809e91fff71dc0e77f38d200e4f0b7fc3f2ae776a1993f2929651`.
Exact native excerpts, provenance, language restrictions and unresolved rules
remain in its `EXCERPTS.json`, `REQUIREMENTS.md` and `HANDOFF.md`.
