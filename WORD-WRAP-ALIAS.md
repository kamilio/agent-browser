# Legacy word-wrap alias

September 4, 2026 continuation from `cd82f8c`. The native browser now treats
`word-wrap` as a legacy name for `overflow-wrap`, not another longhand or a
shorthand. `OVERFLOW-WRAP.md` retains the preceding emergency-wrap measurements.

## Shared state

Stylesheet and inline declarations canonicalize the alias at parse time. Alias
and canonical declarations compete in one existing cascade slot, including
source order, importance, CSS-wide keywords and variable substitution. Invalid
alias values cannot create another entry or erase a valid earlier declaration.
Custom names such as `--word-wrap` and `--Word-Wrap` keep their original identity.

Native CSSOM exposes both `word-wrap` and `wordWrap` accessors over canonical
state. String methods for get/set/remove/priority share that same state; computed
getters stay live and read-only. Saved objects retain their existing detach,
close, coercion, object-limit and mutation policies. Alias spellings are not
added to indexed declaration enumeration or computed longhand lists. Inline
serialization uses `overflow-wrap`; the computed longhand count remains 73.

The shared name helper is `src/css-property-aliases.ts`. Parser and declaration
entry points use it before existing value/cascade logic. `src/inline-styles.ts`
and `src/computed-styles.ts` add accessor aliases, while native direct computed
reads also resolve the canonical name. No second style owner, layout branch,
runtime dependency, property value set or page-runtime API is introduced.
Existing emergency line breaking, intrinsic sizes, Range mapping and hit targets
come from the same canonical property and retain their prior limitations.

## Native verification

The integration archive is
`node_modules/.cache/native-validation/word-wrap-integrated.4zA9oU`.
The two new explicit files contain **57 passing cases**:

- `src/word-wrap.test.ts`: 23 parser/cascade/supports/layout/intrinsic cases.
- `src/word-wrap-cssom.test.ts`: 34 native host-object/CSSOM/lifetime cases.

The final **15-file** regression runs report **582 passes plus one unchanged
baseline failure** in the isolated tree, and **583 passes plus that same failure**
in the working tree. They are not fully green regression suites. The retained
failure is `src/styles.test.ts`, “keeps CSS computed values cached through
text-value edits but not relevant mutations”; exact-base worker evidence
reproduces it before alias changes. No unrelated cache implementation is changed.

Both project no-emit checks and builds using `--outDir dist` pass. Strict checking
of the two new tests and scoped Biome over five new/clean files pass. Full checks
of `css-parser.ts`, `css-declarations.ts` and `computed-styles.ts` retain their
three pre-existing import-order diagnostics, independently reproduced on the
committed baseline archive. Import-only reordering was not swept into this
feature where it overlaps pending user work. Existing source changes remain
separate from the focused commit.

Final evidence uses the prefix
`node_modules/.cache/native-validation/word-wrap-integration-final-`.
Both manifests retain **384 unique entries**, with 22 separately pending working
tests absent from the isolated archive. No full-manifest result is inferred.

Earlier attempts remain visible:

- The parent baseline has 17 failures / six passes. The first parser integration
  has one fixture-assumption failure / 22 passes: a variable-bearing longhand does
  not carry the special pending marker used for multi-component shorthands.
  Matching the actual canonical declaration shape yields 23 passes.
- The independent CSSOM baseline has one new-file pass / 33 failures. CSSOM-only
  changes improve that to 18 passes / 16 dependency-blocked failures; no provisional
  pass count was treated as complete parsing support.
- Replay against actual parent production passes all 34 unchanged CSSOM tests.
  Its four-file regression retains 123 passes and the same baseline cache failure.
  Source hashes, original delivery and actual-source replay are preserved in
  `parallel-word-wrap-cssom-cd82f8c/delivery/README.md` and `REPLAY.md` in the cache.
- Isolated synchronization encounters pre-existing import/statement ordering.
  Applied file portions are inspected before retry, and only intended semantic
  hunks are integrated. No broad reset, whole dirty-source copy or unrelated
  formatting change substitutes for pending-work preservation.

## Capture equivalence

`parallel-word-wrap-capture-cd82f8c/FINAL.md` and `comparison.json` in the cache
record thirty actual injected-native host captures across ten cases. The baseline
uses committed `cd82f8c` with canonical declarations; integrated and working
captures use actual alias declarations in nine cases, with the default case
remaining declaration-free. Original CSS spelling intentionally differs; only
normalized fixture CSS is compared where appropriate, not falsely identical HTML.

Every canonical-to-alias and integrated-to-working PNG pair is byte-identical:
zero changed pixels. Lines, glyph/source mapping, boxes, paint and snapshots match.
The cases cover ordinary/nowrap behavior, emergency policies, whitespace priority,
decorated inline fragments, preserved whitespace and width mutation. All captures
are nonempty, artifacts are exported/deleted, final lists are empty and hosts
close in finally blocks. The decorated inline alias image was visually inspected.
This is ASCII native equivalence, not live-browser or Unicode shaping evidence.

## Space and open gates

A baseline-format launch could not start when root space reached zero. With
approval, the completed 139 MB snapshot at
`/tmp/parallel-control-text-hit-c0a717c.dgYWWt` was copied to
`node_modules/.cache/native-validation/retained-control-text-hit-c0a717c`, verified
with `diff -qr --no-dereference`, and its old path replaced by a symlink. No
unrelated evidence was removed, and original historical paths remain usable.
`word-wrap-disk-recovery.md` in the cache records the incident. This frees space
temporarily; it does not establish overall disk health. New work remains on HOME.

Native factories, injected transports and ASCII rendering do not prove actual
SafeJS, live-site, socket, terminal, service-process or cross-runtime parity.
General CSS text/shaping, neighboring word-break/line-break/hyphenation features,
full native-suite authorization and original browser acceptance gates stay open.
The until-stopped browser goal remains active.

## Primary references

Reviewed September 4, 2026: CSS Text Level 3 section 5.4 requires the legacy name
alias; CSS Cascade Level 5 section 3.1 defines canonical parse and CSSOM behavior.

```text
https://www.w3.org/TR/css-text-3/#overflow-wrap-property
https://www.w3.org/TR/css-cascade-5/#legacy-name-alias
```
