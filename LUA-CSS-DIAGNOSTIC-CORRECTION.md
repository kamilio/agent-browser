# Lua CSS diagnostic source correction — September 12, 2026

## Adverse finding and outcome

**The parent's finding is confirmed.** The sealed replay's `a` diagnostic points into the word `background-color`, not to the `a` rule. The original 27-check verifier accepted an exact substring slice without checking that the slice represented the reported selector. Its pass and the seal established byte integrity, **not correct diagnostic source attribution**.

The original `LUA-COLLAPSED-TABLE-REPLAY.md`, both native outputs and every file in `native-lua-collapsed-replay-september12` remain unchanged, including the inaccurate excerpts and the original verifier. Their complete original 116-file inventory and both ledgers are reverified. Original final-ledger SHA256: `7bef84e6654e05d07f13ffdf716ca04e9b44314dd31791c4366d2353c63bd73a`.

This new lane exhaustively audits all **38 grouped records**: 19 from each runtime. There are exactly **2 inaccurate records**, the same `a` record in each output. The other 36 records have accurate excerpts and offsets. No extra native page session, navigation, click, HTTP request or original browser probe was performed.

| Historical output | Records checked | Accurate | Inaccurate | Zero-based index | Selector | Original start | Correct span |
| --- | --- | --- | --- | --- | --- | --- | --- |
| old11599 | 19 | 18 | 1 | 7 | `a` | 9 | `[581, 611)` |
| new11784 | 19 | 18 | 1 | 7 | `a` | 9 | `[581, 611)` |

Offsets are zero-based, end-exclusive. For this ASCII stylesheet, UTF-8 byte and JavaScript code-unit offsets coincide. Unicode regression cases separately verify that these units need not coincide.

The incorrect original excerpt begins `ackground-color: #F8F8F8 ;` and continues through the unrelated `body` rule. Both original fields and the entire original record remain in `CORRECTIONS.json`, alongside the corrected record, precise span, whole-rule native identity and explicit changed-field list. Only `rawRule` and `sourceCodeUnitOffset` change. The correct **30-byte** rule is:

```css
a {
	text-decoration: none ;
}
```

Correct rule SHA256: `d1a1550fa56a8e30638e593879e4fc00b0aed2a9c1f273fa098d399d37d9b003`. The native whole-rule parser identifies selector `a`, empty retained declarations, no media context, and `unimplemented-css-property: 1`. This is the original unsupported-property diagnosis, not newly supported CSS or an invented per-declaration diagnosis.

## Exact inputs and unchanged observations

| Original captured CSS | Bytes | SHA256 |
| --- | --- | --- |
| `lua.css` | 2247 | `73e7e5fa61afec5f04f5e43ad5c8348620abc41b8e4671631300b5defe3f2826` |
| `index.css` | 240 | `b6ef324ca66e9ffdafa9e5b5a1478a548aa20f3a23f264eb1bed6d21c1c7d039` |

Both encoded/decoded CSS bodies and their original metadata/raw-header files are byte-preserved and checked. All 19 grouped records per output refer to `lua.css`; `index.css` is still scanned and checked for unaccounted native parser diagnoses. No stylesheet byte is changed or injected.

Every original diagnostic field other than the two source-attribution fields is deeply compared and hash-bound. This includes source ref `e9`, source URL/hash, selector, reason/count, media, applicability, selector failure, matched count and retained matched DOM refs. The authoritative counts remain:

| Diagnostic | Raw, each output | Applicable, each output |
| --- | --- | --- |
| `unimplemented-or-invalid-css-value` | 10 | 5 |
| `unimplemented-css-property` | 11 | 5 |
| `unimplemented-or-invalid-css-selector` | 1 | 1 |

The 19 grouped records represent 22 occurrences per output. The native parser freshly reproduces the 21 declaration-related occurrences; the existing selector failure and applicability/DOM refs are preserved recorded observations, **not rerun selector matching or cascade evidence**. Per-rule parser issue counts and every retained diagnostic-bearing rule are matched against the original grouped records.

