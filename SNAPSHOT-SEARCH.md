# Bounded snapshot search

`find` now searches the current native semantic snapshot and returns matching
node refs with ancestor-ref paths and surrounding snapshot lines. It does not
evaluate page JavaScript, fetch another document or consume snapshot-diff state.
The same command host serves the CLI and the existing playground command input.

```sh
agent-browser find "Add to cart"
agent-browser find --regex '/sign (in|up)/i'
agent-browser find --regex '\$[0-9]+\.[0-9]{2}'
agent-browser find "Purchased" --context=0 --max-results=10 --max-bytes=4096
```

Literal search is case-sensitive. Search text is the rendered node line, including
role, name, ref and rendered state, not raw HTML or only the accessible name.
Node lines are numbered from one, excluding snapshot header lines. Default
context is three node lines before and after each match. Overlapping snippets
may repeat context; each returned match still has one primary ref.

`findInDocument` and `renderSnapshotSearch` are exported from the package. Normal
CLI output uses the text formatter; `--json` retains structured matches, counts,
limits, source/result truncation flags and document revision. The supported
regex profile is also advertised under `capabilities.snapshotSearch`.

## Regex profile and resource limits

Patterns use an original bounded, non-backtracking NFA implementation. Runtime
search never constructs a host RegExp from supplied patterns or executes them
as JavaScript. Tests compare a bounded trusted corpus with native RegExp and
exercise nested ambiguous repetition only through the new matcher.

Supported syntax includes literals, dot, classes/ranges/negation, alternation,
ordinary/non-capturing groups, anchors, word boundaries, common character-class
escapes, hex/four-digit Unicode escapes and bounded/unbounded quantifiers. Lazy
quantifiers have the same boolean-search result; captures are not returned.
Raw patterns or slash-delimited patterns with `i`, `m`, `s` flags are accepted.
`i` currently folds ASCII only. Backreferences, lookarounds, named groups,
Unicode properties/code-point escapes and other flags fail explicitly.

- Pattern source: at most 1,024 code units; nesting at most 32 levels.
- Counted repetition: at most 128; compiled automaton: at most 2,048 states.
- Compilation: at most 8,192 expression visits, including empty repetitions
  that would otherwise expand without consuming states.
- Matching: a shared 4,000,000-unit charged work budget across the snapshot.
- Source projection: 1 MiB, 10,000 entries, depth 256, 4,096-code-unit strings.
- Output: defaults to 100 matches, context 3 and 32 KiB of serialized UTF-8 JSON;
  hard maxima are 500 matches, context 10 and 256 KiB.

`matched` counts matches in the scanned projection, even when output limits omit
results. If the source snapshot is truncated, it is not a full-document count.
An empty partial result is not proof of absence. Work exhaustion fails rather
than presenting an incomplete scan as successful. Byte limits govern structured
JSON output, not a promise of identical byte counts in every frontend format.

The underlying snapshot determines visibility, name calculation and protected
value handling. Hidden nodes and password values are excluded/redacted by that
layer; this is not general secret sanitization of arbitrary page text or URLs.

## Evidence and remaining gates

`reports/snapshot-search-focused-2026-09-02.json` records 1,212 passes across 56
files: 58 matcher tests, eight native search tests, two added command-host tests
and existing browser regressions. They cover trusted regex differential checks,
ambiguous/empty repetition budgets, live updates, source/output truncation,
UTF-8 limits, protected content and unchanged snapshot-diff baselines.

`reports/snapshot-search-safejs-fixture-2026-09-02.json` records eight actual
experimental-core command-host checks. A found ref activates an interpreted
handler; subsequent search sees its native DOM mutation. Price/flagged regex,
resource failure recovery and plain output are also checked.

These are in-memory fixtures, not separate CLI/IPC, visual playground, live
terminal, released-SDK or real-site acceptance. Complete ECMAScript regex,
full snapshot semantics, snapshot files/boxes and upstream CLI parity remain
open. P04 is partial, not complete.

Reference inspected September 2, 2026: Playwright CLI README, find and snapshot
search syntax and three-line context:
https://github.com/microsoft/playwright-cli/blob/main/README.md
The upstream CLI itself was not installed or executed for these checks.
