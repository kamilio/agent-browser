# Prefer a publisher's Markdown representation

The read-only research browser can ask a publisher for Markdown at the same
public URL. After building, use:

```sh
node dist/scripts/research-browser.js --reader --prefer-markdown \
  --capture-body --format markdown "$PUBLIC_URL"
```

The opt-in flag sends `Accept: text/markdown, text/html;q=0.9`. It does not change
the browser identity, guess a `.md` URL, execute scripts or make a second request
when the server ignores the preference. HTML responses use the existing reader;
Markdown responses retain their source as inert literal text. Default requests
are unchanged. This is representation negotiation, not a challenge solver.

The API equivalent is `ResearchExecutionOptions.preferMarkdown: true` for
`researchNavigation`. Reports record `representationPreference: "markdown"`;
the actual response MIME and body remain the evidence of what the server sent.
`contentSuccess` remains null for an unverified extraction. A preference alone
does not prove semantic completeness or publisher support.

## Compatibility and limits

- Requires `--reader` and the default document profile. DOM selectors, heading
  outlines/sections and `long-v1` are rejected before a request because literal
  Markdown does not supply the HTML structure those modes require.
- Whole-document output, text `--find` and `--lines` are allowed. Text selection
  still requires an actual admitted literal response; an HTML fallback does not
  acquire source-line semantics. Markdown is not rendered into links or tables.
- Credentials stay omitted. Public-network policies, source/output limits,
  redirect limits, pacing and challenge/rate-limit handling are unchanged.
  There is no automatic retry, alternate URL or HTML refetch on failure.
- A server may ignore or reject the preference. Stop at access restrictions.
  Do not assume lower latency or identical content merely from a smaller body.
- Saved Markdown remains subject to the literal-loader workflow; this option
  does not widen the existing HTML replay CLI's admission rules.

## Measured publisher example

Native observations recorded at September 15, 2026, 00:20:35 and 00:20:46 UTC
requested the same Ollama hardware URL. Default HTML transferred 38,404 encoded
body bytes (297,611 decoded); the explicit Markdown preference transferred 3,788
(12,570 decoded), a 90.1% reduction in encoded body bytes for this pair. Each
navigation made one real HTTP request with zero redirects or mocked requests.
Both extracted hardware content. The Markdown body exactly matches the separately
captured publisher `.md` page. The representations are not claimed byte-equal,
and this one-publisher comparison is not a general latency benchmark.

Original experiment receipts and scope are preserved under
`node_modules/.cache/native-validation/accept-probe-september15/`. See the
thirty-ninth website inventory for integration validation and other observations.
