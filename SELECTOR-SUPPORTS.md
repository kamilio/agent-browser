# Native selector feature queries

September 4, 2026. `selector()` conditions now use the native selector compiler
through both `CSS.supports()` and stylesheet `@supports`. This continues
`CSS-SUPPORTS.md` without introducing another parser or runtime dependency.

## Support is not matching

A query accepts one supported complex selector. A top-level comma-separated
selector list is false, while supported lists inside `:is`, `:where`, `:not`,
`:has` and child-selector filters follow the compiler's existing grammar.
Missing target elements do not make a selector unsupported. State selectors can
be tested without reading focus, hover, control state or browsing history.

The parse-only operation does not construct a document query owner, build a node
index, populate a selector/match cache, register listeners or mutate the document.
Its temporary syntax tree is not retained. Existing query instances and DOM
revision counters remain unchanged in native tests.

All nested selector components must be supported. An unknown branch inside a
functional selector is not discarded merely because another branch could match.
Unknown pseudo-classes, pseudo-elements, namespaces, column combinators and other
unsupported native syntax return false. Invalid syntax returns false; resource
errors and unexpected failures propagate rather than masquerading as unsupported.
General forgiving-selector behavior and full selector conformance remain open.

Read-only primary research on September 4 used
`https://drafts.csswg.org/css-conditional-4/`. The draft requires
recursive support even for selectors whose ordinary parsing may be forgiving.
That specification check is not a new reference-browser or upstream test run.

## Preserve token boundaries

Replacing every comment with a space can make `div/**/span` look like the valid
descendant selector `div span`. Conditions and stylesheet preludes now preserve
selector comments and skip trivia only where the surrounding grammar allows it.
Quoted comment markers and parentheses remain string contents. Function names
with escaped identifiers work without turning an identifier followed by a comment
and block into a function token.

Three new tests failed after initial selector integration because of comment
rewriting: two support results and a stylesheet branch choosing the wrong width.
Both API and stylesheet paths now preserve the compiler's interpretation.

## Shared limits and native evidence

The normal query owner and parse-only support check share default syntax limits:
8,192 selector UTF-16 code units, 256 components and 16 selector nesting levels.
The support path applies these to the selector text passed after the outer query's
CSS newline/NULL preprocessing; comments are retained and counted. The existing
65,536-unit, 32-block-depth and 1,024-condition support-query bounds also apply.
Parsing runs even for Boolean operands whose value cannot change the result, so
negation or short-circuit opportunities cannot hide resource exhaustion.

Capabilities expose `selectorQueries: true`, the
`single-complex-native-selector` profile and the shared syntax limits. Native
tests cover Boolean composition, escaped names, nested rejection, independent
index/owner state, budgets and comment handling. Conditional stylesheet choices
drive existing DOM matching, geometry and pixels; the resulting raster is compared
with an equivalent unguarded native stylesheet.

The new file contains 65 cases. Isolated prior HEAD fails 36 and passes 29.
Focused validation passes 395 tests / six files in both trees. Both also pass
types/builds, strict checking of three tests and eight-file lint. Authorized full
native runs pass 9,929 tests / 275 working files and 8,783 / 253 isolated files.
`TASKS.md` and `SEVEN-DAY-PLAN.md` also record this checkpoint.

The isolated source/build tree remains in ignored repository cache storage with
unchanged historical reports. Unrelated pending work is excluded. No live website,
reference browser, socket, real TTY/PTY or SafeJS probe ran. Font feature queries,
complete grammar, released-SDK execution and the original compatibility gates
remain open. The denied SafeJS probe remains unrun, and the full seven-day browser
objective stays active.
