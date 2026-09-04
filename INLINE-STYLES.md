# Inline style declarations

September 4 continuation: `INLINE-STYLE-PRIORITY.md` corrects priority queries for
unresolved/non-serializable declarations and specification-ordered empty writes.
It explicitly records the difference from the historical `remove-invalid-priority`
browser case without changing that evidence. The measurements below remain the
September 2 checkpoint, not a new reference-browser run.

Later checkpoint: `COMPUTED-STYLES.md` adds a separate readonly live
`getComputedStyle()` API. Inline `element.style` retains the authored-declaration
contract below; it is not changed into a computed-style object.

Later checkpoint: `TEXT-LAYOUT.md` adds fontFamily, fontSize, lineHeight,
whiteSpace and textAlign (and hyphenated equivalents) to this bridge. Matching
computed typography participates in source-mapped native line measurement. This
does not turn declaration reads into full computed style or client geometry.

Checkpoint: September 2, 2026, approximately 02:27 UTC. The independent browser
now supplies a live `element.style` capability backed by the actual `style`
attribute. This is a bounded CSS declaration subset, not a layout engine or
complete CSSOM. No dependency or SafeJS interpreter change is added here.

## Behavior

- Each element has a stable declaration object, including detached elements.
  Saved objects observe subsequent setAttribute/removeAttribute changes. Cloned
  nodes start with equivalent attributes but independent declaration objects.
- `cssText` reads normalized supported declarations. Assigning it parses a
  replacement before mutating the document; assigning `element.style` forwards
  to that operation. Reading an absent style does not create an attribute.
- Supported camelCase and hyphenated properties read/write declarations;
  `cssFloat` aliases `float`. `getPropertyValue`, `getPropertyPriority`,
  `setProperty`, `removeProperty`, `item`, `length` and `parentRule` are provided.
  Numeric indexing and iteration use the existing public indexed host capability.
  Missing indices are undefined, while missing items and values are empty strings.
- Parsed duplicates honor important priority and ordering. Direct setters replace
  priorities, preserve existing positions, and avoid rewriting the original raw
  attribute on semantic no-ops. Invalid priorities, including padded priorities,
  leave declarations unchanged, even for empty values.
- Margin/padding expand into four indexed longhands. Compatible sides serialize
  as compact shorthands; mixed priorities retain longhands. Serialization does
  not compact across an `all` declaration. Complete shorthand ordering and
  interaction semantics remain outside this subset.
- `BACKGROUNDS.md` adds solid-color/none background expansion into eight indexed
  longhands, shared reset/priority/removal handling and compatible serialization.
  Non-color components accept only initial values and supported CSS-wide keywords.
- Custom properties preserve case and quoted token content, with bounded balanced
  delimiters. Their values are stored only: URLs are not fetched, and var()
  substitution is not performed. Object/function/symbol coercion is rejected.
- Mutations update the real attribute, revision, visibility cascade and semantic
  snapshots. The later `CSS-BOX.md` layer also reports supported dimensions,
  margin/padding and box-sizing through the native style API. Only visibility
  affects the current semantic renderer; no positions or used sizes are faked.
- Document or store close revokes saved capabilities and releases cached source
  and declaration arrays. Failed document/source/cache limits preserve attributes
  and committed cached values.

## Supported declaration profile

The explicit profile includes display/visibility, positioning/float/clear,
box-sizing and single-keyword overflow values; basic physical lengths for
offsets, dimensions, margin and padding; finite numeric opacity; safe-integer
z-index; a small color-keyword set, three/six-digit hex colors and integer rgb();
and the supported CSS-wide keywords. Numeric zero lengths normalize to pixels.
Padding/sizes reject negative lengths. Opacity retains specified values rather
than fabricating clamped computed values. Unknown properties and unsupported
values are ignored by this declaration subset.

Not implemented: full property/color/unit grammar, escapes/Unicode identifiers,
all CSS error recovery, whitespace-only custom values, var()/calc() resolution,
logical dimensions, all shorthand interactions, CSSStyleDeclaration prototypes,
CSS rules/stylesheets as script objects, computed styles, layout, painting,
transitions or animation. `getComputedStyle` remains absent. The limits and
unsupported-value handling are not evidence of web-platform conformance.

## Resource boundary

Default per-document inline-store limits:

| Limit | Default |
| --- | ---: |
| Live declaration objects | 256 |
| Source or serialized replacement, UTF-16 code units | 65,536 |
| Statements / retained expanded declarations per object | 1,024 |
| Aggregate cached source, UTF-16 code units | 524,288 |
| Component nesting | 32 |

Trusted constructors may choose bounded overrides, at most sixteen times the
defaults. The document text budget, SafeJS bridge accounting and externally
supervised process lifetime remain additional independent constraints. Oversized
external attributes fail on read but can still be cleared via cssText without
first parsing the old source. Inline styling grants no network or filesystem API.

## Evidence and next blocker

- `reports/cssom-native-oracle-2026-09-02.json` contains an actual reference
  browser snapshot from an owned local fixture. The thirteen extracted cases in
  `reports/cssom-native-cases-2026-09-02.json` drive exact comparisons of text,
  raw attributes, indices, values, priorities and shorthand accessors. The
  reference browser is only an oracle, never the new engine. Its ephemeral
  session and fixture server were closed and session-list cleanup verified.
- `src/inline-styles.test.ts` adds 28 tests, including those thirteen anchors,
  live reflection, clone independence, visibility, coercion rejection, malformed
  values, budgets, mutation atomicity and close behavior.
- `reports/inline-styles-process-sites-2026-09-02.json` exercises actual automatic
  scripts through the explicitly rebuilt SafeJS public core in owned processes.
  Native clicks alter real style attributes and reveal previously hidden
  snapshot content. These are not tests against only the host-object double.
- `reports/site-script-errors-inline-styles-2026-09-02.json` retains bounded
  diagnostics from unmodified public scripts. Books' jQuery advances from
  style.cssText at offset 10697 to `d.attributes[c].expando` at offset 12095;
  its script SHA-256 remains
  `c12f6098e641aaca96c60215800f18f5671039aecf812217fab3c0d152f6adb4`.
  Quotes still stops at Date.now, offset 3900, tracked in Poe Code #543.
  Both sites remain failed/partial automatic JavaScript acceptance.

The generic indexed bridge remains in the existing SafeJS candidate patch and
upstream #545; DOM attributes and CSS declarations belong to the browser package.
This checkpoint neither claims an upstream SafeJS release nor completes the
terminal/playground/Playwright-like superset goal.
