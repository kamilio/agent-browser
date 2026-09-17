# Continue-shopping challenge source detection

The native research browser recognizes the small Amazon.com and Amazon.co.uk
source interstitials represented by two saved September 16, 2026 responses.
Their HTTP 200 status and legal footer previously yielded `extracted-unverified`
despite containing no product content.

An eligible response now yields `semantic-barrier` and this diagnostic:

```json
{
  "kind": "challenge",
  "provider": "unspecified",
  "confidence": "possible",
  "evidence": ["html-continue-shopping-challenge"],
  "action": "stop-and-request-user-handoff"
}
```

This is a conservative source diagnosis, not CAPTCHA solving, automatic form
submission, verified vendor attribution, or a new human-handoff UI.

## Recognition contract

`browserChallengeStructure` returns `continue-shopping-challenge-v1` only when
the bounded native tree contains the supported conjunction:

- An HTTPS `amazon.com` or `amazon.co.uk` origin, with optional `www`, no URL
  credentials or nondefault port, and the corresponding literal Amazon title.
- One GET form with exact action `/errors_page/validateCaptcha`, three enabled
  hidden inputs named `amzn`, `amzn-r`, and `field-keywords`, and one enabled
  submit button whose source text is `Continue shopping`.
- One `h4` instruction, `Click the button below to continue shopping`, and only
  the supported regional terms/privacy links and copyright footer as remaining
  body text. Ordinary product, cart, article, or other mixed content is excluded.
- Correct native ancestry and HTML namespaces, without extra forms, control
  overrides, base elements, templates, noscript, or foreign-content examples.
  Explicit hidden/inert/ARIA-hidden and admitted inline `display:none` states
  on the visible shell or its ancestors prevent this signature.

The shared parser-integrity, 512-node, depth-32, inspected-text and attribute
bounds remain unchanged. The raw-response path is still limited to one HTML
content type and 32,768 decoded bytes. Its substring prefilter merely admits a
candidate for inert parsing; the substring itself is never the diagnosis.

Existing status/MIME/header checks, confirmed-header precedence, rate-limit and
service-backoff policy remain in force. The pre-extraction response check works
without opting into a reader-visibility policy. Default reports do not add hidden
input values; explicitly requested raw body capture retains its existing scope.

## Limits and evidence

Other Amazon regions, changed templates, larger pages, computed stylesheet
visibility, authenticity, form actionability, and successful content retrieval
beyond the interstitial are not established. Apex hosts and variable copyright
years have synthetic coverage; the two saved captures use `www` and a 2025 footer.

`reports/continue-shopping-challenge-2026-09-17.md` records native qualification
and saved-source comparisons. There are no new website requests, challenge
submissions, script/SDK execution, identity changes, credentials, or devices in
that validation. The historical 100-page corpus outcomes are not rewritten.
