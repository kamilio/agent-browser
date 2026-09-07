# Trusted native source-heading rejection diagnostics

September 7, 2026. `scripts/research-source-headings.ts` now exposes
`sourceHeadingStructureDiagnostic(error)` for the existing scanner's own
unsupported-structure errors. This improves observability without widening
parsing policy, raising limits or changing successful candidate output.

## Contract

The getter returns an immutable, internally WeakMap-branded four-scalar record:

- `kind: "source-heading-structure"`.
- `reason`: one of the ten fixed values below.
- `position`: the last committed native cursor position at rejection.
- `positionSemantics: "last-committed-source-utf16"`.

Reasons are `tokenizer-issue`, `unclosed-context`, `ambiguous-text-mode`,
`heading-inline-structure`, `heading-close-structure`, `raw-self-closing`,
`raw-close-structure`, `scope-self-closing`, `scope-close-structure` and
`heading-start-structure`. They identify existing rejection branches, not source
snippets, tag names, attributes, URLs, heading titles or upstream truth.

Position is in decoder-output UTF16 units before parser normalization. It is
neither an exact offending-token location nor a byte/DOM offset. A tokenizer
callback can reject before a read commits, retaining the earlier cursor
position; rejection after an admitted token instead observes its committed end.
No source identity or replay authority is attached to this numeric observation.

Only actual scanner-created errors are branded. Repeated lookup returns the
same frozen record; repeated failures get independent records. The getter does
not inspect properties, prototypes, accessors or proxy traps. Forged/copied
errors, wrapper proxies and unrelated exceptions return `undefined`. Direct
tokenizer exceptions can also remain unbranded; this is not a universal error
classifier. Resource, invalid-input, abort and timeout behavior is unchanged.

The fixed unsupported error code/message, rejection predicates, work/issue
accounting, deadlines, event-loop yields and cursor cleanup remain unchanged.
No public browser-index export, CLI activation, page binding, automatic fallback
or source retry is added. See `NATIVE-SOURCE-HEADINGS.md` for lexical limitations.

## Validation

One exact five-file native run on September 7, 2026,
21:17:52.084605528–21:17:56.183813943 UTC, passes **541 tests**, zero failures or
pending cases. All five files are explicit entries in the committed
`native-tests.json`; this is not a full or near-full suite.

| Test file | Passed |
| --- | ---: |
| `src/research-source-headings.test.ts` | 214, including 48 new cases |
| `src/research-source-input.test.ts` | 105 |
| `src/html-token-cursor.test.ts` | 139 |
| `src/html-tokenizer-issues.test.ts` | 49 |
| `src/resource-limit.test.ts` | 34 |

Production build, five-file strict typechecking and two-file scoped Biome pass;
one formatter pass. New cases cover all ten reasons, UTF16/surrogate and small
window positions, immutable identity, nonexposure and hostile/forged inputs.
Malformed raw closes distinguish tokenizer issue precedence from reachable
nonplain closing-token rejection rather than inventing transitions.

Independent static review found no actionable defect. A read/hash audit checks
all 2,716 native input entries, working/tested source identity and the unchanged
258-file failed-source evidence. No old-runtime negative control was run for
this new diagnostic API. No live request, SafeJS, socket, TTY, vault or device
probe is included in these native tests.

Evidence is frozen under
`node_modules/.cache/native-validation/native-source-heading-diagnostics/`:

- `FINAL-SHA256SUMS`: 45 files, SHA256
  `d7a04875c145800e40429cf70b929cd69ecd941b74c619087e0366f468d98f10`.
- `AUDIT.json`: SHA256
  `5ed0123ddd2c1799b6804747b40b039f45f938a7b72969e7639906a1cceedff3`.
- Runtime SHA256
  `6210c66821df5f496e4f4d2aeda8f59a4dfdb80bbed6854e2564f3ef9758c623`.
- Test SHA256
  `4388d9a46c12b35767f92c4bee99d158d505fff6069e804d1c2aacc7b728fdac`.

## Outstanding gates

`RESEARCH-SOURCE-HEADING-FAILURE.md` records the actual prior fresh source
attempt. Its unsupported construct remains unknown: these synthetic fixtures
do not diagnose that website, and the new getter is not retroactively wired
into its frozen operation. Future activation requires a new bounded wrapper,
classifier-header admission, independent evidence checks and separate source
authorization. Published attestation privacy, passkey page/device/consent,
password-provider live acceptance and the full browser/research goal remain open.
