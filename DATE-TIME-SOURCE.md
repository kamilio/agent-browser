# Native datetime source metadata

The semantic reader preserves the literal `datetime` attribute on unchanged
HTML `time`, `ins` and `del` elements. This keeps machine-readable source dates
available when the displayed text omits a year or time zone. Other element types
do not gain this attribute; executable/foreign-subtree reader omissions remain.

JSON `extractDocument` emits `dateTimeSource` on visible included HTML elements
with an explicit datetime attribute:

```json
{"kind":"native-date-time-source-v1","tag":"time","value":"2026-12-25"}
```

This is **raw source metadata**, not a parsed or independently verified date.
There is no timezone inference, calendar validation, implicit-text fallback,
normalization or assertion that a declared date is correct. Empty declarations
remain distinguishable from missing attributes. Values on `ins`/`del` describe
the source's edit timestamp, not the date of their visible content.

Each JSON metadata value is bounded to 4096 UTF-16 code units; a larger value
fails with `resource-limit` rather than being silently truncated. Existing
extraction byte/intermediate/structure limits still apply. Markdown output is
unchanged and does not incur the JSON-only metadata-value limit. Reader source,
output, attribute and document limits remain unchanged.

Hidden native full-DOM elements, foreign elements, omitted executable subtrees
and heading-section context wrappers do not export this metadata. The partial
semantic reader still explicitly ignores hidden-content semantics: retaining
datetime does not turn it into a rendering or visibility oracle.

Non-whitespace datetime metadata alone counts as content for JSON research
extraction. An empty or whitespace-only declaration does not. It is not added
to rendered-text diagnostics, so metadata is not mislabeled as page text.

The motivating website check found 280 datetime declarations in the native
full DOM of GOV.UK's bank-holiday page and none in the reader. Exact capture,
before/after validation and outstanding limitations are recorded separately.

## Verified coverage

All70new regressions pass; the corrected unchanged baseline has48failures and
22passing controls. Focused validation passes809cases. The expanded selected
native suite has19476passes, three unchanged failures and two unchanged skips;
build, strict and formatting pass. The full selected suite is not green.

On the exact retained GOV.UK source, all280datetime declarations now survive
the reader and JSON extraction and match the native full-DOM values. Reader
node count and metadata-stripped extracted content/references are unchanged.
This is a zero-HTTP before/after replay, not fresh live-site/full rendering
acceptance. Precise sources, runtime pins, byte cost and outstanding gates:
WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-THIRD-UPDATE.md.
