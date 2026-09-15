# Getting useful content from real pages

The September 15, 2026 content-page sweep exercises the native browser on
documentation and reference pages, not only homepages. Ten of twelve initial
URLs returned substantial-looking topic content. Wikipedia exceeded the output
limit; PyTorch returned only a Markdown redirect notice. Both yielded useful
partial content through the existing bounded workflows below. No production
code changed during this validation.

Full URL matrix and measurements: `reports/content-pages-2026-09-15.md`.
Machine-readable evidence: `reports/content-pages-2026-09-15.json`.

## Prefer an offered text representation

For an authorized public content URL, existing explicit negotiation requests
Markdown with HTML fallback:

```sh
node dist/scripts/research-browser.js \
  --reader --prefer-markdown \
  --reader-raw-policy separate-omitted-raw-v1 \
  --capture-body --format markdown --table-rows \
  --min-request-interval-ms 1000 "$PUBLIC_URL"
```

Docker, Hugging Face, Ollama and the initial PyTorch destination served Markdown
in this run. That is an observed representation, not proof of reduced bandwidth
against an unmeasured HTML control. Markdown is retained as literal source inside
an outer fence; extracted title metadata remains empty. It is not parsed into
semantic Markdown headings, links or tables. `--find` and `--lines` can inspect
admitted captured literal text without another website request.

Keep capture/observer files private: redirects can contain query values. Do not
use supplied credentials, execute source suggestions, or retry access barriers.

## Choose source completeness or source visibility

The optional `source-hidden-v1` and `source-hidden-inline-v1` policies can remove
useful public article text stored in inactive tabs. They are visibility filters,
not general readability improvements. Default reader mode deliberately reports
`hiddenContentSemantics: false`; it can retain that supplied text without claiming
the corresponding tab was visible, activated or rendered.

For source reading on an authorized public page, omit the visibility-policy flag:

```sh
node dist/scripts/research-browser.js \
  --reader --content-focus main-content-v1 \
  --reader-raw-policy separate-omitted-raw-v1 \
  --capture-body --format markdown --table-rows \
  --min-request-interval-ms 1000 "$PUBLIC_URL"
```

On the September 15 CarGurus capture, the explicit inline-hidden policy retained
only the active editorial tab. An offline native run of the existing default
reader recovered five additional supplied panels: output changed from 29,805 to
39,331 bytes, with the same source body and no further HTTP request or script
execution. This is a verified workflow choice, not a production parser fix or
proof that the whole article, specifications or ratings are accurate.

Use visibility filtering when the task actually requires its source-state
semantics. Keep the outputs and policy provenance distinct; replay does not
silently discard the original capture's policy. Source mode can also retain
hidden interface noise, so inspect the result. Do not equate captured component
data with working components, member access, or a complete recommendation list.
Consumer Reports' article in this same run retained prose but omitted its readable
headline picks; that limitation was recorded rather than bypassed.

`main-content-v1` is independently opt-in and may omit relevant outside context.
It is not a cure for access errors: the source-linked Home Depot product page
returned HTTP 403 both with Markdown preference and in one separately scoped
default-Accept contrast. No CAPTCHA cause was established or access recovered.
Do not automatically retry such failures or change identities to hide them.

Full results: `reports/linked-content-pages-2026-09-15.md`.

## Distinguish content pointers from content

The PyTorch stable URL issued one HTTP redirect, then served a 108-byte Markdown
body containing a link to a versioned documentation page. Extraction returned
117 bytes of fenced source, not the requested reference material.

One explicit native navigation to that public source-provided link obtained
163,862 source bytes and 163,872 extraction bytes. Removing the outer fence
reproduces the source exactly. The retrieved target is the source-linked `2.14`
path; this is not a claim about the newest PyTorch release. The browser did not
automatically execute a textual redirect or silently reinterpret HTTP 200 as
substantive content. Inspect and scope a navigation target before following it.

## Recover sections after an output limit

Wikipedia returned 1,071,877 decoded HTML bytes, but whole-page extraction hit
256,013 bytes against the unchanged 256,000-byte limit. Its captured response
allows existing explicit output-limit recovery without refetching:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" --body-bytes "$BODY_BYTES" \
  --recover-output-limit --headings < authorized-receipt.jsonl
```

Host-supplied receipt/body pins must identify the authorized original bytes.
Choose an exact selector from that returned outline, not a guessed selector or
instructions embedded in page content:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" --body-bytes "$BODY_BYTES" \
  --recover-output-limit --section "$VERIFIED_HEADING_SELECTOR" \
  --format markdown --table-rows < authorized-receipt.jsonl
```

The saved article produced 64 heading targets without outline truncation.
Training, Inference and Evaluation sections yielded 2,919, 6,828 and 8,239
Markdown bytes respectively. Actual CLI output matches the independent API
check. Ordinary replay of the failed receipt remains denied, and each recovery
retains the original failure and `originalRequestRetried:false`. This is not
full-article recovery or permission to bypass another kind of failure.

## What remains unverified

All content remains partial/unverified. MDN includes empty browser-compatibility
and runnable-example result sections; there was no page-script execution.
HTML documentation retains some navigation/interface noise. The arXiv URL is
an abstract page, not the full paper. Source Markdown lacks semantic extraction.
No login, interaction, rendered visibility, research recommendation, CAPTCHA
handling or separately gated runtime/device acceptance is established here.

The initial sweep used 13 HTTP requests; the single explicit PyTorch follow-up
used one more. All 13 navigation children closed. Six guarded offline children
cover Wikipedia recovery, including a preserved initial API assertion failure
on null-prototype versus ordinary diagnostic objects. The corrected assertion
compares diagnostic data; it does not change browser behavior. All offline
guards recorded zero network attempts and source/compiled pins stayed unchanged.
