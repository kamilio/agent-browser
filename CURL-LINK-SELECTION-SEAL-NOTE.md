# Additive curl replay sealing discrepancy note

## Finding and status

**The sealed draft-pin mismatch is real and remains unmodified. Its byte-level cause is now supported by evidence: the declared SHA-256 equals the preserved draft plus one additional final LF, not the preserved draft itself.** The earlier preparation command hashed the untrimmed draft but passed the saved copy through a `trimEnd()` patch emitter. This is an archive-normalization/provenance defect, not a native-browser outcome.

This note does **not** declare the replay report fully audited or accepted by the parent. It corrects my previous implication that successful receipt verification also validated the packaging receipt's embedded draft claim. No sealed file was repaired, regenerated, replaced or deleted.

Authorization: `node_modules/.cache/native-validation/positioned-float-work-september11/curl-seal-discrepancy-prompt.md`. Only this new note and private0700 lane `node_modules/.cache/native-validation/native-curl-link-selection-seal-note-september12` are owned. Inspection used existing artifacts, shell byte/hash/diff tools and available preparation-command context. **Zero native, browser, runtime, test or network execution; no new page extraction, action or commit.** UTC observations began **2026-09-12T00:25:28.936393882Z**; bounded checksum observations completed **2026-09-12T00:26:29.415804945Z**.

## Exact byte facts

All draft/receipt paths here refer to the sealed `native-curl-link-selection-replay-september12` lane unless otherwise stated.

| Object | Bytes | SHA-256 |
| --- | ---: | --- |
| Actual `REPORT-PRECHECK-DRAFT.md` | 13471 | `af0e4e678bb66fa062486da5c8246290762b6a770dbfb9467164b89a4c0b496f` |
| Diagnostic pipe: actual draft minus its final LF | 13470 | `7b024569a27f65fa8c8b1cdb439a502c64d641549dfcf6a80976eeea8fd4576f` |
| Diagnostic pipe: actual draft plus exactly one LF | 13472 | `2bf56e491a253d8f6b4b93b2b298ba1620ce25ef4d6bb15b7a04eb5cf09745a4` |
| Actual `REPORT-PRECHECK-FAILURE.json` | 1057 | `8209ecc761caf422ba93958b2d000947a155e504cb7688dd3b8816b83e71b08f` |
| Actual root `CURL-LINK-SELECTION-REPLAY.md` | 14007 | `397aa620d6dea3511a65f71ed3c9df4f216c7984e5e5f15f4d74c8839f58a107` |

The actual draft ends in hex `69 6d 2e 0a` (`im.` and one LF). Receipt field `draftSha256` at line14 declares the **13472-byte diagnostic stream's** digest while naming the **13471-byte saved file**. The parent's observation that removing the final newline does not match is correct. Adding one LF matches exactly. These two bounded diagnostic streams were hashed only through pipes; neither was written as an alleged original or replacement draft.

All **44 regular files** at the replay-lane root plus its sealed root report were hashed: **45 artifacts, zero matches** for the declared draft digest. None of the **462 recorded hashes** in the existing historical inventory matches either; this was an inventory lookup, not a re-audit of those historical files. No entire-filesystem search was performed. Thus no existing artifact with that digest was found within the explicit bounded search, not a universal claim that one can never exist elsewhere.

## Preparation provenance and limits

The available prior tool-call text shows the unsealed report read as `draft`, followed by `createHash('sha256').update(draft).digest('hex')`. The same command archived it with an Add File helper based on `text.trimEnd().split('\n')`. The initial report writer used `text.split('\n')` on a template ending in LF, retaining a final empty patch line. Exact relevant expressions and their source limitations are transcribed in the new lane's `PREPARATION-CONTEXT.md`; those inline commands were not preserved as original replay-lane script files and were **not executed again**.

This preparation context, together with the exact additional-LF hash match, supports a specific explanation: the receipt retained the digest of the pre-normalization form while the saved draft lost its additional trailing LF. No different wording is needed to reproduce the claimed digest. The evidence supports a generated pre-normalization hash attached to the wrong byte form, rather than an unexplained unrelated copied hash.

**Limit:** the raw13472-byte report is not independently preserved as an artifact in the searched set. A matching diagnostic pipe and a command transcript explain the discrepancy; they do not turn that pipe into a contemporaneously preserved original, prove every historical write independently, or make the receipt's exact saved-draft claim true. The named draft remains13471 bytes with a different hash.

Separately, the preserved draft-to-final-report diff establishes these unsealed report changes: `Offline` became `Isolated offline`; final-ledger count42 became44; and the packaging-failure disclosure paragraph was added. The exact read-only diff is in the new lane's `REPORT-DIFF.txt`. Both currently preserved files end in one LF. File metadata records draft, failure receipt and final report mtime **2026-09-12T00:20:26.479622151Z**; this is not independent proof of the unavailable original bytes. The receipt itself has `observedAt` **2026-09-12T00:20:26.479Z**, `failedAt:null`; no exact failed-invocation timestamp is invented.

## Effect on evidence and prior claims

- **Original-draft provenance:** the sealed statement that the named draft preserves the original bytes with the declared SHA is not valid. Its trailing-LF loss is explained, but the historical receipt stays wrong and the full parent audit remains outstanding.
- **Inner ledger:** all **38 entries** still match their files. Its SHA-256 is `07de46471ac585185aded2f1dec92aed7a3971bee51e5027f131bd01063ea29b`. It predates the packaging draft/receipt and does not include either.
- **Final ledger:** all **44 entries** still match their files. Its SHA-256 is `3cc19caf4bbb91faefa2fa8c947ef39074f44843442fc2fe6ed231b8e64228b0`. Line19 correctly pins the actual `af0e…` draft; line20 correctly pins the receipt containing the incorrect embedded claim. Correct file checksums do not validate assertions inside those files.
- **Verification gap:** the existing48-check receipt is timestamped **2026-09-12T00:17:12.790Z**, before the packaging receipt. Read-only inspection of `seal.mjs` shows the report branch carries that Boolean forward, hashes the actual report/files, and never compares `draftSha256` against `draftPath`. The previous “48/48” and independent ledger checks therefore did **not** audit this new cross-file provenance claim.
- **Native evidence:** the checksum-matched child stdout, body fixtures, selection/cleanup receipts and execution record are unchanged; none was rerun or reinterpreted as a success. The already-recorded replay still selected visible FAQ e408 and failed with `unsupported` at the width-formatting guard, with two mocks and zero wire. The older fresh e82 `not-actionable` failure also remains untouched. This packaging defect alone does not demonstrate runtime/body corruption, but this note is not a substitute for the parent's remaining audit.

## Additive preservation

New-lane `SOURCE-BEFORE.sha256` and `SOURCE-AFTER.sha256` pin the same **46 inputs**: the44 replay-lane files, sealed root report and discrepancy prompt. `FINDINGS.json` records precise facts and limitations; `VERIFICATION.md` records bounded offline checksum verification, not a native test result. Only the new note/lane is sealed by its new receipt ledgers and listed in its `CHANGED-PATHS.txt`. Existing ledgers, reports, locks, scripts and runtime files remain untouched. **Explanation supported; sealed discrepancy not silently repaired; parent acceptance not claimed.**
