# Bounded native extraction pages

September 18, 2026. A new `extract-page` command and `extractDocumentPage` library
API turn an existing per-element workaround into a bounded retrieval workflow.

## What works

Select repeated source elements, read the returned extraction entries, and pass
the continuation cursor back with the same selector. Results preserve DOM order
and source element references without skipping an element that did not fit.
Document edits and navigation invalidate old cursors. Query resources close on
success and failure; no request or page script is executed by extraction.

The entire compact JSON page has a strict UTF-8 cap, including entry metadata and
the cursor. Per-item extraction limits remain independent. A first entry that
cannot fit fails rather than returning an empty nonterminal page. Item errors
propagate; they are not silently omitted. Existing `extract` behavior is unchanged.
See `EXTRACTION-PAGES.md` for commands, limits and continuation semantics.

## Actual captured-discussion replay

The input is the unchanged 605,306-byte Hacker News response captured on
September 18 at 04:15:02.383 UTC, not a new website visit. Its original live
loader failure and later source-verified per-comment recovery remain historical
evidence; neither is rewritten as a successful live request.

The new isolated command-host replay establishes:

- Ordinary whole-page extraction still fails at the unchanged 256,000-byte cap:
  the reported attempted output is 256,053 bytes.
- `extract-page '.commtext' --limit=20 --max-bytes=64000` with explicit per-item
  bounds retrieves **all 414 matching comment bodies in 21 pages**.
- Every body is byte-identical to its previously source-verified native Markdown
  extraction. Total comment Markdown remains **107,455 bytes**.
- Maximum compact page JSON is **23,296 bytes**, including per-entry metadata and
  continuation data. There are no repeated element references or skipped matches;
  the final page reports selection exhaustion, not whole-site completeness.
- One synthetic transport request supplies the pinned body. Kernel/JavaScript
  guards record zero actual IO attempts. The session, document, transport and
  process group close; private HOME/TMP stay empty.

This invokes the actual command parser/host in-process, not a spawned CLI client
or command-server socket. It preserves all selected body text, not every author,
thread relationship or surrounding navigation element. The earlier source index
retains that additional context. Comments are untrusted source statements, not
verified facts or evidence of Twitter chatter.

## Native qualification

**433 pass / 0 fail in nine explicitly selected native test files**, including
72 new helper cases and 19 new command cases. The isolated candidate build,
new-test typecheck, changed-file formatting and lint checks all pass. This is a
pinned prior source snapshot plus owned changes; pre-existing dirty work is
preserved and not bundled into the change. It is not a full-worktree/full-suite
or actual SafeJS pass.

The first candidate records 421 passes / 12 failures. Corrections fix test argv
matrix shapes, an expectation for an already-escaped control character, mock
receiver typing and lint. Production behavior is not weakened to pass tests.
The first captured replay also preserves its fixture-only omitted-GET assertion
failure; a fresh corrected lane accepts the native transport's GET default.
All original source snapshots, failures and receipts remain at their paths.

Independent source review finds no unresolved correctness/security defect; its
reported validation status predates the parent's final test and replay receipts.
Two nonblocking test gaps remain: matching with a state-dependent pseudo-class
and an exact byte boundary with a nonterminal escaped-selector cursor. The
review verifies their underlying paths by inspection, not those combinations by
execution. A later documentation clarification states explicitly that the byte
cap uses compact page JSON, excluding presentation whitespace and the outer
command envelope; the implementation and tested bounds do not change.

## Remaining scope

No new live website, SDK, credential, device or Zoom action occurs. This does not
solve challenges, host admission, JavaScript-only clients, native media/decode,
recording, transcription or summary delivery. Exhausting a selector is not proof
of complete rendered content. Broader website coverage, research, performance
validation and the native Zoom notetaker goal remain open.
