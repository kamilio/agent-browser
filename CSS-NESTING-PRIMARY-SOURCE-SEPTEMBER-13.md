# CSS nesting: bounded native primary-source research — September 13, 2026

**Outcome: actual W3C source captured and 12 native semantic-reader sections admitted. Syntax/invalid-selector-list recovery coverage is incomplete. This is not an implementation, conformance result, or complete website-rendering claim.**

## Source identity and observed dates

The only actual request was a native GET to `https://www.w3.org/TR/css-nesting-1/`, received at **2026-09-13T15:38:42.283Z**: HTTP 200, `text/html; charset=utf-8`, Brotli, 39,883 encoded bytes and 213,027 decoded body bytes. Zero redirects, retries, subresources, credentials or stored cookies. Transport and fresh cookie jar closed.

The retained native title block is `#title`, document-local `e19`. Its publication/status paragraph `#w3c-state`, `e22`, reads **W3C Working Draft, 22 January 2026**. The same block identifies the dated version as `https://www.w3.org/TR/2026/WD-css-nesting-1-20260122/`. That URL was text in the admitted DOM; it was not fetched. `#sotd`, `e145`, describes a Recommendation-track Working Draft, work in progress that may be replaced or obsoleted, without W3C endorsement. It names the **18 August 2025** W3C Process Document.

The HTTP `Date` is **September 13, 2026, 15:38:42 GMT**; `Last-Modified` is **January 20, 2026, 15:09:13 GMT**. These transport timestamps are distinct from the displayed publication date. None establishes that this is the latest standard, Editor's Draft, or browser implementation status.

Decoded source-body SHA-256:

```text
b29b0db74b96af295efcd7cd94f34366dd099ebb905dc5529c61409184f6fa9c
```

Evidence lane: `node_modules/.cache/native-validation/native-css-nesting-source-september13/`. `source-0-response-1.body` holds the decoded transport bytes; `source-0-response-1.json` holds safe response metadata. The compressed wire body was counted, not retained or separately hashed. `reader-0-AUDIT.json` holds exact unnormalized native text, complete heading labels, fragment/section references, individual text SHA-256 digests, the body digest and capture timestamp. IDs are document-local native identities, not HTML byte offsets.

## Findings and evidence boundaries

The retained `#w3c-conventions`, `e2665`, states that the specification is normative except explicitly non-normative sections, examples and notes. The following distinguishes rule text, examples, explanatory material and worker inference. The semantic reader discards class attributes; example IDs and explicit prose survive, but visual/class-only note classification is not independently preserved.

1. **Nested style rules and implicit descendant behavior.** Normative paragraphs `#nesting` / §3, `e845` and `e851`, allow style rules inside style rules and relative selectors relative to the parent rule's matched elements. Example `#example-82c7d228`, `e917`, equates an inner `a` under `.foo` with `.foo a`; it separately illustrates `&:hover` and leading `+ .bar`. Thus a plain nested selector can express a descendant relationship without an explicit `&`. The precise selector-transformation algorithm was not retained; these findings must not be substituted for its complete grammar.

2. **The nesting selector and specificity.** Normative §4 `#nest-selector`, `e1617`, makes `&` represent the parent rule's matched elements in nested style rules, and `:scope` in other contexts unless otherwise defined. `e1668` excludes pseudo-elements. `e1710` assigns `&` the largest specificity among the parent's complex-selector list, or zero without such a list. Explanatory/example block `e1650` illustrates replacement by `:is(parent-selector-list)`. Example `#example-a71fa710`, `e1743`, gives `& c` under `#a, b` specificity `[1,0,1]`, even when `b` is the matching branch. This is not equivalent to independently distributing selectors with each branch's original specificity.

3. **Interleaved declarations must retain source order.** Normative §3.4 `#mixing`, `e1510`, permits arbitrary mixing of declarations, nested style rules and nested group rules. Declarations after/between rules are implicitly wrapped in nested declaration rules to preserve order. `e1530` places nested style/group rules after their parent for order of appearance. Example `#example-de3f70c3`, `e1522`, makes the trailing red declaration win over the earlier green and nested blue declarations; moving all declarations to the beginning is explicitly not equivalent. The following example `e1545` contrasts ordinary `&` with `:where(&)` specificity. The author-readability recommendation in `e1581` is explicitly a note, not a restriction on valid interleaving.

