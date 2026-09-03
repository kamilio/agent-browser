# HTML reading and native page actions

Checkpoint: September 1, 2026. The default CLI and playground now load actual HTML
through an original, dependency-free TypeScript parser. This is a **partial HTML
implementation with website JavaScript disabled**, not full HTML conformance,
desktop-browser equivalence or the completed Kitesurf/Playwright superset.

The later `SCRIPT-LOADING.md` checkpoint adds opt-in automatic classic execution
through the same parser/tree. Its asynchronous driver pauses at scripts and exposes
parser/lifecycle phases. The scripting-disabled behavior described below remains
the default, not the only supported configuration. Full HTML/JS conformance and
public dynamic-site acceptance remain incomplete. `DOCUMENT-WRITE.md` adds bounded
parser-input insertion for blocking classic scripts; nested inline execution and
post-parse document replacement remain explicitly unsupported.
`HTML-CONTENT.md` separately adds inert contextual fragments, atomic innerHTML
replacement and bounded live HTML extraction through the CLI/API.

## What works now

September 3 update: `HTML-ENTITIES.md` supersedes the small named-reference subset
described in this historical checkpoint. The native parser now uses the complete
reviewed WHATWG mapping and longest-match/attribute-ambiguity behavior. Other
parser limitations and the original paths and measurements below remain unchanged.

The asynchronous `loadBrowserDocument` accepts explicit `text/html`, plain text and JSON. HTML is
tokenized into our owned document tree, rather than being stripped into a string
or rendered by Chromium/Firefox. Parsed elements have the same stable references,
queries, native controls, events, history and session actions as constructed trees.
`loadTextDocument` remains available as a deliberately text/JSON-only loader.

The parser handles document html/head/body scaffolding, ordinary start/end tags,
attributes and void elements; comments and doctypes; common omitted paragraph/list/
option/table closures; implicit table sections/rows; basic table foster parenting;
raw script/style/iframe text; script escape/double-escape boundaries; title/textarea
RCDATA; initial textarea/pre newlines; and scripting-disabled noscript content.
Numeric references and a small explicitly implemented common named-reference set
are decoded. Unknown named references remain literal and are reported, not replaced
with guessed characters. This is not the complete named-reference algorithm/table.

The document model feeds real link navigation and native forms. The public demo
form probe uses parsed controls without inserting nodes, changing attributes,
adding host event listeners or bypassing validation. Type/fill/check/Enter submit
synthetic data through the guarded POST pipeline and load the real JSON response.
Optional empty email/time/date/number-like fields now have explicit empty-value
validation; required empties fail. Nonempty validation for those types is still
unsupported. No claim of complete validity or interactive bad-input state is made.

With the foreground service running, this is a working public-demo workflow:

```bash
node packages/browser-agent/dist/src/cli.js -s=demo open https://httpbingo.org/forms/post
node packages/browser-agent/dist/src/cli.js -s=demo snapshot
node packages/browser-agent/dist/src/cli.js -s=demo fill 'textarea[name=comments]' 'synthetic parser probe'
node packages/browser-agent/dist/src/cli.js -s=demo fill 'input[name=custname]' 'synthetic-browser-probe' --submit
node packages/browser-agent/dist/src/cli.js -s=demo snapshot
```

These commands send synthetic values only to the public httpbingo demo, not a real
order service. Normal browsing starts with `open https://example.com/` or
`open https://books.toscrape.com/`; snapshot links provide refs for `click`.

## Disclosure, bounds and safety

- Navigation results expose `html` metadata: parser identity, `partial: true`,
  `scripting: false`, detected encoding and bounded issue counters. The SDK exposes
  `htmlParseInfo(tree)`. Snapshots contain a compact HTML disclosure; terminal and
  playground text explicitly begin with `HTML partial; JS off`.
- Scripts and event-handler attributes are data only. Script/image resources,
  iframe documents and meta refresh are not automatically fetched or activated.
  The later CSS checkpoint adds bounded stylesheet retrieval and a two-property
  visibility cascade (`CSS.md`), not full styling or rendering.
  There is no website eval, host VM escape hatch, external entity fetching or
  fallback to another browser. The existing watchable browser tests our UI only.
- Encoded/decoded input, document text/nodes/depth and token counts are bounded.
  Each token allows at most 1,024 attributes. Duplicate attributes retain the first
  value. Names such as `__proto__` remain ordinary attributes. Failed parsing closes
  its candidate tree and preserves the committed page/ref state.
- HTTP charset and BOM handling use the guarded decoder. A bounded 1,024-byte meta
  prescan supplies the HTML fallback; absent declarations use windows-1252. Common
  meta charset/http-equiv forms and UTF-16-to-UTF-8 meta normalization are tested.
  Full encoding sniff/restart behavior and late declarations are not implemented.
- Snapshots are semantic, not computed accessibility/layout. The bounded CSS
  visibility subset now excludes supported hidden content; unsupported CSS,
  browser mode differences and incomplete tree repair can still change extracted content.
  Existing output escaping/password redaction remains in effect, but it is not a
  guarantee that every sensitive page value has been removed.

## Deliberate gaps

SVG/MathML foreign content, templates and framesets currently fail explicitly.
The parser is not the complete HTML tokenizer/tree-construction state machine:
adoption-agency formatting repair, all insertion modes/scope rules, complete comment
recovery, quirks/limited-quirks behavior and full character references are missing.
Basic recovery is reported through issue counters; `partial` remains true even for
a document with zero reported issues. There is no WPT-conformance claim.

Website JavaScript, lifecycle/DOMContentLoaded/load bindings, script resource
scheduling, CSS layout/rendering, native frames, full selection/IME, complete forms,
HTML export and screenshot/PDF rendering remain unfinished. Standards-oriented
parser/runtime dependencies still require explicit approval; none was installed,
vendored or imported through a private transitive path. This original parser moves
real reading/actions forward without declaring the broader browser goal complete.

## Verified evidence

- 772 Node tests pass across 39 files, including parsed local HTTP link navigation,
  form POST/cookies, required validation, inert resources and failed-load preservation.
- 76 focused parser/decoder/form tests pass on Bun. Networking remains Node-only.
- All 17 public separate-process CLI checks pass: JSON/RFC history, Example Domain,
  parsed Hacker News links, Books to Scrape listing-to-product navigation by ref,
  HTML back traversal and complete service/private-file cleanup.
- The parsed public httpbingo form POST matches all seven expected fields. No
  artificial controls or validation overrides are involved. A 74.4 MB whole-process
  RSS sample is recorded, not a peak or general browser memory benchmark.
- All 17 UI assertions pass on desktop and at 390×844. Actual HTML content, disclosure,
  XML rejection preserving HTML, shared CLI state and disconnect behavior are tested.
  Private desktop/mobile images were inspected; the owned test browser and isolated
  service were closed. No production daemon restart occurred.

See `reports/README.md` for dated artifacts. Initial Books to Scrape inspection
exposed an over-conservative script-boundary rejection; implementing and testing
script escaped/double-escaped scanning allowed the full public CLI probe to pass.

Reference inspected September 1, 2026:
https://html.spec.whatwg.org/multipage/parsing.html
This is the target specification, not evidence that every rule is implemented.
