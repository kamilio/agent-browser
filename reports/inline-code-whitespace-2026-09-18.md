# Inline-code whitespace preservation

September 18, 2026. A focused native extraction correction; no live website or
Zoom execution is included in this checkpoint.

## Defect and correction

The Markdown serializer used JavaScript `trim()` to decide whether inline code
needed protective delimiter padding. That treats tabs and Unicode whitespace
like ordinary ASCII spaces. For a source code span containing an ASCII space,
a tab, and another ASCII space, the old output did not protect the edge spaces
from Markdown code-span normalization.

The one-line correction tests for a character other than ASCII space instead.
All-ASCII-space code keeps its existing representation. Tabs, nonbreaking and
other Unicode spaces receive padding that preserves the original code text.
Delimiter selection and line normalization stay unchanged; no HTML, source,
link, execution, network or credential policy is relaxed.

## Qualification

- New synthetic regression file: 12 input cases through each of the native HTML
  parser and the inert research reader, with exact output and decoded code-span
  text assertions. No Markdown parser dependency is added.
- Unmodified serializer with the new tests: **8 pass / 16 fail**. The failures
  retain the actual missing-padding outputs; the baseline is not overwritten.
- Corrected isolated source overlay: **368 pass / 0 fail in 7 selected native
  test files**, including all 24 new cases. Selection is checked against the
  explicit native test manifest. Native network guards observe no attempted IO.
- Isolated candidate build, new-test typecheck, and changed-file formatter/lint
  checks all exit zero. Test and quality process groups close cleanly; temporary
  HOME directories remain empty. No full-worktree or full-suite pass is claimed.

The unchanged neighboring suites cover block links, generic inline wrappers,
table rows, byte accounting, ordinary extraction and literal Markdown. These
are synthetic native checks, not rendered-site equivalence or a measured fix
for any particular live page. The implementation and test files are the exact
files overlaid onto the previously qualified source snapshot.

Independent source review finds no blocking defect. Its two nonblocking coverage
gaps remain explicit: the new matrix does not directly cover CR/CRLF or cleaned
controls, and does not add a padded-whitespace-specific exact byte-bound test.
The existing cleaning and accounting paths are unchanged. The span decoder is a
focused test oracle, not an independently installed Markdown parser. The reviewer
does not independently execute or certify the reported test results.

## Scope remains open

This improves source-text fidelity when agents consume extracted code. It does
not resolve website coverage, crawler blocks, CAPTCHA handling, actual SafeJS
qualification, Zoom client globals, meeting media/decode, admission, recording,
transcription or delivery. No SDK/source execution, real credentials, devices,
TTY, meeting action or push occurs. The broader browser goal remains active.