4. **Nested declarations are not merely an `& { ... }` wrapper.** Normative §5 `#nested-declarations`, `e2098` and `e2104`, wraps consecutive directly nested declarations in a special rule matching the same elements **and pseudo-elements**, with the parent's specificity behavior. Examples `#example-cef45fb3`, `e2172`, and `#example-c3bca626`, `e2216`, illustrate the pseudo-element and CSSOM differences. §6.1 `#the-cssnestrule`, `e2378`, describes `CSSNestedDeclarations`, its ordered style declarations and direct declaration-block serialization. No CSSOM implementation was exercised.

5. **Nested conditional/group rules.** Normative §3.3 `#conditionals`, `e1248`, `e1266`, `e1278`, and `e1425`, allows nesting at-rules whose bodies contain style rules unless otherwise specified; their blocks are parsed as block contents rather than a rule list. Inner style rules take their nesting selector from the nearest ancestor style rule; directly nested properties behave as nested declaration rules. The section lists `@container`, `@media`, `@supports`, `@layer`, and `@scope` (`e1305`). Examples at `#example-81212ace`, `e1406`, are informative illustrations, not independently executed equivalence tests. §3.3.1 `#nesting-at-scope`, `e1462`, says `&` in the scope-start selector refers to the nearest ancestor style rule's matched elements; `e1491` describes its `:where(:scope)` behavior within scope rules. This is not verification of complete conditional/scope semantics.

6. **Invalid selectors: one concrete rule, not full recovery coverage.** Normative §4 paragraph `e1865` preserves the requirement that a type selector come first in a compound: `&div` is illegal; `div&` is the valid arrangement. It also contrasts equivalent `&.foo` and `.foo&`. The retained material does **not** establish general invalid nested selector-list handling, whether one invalid member invalidates a whole list, parser recovery boundaries, or all nested-rule grammar restrictions. Test-link titles containing “invalid” are not evidence that those tests were read or passed.

7. **Expansion risk, not a numeric standard limit.** Explanatory rationale `#nest-selector`, `e1790`, illustrates three three-selector levels becoming 27 selectors under naive distribution, potentially growing to megabytes; it motivates `:is()`-based representation instead. This block is treated as rationale, not as an independently established normative resource-limit clause. No numeric maximum nesting depth, selector expansion size, or permitted heuristic pruning threshold was found in the admitted sections. The worker's own budgets below are research limits, not CSS conformance limits.

**Implementation inference for the parent, not a new diagnosis:** a future scoped implementation should preserve nested-selector parent context and nested-declaration order rather than flatten all declarations into one parent list; it should avoid selector-list expansion that loses `:is()` specificity or explodes combinatorially. These are implications of the retained text, not a prescription that the browser already implements any of it. This worker did not reopen Python attribution, inspect Go, edit production/tests, or run a CSS compatibility test.

## Section text digests

All are SHA-256 of the exact concatenation of the retained heading and native descendant text up to the next heading, with original native whitespace. All 12 admitted blocks are complete within those heading-delimited boundaries, not entire recursively nested chapters. No block was truncated or had an omitted fragment.

| Source anchor / native ref | Text units | Section SHA-256 |
| --- | ---: | --- |
| `#title` / `e19` | 847 | `91b6166454a821e80b70e74a124050085f70ed19fb703d726b9cb314eb612f03` |
| `#sotd` / `e145` | 1470 | `0b5150ec20ca28857a9ae5cb5bbf937bc2e680ba37786e1653b795b67dd1661b` |
| `#nesting` / `e838` | 1543 | `129fdf3962d542e8679fd37c2a0fa54d32e538b04da8889e0ff057ea24832ef6` |
| `#conditionals` / `e1241` | 2891 | `6a3dff9c9a2650a7e16ccff93671df10f0fdefb987c239357c17e51481246038` |
| `#nesting-at-scope` / `e1452` | 557 | `b258655184c9970ac8197ce9fb287bf91c61d67b404faaab03f12a1de9fe3982` |
| `#mixing` / `e1503` | 1956 | `d60a11fb213bec7dd8b6165232500daf5fc0e4bddb84009102b60a6ccd26505b` |
| `#nest-selector` / `e1592` | 5620 | `013e1d9a4a00656e2753e6b5ac6f8dfd90109e36767de467a2304fb83f2e8922` |
| `#nested-declarations` / `e2009` | 4907 | `da2831599b804cc8e7f1c278d2eab523d08bcf1aed4aab880f22619af04f2dff` |
| `#the-cssnestrule` / `e2378` | 1015 | `ec5bbf0aa6add653cb5e2b897b919aecda191c81164264ac35770412e07f9d3a` |
| `#w3c-conformance` / `e2660` | 15 | `ad34410845c8fd36148b582c6b24c6c9efef71ef5c55b50c5cb4f8cea1f26af1` |
| `#w3c-conventions` / `e2665` | 1417 | `0357ad1e4d0cf4565db1cffedcf6ec41cf58509cf5c8d3d0ad235c93e8fcf6bb` |
| `#index-defined-here` / `e2822` | 308 | `8f51a6c10faf98944610ad655d761868ed6f1fbd5f5b2c644b859d94df84b2a8` |

