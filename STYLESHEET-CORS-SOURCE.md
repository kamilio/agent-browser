# Native stylesheet CORS source — September 11, 2026

## Outcome

**HTML state/request mappings obtained; Fetch-specific requirements remain unverified.**
This separate authorization used exactly two public specification GETs, with the
existing 8339-pass native build. Both returned HTTP 200, but Fetch exceeded the
unchanged document-node limit before native extraction. No retry, cap increase,
raw-HTML search, alternative reader/HTTP client, or site stylesheet request was
used. `STYLESHEET-INTEGRITY-SOURCE.md` and its complete lane remain unchanged.

## Extracted HTML requirements

Primary source: `https://html.spec.whatwg.org/multipage/urls-and-fetching.html`.
Evidence is in `html/section-1.jsonl` (§2.5.4 CORS settings attributes) and
`html/section-2.jsonl` (§2.5.1 Terminology), relative to the new lane below.

The §2.5.4 state defaults and §2.5.1 create-a-potential-CORS-request algorithm yield:

| `crossorigin` attribute | State | Request mode | Credentials mode |
| --- | --- | --- | --- |
| Missing | No CORS | `no-cors` | `include` |
| Empty value | Anonymous | `cors` | `same-origin` |
| Invalid value | Anonymous | `cors` | `same-origin` |
| `anonymous` | Anonymous | `cors` | `same-origin` |
| `use-credentials` | Use Credentials | `cors` | `include` |

These request columns describe **create a potential-CORS request**, not every
algorithm that consumes this attribute. Its optional same-origin fallback flag
changes `no-cors` to `same-origin`; it does not change the stated credentials
selection. The returned request also has the supplied URL and destination and
its use-URL-credentials flag set. That source statement authorizes no credential
access in this task: the research requests themselves both used `omit`.

§2.5.4 separately defines a credentials-only mapping for newer features whose
mode is always `cors`: both No CORS and Anonymous map to `same-origin`, while
Use Credentials maps to `include`. Do not substitute that mapping for the
potential-CORS algorithm's missing-attribute `include` behavior.

**Anonymous does not mean `omit`.** The extracted state mapping is `same-origin`.
The linked general enumerated-attribute parsing rules and stylesheet link's
complete caller algorithm were not independently extracted in this task.

§2.5.1 defines response types `basic`, `cors`, and `default` as CORS-same-origin;
`opaque` and `opaqueredirect` are CORS-cross-origin. An unsafe response is its
internal response when present, otherwise itself. These are response-type
definitions, **not** an assertion that an initially same-origin URL remains
eligible through redirects or that a response has passed an SRI/CORS check.

## Preserved Fetch failure and explicit gaps

The second GET requested `https://fetch.spec.whatwg.org/`. The native transport
received the whole HTTP 200 response, but the loader failed with:

`{"category":"resource-limit","stage":"loader","resourceLimit":{"kind":"document.nodes","unit":"nodes","limit":50000,"observed":50001}}`

This is the first native failure in this new lane. It is not a network failure,
redirect, anti-bot challenge, timeout, output limit, or completed source reading.
The body and receipt are preserved for provenance only; no raw-body search,
manual trimming, offline Fetch extraction, or remembered replacement text was
used to evade the cap. There is no usable Fetch heading outline or extraction.

Still unverified from primary extracted text:

- Actual CORS response eligibility/check algorithm and response-header conditions.
- Credential handling, origin tainting, response tainting, URL credentials and
  authorization-header behavior at each redirect, including cross-origin detours.
- Fetch integration of integrity checking and the precise digest-input byte
  stage relative to HTTP content decoding and subsequent text/charset decoding.
- The stylesheet link caller's full fetch/CORS/integrity integration.

The earlier SRI source establishes a digest over supplied bytes. Neither that
fact, these HTML response-type definitions, nor native gzip encoded/decoded
capture counts establish the missing Fetch integration or decode-order rule.

## Local implementation context, not acceptance

The preserved private `stylesheet-cors-investigation-september11.md` reports
existing stylesheet callbacks with credentials `include`, transport redirects,
and a URL-only callback contract whose wrappers could drop added options.
`TESTPAGES-SCOPED-CHECKBOX.md` records an initially same-origin anonymous+SHA-256
stylesheet rejected before fetching. These are earlier local findings, not
newly exercised credentials, redirects, or CORS acceptance here. The parent's
concurrent PageFetch/checkCors/manual-redirect inspection and separate SRI helper
work were not evaluated or modified by this source worker.

