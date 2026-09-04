# Owner-aware template parsing

September 4, 2026 continuation of `TEMPLATE-OWNERSHIP.md` and
`TEMPLATE-BINDINGS.md`. Template markup and template fragment contexts now use
the native contents model rather than rejecting all templates or treating their
contents as ordinary children. The parser remains an independent HTML subset.

## Tree construction

The open-element stack carries the actual native document for each entry.
Insertion redirects a current template element to its associated contents
fragment. Elements, comments, text coalescing and fostered text are allocated and
mutated in that destination owner. Main-document scaffold and metadata decisions
remain attached to the original document.

An explicit stack retains each template's insertion mode. It begins in-template,
then selects table, column-group, table-body, row or body handling from the token.
This permits direct rows, cells and columns without inventing body wrappers or
unrequested table containers. Head-rule tokens and ordinary body tokens are
distinguished: for example, a title start changes to body handling, while style,
script and noframes preserve the initial template mode. Nested templates push
their own mode and restore the enclosing mode when closed.

The nearest template bounds stack searches, paragraph/list/form recovery and
formatting-end handling. Closing a template pops its open elements without
popping enclosing live elements. Stray end tags and EOF recovery produce explicit
diagnostics. A fragment's virtual template context cannot be popped by markup.
Template starts remain available in table, select and column-group contexts.

Foster insertion inside a contents table stays in its native owner. When a
template table mode has no real table element, fostered nodes go into the
associated contents fragment, not an outer live table. Template forms do not
overwrite or consume the main form pointer. HTML/head/body tokens cannot alter
the real scaffold from inside a template, and misplaced doctypes cannot change
the main document's accepted doctype or mode.

## Fragment and script-facing HTML

Template fragment contexts initialize the template mode stack and return actual
fragment children. The temporary parse tree is copied through the existing
bounded graph import path, then closed.

Setting a template's innerHTML replaces its associated contents, preserving the
stable fragment binding and leaving ordinary template children untouched. Source
parse failure, cancellation and destination quota/depth preflight leave existing
contents intact. Successfully replaced old nodes remain detached and charged,
with their native identities retained.

insertAdjacentHTML still inserts into the template's ordinary children: it is not
an alias for the template-specific innerHTML setter. Its parsing context is a
template, so table-mode fragment parsing still applies. outerHTML replacement of
an ordinary child likewise uses the actual template parent context.

## Inert processing

Template scripts use the tokenizer's real raw-text states but do not produce
script, written-script-preparation or CSP-policy hook calls. One input stream
and tokenizer retain the existing token/work limits and parser-write boundaries;
templates are not reparsed recursively in an unbounded secondary parser.

Only the main document receives initialization hooks. Its mutation stream and
ordinary traversal do not expose template descendants to resource owners. Native
tests inject an image fetch function and verify no template image request reaches
it; template base elements also do not change the main document's base URL.
These checks use no network, runtime or live website.

## Bounds and remaining compatibility

Native graph quotas include host elements, contents roots/fragments, nested
contents and text. Host-inclusive depth checks apply both during parsing and
before destination replacement. Parse failure and cancellation close candidate
contents owners along with their primary document.

This is not a complete HTML tree builder. The inherited active-formatting
reconstruction/adoption-agency algorithm and broader malformed-table recovery
remain incomplete; misnested formatting retains an explicit diagnostic. Template
scope isolation is not a claim that a complete active-formatting list now exists.
The mode stack added here does not close those broader parser requirements.

Declarative shadow roots and content patching are not activated; relevant
template attributes produce `template-extensions-not-implemented`. Foreign
SVG/MathML construction and framesets remain explicitly unsupported. DOM
adoption, cross-owner observer/runtime integration, full namespace/prototype
behavior and quirks rendering remain separate open requirements.

No SafeJS, live website, socket or real TTY/PTY probe ran. The denied SafeJS probe
remains unrun. Native parser checks do not establish framework compatibility or
close the independent runtime, live-site, terminal, portability or release gates.

## Validation

Three initial template document/fragment/replacement regressions fail before
integration. The final 46 new tests pass, with 343 focused checks across eleven
files. Existing parse-failure fixtures now use still-unsupported SVG rather than
templates, preserving their old-state/allocation assertions. The obsolete
template-rejection parameter is removed from the unsupported-tag test matrix.

On September 4, 2026 the explicit native suite passes 8,273 tests / 233 files in
the working tree and 5,513 / 172 available files in an isolated HEAD plus owned
patch. The smaller isolated set excludes pre-existing untracked tests. Production
and changed-test typechecks, builds and ten-file Biome checks pass in both trees.
The pre-existing pending test/source work remains outside this checkpoint.

These results are native parsing and injected-hook/resource evidence only.
Historical reports remain unchanged; the seven-day goal and independent
acceptance gates remain active.

## Research

Reviewed the WHATWG HTML Standard on September 4, 2026: “The in template insertion
mode”, in-head template start/end rules, appropriate insertion locations, scope
boundaries and fragment parsing. Those rules motivate separate owners, mode
push/pop, foster destinations and context initialization. Unsupported formatting,
table-recovery and template-extension behavior remains explicit rather than
being inferred from successful fixtures.
