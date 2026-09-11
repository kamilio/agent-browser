# Reusing unchanged computed custom-property maps

September 11, 2026: computed custom-property resolution now returns the inherited
map when resolving the element's declarations produces exactly the same key set
and values. The motivating MDN capture repeats theme declarations on `:root *`;
previously every such element retained a full equivalent map until the existing
CSS variable retention limit rejected navigation.

Resolution still runs before comparison. This preserves cycle detection,
fallbacks, inherited computed aliases, CSS-wide keywords, null/empty distinctions
and case-sensitive values. A new key, even one computing to null, or any changed
value keeps a distinct map. Only specified keys need comparison because all
other entries are inherited unchanged. Map copying and value comparison work are
charged; no property, recursion, work, retained-binding or retained-text limit is
increased. No sibling interning cache or new dependency is introduced.

The style owner already accounts for shared inherited maps by identity. Returning
an equivalent parent therefore avoids retaining duplicate bindings rather than
clearing counters or miscounting newly allocated retained maps. Genuinely
different scoped maps still consume the original retention budget.

## Evidence

The new tests cover nine unchanged-map identity cases, five changed/new-key cases,
and a native wildcard-theme fixture that previously exceeded retained bindings.
That fixture checks 102 inherited names, changed child scope, descendant reset,
and style mutation/recovery. Existing cycle, property/value bounds and genuinely
distinct retained-binding failure/recovery tests remain included.

The isolated unchanged-code baseline in
`node_modules/.cache/native-validation/native-custom-map-sharing-baseline-september11/`
passes 63 and fails 10 cases: the nine sharing expectations plus the wildcard
fixture's actual `CSS variable retention limit exceeded` error. The improved
implementation passes all 73 custom-property core cases.

The clean `c226acb` snapshot overlaid only `src/css-variables.ts` and
`src/css-variables-core.test.ts` in
`node_modules/.cache/native-validation/native-custom-map-sharing-september11-round01/`.
Build, strict checking, formatting and 112 explicit native files pass from
09:59:24.792 to 10:01:02.259 UTC: **6687 passed, zero failed, one existing
baseline assertion excluded**. Source inventory remains 1006 stable files; the
549-entry native manifest is unchanged. The core variable test was already
manifest-listed and is newly included in this selected validation set.

Strict checking covers 111 roots, retaining the documented snapshot typing
exception while including that file at runtime. The existing excluded
focus-provisioning-pressure assertion remains an acknowledged failure.
Validation denies networking and makes no live-site, rendering, SafeJS,
credential or TTY/PTY acceptance claim. Captured MDN replay is a separate gate;
the earlier failed replay and its original measurements remain unchanged.
