# Image-role source qualifications

The native extractor preserves author-supplied `aria-label` and `title` values on
included HTML elements with an explicit `role="img"`. This recovers qualifications
that otherwise disappear when an icon has no ordinary text, such as an
experimental-status warning beside a method name.

This is **source annotation**, not rendered image recognition, a complete
accessible-name algorithm or evidence that a browser/user saw a tooltip. No
attribute is interpreted as an instruction, URL to fetch or executable content.

## Output

JSON extraction nodes gain optional `imageSource` metadata:

```json
{
  "kind": "native-image-source-v1",
  "role": "img",
  "attributes": {
    "aria-label": "Experimental",
    "title": "Experimental. Expect behavior to change in the future."
  }
}
```

Markdown emits a clearly labeled annotation before the original node content:

```text
[Image source: aria-label="Experimental"; title="Experimental. Expect behavior to change in the future."]
```

The actual Markdown escapes source punctuation and markup. Metadata retains exact
attribute strings; the annotation quotes values and escapes control/format
characters for safe display. Original element types, text, children and the DOM
are not replaced. Nonempty image-role elements keep both their source annotation
and their existing content; no attempt is made to choose one as a rendered name.

Annotations participate in ordinary output limits and the explicit text-prefix
fallback. Table-row compaction falls back to structural table rendering when
compaction would lose a row/cell/wrapper annotation. Annotations inside literal
`pre`/`code` descendants do not alter emitted code text; their source metadata can
still appear in JSON. An annotation on the literal container itself is outside
the code text.

JSON content detection and extraction diagnostics recognize this source-qualified
image content. Existing access/challenge checks remain in force; an annotation is
not a reason to bypass a barrier or promote source claims to verified facts.

## Eligibility and bounds

- Own `role` attribute, exactly lowercase `img` with optional surrounding ASCII
  HTML whitespace. Multiple roles and other role spellings are not resolved.
- Included, visible HTML nodes only, under the extractor's existing partial
  visibility rules. Hidden/omitted nodes and foreign SVG/MathML namespaces are not
  promoted into source annotations. Heading-section context ancestors do not add
  unrelated annotations to a selected section.
- At least one own nonblank `aria-label` or `title`. Both provided values are
  retained independently, including a blank companion field. No inherited or
  unrelated attributes, ID-reference resolution or inferred labels are exported.
- Maximum 8,192 UTF-16 units per selected attribute. Direct extraction rejects an
  oversized selected attribute with a resource-limit error instead of clipping it.
  The reader preserves only individually bounded attributes, consistent with its
  existing attribute limits and ignored-attribute counters.
- The reader additionally preserves bounded `title` on matching, preserved
  HTML elements. It does not broadly retain every title or change hidden-content,
  template, script, control-unwrapping or foreign-element policies.

Snapshots are fresh whitelist copies with frozen metadata and attributes. There
is no persistent metadata registry or added page-runtime dependency.

## Remaining gaps

The MDN compatibility-widget fallback captured in
`reports/developer-content-2026-09-16.md` is a different omission inside a template
and `noscript`. Image-source annotations do not restore it or manufacture absent
browser-support rows. Template fallback recovery remains separate work.

Historical website verdicts retain their original measurements. Validation of this
change is recorded separately in `reports/image-source-2026-09-16.md` and JSON.
