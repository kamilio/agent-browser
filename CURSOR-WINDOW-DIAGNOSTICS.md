# Trusted native cursor-window diagnostics

September 8, 2026. Native cursor-window failures now expose bounded attribution
through `htmlTokenCursorWindowDiagnostic(error)` from `src/html-token-cursor.ts`.
The browser's window cap and parsing behavior are unchanged. This feature does
not retroactively identify the operation that failed in the source08 trial.

## Contract

Only the same actual error created at the cursor's window-limit site receives a
private-map record. The frozen record has exactly four fields:

```ts
{
  kind: "html-cursor-window",
  operation: "next" | "raw" | "remainder",
  position: number,
  positionSemantics: "last-committed-source-utf16"
}
```

`position` is the cursor's last committed UTF16 offset in its supplied string,
not the native tokenizer's speculative position, the bad token's location, a
byte offset or a displayed-character count. For the research scanner the supplied
string is admitted decoder output, but the generic getter itself proves no
decoder, source-byte, publisher or wrapper identity.

Both initial and rebased `next` window refusals use `next`; no phase is published.
`raw` publishes neither the raw name nor entity mode. There are no arbitrary
names, source snippets, attributes, URLs, cursor references or copied payloads.
The existing resource diagnostic remains separate and unchanged. For `next` and
`raw`, its observed `limit + 1` is a refusal sentinel, not the measured complete
token or raw-body length. `remainder` retains its actual remaining-length value.

Unknown-input lookup uses a type guard and private WeakMap only. Fake, copied,
wrapped or proxied errors cannot borrow a record; revoked proxies do not need
inspection. Repeated lookup of the original error returns the same frozen object.
An already branded error propagated from another cursor retains that origin's
operation and position, not the receiving cursor's state. This is not hostile-realm
isolation against in-process mutation of nominal TypeScript-private methods or
module/built-in internals.

## Preserved behavior

- The error object, resource schema, own-property shape, message and absent cause
  remain unchanged. No wrapping or public error field is introduced.
- All four window-limit callsites retain their prior rejection conditions.
  Work/operation/issue counters, checkpoints, close behavior and committed position
  retain their previous semantics. Successful paths allocate no new diagnostic.
- Diagnostic bookkeeping occurs only after the native resource error is created.
  Branding additionally requires the actual window resource kind, a finite operation
  and a safe position within the existing 4M source ceiling; these checks do not
  introduce a new throwing admission or change the original thrown error.
- No window/source/work/depth limit, grammar, scanner policy, source capture,
  default option, CLI/public-index export or dependency changes.

## Validation

| Gate | Actual result on September 8, 2026 |
| --- | --- |
| Scoped formatter | 03:40:31.554081687–03:40:31.646214660Z; exit 0 |
| Isolated build / strict typing / scoped Biome | 03:41:36.853654572–03:41:46.268266338Z; all 0 |
| Five selected native files | 03:42:14.761058096–03:42:21.349282454Z; 1302 passed, 0 failed/pending |
| Cursor suite | 181 cases: 139 retained and 42 new |
| Other selected suites | Headings 933; source input 105; tokenizer issues 49; resource limits 34 |
| Independent evidence audit | 03:43:16.004Z; 2716 inputs, 527 source08 artifacts, 48 prior feature artifacts |

The new tests cover real initial/rebased `next`, raw and remainder window failures;
UTF16 coordinates; default and exact-cap behavior; native tokenizer accounting;
unchanged errors/cleanup; earlier unrelated failures; getter identity and hostile
inputs; and origin preservation through real issue-callback propagation. Injected
same-kind errors are explicitly negative controls, not fake native pause evidence.
All 1260 previous assertion names remain passing. Removing the two new imports and
appended block from the preformat test reproduces the original file exactly.

The isolated candidate comes from commit
`1bc923e5361398f65d392ad552610ac3235b52b3` with exact full-context code mirroring.
Independent runtime review found no actionable defect. The formatter only wraps
one runtime boolean condition; its saved inputs and outputs are retained. Its
first approval review timed out before execution; the single identical retry was
authorized. Build, native tests and audit each ran once under separate approval.

Evidence: `node_modules/.cache/native-validation/native-cursor-window-diagnostics/`.
Its 48-file `FINAL-SHA256SUMS`, all subsequently checked, hashes to
`4e412dad1b485be25cc99a6da7710164d0fc438b4817bfb947765b52166d94f6`.
`AUDIT.json` hashes to
`73c07cf53ecc2bbbe66dcf5c57907c2e407dff77d58844839073a38e25b12b37`.
The audit log is `/tmp/native-cursor-window-diagnostics-final-audit.log`.

## Outstanding gates

No old-runtime negative control, source09 execution, body replay/decoding, socket,
SafeJS, real provider/vault/device or page/privacy acceptance occurs here. Source08
remains its original unattributed failure. Source09 needs a separately frozen
same-engine wrapper, independent controls/reviews and exact request authorization.
Large omitted-raw traversal and native section prose remain separate proposals;
do not infer a raw cause or increase a cap. All denied gates remain closed, and
the original browser improvement goal continues.
