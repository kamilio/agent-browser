# Contextual HTML content and live extraction

September 2, 2026. The independent parser now handles a tested subset of HTML
fragment contexts. Page scripts can replace `innerHTML`; agents can extract the
current serialized tree without replaying source or using a native browser engine.
No dependencies or SafeJS source changes are added by this checkpoint.

## API and commands

- `element.innerHTML` gets serialized children and sets contextually parsed
  content. Null becomes empty text; other supported primitive values use the
  adapter's existing conversion. Arbitrary object coercion remains unsupported.
- `element.outerHTML` gets serialized markup including the element. Its setter
  explicitly reports unsupported rather than silently ignoring a replacement.
- `parseHtmlFragment(source, url, context, options)` returns an owned staging
  tree and fragment ID. The caller must close that tree. Context declares the
  element tag, ancestor-form presence and optional scripting mode.
- `setInnerHtml(tree, id, source, options)` owns staging and cleanup, then replaces
  the target's children. It accepts an optional cancellation signal.
- `serializeHtml(tree, id, options)` supports children or inclusive serialization,
  an output code-unit limit and the noscript scripting-mode distinction.

With a service and named session already open as described in `CLI.md` or
`PROCESS-CLI.md`:

```bash
node packages/browser-agent/dist/src/cli.js -s=research html
node packages/browser-agent/dist/src/cli.js -s=research html 'main'
node packages/browser-agent/dist/src/cli.js -s=research html 'h1' --max-code-units=65536
```

The optional target is a single selector match or a current node reference.
No target serializes the document; a target includes that element's own markup.
Ambiguous, missing and stale targets retain existing command errors. The result
contains `url`, `html` and `partial: true`, inside the normal result envelope.
This is an additive agent command, not an assertion of full Playwright parity.

The command defaults to at most one million UTF-16 code units, also capped by
the document text limit. Explicit limits can only lower that ceiling. Transport
byte limits still apply separately. Exceeding a bound fails, not silently
truncates. HTML is returned as JSON text, not inserted into the playground DOM.

## Parsing and replacement

The fragment path shares the existing tokenizer and tree constructor, not a
string-wrapped fake document. It supports ordinary elements, basic table/section/
row/colgroup and select contexts, ancestor-form suppression, RCDATA and raw-text
contexts. An html-element context reuses document head/body construction while
retaining fragment comments and BOM text. A textarea context does not discard
its first newline merely because a full document textarea start tag would.

Inserted scripts are inert: no evaluation or script-resource request is scheduled
by `innerHTML`. The owned-process probe checks this while executing the containing
page's ordinary script. Native actions can target newly parsed controls and run
listeners explicitly registered by that page script.

Parsing happens in a separately bounded tree. Destination node, aggregate text
and depth limits are checked before importing or detaching old children. On
parse/quota/cancellation failure, the committed children, node count and revision
remain unchanged. Successful replacement preserves old detached node identities;
their capabilities remain readable until document close, but their connected
agent references become stale. Detached focus is cleared.

The model intentionally retains detached nodes. Imported nonempty fragment
wrappers also remain counted until document close. Empty replacement allocates
no destination nodes. This is cumulative ownership accounting, not garbage
collection. Staging, copying and serialization have bounded native work but are
not precisely charged as interpreter instructions; the process supervisor is
still required for untrusted scripts.

## Serialization and limitations

Serialization emits actual current nodes, stable attribute order, escaped
attributes/text, comments, HTML void-element spelling and literal raw-text
content. Expanded escape size is checked before allocating expanded strings.
Doctypes are not yet represented by the document model and are not fabricated.

Serialization is **not sanitization**. Raw script/style text or comment data may
produce active markup if another application reinserts it. Consumers must not
treat returned HTML as trusted UI content.

Template contents, namespace-aware SVG/MathML, frameset parsing, custom elements,
shadow roots, full table/select insertion modes, formatting reconstruction,
complete named entities and quirks-mode behavior remain incomplete or explicitly
unsupported. `insertAdjacentHTML`, outerHTML replacement, and general dynamic
script insertion are still open. Full HTML conformance, all Kitesurf features,
the complete CLI superset and visual playground exports are not claimed.

## Verification

- `reports/unit-node-2026-09-02-innerhtml.json`: browser regression suite,
  including contextual fragments, atomic replacement, serialization limits,
  live adapter identity and separate actual CLI invocations: 1046 passing tests
  across 59 files.
- `reports/innerhtml-process-sites-2026-09-02.json`: owned-process HTTP page
  scripts create controls through innerHTML, receive native commands and expose
  post-action HTML: 21 fixture checks pass. The two passing public reporting
  checks are not dynamic-site acceptance.
- `reports/innerhtml-cli-sites-2026-09-02.json`: 18 checks pass through the actual
  CLI executable and paired API, including live HTML extraction against public
  documents after controlled local DOM edits. Those edits and manual evaluation
  are not automatic-site compatibility.

Strict package/test compilation and the 138-file Biome check pass. Completed
counts are also recorded in `TASKS.md` and the report index. Public
Books/Quotes automatic JavaScript remains blocked by SafeJS function-object
semantics; upstream #540/#541 remain open at this checkpoint.

Primary standards consulted:

- https://html.spec.whatwg.org/multipage/parsing.html#html-fragment-parsing-algorithm
- https://html.spec.whatwg.org/multipage/parsing.html#serialising-html-fragments
- https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-innerhtml
