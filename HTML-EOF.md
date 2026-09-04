# Native HTML end-of-input handling

Checkpoint: September 4, 2026. Native TypeScript implementation only.

## Reference and supported behavior

Reviewed the WHATWG HTML tokenizer and tree-builder EOF rules:
`https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state`
`https://html.spec.whatwg.org/multipage/parsing.html#end-tag-open-state`
`https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inbody`
`https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-incdata`
`https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-intemplate`.

The native body EOF check now reports `unclosed-elements-at-eof` once when its
retained open-element stack contains a tag outside the permitted EOF list. It
does not diagnose optional paragraph/list/ruby/option/table-section ends merely
because their explicit closing tag is absent. Unlike body-end scope lookup, EOF
inspection is not stopped by a table or another scope boundary.

After-body and after-after-body EOF paths do not repeat a prior body-end error.
Ordinary late content still reenters body processing and receives its own EOF
check. Pending table text is flushed before inspection, retaining normal foster
placement. Diagnostics do not remove or rearrange the resulting document nodes.

## Templates, text and boundaries

EOF unwinds actual template frames from the parser stack, synchronizes formatting
markers and then checks any remaining outer body frames. It retains the existing
`unclosed-template` count for those hosts. The virtual fragment context is not
treated as a real open element. A virtual template without an actual template on
the stack stops without applying the body EOF list to its content frames.

The text-mode path reports `eof-in-text` when no closing tag was produced,
including an incomplete end tag discarded at EOF. Existing tokenizer diagnostics
such as `unterminated-tag` and `unterminated-raw-element` remain separate. An
unterminated script remains unexecuted. Plaintext remains a body-path element,
not a text-mode element.

A final literal `<` or `</` now emits its complete literal opener and one
`eof-before-tag-name` diagnostic. A bounded input checkpoint still pauses with
the input unconsumed. Completing the name in another chunk does not generate a
false EOF diagnostic; releasing an unfinished boundary to true EOF does.

## Bounds and evidence

EOF stack visits consume the existing immutable scope work budget and check for
cancellation. Template unwinding is bounded by the existing parser stack and
formatting work budgets. No new runtime dependency or document allocation is
introduced by diagnostics. Native parse metadata remains immutable, contributes
to snapshot issue totals and is cleared when its document closes.

Three initial regressions fail before their fixes. The 66 new tests cover the
EOF-permitted list, non-optional ends, table boundaries, template unwinding,
fragment contexts, text-mode and partial-tag EOF, document-write boundaries,
script non-execution, work limits, cancellation and snapshot/lifecycle behavior.
The focused native run passes 428 tests across ten files.

Full native validation passes 8,752 tests across 242 files. An isolated archived-
HEAD tree with only this checkpoint passes 5,992 tests across its 181 available
files. Production and new-test type checks, builds and four-file lint pass in
both trees. Pre-existing pending work is excluded from the isolated patch and
the checkpoint commit. Historical measurements and reports are unchanged.

## Remaining requirements

These are named native diagnostics, not a claim of one-to-one WPT parse-error
reporting or complete tokenizer/tree-builder conformance. Modern select, foreign
content, framesets, full quirks layout and cross-owner observer/runtime behavior
remain open. Native script hooks are not a page runtime. No SafeJS, live website,
socket or real TTY/PTY probe ran; the previously denied SafeJS probe remains
unrun. Independent acceptance gates and the seven-day browser goal stay open.
