# Interpret a saved Markdown-labeled HTML capture

Ordinary capture replay can explicitly apply the existing
`markdown-html-document-v1` reader policy to a complete capture that was originally
read without that policy. This avoids another website request merely to change
reader interpretation. The original receipt, response headers and body remain
unchanged; interpretation belongs to the replay, not the recorded navigation.

## CLI and API

Build the repository normally before using its compiled CLI. Supply supervisor-
verified receipt/body SHA-256 values and the decoded body byte count, not values
invented from an untrusted page. For example, with those values already assigned:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" \
  --body-bytes "$BODY_BYTES" \
  --content-focus main-content-v1 \
  --reader-mime-policy markdown-html-document-v1 \
  --format markdown --table-rows < capture.jsonl
```

Use `--selector` or `--section` instead of `--content-focus` for an inspected
explicit scope. JSON DOM extraction is supported too. Existing compatible table
options and explicit `--output-limit-policy text-prefix-v1` remain separate.
Neither interpretation nor a nonempty extraction implies factual correctness or
successful page interaction.

The API adds a field to ordinary `extractResearchReplayJson` selections:

```ts
const result = extractResearchReplayJson(
  rawReceipt,
  trustedAdmission,
  {
    contentFocus: "main-content-v1",
    readerMimePolicy: "markdown-html-document-v1",
    tableRows: true,
  },
  undefined,
  "markdown",
);
```

The report's `selection.readerMimePolicy` records the replay request. Actual
interpretation appears in `reader.mimePolicy` and `reader.mimeInterpretation`,
including declared/effective MIME, prefix basis and length. `source` retains the
original receipt/body identities. No policy is inserted into captured metadata.

## Admission and safety

- Opt in explicitly. Without the option, original ordinary replay behavior is
  unchanged, including rejection of Markdown for HTML-only selections.
- Only default-profile, complete, ordinarily admitted captures with exactly one
  declared `text/markdown` Content-Type are eligible. Existing status, barrier,
  integrity and byte limits still apply. Failed or partial captures do not become
  eligible merely because they contain some HTML bytes.
- The capture must not already declare a reader MIME policy or interpretation.
  Already-interpreted captures continue to use existing ordinary replay without
  this new selection field. Malformed original policy evidence still rejects.
- The existing bounded recognizer must find an HTML5 doctype, HTML root, then a
  head/body start tag. Genuine Markdown, fenced/indented examples, fragments and
  unmatched prefixes reject for DOM interpretation. This is not generic MIME
  sniffing. An unfenced full HTML example can remain semantically ambiguous;
  choose this option only when interpretation fits the task.
- Original source-visibility metadata is validated as literal text. Interpreted
  HTML naturally has different omission counts. Its unfiltered source receives
  the existing challenge check before hidden-content filtering or scoped output;
  changing interpretation must not hide an access barrier.
- Original decoding/charset evidence is retained. Scripts, styles and subresources
  are not executed or fetched. No credential, authentication or CAPTCHA bypass is
  introduced, and extraction/output limits do not increase.
- Literal lines/find, link discovery, headings, `long-v1` and named output-limit or
  empty-outline recovery modes cannot combine with the new option. Those modes
  retain their own existing contracts.

## Choose scope by the task

`main-content-v1` selects documented source landmarks, not guaranteed useful
content. A unique article can be only a promotional banner on a storefront. If
inspection establishes products outside it, replay the same capture with a
specific retained container ID or `--selector body`, without content focus. This
requires no new request and does not change the focus algorithm. Verify actual
product/article text and links, not just output byte count. IDs observed in one
capture are not promised stable live-site APIs.

See `RESEARCH-MIME.md` for capture-time interpretation, `REPLAY-CONTENT-FOCUS.md`
for focus/text fallback, and `RESEARCH-JSON-REPLAY.md` for original admission.
