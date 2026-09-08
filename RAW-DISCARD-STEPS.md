# Bounded native raw-discard steps

Validated core implementation, September 8, 2026. This is an explicit
cursor capability, not yet selected by the research scanner or exposed through
the CLI/package index. It does not establish recovery of the source09 failure.

## Surface

`HtmlTokenCursor.discardRawStep(name)` accepts exactly one primitive lowercase
name: `script`, `style`, `xmp`, `iframe`, `noembed` or `noframes`. A selected cursor
window must be at least16 code units. Invalid names, extra arguments or smaller
windows fail closed with `invalid-input`; old methods retain their former smaller
window admission. The caller chooses the starting body position: this method
does not certify that a corresponding opening tag was consumed.

Each call returns a frozen three-field record:

```ts
{
  status: "more" | "end-tag" | "eof",
  position: number,
  discardedCodeUnits: number
}
```

Position is the absolute committed UTF16 offset in the supplied string, not a
byte offset or displayed-character count. Discarded units describe this call's
advance, not a claimed full element/payload length. No raw text, attributes,
source excerpts, mutable parser state or name log is returned.

- `more` commits progress in one bounded window; call again with the same name.
- `end-tag` leaves the closing prefix's `<` unconsumed. The caller must still use
  ordinary tokenization and validate the entire closing token. Its syntax and
  window/issue limits are not bypassed.
- `eof` follows one `unterminated-raw-element` issue at actual source EOF. It can
  return only if the caller's issue callback accepts that issue; it is not a
  successful element close. A subsequent call begins a new operation.

While continuation is active, `next`, legacy `raw`, `remainder`, a changed name
or invalid arguments fail closed without advancing the committed position.
`close` clears the private continuation and remains idempotent. Terminal results
clear continuation; no session object is exposed or accepted from callers.

## Native semantics and bounds

The implementation uses one source slice per step, at most the configured window.
Nonfinal windows reserve10 trailing units for the longest11-unit close delimiter;
overlap is copied and charged again. A `more` step advances at least6 units with
the minimum16-unit window. No speculative refill, concatenated carry buffer,
full-source regex or hidden multi-window loop occurs in the new method.

Script transitions share the legacy tokenizer's native data/escaped/double state
recognition. Exact comment prefixes, ASCII case-insensitive script names and the
seven native delimiters retain their order; `-->` resets either non-data state.
Only finite private phase and a two-dash count survive a boundary. This is
native lexical equivalence, not a new claim of complete HTML-spec conformance.

Other selected names use their existing case-insensitive close-prefix semantics.
Raw NUL/entity-like text is not decoded or newly diagnosed, as on the existing
non-entity raw paths. `title` and `textarea` are deliberately excluded; their
legacy entity-aware `raw` behavior and window refusal remain unchanged. Generic
legacy raw-name matching and returned text are not replaced by the new method.

Source4M, window65536, work32M, operations200000, issues1024 and timeout120000ms
remain hard ceilings; lower caller selections remain effective. Every step uses
the same cursor, original deadline, abort signal and accumulated counters. One
step is one operation, including terminal/invalid calls after the first checkpoint.

Work is copied units plus one unit per transition dispatch, each full attempted
prefix width, and bounded dash inspections. Copy is charged before slicing;
prefix widths are charged before comparison even on short EOF/early mismatch.
Dash inspection costs1 at local0, otherwise2; successful `more` adds2 for carry,
including non-script sessions. Terminal returns need no carry update. No legacy
offset-work is added again. Total per-step work is at most25 times its copied
window plus2. Dense prefixes, small-window overlap or deadlines can refuse input
below the source ceiling; traversal is not guaranteed and no cap is raised.

Failure retains charged work/operations/issues but the previous committed offset.
Actual EOF increments the issue count and checks its cap before callback delivery.
Throwing callbacks preserve error identity. Callback reentry, close, abort or
deadline expiry prevents result publication, even if a reentry error was caught.

The existing trusted cursor-window diagnostic remains `next|raw|remainder` only.
The new method does not forge a raw-window record for admission/work/issue errors;
a genuine subsequent `next` or legacy raw refusal retains its normal attribution.
An already branded error propagated from another cursor keeps its origin record.

The internal tokenizer session export assumes cursor admission; it is not a
separately hardened hostile-input API. Private continuation does not certify
hostile-realm isolation against mutation of legacy nominal-private fields,
prototypes or built-ins.

## Validation and remaining gates

| Gate | Actual UTC result on September 8, 2026 |
| --- | --- |
| Initial format | 04:29:36.111046801–04:29:36.288146501; exit 0 |
| Initial setup | 04:30:16.802279392–04:30:25.368633299; build/strict 0, Biome 1 |
| Corrected format | 04:31:56.224701277–04:31:56.378765429; exit 0 |
| Corrected setup | 04:32:33.263881944–04:32:41.693685190; build/strict/Biome 0 |
| Six selected native files | 04:33:10.726819298–04:33:17.377368604; 1443 passed, 0 failed/pending |
| Pinned evidence audit | 04:34:51.637; 2716 current inputs, 551 source09 and 48 prior-feature artifacts verified |

The cursor suite has 263 cases (82 new), tokenizer input 48 (43 new) and tokenizer
issues 60 (11 new); headings 933, source input 105 and resource limits 34 remain
unchanged. All 1302 previous assertion names pass, plus five previously existing
input cases added to this validation scope and 136 new cases. The audit restores
only the added `describe` imports before byte-checking all old test prefixes.

Initial setup's lint rejection of `arguments.length` is preserved. A typed rest
tuple retains exact runtime arity/name admission. Parent static review also fixed
one new test's conservative-overlap expectation before native execution. There
was no native failure; the sole native run used corrected snapshot02. Both setup
snapshots remain intact. The first formatter approval review timed out without
execution, followed by its sole identical approved retry; later approvals passed
first try.

Independent static core review found no actionable defect before formatting and
the mechanical rest-tuple fix, which parent review reconciles explicitly. Finite
fixture coverage is not exhaustive equivalence, an allocation audit or measured
throughput. No new dependency is introduced.

Frozen evidence: `node_modules/.cache/native-validation/native-raw-discard-core/`.
Its 92-entry `FINAL-SHA256SUMS` has SHA256
`a0058931804ec575ae6cbfedef7206bd19efc59a7937d6ebda7cf4d321633f94`.
The 2716-entry native ledger is
`6ec1368eedd2265b5fef55bf1e11b5a1d221b6ba6db22ee0e55dbd94ee6f8ae5`;
`AUDIT.json` is `7dd014bcdfba41e1ffe35da5092fa950702476050f6d1d888e24cfd746ffbb9b`.
Final tokenizer/cursor identities are
`72991e3e8bfe5eeb2ff17635ecb7c732848338a24bd200cc08acd99c6a42a900` and
`ecd02a5f0af8d0fa9cde154f085253213f27d5f197ad2f31c79f427144f068c3`.

Scanner opt-in, report/counter disclosure, operation/verifier controls and any live
trial remain separate future work. Source09 identifies raw at1824525, not its name,
entity mode or full payload size. This feature might not apply to that failure.
No live request, historical body/capture replay, vault/device/page/SafeJS/privacy
acceptance or stopped/denied gate is authorized by native validation.
