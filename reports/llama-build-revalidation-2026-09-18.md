# Native llama.cpp build-guide revalidation

September 18, 2026. One deliberate later revalidation of a previously failing
public GitHub page, followed by offline checks of the same captured response.
No production code or default policy changes are needed in this checkpoint.

## Fresh native request

Target: `https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md`.

At **09:10:09.751 UTC**, the native browser receives **HTTP200/text/html** with
**642,230 complete decoded bytes**. Whole-document extraction produces **54,535
Markdown bytes**, without prefix fallback, and exits zero. The report correctly
retains `extracted-unverified`, `partial:true` and `contentSuccess:null`.

The exact selection-independent CLI options are:

```text
--reader --capture-body --reader-raw-policy separate-omitted-raw-v1 --reader-visibility-policy source-hidden-inline-v1
```

There is one anonymous native HTTPS GET, no redirect, HTTP retry, alternate URL,
subresource or website-script execution. Ordinary AgentBrowser identity and
credential omission remain intact. The observer records an authorized TLS
connection and closed request/socket; native session/document/transport and
process cleanup also pass. No challenge is observed; this is not challenge-bypass
or general anti-bot acceptance. Existing DNS resolver retries are not changed.

The isolated synthetic proof first checks a592-byte fixture with visible build
text, hidden subtrees and inert raw data: one mockedGET,171 Markdown bytes,
no actual IO or external module load, and full cleanup. Its initial assertion
mistakenly expected unescaped Markdown punctuation; that failure and correction
remain separate. Synthetic200 is not publisher evidence. The preparation worker
never issues live authority or requests; the parent independently finalizes and
spends the one-shot lane.

## Focused source and CLI validation

On the fresh body, `article.markdown-body` identifies one article. Native raw-source
and semantic-reader DOM comparisons match **66 heading texts and56 preformatted
code-block texts**. These are native source comparisons, not an independent
rendering oracle or proof that every page element is retained.

Article selection with Markdown, table rows and compact tables produces **43,811
bytes**. A separate invocation of the existing research replay CLI, under kernel,
JavaScript and module network/execution guards, produces byte-identical article
Markdown from the hash-pinned successful receipt. It makes zero network requests.
No special recovery override, output-limit increase or body refetch is used.

The new extraction-page API also retrieves the56 code-block scopes in six pages,
with every entry identical to individual native extraction. The largest compact
page JSON is20,953 bytes under the64,000-byte cap. This validates another real
captured website with the pagination API; it does not execute any build command
contained in those code blocks.

The original **September15** request remains200 with an unsupported-reader
failure and zero Markdown. Its later offline recovery remains historical, not
a retroactive successful live run. Reprocessing that old body under the current
explicit policies yields the same43,811 article bytes,66 headings and56 code
texts as the fresh capture, although the complete HTML bodies differ. The
mutable `master` URL is not a pinned repository revision or a latest-release
claim. Earlier reference notes are not rewritten.

## Retrieval efficiency

The focused option combination returns10,724 fewer Markdown bytes than the fresh
whole-document output. This is a change of scope and serialization, not a network,
token-count or engine-speed benchmark.

Data-only accounting of the historical body's six code pages measures112,799
compact JSON bytes for56 entries, versus10,785 bytes for their JSON-encoded
content values. Repeated reader metadata values alone occupy47,320 bytes. No
metadata is removed in this checkpoint. Prefer a single article selection when
it fits; use paging when repeated scopes or output limits justify it. The guide's
article and code-only pages are different selections, not compression equivalents.

## Qualification and limits

The immutable runtime reuses **433 native passes in nine files** and green
build/type/format/lint receipts; those suites are not rerun here. Source/compiled
manifests are checked, and six read-path source files match the prior live-read
runtime. New evidence comprises the synthetic/live lane, two guarded source
inspections and one actual offline replay CLI execution. An attempted external
documentation lookup returned no usable text and supplies no native acceptance
evidence. No full-suite or alternate-browser acceptance is claimed.

All relevant captures, source snapshots, failures, guards and process receipts
remain pinned in the JSON companion. Existing uncommitted work is preserved.
No SDK, credentials/vault, passkeys, devices, meeting admission, audio, recording,
transcript or summary delivery is exercised. Hardware recommendations, benchmark
comparisons, Twitter/Reddit research, wider website coverage and the native Zoom
notetaker workflow remain incomplete. Nothing is pushed.