## Execution, audit and limitations

- Runtime only: `native-generated-clear-september13-round00/snapshot01/dist`, historical base `ea00b5b71952efeae0f7467e3c3280b9dc7471bb`. Historical audit: 19,803 passed / 0 failed / 2 existing skips; 384 selected / 383 strict / 749 manifest. No tests rerun and no skipped gate converted to success.
- Full source inventory: 1290 files, `9b0e9de877ee416b542a3169025125a3ba89bbbd4db557d1128b3844520de619`. Full compiled inventory: 2124 files, `86c6dbcfc1a59d787d59432a5feb82cc51b06db4336c10c2c952e4fab7e3dde9`. Inventories verified before and after each supervised phase; final seal verification also checks them.
- Live phase: `2026-09-13T15:38:42.143Z`–`15:38:42.290Z`. Offline reader phase: `2026-09-13T15:40:38.152Z`–`15:40:38.346Z`. Node 22.22.0; pipes; private empty HOME/TMP; 30-second timeout plus 5-second grace; 10 MiB output/file cap. No timeout or stream error. Process groups absent and private directories empty then removed.
- Exactly one native long-v1/default-raw-policy load, 3444 nodes, one native heading query, 54,481 native query-work units, 34,091 explicitly charged traversal/text-copy work units, 12 retained labels, 22,546 admitted text units; largest section 5620 units. Limits: 50,000 nodes / depth 128 / 3,000,000 text units / 1024 changes; 4 queries / 2,000,000 query work / 100,000 walk work / 12 labels / 50,000 retained text units / 12,000 per section. The traversal metric is an explicit harness counter, not a CPU instruction count.
- The reader found 35 headings. Its fixed heading-label selection identified 13 candidates and retained 12; it included an index heading while missing formal syntax/recovery material. No retry, additional native load, second extraction pass, or full-DOM fallback was used to improve that selection. General invalid-list recovery and the exact implicit-`&` insertion algorithm remain unverified. This limitation is selection coverage, not a claim that the specification omits them.
- Reader reports `partial: true`, no styling/scripting/hidden-content semantics, 5 omitted script subtrees, 11 style subtrees, 3 link subtrees and 6 metadata tokens/subtrees, 2061 ignored attributes and 1048 unwrapped elements. Native text is not a screenshot or exact HTML-byte transcription. All document/query owners closed; document node count became zero and query indexes were released. The successful reader did not authorize a full-DOM comparison.
- Offline kernel seccomp and JS network/process guards were active without self-probes; no guard attempts occurred. No Chromium/Firefox/remote browser, `web.run`, raw HTML/CSS research search, historical forbidden payload, scripts, stylesheets, resource loading, SafeJS, actions, geometry, raster, login solving, devices, real TTY/PTY or socket probes.
- `INPUT-PINS.json` binds the source framework files, worker instructions and original build receipts; `FRAMEWORK-CHAIN.json` verifies those framework files against their existing sealed ledger. `RESULT.json`, `TERMINAL-AND-CLEANUP.json`, `EVIDENCE.sha256` and `SEAL.json` are the final explicit-whitelist audit/seal. They bind this report and the handoff. SHA-256 plus read-only permissions is not filesystem-level immutability or independent authentication of W3C content.

No commits, pushes, extra agents, production/tests/global edits, or historical rewrites. Overall browser and independent live/SafeJS/device/credential/TTY/socket acceptance gates remain OPEN. Parent review remains separate.
