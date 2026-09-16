# Reader option text: fix and captured-page validation

## Result

**Adjacent option labels no longer concatenate in the semantic reader.** A
small production change adds ASCII spaces when unwrapping admitted opening and
matched closing `select`, `optgroup` and `option` boundaries. It does not create
controls, infer selected values or insert attribute labels.

This follows a concrete defect in the arXiv search capture: its page-size labels
became `2550100200`, while field and sort options also ran together. A separate
captured Wikipedia search page has the same defect. Python documentation supplies
a third-host preservation check rather than another claimed failure.

## Production and regression evidence

- Baseline: `6ed46c66016ae4e71816853b151713f2f9c91c3f`, in a clean committed
  checkout. Candidate overlays only `src/research-loader.ts` and the new
  `src/research-option-text.test.ts`; pre-existing root work is not tested as
  candidate production or bundled into the change.
- Source visibility and omission branches still precede boundary insertion.
  Unmatched closing controls add no spaces. Ordinary inline text is unchanged.
- Generated spaces use the existing bounded output emitter. They do not count
  as source text or relax source/text/token/depth/cancellation limits.
- The119 new cases cover literal text and numeric options, groups, empty
  controls, formatting, entities/Unicode, ignored values/labels, unmatched ends,
  all raw/visibility combinations, hidden/omitted content, limits and abort.
  Every created `DocumentTree` is closed.

| Isolated selection | Passed | Failed | Files | Build/types/format/lint |
| --- | ---: | ---: | ---: | --- |
| Clean baseline | 598 | 0 | 7 | All pass |
| First candidate | 699 | 18 | 8 | Formatting failed; others pass |
| First old-production control | 17 | 102 | 1 | Formatting failed; others pass |
| **Final candidate** | **717** | **0** | **8** | **All pass** |
| Final old-production control | 23 | 96 expected | 1 | All pass |

All18 first-candidate failures had the same new-test error: `BeforeSECRETAfter`
was incorrectly expected to contain16 code units rather than17.
The test arithmetic and its formatting were corrected; production was not
changed to satisfy the mistaken expectation. Initial artifacts remain intact.
Only the final96 old-production failures establish the final negative control.

This is an explicit selected native-manifest run, not the whole manifest.
Native tests and actual website/socket/SDK/real-input acceptance are separate.
There is no new runtime dependency or measured speed/throughput claim.

## Captured-page comparison

The three original bodies are read offline, with receipt/body hashes checked.
Each is replayed once through the old clean reader and once through the final
candidate, using raw omission, source/inline visibility, main-content focus,
Markdown extraction and the same bounded output options.

| Captured source | Old Markdown bytes | New bytes | Added sanitizer spaces | Outcome |
| --- | ---: | ---: | ---: | --- |
| arXiv search results | 59,960 | 59,984 | 56 | Field, size and sort labels separated |
| Python asyncio documentation | 66,110 | 66,110 | 24 | Focused Markdown byte-identical |
| Wikipedia search results | 10,094 | 10,102 | 24 | Both pager-option lists separated |

Exact fixture URLs:

1. `https://arxiv.org/search/?query=transformer+inference&searchtype=all&abstracts=show&order=-announced_date_first&size=50`
2. `https://docs.python.org/3/library/asyncio-task.html`
3. `https://en.wikipedia.org/w/index.php?search=HTML+parsing+tokenizer&title=Special%3ASearch`

These are historical capture identities, **not URLs fetched by this change**.
The arXiv capture is from the separately recorded lightweight search workflow;
the Wikipedia capture is from the earlier native form workflow. Python's body
retains its original September15 capture provenance. No original result is
rewritten, and none of these replays becomes a new live success count.

Examples of actual changed output:

| Before | After |
| --- | --- |
| `2550100200` | `25 50 100 200` |
| `All fieldsTitleAuthor(s)` | `All fields Title Author(s)` |
| `20 items50 items100 items250 items500 items` | `20 items 50 items 100 items 250 items 500 items` |

The examples isolate relevant text and omit Markdown punctuation escaping;
they are not exact whole-line snapshots. Existing leading/adjacent whitespace
is not globally normalized. Source text remains in its authored order.

Across all three pairs:

- The sanitized HTML changes only by insertion of ASCII spaces:56,24 and24.
- All non-whitespace Markdown content is identical.
- All412 arXiv,250 Python and49 Wikipedia link-destination occurrences remain
  identical and in order:711 total, not711 distinct URLs.
- Every sanitizer/reader report field except output length remains identical,
  including source/text counts, tokens, omission, raw-text and visibility data.
- Python's theme controls are outside the focused document content; the unchanged
  output is a preservation result, not evidence of a newly repaired visible UI.

## Isolation and integrity

Both replay processes run with the existing kernel-denied network wrapper and
the JavaScript replay guard, isolated empty HOME/TMP, no stdin,256MiB heap and
a60-second supervisor deadline. Socket and io_uring operations are denied; no
socket probe is performed. Both guards record no attempted I/O, every document
closes, each child/group is reaped without timeout or cleanup signals, and both
supervisors report safety success. Six fixture evaluations are not six fetches.

The corpus inventory excludes commented-out Etsy controls, explicitly hidden
Instagram language controls and hidden/empty CarGurus selects. Source ancestry
inspection is not rendered visibility. Hidden arXiv duplicate controls remain
omitted; the patch does not manufacture their text or selected state.

Evidence is under `node_modules/.cache/native-validation/reader-option-text-september16/`:
clean sources/builds, all initial/final test results, `CORPUS.json`,
`CORPUS-NOTES.md`, `REVIEW.md`, `replay-baseline/`, `replay-release02/` and
`COMPARISON.json`. The same-basename JSON report pins supporting artifacts and
original receipts. Existing sealed source lanes remain unchanged.

## Limits and remaining work

No source is freshly fetched, no form is submitted, and no page script/SafeJS,
credential/passkey, alternate browser, challenge solver or real-input probe is
used. The native full parser and form APIs are unchanged. Select choice-state,
group-label interpretation, optional-end stack behavior and external-CSS/UI
semantics are not implemented by this text-boundary fix.

The original100-page judgments remain unchanged. Dynamic search and content,
challenge/human handoff, connection fallback, SafeJS, credentials/passkeys and
real-input gates remain open. The broader browser objective remains active.
Changes are committed locally without pushing.
