# Source-hidden block ancestor ends

Research-reader source visibility is opt-in. When either source-hidden policy
omits an HTML block, an explicit matching block end may close that ancestor even
if ordinary descendants lack their own end tags. For example:

```html
<div hidden><ul><li>Hidden promotion</li></div><p>Visible content</p>
```

The omitted `ul` end no longer makes this entire document unreadable. The reader
discards the intervening hidden descendants and resumes after the explicit `div`
end. A nested block end closes the nearest matching ancestor, not the outer
hidden root. The visible open stack is never popped by this recovery.

Supported end names are `address`, `article`, `aside`, `blockquote`, `center`,
`details`, `dialog`, `dir`, `div`, `dl`, `fieldset`, `figcaption`, `figure`,
`footer`, `header`, `hgroup`, `listing`, `main`, `menu`, `nav`, `ol`, `pre`,
`search`, `section`, `summary` and `ul`.

## Conservative boundaries

- The target must already exist inside the current hidden stack. Missing or
  outer visible ancestors are not invented, and an unclosed hidden root still
  fails rather than disclosing following text.
- Recovery does not cross HTML scope boundaries such as table, cell, select,
  template, object or applet. Foreign SVG/MathML ancestry disables it.
- Body and form starts also block this new unwinding. Duplicate body attributes
  can affect the existing document body; form-pointer state can survive removal
  of a stack entry. Neither effect is modeled by discarding source tokens.
- Reconstructable formatting elements such as `a`, `b`, `em` and `strong` block
  unwinding: their reconstruction is outside this source-reader feature.
- A legacy-omitted subtree disables the new recovery until its normal closing
  boundary. Script/raw contents are consumed by the existing raw scanner, not
  interpreted as block ends.
- Paragraph/list implied ends, direct matching ends, token/text/depth budgets,
  default visibility and CSS-class limitations retain their existing contracts.

This is bounded source filtering, not a replacement HTML tree builder, computed
visibility, or permission to bypass access restrictions. The motivating saved
Rakuten response contains a hidden `div` whose `ul` lacks an end tag; its inline
visibility extraction previously failed at normalized UTF-16 offset 310747.
Evidence and remaining work are recorded in
`reports/top100-reassessment-2026-09-15.md` and its JSON companion.

The new boundary checks do not change older direct-matching behavior. In
particular, source filtering does not generally model duplicate body-attribute
merges or persistent form state. Those pre-existing limitations remain; blocking
the newly admitted ancestor path is not a complete document-tag visibility fix.
