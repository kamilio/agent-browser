# Native select parsing and option ownership

Checkpoint: September 4, 2026. Native TypeScript implementation only.

## References and scope

Reviewed the current WHATWG HTML in-body parsing rules and nearest-ancestor
select algorithm:
`https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inbody`
`https://html.spec.whatwg.org/multipage/form-elements.html#nearest-ancestor-select`.

The parser no longer applies the legacy select-only tag filter or separate
select-in-table dispatch. Supported ordinary descendants, including wrappers,
buttons, rich option content and textarea, now pass through the shared body,
formatting and table algorithms. This is tree construction, not full customizable
select UI support.

Select end tags use normal scope. Nested select starts pop an in-scope select
without inserting another, but cannot cross an intervening scope boundary.
Select-context fragments ignore select starts. Option, optgroup and hr starts
use implied-end handling when a real select is in scope; arbitrary descendants
that block those implied ends are retained with a diagnostic rather than silently
flattened. Formatting reconstruction is no longer suppressed inside select.

The input exception remains: an input start closes an in-scope select and is
processed outside it, while a select-context fragment ignores input starts.
Textarea and keygen do not use that exception. Keygen now uses the existing void
insertion path, consistent with its native serialization, instead of swallowing
the following option into a non-serialized child subtree.

## Shared option ownership

`nearestSelect` supplies the same ancestor rule to control collections and native
selectedness tracking. Ordinary wrappers and one optgroup are allowed. Datalist,
hr, option, or a second optgroup before reaching select prevent association.
An inner select encountered first remains the owner even if its outer subtree
would be excluded from a different select.

Native collection queries, selected values, host options/indexes and form-data
preparation therefore agree about which options belong to a select. Excluded
options can retain their own selected state without deselecting a valid option
in the outer select. Moving a subtree into or out of an excluded chain recomputes
ownership and resets affected selection; cloning also recomputes associations.
The existing tree-depth limits bound ancestor traversal. No new runtime
dependency or persistent option-owner store is added.

## Validation and remaining work

Three initial regressions fail before integration: rich option descendants,
textarea retention and datalist option ownership. The 45 new tests cover body
and fragment parsing, input exceptions, scope/table boundaries, implied ends,
formatting, ownership exclusions, moves/clones, selection rejection, host
collections, form-data preparation, templates, parser writes and node limits.
The focused native run passes 324 tests across nine files. Existing table/select
and select-fragment tests retain their original assertions.

Full native validation passes 8,797 tests across 243 files. An isolated archived-
HEAD tree with only this checkpoint passes 6,037 tests across its 182 available
files. Production and new-test type checks, builds and six-file lint pass in
both trees. Pre-existing pending work is excluded from the isolated patch and
checkpoint commit; historical reports and measurements remain unchanged.

Preserving button and selectedcontent nodes does not implement selectedcontent
cloning, picker behavior, select-button inertness, customizable rendering or
keyboard/pointer interaction parity. Those are the next consumer requirements,
not acceptance inferred from parsing or native host factories. Foreign content,
framesets, quirks layout and cross-owner observer/runtime breadth remain open.

No SafeJS, live website, socket or real TTY/PTY probe ran. Form tests prepare
requests without sending them. The previously denied SafeJS probe remains
unrun; independent acceptance gates and the seven-day browser goal stay open.
