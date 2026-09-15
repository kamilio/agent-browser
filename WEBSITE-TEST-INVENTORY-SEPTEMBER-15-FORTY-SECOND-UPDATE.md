# Website testing: September 15, forty-second update

## Get the article, not just a successful status

Two fresh native GETs to one host distinguish a public client-side redirect stub
from substantive content. Both use the pinned `416d4b3` reader, default caps,
captured source and no page scripts, subresources, credentials or alternate client.

| URL | HTTP | Encoded / decoded bytes | Whole Markdown bytes | Result |
| --- | --- | --- | --- | --- |
| `https://docs.pytorch.org/docs/stable/notes/randomness.html` | 200 | 655 / 1,350 | 113 | Redirect stub only; no article |
| `https://docs.pytorch.org/docs/2.14/notes/randomness.html` | 200 | 38,298 / 200,810 | 61,356 | Reproducibility article captured |

The first source contains one labeled Continue link. Its canonical and refresh
hints agree on the same HTTPS-origin destination. A separate bounded scope
follows that actual link: this is a second request, not an HTTP redirect or a
retry of the stub. No `location.replace` or other script executes. There are
zero HTTP redirects across the two visits. The `2.14` path is an observed source
destination, not independent verification of the latest PyTorch release.

Offline native selection of `article.bd-article` recovers 15,267 Markdown bytes
and verifies all 12 article headings, seven code blocks with indentation, twenty
table cells and 52 paragraphs against the captured source. Its whole Markdown
reconstruction also matches the live output. The article has no empty hyperlinks;
the surrounding whole document has seven whitespace-only link labels. The initial
simple `[]` counter missed those seven; that counter and its later qualification
remain in evidence. A source-checker bookkeeping correction is also retained.

The source contains a Cloudflare JavaScript-detection marker, but this alone is
not evidence of an active challenge or permission to execute it. Native reports
retain `barrier: null`, `extracted-unverified`, `partial: true` and
`contentSuccess: null`; content checks do not promote them to full acceptance.
Reader-derived missing-doctype/quirks diagnostics despite source doctypes remain
a separate provenance issue. Compressed-body counts are transport measurements;
wire gzip bodies were not retained for independent hashing.

## Research content actually recovered

The captured article explains that matching seeds does not guarantee identical
results across releases, platforms or CPU/GPU execution. It distinguishes random
number sources from nondeterministic algorithms, and cautions that deterministic
operations can reduce single-run speed while helping debugging and regression
testing. It also distinguishes cuDNN algorithm-selection benchmarking from
whether the selected algorithm itself is deterministic. Backend-specific
attention determinism appears in the recovered table.

For benchmark interpretation, my inference is that software/device configuration,
algorithm-selection settings and determinism settings need to accompany reported
speed or repeatability. These are documentation-derived considerations, not
independent ML benchmarks, hardware rankings or tests of the code examples.
Linked API pages were not visited. The broader hardware/benchmark/Astra/Poe
research remains incomplete.

## Markdown cleanup

Native Markdown now omits destination wrappers for empty or whitespace-only
rendered labels. This fixes `[](<URL>)` permalink noise without dropping source
anchors, JSON link records or explicit link discovery. Neighboring whitespace,
line breaks, meaningful labels, alternative text, code and visible escaped
characters remain. No title/ARIA label is invented. The iterative renderer
checks an active link's rendered pieces without recursively rescanning nested
anchors or allocating a second complete label string.

Four actual offline CLI replays compare identical captured bodies and selectors:

| Captured article | Baseline Markdown | Patched Markdown | Verified change |
| --- | --- | --- | --- |
| Hugging Face `.prose-doc` | 16,092 bytes | 14,437 bytes | Eighteen empty heading wrappers removed |
| Python `.body[role="main"]` | 43,583 bytes | 43,583 bytes | Byte-identical; nonempty paragraph-sign links retained |

Hugging Face's exact byte difference is limited to those eighteen wrappers and
their now-leading whitespace; all other Markdown bytes remain identical. Table
format stays the same across this comparison. Copy labels and other boilerplate
are not silently filtered. Python's previously verified article remains intact.
These are output-size/readability changes, not network savings or rendering claims.
See `EMPTY-MARKDOWN-LINKS.md` for boundaries and retained discovery behavior.

Two additional offline API children verify unchanged JSON/discovery records:
46 Hugging Face anchors and 86 Python anchors remain, including all eighteen
unlabeled HF links with their original empty inline children. HF's complete
51,191-byte selected JSON is byte-identical. Python's default whole-JSON limit
failure remains in both versions; no cap is widened. The six replay children
and PyTorch's separate article-inspection child all exit cleanly with zero
HTTP requests. All 18 HF headings, fifteen code blocks, eight cells, 37
paragraphs and 28 nonempty Markdown links are verified.

The first host verifier's false failures remain recorded: a link regex crossed
lines while normalizing paragraphs, and a JSON check incorrectly required an
empty children array instead of the unchanged empty inline child. Corrected,
source-backed checks pass without repeating native children. Worktree drift
from concurrent parent edits is recorded separately, not relabeled as immutable.

## Validation

The clean candidate is based on `416d4b3` plus this extraction change. All
**2,045 tests in fifteen explicitly selected native files pass**, including 26
new empty-link/whitespace/code/JSON/discovery/structure/budget cases. Build,
fifteen-root strict typecheck, two-file formatting and lint pass. No test timeout
is raised; the per-test allowance remains 5,000ms. The manifest has 853 entries.

Baseline results are retained: 2,025 passes and twenty failures, all in the new
test file. Nineteen expose the intended behavior change; one is an incorrect
expectation for the existing escaped zero-width character representation. The
first patched run is 2,044 passes/one expectation failure; the final fixture
correction accounts for both control-character and Markdown escaping. One new
test lint issue is corrected. All three frozen source/check ledgers remain.
Only `extraction.js` and its JS/declaration source maps change among the 2,208
compiled artifacts; public declaration signatures are unchanged.

This selection does not include or resolve the prior 24 baseline failures, the
two earlier body-capture failures or the old ARIA-test lint issues. It is not a
full native release pass, live-service gate, SafeJS validation, real TTY/PTY or
credential/passkey-device test. Restricted sites remain stopped, without a solver
or identity change. Original dirty work and historical receipts are preserved.

## Evidence

Original lanes under `/dev/shm/`:

- `agent-browser-empty-links-september15`: baseline/first/verified candidates,
  source/compiled pins, all test/check outputs and parent audits.
- `agent-browser-empty-link-proof-september15`: actual HF/Python before/after
  replays, source/content checks, JSON/link-discovery evidence and execution guards.
- `agent-browser-pytorch-reproducibility-september15`: original successful-status
  stub capture, explicitly unsuccessful article check and preserved integrity drift.
- `agent-browser-pytorch-continued-september15`: source-backed continuation,
  article capture, one offline native API child and substantive-content checks.

Durable hash-checked copies use those names without `agent-browser-` beneath
`node_modules/.cache/native-validation/`. Recorded parent worktree changes are
not attributed to evidence-only agents or rewritten as an unchanged worktree.
The overall browser goal remains active. No push.
