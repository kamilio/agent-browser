# Native paragraph and heading alignment

## Supported behavior

HTML `p` and `h1`–`h6` elements accept exact ASCII-case-insensitive `align`
values `left`, `center`, and `right` as zero-specificity, author-level
`text-align` hints. Normal author declarations override them. The existing
cascade handles important declarations, CSS-wide keywords, variables and
computed-value inheritance; attributes are not rewritten into inline styles.

Whitespace is not trimmed. Unmatched values, including `middle`, `start`, empty
strings and CSS-wide keywords, provide no hint. This does not import DIV's
different `middle` alias. An alignment attribute is bounded to 4096 code units;
existing style and formatting work limits still apply.

These hints align inline content, not fixed-width child blocks. An applicable
hint also excludes that element from ancestor legacy CENTER positioning.
Formatting carries that boundary without inheriting it to unrelated descendants.
Author text alignment does not erase the attribute's applicability, and explicit
auto margins still position the element normally. Attribute/style changes and
reparenting invalidate the existing style and geometry caches.

No runtime dependency, foreign browser, source substitution or guard bypass is
introduced. Non-HTML namespaces do not acquire HTML hint behavior.

## Explicit limits

`justify` remains an unsupported presentation hint: the native text engine does
not implement justification. DIV, table, cell, caption and replaced-element
alignment have different semantics and remain outside this implementation.
Their existing diagnostics are not removed by a universal attribute exemption.
Even an author override does not waive the conservative `justify` guard.

## Primary-source investigation

The browser's native parser read the original retained WHATWG rendering chapter,
received September 12, 2026 at 02:33:40.930 UTC. No fresh request was made.
The decisive paragraph/heading rules are in section 15.3.8, within the Tables
section: native PRE node4624 and introductory paragraph4615. Native
`align-descendants` container738 establishes the applicable-attribute exclusion.
The author-level zero-specificity clause was retained separately in section15.2.
General CSS defaulting reuses the repository implementation rather than claiming
new independent validation of every external specification.

Private evidence under `html-align-work-september13/` preserves the broad
selection-limit failure, the incorrect Flow-section locator failure, and the
later successful `source-flow/` and `source-rules/` queries. The successful rules
query retained eight complete containers, 10052 text code units, with one native
parse/query owner, no HTTP, and closed document/query resources. Main's independent
read-only verification passed September13 at01:55:19UTC.

Original body SHA256:
`d7b02615f70194b29caf5daaac20432cf2c540806636146539036a4c52d4173e`.
Rules evidence SHA256:
`120f70e725d9facb8f71680e3408714366a502d37f81a1df50194c41a4404625`.

## Validation

The original two paragraph/heading pixel-and-hit fixtures reproduced the real
unsupported-formatting failure before implementation and remain unchanged.
The final focused candidate passes600 tests, including112 new cases across two
explicitly listed native test files. Coverage includes exact glyph placement,
geometry, raster pixels, hits, cascade, inheritance, namespaces, invalid values,
resource bounds, mutation, owner closure and nested legacy alignment boundaries.

The earlier broad round00 is preserved but superseded: source review found that
its nested CENTER test expected the wrong placement. The stronger corrected
expectation and six additional boundary tests are in the final candidate.
Intermediate format-only failures remain preserved, not relabeled as test runs.

The final clean gate passes **17,072 tests, 0 failures, 2 unchanged exclusions**:
328 selected suites,327 strict roots,706 manifest entries (378 not run).
Build, strict type checking, formatting and unchanged-source checks pass.
Gate `native-html-align-september13-round01` ran September13,2026 from
01:57:39.521 to02:01:39.549UTC. The audit verifies1229source/2052compiled files,
1223 unchanged tracked inputs, and the five owned files plus the test manifest.
Pre-existing uncommitted work remains separate. No push.

Source inventory SHA256:
`2b9908dcaacc33e32505e3d78e20e750ed78a4a61076065b53fdefd9da943a9f`.
Compiled inventory SHA256:
`19c4c7aab4bf24a928e87e6ecb1a6c14ce6b81168f87b09afc3dd6d59710a535`.
Native results SHA256:
`68c485ad39eadb7f8bf8eab15037f3ba584916d52af176130e663737747c48f7`.
Audit SHA256:
`01b383860b0fc615e2a52ba7f1441aa77c820215814c22d40f76fba291f6908e`.

## Original SQLite source replay

The unchanged8886-byte HTML and6868-byte CSS from the September13 live capture
were replayed offline on the audited runtime. Final `sqlite-replay02` passes at
02:03:51.823–02:03:52.012UTC: one parse,469DOM nodes,one external stylesheet,
one formatting inspection,zero HTTP/image/used-layout/raster/script calls.
Original H3 node129 and P node465 both compute centered text without the legacy
descendant marker. The two presentation-hint flags disappear. All six unsupported
CSS values,fifteen properties,six selectors,eleven float flags and one overflow
flag remain. The float flags are not proof of a missing float implementation.

Raw native DOM records are unchanged. Stylesheet installation correctly advances
presentation revision473→474; formatting leaves474 unchanged. Accessibility
snapshots are unchanged after installation. Document/style owners close, private
HOME/TMP stay empty, and runtime inventories match before/after. The result is
an offline compatibility check, **not a fresh website or used-layout pass**.

Two earlier harness failures remain immutable: replay00 compared the revision
from before stylesheet installation; replay01 incorrectly compared style-aware
accessibility snapshots across that installation. Separate corrected replay02
checks both full DOM records and stable post-install presentation. No source,
runtime, diagnostic or budget was changed to obtain its result. All three calls
were offline, each with its own new native document owner and preserved receipts.

Replay02 result SHA256:
`22e6171487492340c32649ab77770d9ba955a1c31b1846d4131d65e7be3a2677`.

## Remaining browser work

The prior live SQLite check reached document/image loading but failed used
layout. The remaining CSS values/properties/selectors and overflow still require
real implementation; floats must not be assumed missing merely from diagnostics.
Independent native source research now establishes the `ex` x-height basis for
the next font-relative-length work; no `ex` implementation is claimed here.
Original research topics, script execution, credential providers, passkey-device,
SafeJS, real TTY and challenge/human-handoff acceptance remain separate open
gates. This feature does not establish whole-site compatibility or a new host.
