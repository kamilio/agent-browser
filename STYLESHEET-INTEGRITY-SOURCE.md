# Native stylesheet-integrity source — September 11, 2026

## Outcome and source date

**SRI evidence obtained; HTML anonymous-CORS/Fetch evidence remains incomplete.**
The two authorized public native requests were consumed by a case-only canonical
redirect and its observed target. No site stylesheet or authentication flow was
fetched. The first failure remains preserved, not rewritten as success.

1. `https://www.w3.org/TR/SRI/` returned **301**, with native response
   `Location: https://www.w3.org/TR/sri/`. The one-request guard stopped there.
2. The second and final authorized navigation requested that observed lowercase
   target and returned **200**. Its native reader exposed 44 untruncated headings.

Retrieval date is **September 11, 2026**. The successful response's `Last-Modified`
is **March 20, 2026, 05:28:14 UTC**. This is an HTTP modification timestamp, not a
verified publication date. The selected sections do not establish the document's
publication/status date, and this report does not label it the 2016 Recommendation
or a particular newer draft. It includes `Integrity-Policy` material, which was
not implemented or separately evaluated here.

## Extracted normative framework

Evidence is `sri-canonical/section-1.jsonl`, observed **§3 Framework**, including
§§3.1–3.7. Distinguish author-conforming attribute grammar from parsing recovery:

- **Algorithms:** §3.2 requires SHA-256, SHA-384 and SHA-512. Strength order is
  SHA-512 above SHA-384 above SHA-256. A SHA-256-only implementation is a narrower
  capability, not conformant support for this complete algorithm set.
- **Parsing:** §3.3.2 splits metadata into items, separates `?` options and the
  algorithm/value components, and skips algorithms outside the valid token set.
  Recognized algorithms retain a value entry even when the digest is absent;
  the default value is empty. It does not specify blanket rejection or blanket
  skipping of every malformed recognized-algorithm item.
- **Empty/unsupported-only:** §3.3.4 returns true when parsing yields an empty set.
  That represents no effective integrity restriction, not proof of a digest
  match. Missing/bad digests under a recognized algorithm are distinct: retained
  values still enter strongest-metadata selection and must match the computed
  value; they are not automatically treated as unsupported-only metadata.
- **Strongest and multiple digests:** retain only entries at the greatest
  algorithm strength present. Any matching entry in that strongest set succeeds;
  otherwise validation fails. A weaker digest match cannot rescue stronger
  mismatches. Multiple digests of the same strongest algorithm are alternatives.
- **Digest operation:** §3.3.1 hashes the supplied **bytes**, base64-encodes the
  result, and §3.3.4 compares case-sensitively to the expected value. This is not
  an instruction to hash normalized CSS source or parser output.
- **Options/grammar:** §3.5 permits empty integrity or the stated hash/options
  grammar and requires ignoring unrecognized options. No options are defined by
  the extracted framework. Detailed referenced grammar/Infra token definitions
  were not separately extracted; do not substitute guessed recovery rules.
- **Validation failure:** §3.7 refuses rendering/execution and returns a Fetch
  network error; its note describes an error event. It does not authorize silently
  accepting or applying a stylesheet after a hash mismatch.

## CORS support actually obtained, and remaining gaps

§3.3.4 includes a note about SRI requiring CORS. The second extraction,
**§5 Security and Privacy Considerations**, expressly labels itself **not
normative**. Its §5.3 explains that integrity-protected cross-origin requests need
CORS so content is explicitly shared, avoiding cross-origin content inference.
This rationale is not a substitute for Fetch's detailed eligibility algorithm.

The source includes `crossorigin="anonymous"` examples, but the selected sections
do **not** define the HTML CORS-settings state machine, anonymous request mode or
credentials mode, per-redirect credentials behavior, response-tainting/eligibility,
or precise CORS response-header checks. No separate HTML or Fetch page was fetched:
the two-request ceiling was already consumed. This check therefore does not
confirm whether a proposed request should use `omit`, `same-origin` or `include`,
or that any existing redirect implementation satisfies anonymous CORS.

The exact stage supplying digest bytes is also missing: the selected algorithm
accepts a byte sequence but does not establish content-decoding versus encoded
transport boundaries or Fetch body-processing integration. The native source
captures record encoded/decoded byte counts; those measurements do not resolve
this standards question.

## Measured-site implication — implementation guidance, not acceptance

