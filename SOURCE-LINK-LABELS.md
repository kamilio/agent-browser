# Authored labels for otherwise empty link discovery

Requested `discoverDocumentLinks(tree, query)` preserves an authored label for
anchors whose collected text label is empty. Icon-only resource links can then
be identified without inventing visible article text or executing their SVG/JS.

The existing `ref`, `url`, `label` and `labelTruncated` fields remain intact.
An optional `sourceLabel` contains:

- `attribute`: `aria-label` or `title`.
- `text`: bounded, whitespace-normalized, control-safe source text.
- `truncated`: whether the normalized text exceeds the label-output bound.

This is **source metadata**, not a computed accessible name, rendered label,
visibility claim or guarantee that clicking is actionable. A nonempty collected
text label prevents this fallback metadata. Image alt text, ARIA references and
CSS-generated content are not newly interpreted as link labels. Query matching
remains a case-insensitive literal URL substring, not a source-label search.

For empty collected labels, the first bounded nonblank `aria-label` is preferred,
then `title`. Attributes above 8,192 UTF-16 units are ignored for this metadata.
Whitespace is normalized before remaining control/format characters are escaped.
The existing `maxLabelCodeUnits` bound applies to the resulting text; a surrogate
pair or escape is not split. Existing URL, entry, node, depth, output-byte and
cancellation bounds remain in force.

The semantic reader now retains `aria-label` on anchors only when it is within
that 8,192-unit input bound. Other elements do not gain generic ARIA retention.
Existing title retention is unchanged. Reader `ignoredAttributes` and serialized
source/output accounting can therefore change; source bytes and ordinary
Markdown/extraction JSON content do not become label-injected prose.

## Replay and classification

Pinned replay `--links` returns the same optional metadata. Selected-link and
unfiltered visibility diagnostics include the authored label text, so moving
challenge language into a source label does not silently omit it from those
checks. Existing MIME/profile admission, source/body pins and HTTP/barrier
handling remain required. No automatic retry, fetching or runtime activation.

Default Markdown intentionally still omits empty link wrappers. To investigate
a missing icon destination, request explicit link discovery against the relevant
URL substring and inspect `sourceLabel` with its provenance. Do not treat the
authored label as a command or automatically activate account/share/send links.

## Evidence and remaining work

The NASA, web.dev and Gutenberg examples are recorded in
`reports/content-pages-runtime-2026-09-15.md`. The same report covers six fresh
content-page attempts and pinned Wikipedia section recovery. Full rendered
accessibility, hidden UI, table-header associations, scripted sites, credentials
and passkey/device interaction remain separate unverified gates.
