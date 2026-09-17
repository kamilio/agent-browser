# Native-first reader fallback

The research CLI has an opt-in document strategy:

```sh
node dist/scripts/research-browser.js \
  --document-strategy native-reader-fallback-v1 \
  --capture-body https://example.com/
```

This is a single-response loading strategy, not a second browser, network retry,
CAPTCHA workaround, or general dynamic-page renderer. Existing native and
`--reader` behavior stays unchanged when the strategy is not selected.

## Selection

The strategy first uses the existing native document loader. A successfully
loaded native document keeps its ordinary extraction path, including the native
inline-stylesheet/CSS subset. Empty, short or subsequently failed extraction does
not trigger fallback. In particular, an empty styled document must not be replaced
by a reader view that exposes a CSS-hidden error template.

Only an HTTP 200 response with one explicit `text/html` Content-Type is eligible
for fallback. If native loading throws an `AgentBrowserError` with category
`unsupported` or `resource-limit`, the strategy tries the existing bounded reader
on the **same response bytes**. It neither increases limits nor makes another
request. The reader uses `separate-omitted-raw-v1`, `source-hidden-inline-v1`, and
the existing explicit UTF-8 fallback when no stronger encoding applies.

Policy, network, timeout, abort and unknown errors do not trigger this fallback.
Neither do HTTP/access failures, successful empty native results, nor extraction
errors after native loading. Normal challenge classification, rate-limit stops
and source-visibility evidence still apply; a successful parse is not proof of
useful, accessible or factually correct content.

## Resource ownership

Both loading attempts receive the original limits, signal and tab ID, but no
script, fetch, stylesheet or image capability hooks. No downloaded code runs and
no subresource is fetched. The source's inline CSS remains available to the native
engine; external stylesheets are not loaded by this strategy.

The session initializer receives only the final selected tree, once. Failed
intermediate parser trees are closed by their loaders. Initialization or abort
failure closes the selected tree and is not reinterpreted as a reason to retry
with another loader. Caller-owned response bytes are not modified or cleared.
Typed cancellation reasons retain their identity, and a throwing close handler
does not replace the primary initialization/cancellation error during cleanup.

## Reports and compatibility

An explicit strategy adds `documentStrategy` metadata containing its policy,
the selected loader mode (`native` or `reader`), and, when fallback is attempted,
the original native failure category/stage and available resource diagnostic.
It does not include arbitrary exception text or source snippets. The mode is not
proof that loading or extraction completed. Profile and reader metadata describe
the selected path; a failed reader attempt retains the native failure provenance.

This first strategy supports default-profile whole-document extraction. It can
be combined with ordinary pacing, HTTPS redirect policy, format/table options
and body capture. It cannot be combined with `--reader`, reader-specific policies,
long-document mode, selectors/sections/discovery, content focus, JSON pointers,
text-prefix output, source label/heading policies or Markdown negotiation.

Strategy-tagged captures remain refused by default replay and recovery admission.
Explicit asynchronous replay with
`--expected-document-strategy native-reader-fallback-v1` revalidates the same loading strategy before applying
a supported selection. See `RESEARCH-STRATEGY-REPLAY.md`. Retaining a complete body
does not silently authorize replay through a different interpretation.

This is not automatic best-content selection. Reader-only source enrichments,
focus and simplified output may still be preferable for a particular task even
when native loading succeeds. Use the existing reader mode explicitly for those
workflows. The native CSS subset does not establish full rendered visibility,
external CSS fidelity, JavaScript initialization or interactive compatibility.

See `reports/native-reader-fallback-2026-09-17.md` and `TASKS.md` for measured
coverage and remaining gates. Do not treat nonempty output, a selected mode, or a
source-only benchmark shell as a successful content task.
