# Bounded challenge evidence preserves real text boundaries

Native challenge classification no longer treats a truncated title as a complete
anchored challenge/login title, or invents a word boundary when an admitted body
prefix ends inside a longer word. This corrects a specific source of misleading
possible diagnostics; it does not solve challenges or make null a clearance signal.

## Behavior and bounds

`src/browser-challenges.ts` retains the256-title/8192-body UTF16 evidence prefixes.
A private record tracks normalized text, truncation and whether a word continues
across the cutoff. At most one additional source code unit is inspected, solely
to qualify a boundary; it is never appended to searchable evidence and cannot
complete a marker outside the prefix. The rest of the input is not scanned.

Boundary metadata uses the normalized prefix before trimming. Real trailing
whitespace therefore remains a boundary even when the next source character is
word-like. Separately lowercasing that lookahead preserves the existing non-Unicode
ASCII word-regex semantics, including characters whose lowercase starts with an
ASCII letter. This is not a new Unicode word-segmentation policy.

One shared marker helper rejects a match ending at an artificial word boundary
but preserves an earlier complete match. It covers challenge phrases, Cloudflare
attribution, network-security denial, title-based login text and both social-login
orders. An over-budget title does not suppress independent denial or URL/text
evidence. Genuine punctuation/whitespace boundaries and exact-limit complete
titles remain usable; lookahead never supplies a missing final marker character.

Public response/diagnostic types, fixed evidence/confidence/action fields and
retry metadata remain unchanged. Full header/status/MIME admission and confirmed
`cf-mitigated: challenge` precedence are untouched. No redirect, request policy,
transport/parser, impersonation or automatic challenge bypass is introduced.

Possible HTML diagnostics remain heuristics: ordinary pages can contain intact
challenge-like titles and widget text. Null is inconclusive, not proof of access
or safety. Existing Proxy introspection limits and all live acceptance gates remain.
Historical Cloudflare403, X login, Reddit403 and NVIDIA failures are not reclassified.

## Actual isolated validation — September 8, 2026

The accepted snapshot uses committed8b9dcde source, the exact classifier delta and
one new test. The committed native manifest grows519 to520; the mixed root's two
pending entries are excluded. No dirty package or unrelated source is accepted.

- Formatting01 runs08:31:15.104594383–08:31:15.358593300Z, exit0, preserving originals.
- Setup01 runs08:32:06.028911654–08:32:11.989937916Z: production build0/types0/lint1.
  Two new-test string concatenations require template literals; only those
  equivalent expressions change. The original snapshot/logs remain intact.
- Setup02 runs08:33:45.048327967–08:33:51.209279077Z: build0/types0/two-file lint0.
- First native cohort, named02, runs08:35:20.221407833–08:35:22.328853012Z:
  **171pass,0fail,0pending in two files**. There is no native01 run.

The result is48new cutoff regressions and all123existing classifier cases.
Existing test bytes remain unchanged. New cases call the actual classifier on
synthetic strings without mocks. Existing committed fixtures are not a new source
retrieval or permission to read historical captures. No browser/network/provider/
device/vault/TTY/SafeJS execution occurs. Every actual action has fresh approval.

Static review finds no additional classifier/test defect, but catches a prepared
manifest guard mistakenly expecting219. Parent inspection independently finds it;
the original draft is retained and the guard is corrected to520 before execution.
A separate static follow-up confirms the correction. This is not an actual failed
test run. The later two-expression lint failure is separately preserved.

Native JSON:55709bytes, SHA256
`8ee11085e02768a910d3ac66cb052f67ba2e47e0c5ec9570325e4c072c24129c`.
All2725input pins match before/after, ledger SHA256
`d143695b2df6acb063b8d4755dd01e6b6641bde8b6390047d9449ffbf7b817a4`.
Actual test/input/aggregate/outer statuses are0. Native stdout148bytes identifies
the report path; native stderr and both outer streams are empty. The cohort is
not a full-suite or live-site-generalization result.

Evidence: `node_modules/.cache/native-validation/native-challenge-truncation/`.
Independent integration review finds no actionable discrepancy, confirms tested
root bytes and the narrow working delta, and checks selected actual input hashes.
The parent separately rehashes all2725 inputs. The137-file frozen feature ledger
is SHA256 cd2668c17ba3f5da0792b25485fddc574864dc164bfb5716912d9b9f72c6560b;
all137 entries pass the final opaque-file audit. No validation is rerun to seal it.

The broader browser goal, future diagnostics and outstanding gates remain in
`TASKS.md`; this change does not reopen any denied acceptance operation.
