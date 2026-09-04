# Parsed doctypes and compatibility modes

September 4, 2026 continuation of `DOCUMENT-TYPES.md`, `HTML-DOCUMENTS.md` and
the seven-day browser plan.

## Tokenization and retention

DOCTYPE tokens now carry a nullable name/public/system identifier and the
force-quirks flag instead of an undifferentiated declaration string. Names use
ASCII-only case folding; identifier case and literal character-reference text
are preserved. Missing identifiers remain distinguishable from empty identifiers
until mode selection; native DocumentType fields use empty strings for absence.

The scanner handles public/system keywords, both quote styles, missing separators,
missing quotes, null replacement, abrupt greater-than termination, bogus tails
and EOF. In particular, `>` terminates even an unfinished quoted identifier:
following page markup is no longer swallowed as part of the declaration.

At an incomplete input boundary the tokenizer rolls back the entire token and its
diagnostics. Resuming or inserting more input produces the same token and issues
as uninterrupted input. Repeated scanning still counts toward the existing input
work budget; this is not an unbounded streaming-retry exemption.

The document parser materializes the accepted initial doctype before its scaffold
document element, retaining preceding/following comments. Duplicate, late and
fragment doctypes are ignored with diagnostics. A doctype supplied by a native
initialization hook is not replaced by the parser. Doctype metadata is available
before subsequent blocking parser-script hooks.

Creation reuses the existing owned DocumentType primitive, including node/text
quotas, frozen metadata, serialization, equality and cloning/import behavior.
Detached allocations remain charged. A minimal parsed `<!doctype html>` document
now retains five nodes and 16 name code units, rather than discarding its doctype.
Parser failure closes the partial tree. Identifiers never trigger DTD downloads
or other network access.

## Mode classification, not quirks rendering

The parser selects `no-quirks`, `quirks` or `limited-quirks` using the initial
token's name, force flag and legacy identifier rules. HTML 4.01 transitional and
frameset identifiers distinguish missing/empty system identifiers from nonempty
ones. Current public-prefix, exact-match, XHTML and IBM system-identifier cases
are included. Comparisons that require case-insensitivity use ASCII folding.

Missing doctypes select quirks when the first non-comment/non-whitespace token is
processed, or at EOF. A declaration appearing after an HTML start tag is already
late, even while the existing tree builder remains in its broader before-head
mode. Programmatic doctype insertion/removal does not recalculate document mode.
New standalone native documents default to no-quirks.

`documentMode(tree)` exposes native state. `htmlParseInfo(tree).mode` records the
parsed decision, and ScriptDom exposes `document.compatMode`: `BackCompat` for
quirks, `CSS1Compat` for no-quirks and limited-quirks. Owner closure still revokes
access. Inert documents created by `createHTMLDocument` retain their no-quirks
defaults.

**This does not implement quirks layout or selector behavior.** The existing
standards-oriented rendering/selector/scroll subsets have not been changed into
full quirks or limited-quirks implementations. Those decisions emit explicit
`quirks-layout-not-implemented` or `limited-quirks-layout-not-implemented` issues,
and parse metadata remains `partial: true`. Mode classification must not be
reported as visual or whole-browser quirks conformance.

The old combined `missing-doctype-quirks-not-implemented` diagnostic becomes
`missing-doctype` plus the applicable unsupported-layout issue. Structured
doctype diagnostics replace the old generic doctype-mode warning. Historical
reports retain their original diagnostic names and measurements.

## Evidence and remaining work

Three initial regressions fail before integration. Ninety new allowlisted cases
exercise scanner state/recovery, every split boundary of representative tokens,
identifier distinctions, mode selection, DOM retention/order, fragments,
initialization/script hooks, quotas, cleanup and script-facing compatMode.
Focused validation passes 391 tests across eleven explicit files.

Full native validation passes 8,152 tests across 230 files. An isolated snapshot
of the committed baseline plus only this owned patch passes 5,392 tests across
its 169 available allowlisted files. Production/new-test types, builds and
nine-file Biome checks pass in both trees. Pre-existing pending work is preserved
outside this checkpoint, and historical evidence is not rewritten.

The overall HTML parser is still a subset, not the complete tree-construction
algorithm. Template content-document ownership/insertion modes, XML/namespaces,
adoption and broader quirks behavior remain open. No SafeJS, live-site, socket or
real TTY/PTY probe ran; the previously denied SafeJS probe remains unrun. These
native results do not close runtime, site, terminal, portability or release gates.

## Research

Reviewed the current WHATWG [DOCTYPE tokenization states](https://html.spec.whatwg.org/multipage/parsing.html#doctype-state),
[initial insertion mode](https://html.spec.whatwg.org/multipage/parsing.html#the-initial-insertion-mode),
and [Document compatibility API](https://dom.spec.whatwg.org/#dom-document-compatmode)
on September 4, 2026. The implementation records mode decisions separately from
the unsupported rendering behaviors they would require.