The original non-CSS guards remain unchanged: presentation hint 1, display-layout guard 1, collapsed-border guards 7, including the deferred `e401` table. Original DOM data, click/geometry `unsupported` failure and extraction `resource-limit` failure are preserved, not newly observed. This correction changes neither the failed website flow nor collapsed-table support, extraction capacity or acceptance gates.

## Exact-span implementation and scope

`rule-spans.mjs` uses the pinned repository-native `CssScanner`, `skipCssTrivia` and `parseCssRules` from each original runtime. It does not search for the selector as an unanchored substring.

1. Walk the complete stylesheet with native scanner boundaries, preserving positions through comments, strings, escapes and balanced components/braces.
2. Use native trivia handling to identify each qualified rule's actual start; retain both code-unit and UTF-8 byte ranges through its closing brace.
3. Parse each complete rule independently and compare its selector, declarations, media and issue records with the ordered whole-stylesheet native parser output.
4. Resolve only an exact, unique native textual selector identity. Missing selectors and duplicate selectors are rejected, even when duplicate bodies are identical or one rule is empty. Empty/unretained identities are not silently accepted.
5. Compare every original record with its validated span, preserve the original record, and enumerate all changed fields. Recompute raw/applicable totals from corrected records without changing diagnostic content.

Supported scope is **flat, complete top-level qualified rules** with exact native textual selector identity. Leading BOM/trivia, internal comments, quoted/escaped delimiters and custom-property brace content are covered by regressions. At-rules—including media, supports and imports—are explicitly rejected. Malformed scanner boundaries, unresolved or ambiguous identities, and capacity breaches are rejected. This is not a general CSS syntax validator, semantic selector normalizer, nested/grouping-rule resolver, import loader or per-declaration blame engine. Unsupported CSS values/properties may remain diagnosed by the native parser; source-span validity does not imply declaration support.

Correction-only bounds: 32768 source code units, 256 top-level rules, 4096 declarations, with native scanner nesting bounds unchanged. These are smaller than the recorded stylesheet capacities; no page capacity is increased and no page is created.

## Checks and isolated regressions

**21 correction checks and 60 named regression cases pass, with zero failures.** The latter means 30 named assertion groups under each pinned native parser, not a claim that there were only 60 individual assertion calls. Exact names/results are retained in `CHECKS.json` and `REGRESSIONS.json` and are recomputed by the read-only verifier.

Nine checks run separately for each historical output (18 total):

- All 19 records resolve to unique top-level whole-rule spans.
- Complete-span native identities equal ordered whole-stylesheet native identities.
- Every retained rule's native grouped diagnostic counts match the recorded counts.
- Raw and applicable authoritative counts remain unchanged.
- Source refs, matched DOM refs and every non-attribution field remain unchanged.
- Both CSS responses and raw headers match exact archived hashes.
- All original excerpts/offsets are preserved with an exhaustive difference list.
- The original slice-only verification false positive is reproduced.
- Non-CSS guards, DOM, extraction and website failure remain original observations.

Three cross-output checks complete the 21:

- Old/new corrected spans and regression results are identical.
- Strict kernel and JS guards remain active, with no page session or child-process invocation in the offline check.
- The old seal's full membership and every original byte remain intact.

All 30 regression cases, each run under both native parsers:

1. Reproduce the original `a` substring defect and passing old slice-only assertion.
2. Check the captured `a` rule's exact span, native identity and issue count.
3. Distinguish confusable selector prefixes/suffixes and property substrings.
4. Reject a missing bare `a` when only confusable selectors exist.
5. Ignore fake rules inside leading comments.
6. Preserve quoted property braces and fake selectors inside strings.
7. Respect escaped quotes inside strings.
8. Respect quoted braces inside attribute selectors.
9. Preserve body comments containing braces and fake rules.
10. Preserve exact selector identity through internal comments.
11. Distinguish escaped selector braces from block openings.
12. Preserve balanced braces inside a custom-property value.
13. Reject duplicate selectors with identical bodies.
14. Reject duplicate selectors with different bodies.
15. Do not hide ambiguity behind an empty duplicate rule.
16. Reject an empty single rule without a retained native identity.
17. Allow a unique `a` when another selector is duplicated.
18. Distinguish UTF-8 byte offsets from code-unit offsets.
19. Preserve offsets through BOM, leading trivia and CRLF.
20. Reject top-level media scope.
21. Reject top-level import scope.
22. Reject top-level supports scope.
23. Reject an unterminated comment.
24. Reject an unterminated string.
25. Reject an unterminated rule.
26. Reject an unexpected top-level closing brace.
27. Reject a semicolon instead of a rule block.
28. Enforce the source-size bound.
29. Enforce the rule-count bound.
30. Enforce the native declaration budget.

