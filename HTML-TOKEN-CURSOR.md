# Bounded native HTML token cursor

September 6, 2026. This host-only foundation reuses the actual `HtmlTokenizer`
without building a whole document tree. It does not change default parsing,
reader sanitization, long-v1 limits or the CLI. It is not heading discovery,
DOM/visibility equivalence, a network-streaming parser, or a successful read of
the W3C source whose loader stopped at 50,001/50,000 nodes.

## Contract

`src/html-token-cursor.ts` exports `HtmlTokenCursor`, its options/limits types and
the frozen `htmlTokenCursorLimits` record. Constructor arguments are a primitive
source string, trusted issue callback, optional limits and optional host
`AbortSignal`. There is no general index export or automatic activation.

| Ceiling | Default and maximum |
| --- | ---: |
| Source | 4,000,000 UTF16 code units |
| Native input window | 65,536 code units |
| Logical work | 32,000,000 code units |
| Public read operations | 200,000 |
| Attempted issues | 1,024 |
| Absolute cooperative deadline | 120,000ms |

Options accept only own plain data, known names and safe integer values at or
below these ceilings. Only issue allowance may be zero. Unknown/symbol keys,
accessors, exotic prototypes, coercion and explicit undefined values reject.
The admitted record and its public reference are immutable. Reflection failures
reject statically; portable trusted host options are not promised to be
proxy-inert or a sandbox for arbitrary host mutation of implementation internals.

`next()` shares a cached bounded native window across small tokens. A native
boundary pause can retry once from the unconsumed token start. Continued pause
fails with `html.cursor-window`; its default observed value is the requested
expansion, limit+1, not a measured complete lexeme/document length. Adjacent text
pieces may need concatenation and can split a surrogate pair. Positions count
UTF16 source units, not bytes, display characters or DOM references.

`raw(name, entities=false)` uses the real native raw/script state machine in a
fresh bounded window. The raw body plus closing-prefix lookahead must fit; the
cursor does not silently lose escaped/double-escaped state across windows.
Names match lowercase ASCII `[a-z][a-z0-9-]{0,31}` and `entities` is boolean.
`remainder()` admits the complete remaining tail against the window ceiling
before allocation. True EOF retains native issue behavior, including raw EOF.

Work is requested/materialized window units plus actual native work deltas,
including partial attempts and retries. It is not a CPU/RSS measurement or an
every-inner-step bound. Operations count every public read, including EOF.
Deadline/abort checks surround bounded native calls and callbacks; synchronous
work is not preempted, and a future scanner must explicitly schedule batches.

The optional third `HtmlTokenizer` constructor argument bounds attempted issues
before buffering or delivery. Need-input control is not an issue; provisional
issues later discarded by a partial read still count. A breach is terminal for
next/raw/remainder, including EOF, and insertion/boundary changes cannot reset
it. Later reads produce fresh trusted diagnostics from numeric state. Omitted
quotas preserve existing behavior. Delivered callbacks can be fewer than
`issueCount`; cursor refills aggregate remaining native allowances globally.

Any failed cursor read closes it and leaves the last committed source position
unchanged; counters retain attempted charges. `close()` is idempotent and
releases retained source/window references. Native/trusted callback failures
remain failures, including callback-origin quota diagnostics before actual
cursor exhaustion. Reentrancy and callback closure prevent late publication.

## Isolated validation

Evidence lane: `node_modules/.cache/native-validation/html-token-cursor/`.
Base: `9e48c4cab7a01502b469f6893eedcd72d7d7b128`. The committed source plus only
six focused code/manifest deltas formed each isolated snapshot; pre-existing
dirty source and the two denied parent-RP tests were excluded.

- Native01, 21:38:03.864993557–21:38:08.182580746 UTC: 499 passes, two failures,
  zero pending. Both failures were test matcher inspection of deliberately
  poisoned old error getters, not tokenizer reads retaining those errors. The
  primitive-identity assertion correction preserves the no-getter requirement.
- Setup01 retained six TS2540 diagnostics for a readonly mapped construction
  type and two import-order findings. Independent review also found the public
  limits reference was replaceable. The type, reference authority and imports
  were corrected; original logs and review remain intact.
- Native02, 21:39:35.940320029–21:39:40.141978041 UTC: **503 passes, zero failures,
  zero pending in ten explicitly listed files**, including **188 new cases**
  (139 cursor, 49 issue quota). Production build, ten-file strict checks and
  five-file Biome pass. Two formatter passes were used.
- Actual pre-correction runtime control, 21:40:41.693854971–21:40:43.187541096 UTC:
  the two new reference/accessor replacement cases both fail, as expected;
  zero pass and 137 are unselected. Exactly one of 846 source files differs
  from snapshot02, and that runtime equals snapshot01, not a mock.
- The synthetic 25,001-span fixture reaches native token EOF under declared
  cursor bounds while actual native parsing fails at the unchanged 50,001 node
  attempt. This does not identify what caused the unseen W3C source's failure,
  establish its cursor admission, or claim DOM/heading equivalence.

The ten-file scope also includes native tokenizer-input, comments, doctype,
entities, script-parser, resource-limit, research-loader-limits and
research-admission regressions. It is not the full native suite. Independent
correction review resolves both findings with no additional actionable defect;
its five reviewed runtime/test hashes equal final tested and working bytes.

`AUDIT.json` SHA256:
`7bb51a4bf39dba80f77659762f6879db08b0e9982df565a16d2d74f2cc404d9c`.
The audit verifies 2,699/2,699/855 input entries, final outcomes, source identity,
manifest exclusion and the unchanged 238-entry long-source and 117-entry
long-CLI historical ledgers. Control runner aggregate pending137 denotes
unselected tests, not unfinished execution. No source request or captured-body
decode/replay occurs in this slice.

## Outstanding gates

Next: bounded source-heading candidates with explicit lexical semantics,
source identity/encoding/coordinate rules, scheduling and output limits, then
separately authorized native source admission. Existing failed receipts are
not automatically eligible for decode/replay. No whole-tree ceiling is raised.

Password/passkey page/device/consent integration, modern attestation privacy,
fingerprint consistency and blocked research sources remain open. Native tests
authorize neither external probes nor challenge circumvention. All stopped and
denied gates remain stopped, and the original full browser goal remains active.
