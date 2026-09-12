# Libpng captured replay comparison and parent verification

## Result

The native quirks-image fix changes the retained Libpng badge from a deferred
element to a replaced text alternative. It does **not** make the full website
interaction pass. Both captured runs commit the homepage and attempt one genuine
current-DOM FAQ click; native width resolution rejects the click before any
destination request.

| Captured runtime | Non-CSS guard occurrences | Deferred entries | Badge |
| --- | ---: | ---: | --- |
| 12817 / `3890c33` | 58 | 9 | Deferred element |
| 13042 / `9654150` | 57 | 8 | Replaced `imageAlternative` |

Each run uses the same 23 original captured responses, with 23 native mocks,
zero wire requests and zero new attempted hosts. Raw, applicable and formatting
CSS issue counts are empty in both observations. These are captured replays,
not additional live website validations. The historical live capture remains
dated September 12, 2026, 08:56:00.180–08:56:06.428 UTC.

The badge keeps its original Transitional doctype, source, alt text and
80-by-15 attributes. Its image owner remains broken, policy-denied, complete,
natural size zero and without decoded pixels. No SourceForge request or body
exists. The new 432-by-16 intrinsic text metadata and computed 80px-by-15px
dimensions are not a measured whole-page used rectangle. Global guards still
prevent that measurement; isolated image tests establish the separate native
sizing/painting behavior described in `QUIRKS-IMAGE-ALTERNATIVES.md`.

## Independent parent checks

The parent compared fresh local Git object bytes against each lane's captured
commit/tree/blob proof, then executed its read-only verifier under unconditional
kernel socket/socketpair denial. Neither verifier reruns the browser.

| Evidence | Parent finish UTC, September 12 | Actual Git objects | Snapshot inputs | Read-only check groups | Sealed entries |
| --- | --- | ---: | ---: | ---: | ---: |
| 12817 baseline | 10:34:34.653 | 10 | 7 | 14 | 219 |
| 13042 follow-up | 10:50:57.293 | 13 | 10 | 16 | 231 |

Both verifiers exit zero, record unsupported website acceptance, and leave their
final ledgers unchanged. Baseline ledger SHA256:
`578fc1c557e86ca89105da71eee7032331925d9a11ea9923159905e99e303f46`.
Follow-up ledger SHA256:
`a2e1d9686d3830764e18fdfa6901dd719b03a02673a0a1fa6d5ba871269e01a7`.

Parent summaries and stdout hashes are retained under
`node_modules/.cache/native-validation/quirks-image-work-september12/parent-baseline-replay-verification/`
and `node_modules/.cache/native-validation/quirks-image-work-september12/parent-quirks-replay-verification/`.
Full inputs, UTC intervals, discovery observations, failure receipts and
read-only verification commands remain in `LIBPNG-BORDER-BASELINE-REPLAY.md`
and `LIBPNG-QUIRKS-REPLAY.md`; their sealed report bytes are unchanged.

## Remaining investigation

The remaining census contains 31 general HTML presentation-hint occurrences,
16 table presentation-hint occurrences, two inline vertical-alignment
occurrences and eight table display markers. Counts are guard occurrences,
not necessarily distinct failing attributes or unsupported algorithms.

In particular, `src/formatting-tree.ts:1472` permits matching
`display-layout-not-supported` markers when its flex/grid/table coordinator
callback is supplied. The eight table roots therefore do **not**, by
themselves, prove eight missing table layout algorithms. Retained table
attributes and other hard guards require investigation before any table
compatibility claim. No guard is suppressed, source repaired, capacity raised
or partial layout substituted in either replay.

Full live navigation, rendering parity, performance, research, credential
providers, passkey devices, TTY, real SafeJS and challenge handling remain
separate outstanding acceptance gates.