The original flawed browser harness and verifier are archived verbatim before adaptation. The unanchored lookup is retained only in the regression that reproduces the defect, not in the corrected locator.

## Integrity and isolation

29 exact-byte archives include the corrective task, verifier note, instructions, original report, original seal/ledgers/harnesses, both recorded outputs and CSS response evidence. Both original full release snapshots are rehashed: old11599 has 1094 source and 1928 compiled files; new11784 has 1103 source and 1944 compiled files. Both 20-entry gate receipt ledgers and pinned commit-verification receipts remain intact. No rebuild, native suite rerun or manifest edit is performed.

The offline analysis uses Node 22.22.0 at `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`. The strict inherited seccomp policy denies socket/socketpair/connect/bind/listen/accept/send/receive/shutdown, ptrace/process-vm and io_uring operations. No-new-privileges is required. JS network/DNS/process/worker/native-addon guards remain active, and imports for native page sessions, document loading, transport and runtime entry points are denied. There is no socket self-probe, HTTP/client/browser use, real SafeJS, credential, device, TTY/PTY or bypass.

No Git command audit or subprocess call is needed inside the check: pinned complete ledgers, inventories and exact recorded bytes are verified directly. Consequently the IPC workaround in `LUA-VERIFIER-NOTE.md` is not needed, and the socket/socketpair policy is not broadened. The old 27-check verifier is not rerun or represented as validating source attribution.

The supervisor supplies an explicit environment, ignored stdin, piped stdout/stderr, private empty mode-0700 HOME/TMP, 45-second deadline plus 5-second kill grace, 6 MiB per-file/combined-output cap, 16 MiB lane cap and at least 64 MiB free. The initial offline analysis runs September 12, 2026, **04:24:24.035–04:24:24.395 UTC**; supervisor **04:24:23.993–04:24:24.419 UTC**, elapsed 0.42577104829251766 seconds, exit 0, stdout 1410 bytes, stderr 0. No timeout, signal, truncation or cap breach occurs; its process group is absent afterward. These are correction-analysis times, not new browser or HTTP observations.

## New paths, seal and read-only verification

Only these new paths belong to this correction:

- `LUA-CSS-DIAGNOSTIC-CORRECTION.md`
- `node_modules/.cache/native-validation/native-lua-css-correction-september12/`

The lane's `ARTIFACTS.txt` lists every new file plus this report. `CORRECTIONS.json` contains every original/corrected record and difference; `REGRESSIONS.json` and `CHECKS.json` contain all test outcomes; `INVOCATION.json` and `EXECUTION.json` preserve the bounded offline execution. `RECEIPTS.sha256`, `SEAL.json` and `FINAL-RECEIPTS.sha256` bind the report, code, corrected data, archives and receipts with exact membership and byte hashes. The final ledger covers every listed file except itself.

From repository root, run this **read-only** verifier under the same kernel policy:

```sh
env -i PATH=/usr/bin:/bin LANG=C LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B \
  node_modules/.cache/native-validation/native-lua-css-correction-september12/offline.py verify
```

It rehashes the old and new evidence, recomputes all 38 exact-span audits and 60 regression cases, compares the complete corrected data, validates execution bounds and report claims, and prints verification/supervisor results without writing files or launching a native page session. Do not substitute a bare Node command: kernel denial and resource limits are required by the verifier's guard.

No production, shared documentation, manifest, historical evidence, commit or push changes. This report explicitly corrects the earlier attribution claim; it does not revise or conceal the earlier failed website flow or the parent's adverse finding.
