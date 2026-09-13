# Native CSS nesting syntax follow-up — September 13, 2026

This adds the missing formal Syntax section to the earlier native primary-source
research. It does not rewrite `CSS-NESTING-PRIMARY-SOURCE-SEPTEMBER-13.md` or turn
its incomplete section selection into a complete original run.

## Source and method

One separately bounded, zero-HTTP native long-v1 reader load reuses the exact
W3C `https://www.w3.org/TR/css-nesting-1/` response captured at
`2026-09-13T15:38:42.283Z`: 213,027 decoded / 39,883 encoded bytes, SHA-256
`b29b0db74b96af295efcd7cd94f34366dd099ebb905dc5529c61409184f6fa9c`.
The document identifies itself as the **January 22, 2026 Working Draft**; the
retrieval date is not its publication date or evidence that it is the latest.

The new reader retains the native heading index and extracts one complete
`3.1. Syntax` section, HTML ID `syntax`, native reference `e967`: 3,369 text
units, one query / 54,481 query-work units, 11,735 extraction-walk units. It
does not search raw HTML/CSS or use another browser, a search engine, source
replacement, a fallback load, or partial text trimming.

Execution runs `15:51:52.016–15:51:52.211 UTC`, exit 0, 250 stream bytes.
Native/query owners close, zero nodes remain, empty private directories are
removed, runtime pins stay unchanged, and the process group is absent.
Network and process-denial counters remain empty. There are no scripts,
credentials, real passkeys, TTY/PTY, socket, geometry or raster probes.

## Verified implementation contract

- Nested selectors use a relative selector list. Without a leading combinator,
  a branch containing a nesting selector is non-relative; otherwise the parent
  nesting subject is implicit. A leading combinator stays relative even if an
  ampersand occurs later in that branch.
- Invalid nested style rules are ignored with their contents without
  invalidating the parent rule. This is distinct from a valid selector that
  the native browser does not yet implement.
- An implicit nesting selector contributes the parent's specificity just as an
  explicit one does. Parent-list maximum specificity and pseudo-element
  distinctions are covered by the earlier source sections.
- Ampersands are selector delimiter tokens, not Sass-style string
  concatenation. `Bar&` is syntactically valid; `&Bar` is not. Quoted or escaped
  ampersands are not nesting-selector tokens.
- The source describes nesting tokens inside functional arguments and
  serialization of invalid branches in forgiving lists. The native strict
  selector subset does not thereby gain support for unknown functions or
  forgiving-list expansion.

The detailed block-parsing algorithms are referenced to CSS Syntax Level 3;
that separate specification was **not** captured in this check. Do not infer
complete CSS Syntax recovery, CSSOM nesting, `@scope`, `@layer`, `@container`, or
full browser conformance from this bounded research and implementation.

## Evidence

Lane: `node_modules/.cache/native-validation/native-css-nesting-syntax-september13/`.
Its 24 lane-relative payload entries are sealed in `EVIDENCE.sha256`, SHA-256
`e37e0bba12a395a734df8a51535fc59a465100c3e900f2ce766eb84826d7f97c`.
The native extraction audit hash is
`af2f85f719484811362e2318d6b816ec79e93b837f1f92158b7925ceffac4039`.
Use the lane as the base directory when verifying its relative digest paths.
The source/runtime/provenance and zero-HTTP authorization remain explicit in
the lane. This source check itself is not website action or layout acceptance.
