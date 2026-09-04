# Inert HTML document creation

September 4, 2026 continuation of `DOCUMENT-TYPES.md`, `DOCUMENT-RESOURCES.md`
and the seven-day browser plan.

## Page-facing behavior

`document.implementation.createHTMLDocument(title?)` now returns a fresh owned
document capability. It constructs a native Document, `html` doctype, `html`
element, `head`, optional `title` with a Text child, and `body`.

Omitted and explicitly undefined titles omit the title element. An empty string
still creates the title element and an empty Text node. Null becomes `"null"`.
The existing primitive DOM-string conversion applies; object, function and symbol
coercion remains explicitly unsupported. Stored title text retains whitespace;
the existing `document.title` getter normalizes HTML whitespace.

Created documents have an `about:blank` URL/documentURI, UTF-8 encoding aliases,
`text/html` content type and `CSS1Compat` compatibility mode. Later doctype removal
does not change that mode. These defaults are specific to this creation path;
they do not claim correct encoding or quirks handling for all parsed pages.

Origin identity is inherited separately from the URL. Native metadata preserves
the creator's origin object through nested creation, including distinct opaque
identities for unrelated opaque-origin roots. Changing a base URL does not change
that identity. The native root-origin helper initializes from the existing tree
URL; complete sandboxed/navigation-origin policy is not added by this checkpoint.

## No browsing context

- `defaultView` and `location` are null; referrer and cookie reads are empty.
  Cookie writes have no effect and never reach the creator's storage binding.
- Initial readyState is complete and currentScript is null. No PageBindings,
  Window, navigation, network, storage or timer owner is inherited.
- `hasFocus()` is false. Element focus/blur are inert; activeElement uses the
  body/document-element fallback without focusing a control.
- Page-facing client/offset/scroll dimensions are zero, offsetParent is null,
  client rect lists are empty and bounding rectangles start at zero. Hit testing
  returns null/an empty list and scrolling does not affect the creator's viewport.
  Native offscreen layout utilities are not globally disabled by this policy.
- When the initiating ScriptDom has callback support, each created document gets
  its own DocumentEvents dispatcher using that callback runtime, without a Window
  target. Listener registration does not borrow the creator's event dispatcher.

Existing native queries, title updates, markup insertion, cloning and authenticated
importNode work with these documents. Fragment insertion has no script execution
hook. Imported copies resolve URLs against their destination and remain usable
after the auxiliary source closes. Ordinary cross-document append/move still
rejects foreign capabilities rather than silently pretending adoption exists.

## Admission and ownership

One auxiliary family is shared by nested creation and additional native ScriptDom
wrappers around its members. Its aggregate node/text limits equal the initiating
tree's configured limits. The initiating document retains its existing separate
budget; this is not one combined primary-plus-auxiliary memory ceiling.

Each family admits at most 16 lifetime creation attempts. Admission is reserved
before skeleton allocation or provider callbacks, including attempts that later
fail quota, depth or publication checks. Invalid primitive-conversion/native
arguments are rejected before admission. Closing a child frees its retained
capacity but does not reset this lifetime counter.

Skeleton creation preflights five nodes and 16 retained code units without a title,
or seven nodes and `21 + title.length` units with a title. Required depths are two
and four respectively. Subsequent changes and imports use the shared budget from
`DOCUMENT-RESOURCES.md`; detached nodes remain charged until document closure.

Publication uses the existing guarded node-capability factory. Reused identities,
failed publication and factory-triggered owner closure cannot return a live
candidate. Failure closes and releases that candidate without closing successful
siblings. Publication and native cleanup failures are aggregated when necessary.

Closing the initiating ScriptDom or its native tree closes the whole family and
revokes retained child capabilities. Closing one auxiliary native tree leaves
other family members, including its previously created descendants, usable until
the initiating owner closes. Family teardown attempts every member even if native
cleanup handlers fail. Metrics contain only counts and closure state, not titles,
URLs, origins or content.

## Evidence

Three API regressions fail before integration. Forty new explicitly
allowlisted native cases cover skeletons, conversion/defaults, origins, markup and
imports, inert geometry/focus, storage isolation, shared quotas, lifetime admission,
publication reentrancy, errors and teardown. The final focused regression set
passes 357 tests across ten explicit files.

Full native validation passes 8,062 tests across 228 files. The isolated committed
baseline plus only this owned patch passes 5,302 tests across its 167 available
allowlisted files. Production/new-test types, builds and four-file Biome checks
pass in both trees. A preservation comparison confirms that pre-existing pending
ScriptDom changes remain outside the checkpoint. Historical evidence is unchanged.

## Remaining gates

This is a native implementation with mock-host-factory behavioral evidence, not a
SafeJS runtime or real-site acceptance result. No SafeJS, live website, socket or
real TTY/PTY probe ran; the previously denied SafeJS probe remains unrun.

Parsed DOCTYPE metadata/compatibility modes and proper template content-document
ownership/parser integration remain next. XML createDocument, namespace breadth,
cross-document adoption, realm/prototype/instanceof parity, complete WebIDL
conversion, general Event/dispatchEvent exposure and document writes outside a
blocking parser script remain separate gaps. The parser's template rejection is
not removed. Existing runtime, site, terminal and release gates stay open.

## Research

Reviewed the current [DOMImplementation creation algorithm](https://dom.spec.whatwg.org/#dom-domimplementation-createhtmldocument),
[HTML document and cookie behavior](https://html.spec.whatwg.org/multipage/dom.html),
[focus definitions](https://html.spec.whatwg.org/multipage/interaction.html#dom-documentorshadowroot-activeelement),
and [unrendered geometry rules](https://drafts.csswg.org/cssom-view/#dom-element-getclientrects)
on September 4, 2026. Also inspected the upstream
[WPT optional-title cases](https://github.com/web-platform-tests/wpt/blob/master/dom/nodes/DOMImplementation-createHTMLDocument.js)
and its document-default assertions. Those sources informed native regressions;
the upstream browser harness was not executed and full WPT conformance is not claimed.
