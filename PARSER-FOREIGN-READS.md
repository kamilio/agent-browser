# Namespace-only parser dispatch

The HTML parser needs the active namespace for tokenizer CDATA handling and
foreign-content dispatch. It does not need an immutable attribute snapshot for
every ordinary HTML token. `HtmlForeign.currentNamespace()` uses the existing
`DocumentTree.namespaceOf()` read, or the original fragment context when the
parser is at its virtual root. It does not cache namespace state or node views.

HTML dispatch returns before reading the full foreign context. Actual SVG and
MathML processing still uses `current()` and its existing attribute snapshots,
including `annotation-xml` encoding decisions, integration points and breakout
rules. Work limits, cancellation, issue reporting and closed/invalid ID checks
are not relaxed. A virtual fragment context retains its prior precedence.

Insertion-target selection first checks the parser entry's tag before requesting
element information for a possible template. It retains the actual HTML-element
check: a template fragment's virtual root is not itself a template element, and
an SVG template lookalike does not gain HTML template ownership.

`src/parser-foreign-read.test.ts` covers these boundaries and snapshot avoidance.
`reports/parser-foreign-reads-2026-09-16.md` records profiling and ten-page
same-response comparisons. The optimization changes neither the public document
snapshot shape nor reader output/access policy. Faster local parsing is not
evidence of faster network loading, script execution or new website access.
