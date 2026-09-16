# Preserve blocks inside generic inline wrappers

Markdown extraction preserves authored block boundaries beneath generic inline
wrappers even when no link surrounds them. For example:

```html
<span><span><p>Summary.</p></span></span><span>Sep 14, 2026</span>
```

produces separate paragraph and date text instead of joining them:

```markdown
Summary\.

Sep 14, 2026
```

This is source-structure recovery, not CSS layout inference or date validation.
The motivating admitted Car and Driver capture contains four such paragraph/date
joins. It supplies editorial teasers, not the complete linked articles.

## Boundaries

- Generic inline wrappers containing block descendants participate in the
  existing iterative structural pass. Paragraphs, headings, lists, quotes and
  preformatted blocks use the ordinary block emitter and prefix rules.
- Pure inline text retains its authored adjacency: separate spans containing
  `inter` and `national` still produce `international`, without invented spaces.
  Inline runs also remain continuous across transparent wrapper edges until an
  actual block boundary. Explicit image-source annotations retain their own
  existing emission boundary instead of being discarded with the wrapper.
- True text sinks remain unchanged: paragraph, heading, pre, code, strong and
  emphasis content is not promoted into a different block hierarchy.
- Linked-block destinations, unsafe-link filtering, table modes and list-group
  boundaries retain their existing behavior. Preformatted source remains literal;
  image-source qualifications are not injected into code fences.
- Only Markdown formatting changes. Source DOM, structured JSON, discoveries,
  source/access metadata and native reader accounting remain separate invariants.
- Existing byte, depth, node and intermediate limits still apply. Additional
  separators count toward output limits; no quota is raised or failure hidden.
- No new runtime dependency, scripting, network access or challenge bypass is
  introduced. Preserving structure is a functionality fix, not a speedup claim.

See `reports/inline-block-boundaries-2026-09-16.md` for the selected native checks,
saved-response comparisons, preserved failures and remaining acceptance gates.
