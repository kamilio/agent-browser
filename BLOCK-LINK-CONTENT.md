# Preserve linked content structure in Markdown

Native Markdown extraction now preserves block structure inside source anchors
instead of flattening every card into one inline link label. This fixes the nine
story headings lost in the saved BBC index from September 15, 2026.

For example, an anchor wrapping a heading and paragraph now produces:

```markdown
## [Title](<https://example.com/story>)

[Summary](<https://example.com/story>)
```

The heading remains a heading, the summary remains a separate paragraph, and
both retain the source destination. This is source formatting, not inferred
visual layout or a claim that a complete linked article was retrieved.

## Behavior and boundaries

- Block containers, headings, paragraphs, lists and quotes inside eligible
  anchors retain source order and normal Markdown prefixes. Inline wrapper
  ancestors do not hide those block links.
- Each nonempty inline text group inherits the sanitized outer valid URL.
  Nested anchors retain existing outer-valid-destination precedence. Unsafe
  schemes and credential-bearing destinations remain absent from output URLs.
- Preformatted text stays literal in its own fence. When an anchor contributes
  only non-whitespace preformatted source and no linked text group, its URL is
  emitted once afterward as an autolink, not inside a fence or an invented label.
- Empty links still receive no invented labels. Ordinary inline links and
  generic non-link inline wrappers retain their existing formatting path.
- Existing true text/inline sinks (heading, paragraph, pre, code, strong and
  emphasis) do not promote nested block links. Unsupported table-through-link
  structures remain unsupported. This is not full HTML rendering semantics.
- Source DOM, JSON extraction, heading/link discovery, admission and barrier
  classification are unchanged. Only Markdown rendering changes. Existing
  output, node/depth and intermediate limits still apply; output can grow.
- Traversal is iterative and linear in the visited extracted structure. No new
  runtime dependency, website request, script execution or credential access.

## Saved-source validation

The BBC capture's nine h2 story headings were already present in the native
source tree but disappeared into card labels. Final Markdown preserves all nine,
with separate card text groups and clickable destinations. Whole-page Markdown
grows from **15,263 to 17,231 bytes**. A source-selected card grows from **385 to
604 bytes** and gains its h2 heading. Actual baseline/final replay CLI output
matches the corresponding API output; the card's JSON structure is unchanged.

Seven pinned response controls retain identical source-DOM fingerprints,
heading/link discovery, titles and outcomes. GitHub, Hacker News, crates.io,
Serde docs and the WebAuthn tutorial also retain identical Markdown bodies.
Chrome's 404 body changes only by trimming boundary whitespace on 28 block-link
labels; its HTTP failure remains a failure. The crates.io JavaScript notice
remains a notice, not newly recovered package content.

The original AP challenge receipt still denies ordinary replay. An initial
proof incorrectly expected response reinjection from projected receipt headers
to reproduce the original header-based classification. Those headers are
insufficient; the failed proof is retained and the corrected check validates
the original barrier receipt directly without inventing headers.

## Measured cost

Warm native extraction only, one pinned CPU, three warmups and twelve samples
per build. These measurements exclude parsing, network and rendering:

| Synthetic source | Baseline median | Final median | Markdown bytes, before → after |
| --- | ---: | ---: | ---: |
| 500 ordinary inline links | 5.378 ms | 5.638 ms | 36,279 → 36,279 |
| 250 block-linked cards | 1.653 ms | 2.704 ms | 17,171 → 31,309 |
| 1,600 plain paragraphs | 5.715 ms | 5.808 ms | 57,599 → 57,599 |

The formatting pass has a measurable cost, especially when it emits more
structure and destinations. This is a functionality fix, not a speedup claim;
the small ordinary-content differences should not be generalized from one run.

All **1,177 selected native tests** pass across 22 explicit manifest files,
including 68 new cases. All 1,109 prior case statuses match. Build, type,
formatting and lint checks pass. An initial new quota test used a limit below
the existing 256-byte minimum; only its synthetic payload was enlarged. Final
production bytes match the initial candidate. Independent static review found
no actionable defect. Seven guarded offline children close with zero network
attempts and unchanged source/compiled/capture pins.

Evidence: `reports/block-link-content-2026-09-15.json` and private local lane
`node_modules/.cache/native-validation/block-link-content-september15`.
No websites were re-fetched. Original live reports are unchanged. Full native
release, rendered interaction, SafeJS, credentials/passkeys, service/socket and
TTY acceptance remain open, as do application shells and access restrictions.