Implementation implication: do not remove the guard based only on initial
same-origin status or digest support. Preserve explicit unsupported/fail-closed
boundaries until request semantics and the remaining response/redirect/byte-stage
requirements are established. No production conformance claim is made here.

## Exact execution and evidence

New lane: `node_modules/.cache/native-validation/native-stylesheet-cors-source-september11/`.
All following times are September 11, 2026 UTC.

| Operation | Start–finish | PID | Outcome |
| --- | --- | --- | --- |
| `html/live` | 16:50:34.252–16:50:34.564 | 2921458 | HTTP 200, exit 0, `extracted-unverified`, 15 untruncated headings |
| `fetch/live` | 16:50:42.359–16:50:43.034 | 2921746 | HTTP 200, exit 1, loader node cap |
| `html/offline` | 16:51:05.359–16:51:05.605 | 2922838 | Exit 0, two observed native sections, zero wire |

Exactly **2 native navigations / 2 native request calls / 2 wire GETs / 0 mocks**;
**2,011,002 decoded bytes / 262,843 encoded bytes**, no automatic redirects or
subresource fetches. HTML contributed 81,036 decoded / 14,671 encoded bytes;
Fetch contributed 1,929,966 decoded / 248,172 encoded bytes. Both requests were
bodyless and omitted credentials. Exactly **2 offline section calls**, both HTML,
with zero network/process guard attempts and no navigation.

| Artifact | SHA-256 |
| --- | --- |
| `html/response-1.body` | `af409d5bc26809eb20aefbbd0c7767c173626c3d20c34f63d2c00e2644c151e4` |
| `html/live.jsonl` | `b28055670b543c2f185d0e8574138c616dd741088926fb43304ce50de23b4590` |
| `html/section-1.jsonl` (14,938 bytes) | `42572650ef0485df8cef62d210f7947a264a2b3d6e8bc480d6331e8495f48451` |
| `html/section-2.jsonl` (11,574 bytes) | `f0044f3596b8dfc4f0bb950209cf163f34fa24c89412c79012c89eea487d0a4f` |
| `fetch/response-1.body` | `f72f58d3320c54413fcc95da4e125f07b4141663c6ff7077733909216ad1905b` |
| `fetch/live.jsonl` | `c363ede29359238a39039dc4e2e0606abf8bc0389c5bae8c6ee201ca757e9232` |

Observed live heading selectors: §2.5.4 `e1345`,
`html:root:nth-child(1) > body:nth-child(2) > h4:nth-child(45)`; §2.5.1 `e994`,
`html:root:nth-child(1) > body:nth-child(2) > h4:nth-child(32)`.
Replay references can differ; selections bind the observed title/ref/selector
to the original receipt and match exactly one heading in each native replay.
The semantic reader labels all successful extractions partial and unverified;
they are source evidence, not rendered-browser equivalence or site success.

HTTP Last-Modified values were September 8, 2026, 14:24:04 UTC (HTML) and
September 2, 2026, 14:23:04 UTC (Fetch). They are not verified publication dates.

## Build, caps and cleanup

Reused `native-session-request-queue-september11-round02/snapshot01/dist` in place.
Its historical gate is **8339 passed, zero failed, one baseline exclusion**,
137 manifest-listed selected suites / 136 strict roots, 1018 source / 1816
compiled files. No rebuild or fresh full test pass is claimed. Source inventory
SHA-256: `2576328a126835f4089729df176108358d997ade8ebf93e3545fed6da874e0f8`;
compiled inventory: `a546339fe83ce9cf8d8c649e77a783cd20cbfaa167357e58ecf72da9595deeb4`.
Original gate output: `a0b4c1112fc838feb156a75b7229ff9e1542c6efcc11e9ef6460325d9f6a0b06`.

Unchanged `long-v1`, 30-second child plus 5-second kill grace, 6 MiB file/output
caps; separate one-GET manual-redirect guard per source. Both native transports
closed with zero active requests. All three process groups are absent; private
home/tmp directories were empty and removed. Both instrumented offline document
trees closed with zero nodes; live document-node cleanup was not separately
instrumented, including the failed Fetch loader. No SafeJS, credentials,
devices, sockets outside authorized native GETs, alternate tools or commits.

`verify.mjs`, `VERIFICATION.json`, and `RECEIPTS.sha256` bind captures, section
receipts, execution/cleanup records, report hash and unchanged historical/SRI
evidence. A verification pass means the bounded outcomes are faithfully
preserved, **not** that the failed Fetch extraction succeeded. Only this report
and the new lane were written; no shared source, TASKS, manifest or production edits.
