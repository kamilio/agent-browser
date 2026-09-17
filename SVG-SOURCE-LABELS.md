# Read literal SVG source labels without rendering SVG

The native research reader retains a nonblank, own `aria-label` on an otherwise
omitted `svg` element as inert inline code prefixed exactly with
`SVG source aria-label: `. This is a literal source-text fallback, not a computed
accessible name, rendered SVG or verified description. No new flag, dependency,
resource request or SVG runtime is needed.

For example, this source:

```html
<a href="/saved"><svg aria-label="Saved &amp; 😀"><path d="M0 0"/></svg></a>
```

becomes this inert reader HTML:

```html
<a href="/saved"><code>SVG source aria-label: Saved &amp; 😀</code></a>
```

The retained owning anchor keeps its destination under existing link rules.
Markdown and JSON extraction can therefore retain a link whose only source
content was the labeled SVG. This does not turn the SVG into a button or enable
an action; the annotation remains code text inside the existing anchor.

## Boundaries

- Only an explicit, own, nonblank `aria-label` qualifies. Missing or blank labels
  do not produce an annotation. No name is inferred from `title`, `desc`,
  `aria-labelledby`, descendant text, classes, URLs, `alt` or `alttext`.
- The SVG element and its entire subtree remain omitted, including geometry,
  nested links, `foreignObject` content and image references. SVG IDs, classes,
  roles, event handlers and other attributes are not transferred to the generated
  code element. Use an actual retained ancestor as an extraction target.
- An SVG inside an already omitted foreign or raw subtree cannot emit another
  annotation. This includes nested SVG, MathML, scripts, styles, templates,
  iframes, objects, canvas and textarea. An unlabeled outer SVG does not expose
  labels on its nested SVGs. Separate adjacent eligible SVGs can each emit code.
- Existing tokenizer decoding and first-wins duplicate-attribute handling apply.
  The nonblank check does not trim the decoded value used for the annotation.
  That value is HTML-escaped before entering the reader document; label markup
  cannot manufacture elements, links, controls or executable attributes.
- Raw decoded-label preservation is not original-byte preservation. Tokenizer
  newline normalization still applies; a decoded carriage-return character is
  escaped for preservation in reader HTML. Markdown inline-code whitespace
  normalization and extraction control-character escaping still apply. Retain
  captured HTML when original attribute spelling, entities or bytes are needed.
- This changes neither ordinary non-reader native parsing/rendering nor the
  existing MathML alternative behavior. Unlabeled SVG remains omitted. There is
  no SVG rendering, computed accessibility naming, script execution, hydration
  or active control/form support added by this fallback.

## Source hiding is not computed visibility

Existing `source-hidden-v1` policy suppresses annotations for SVGs with `hidden`
or the recognized `aria-hidden="true"` value, including inherited source hiding.
`hidden="false"` still counts as hidden; a child's `aria-hidden="false"` does not
override a hidden ancestor. `source-hidden-inline-v1` additionally recognizes
the existing simple inline `display:none` cases. These are existing policies,
not new SVG options. Legacy mode retains `hiddenContentSemantics: false` and
does not gain these hiding rules.

Neither policy computes stylesheet rules, classes, media queries or responsive
visibility. A `hidden` class, `visibility:hidden` or `inert` does not by itself
expand the recognized source-hidden rules. Consumer Reports source contains both
responsive variants and many icon labels; retained annotations do not establish
which variant is visually displayed or that those labels represent displayed,
enabled controls. They are authored source text, not a visual control inventory.

## Provenance and budgets

Reader reports include this optional immutable record only when an annotation
is emitted:

```json
{"svgAlternatives":{"elements":1,"codeUnits":10,"attribute":"aria-label","rendered":false,"verified":false}}
```

Here `Saved & 😀` contributes ten decoded UTF-16 code units, including two for
the emoji. `elements` counts emitted alternatives; `codeUnits` sums their decoded
label units, including preserved whitespace, but not the fixed prefix. Sanitized
records are frozen, and document-attached records are defensively copied and
frozen. Reports without emitted SVG alternatives omit this field rather than
adding a zero-count record. MathML retains its separate counters.

Eligible labels also debit the shared `textCodeUnits` budget alongside ordinary
text and omitted descendant text under existing policies. Source-hidden labels
still incur that debit even though they emit nothing and do not increment
`svgAlternatives`. Labels nested inside already omitted foreign/raw subtrees are
not additional alternatives or additional decoded-label debits; their source and
tokens remain subject to existing omission accounting.

The prefix, escaped label and generated markup consume the existing reader output
budget. Original source, tokens, depth and omitted text remain bounded, with the
existing malformed-input checks. Generated document admission and serialized
extraction have their own unchanged limits. No cap or timeout is raised, and an
available label cannot rescue invalid or over-limit input.

Default and long-profile reader loading and admitted captured-HTML replay use
the same bounded transformation. Replay computes current reader metadata without
rewriting original receipt metadata, including receipts without this optional
field. JSON and Markdown remain partial and unverified; the reader notice still
describes SVG structures as omitted. Literal labels and their metadata do not
claim rendered fidelity or establish any separate acceptance gate.