`TESTPAGES-SCOPED-CHECKBOX.md` records one initially same-origin stylesheet link
with anonymous CORS and a SHA-256 value, rejected before fetch. The private
investigation warns that current stylesheet requests use credentials `include`
across redirects and that legacy wrappers can discard newly added options.
Those are prior local findings, not credential/CORS exchanges run here.

Do not remove the existing guard merely because the initial URL is same-origin
or a SHA-256 digest can be computed. Request/redirect credential semantics,
fail-closed option propagation, CORS eligibility and the correct byte-input stage
remain independent requirements. A bounded initial feature must expose its
unsupported cases rather than claim complete SRI/CORS or current-browser
equivalence. This task changes no loader, transport or verification code.

## Exact native execution and receipts

New lane:
`node_modules/.cache/native-validation/native-stylesheet-integrity-source-september11/`.

| Native operation | UTC start–finish | Result |
| --- | --- | --- |
| `sri/live` | 16:38:30.374–16:38:30.537 | HTTP 301, exit 1; intentional manual-redirect stop |
| `sri-canonical/live` | 16:39:09.976–16:39:10.198 | HTTP 200, exit 0; `extracted-unverified` |
| `sri-canonical/offline` | 16:40:03.670–16:40:03.988 | Two observed native sections, exit 0, zero wire |

The first CLI report records `internal-error` at `network` because the guard
asserted on the 301. `sri/LIVE-AUDIT.json` preserves the precise assertion and
Location header. No reader failure or anti-bot challenge is inferred from it.
The second operation is a new authorized navigation to the observed canonical
target, not an automatic redirect within the first request.

**Totals:** two native primary request calls / two actual wire GETs / zero mocks;
**212,822 decoded bytes / 40,400 encoded bytes**. Each GET omitted credentials and
had no body. No subresource fetch or third request occurred. Native transport
redirect counters are zero because redirects were manual. The failed navigation
has no sections; the successful one has exactly two offline extractions.

| Artifact | SHA-256 |
| --- | --- |
| `sri/response-1.body` (274 bytes) | `6e23543e7d026421b75345e956f66d7721f8f87112e0e551f31540b10280815e` |
| `sri/live.jsonl` | `36d7d572a0755bfb1d8576d805701ed45ad144a9e2374111ecb6b3cb62451cf7` |
| `sri-canonical/response-1.body` (212,548 bytes) | `d6eacb528f89ca8df9b0f6ae602490e102cb3d98ee87c5a9bffb164b4fb5d4ff` |
| `sri-canonical/live.jsonl` | `46784c2efb6570dde6a100a83ef276e1ff28e83e3e2749618dc4bc3ad9fb8c01` |
| `sri-canonical/section-1.jsonl` (125,489 bytes) | `3e8e4382d7b6bfb7467e8dba7abbb5998d6ee2374c24e7df5d5b25f81ea7ace2` |
| `sri-canonical/section-2.jsonl` (8,725 bytes) | `83fadc4279b3e66798f1ebcec45cc5503d2e9a4b32a75f6141e85f28d47da6bb` |

Observed selectors:

- Framework `e953`: `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h2:nth-child(26)`.
- Security `e3166`: `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h2:nth-child(111)`.

## Build, bounds and cleanup

The already pinned **8339-pass** reader was reused in place, not rebuilt or
relabelled as the optional newer 8831 build: 137 selected / 136 strict roots,
one historical exclusion, 1018 source / 1816 compiled files. Source inventory:
`2576328a126835f4089729df176108358d997ade8ebf93e3545fed6da874e0f8`;
compiled inventory:
`a546339fe83ce9cf8d8c649e77a783cd20cbfaa167357e58ecf72da9595deeb4`.

Original `long-v1` reader/document/transport caps, 30+5-second child bounds and
6 MiB output/file limits remain unchanged. All three process groups exited;
both transports closed with zero active requests; offline documents closed to
zero nodes; guards recorded no attempts; private home/tmp directories were empty
and removed. No timeout, cap increase, site-CSS request, authentication test,
SafeJS, alternate browser/HTTP, raw-HTML fallback or device access occurred.

Only this report and new lane changed. Prior evidence/source/build pins remain
unchanged. Per-operation and aggregate verification/receipt files retain the
initial failure, successful source extraction and unresolved requirements. No
production/shared-doc/TASKS/manifest changes or commits occurred.
