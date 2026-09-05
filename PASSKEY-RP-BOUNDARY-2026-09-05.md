# Passkey RP boundary evidence — September 5, 2026

## Finding and scope

The retrieved WHATWG predicate **rejects a requested ancestor that jumps above
a deeper public-suffix boundary of the caller**. Checking only that the requested
RP is not itself a public suffix is insufficient. The algorithm also checks the
original host's public suffix. This closes the specific predicate-definition
gap left by the earlier bounded research attempts.

With the suffix rules stated in the review, both cases reject:

| Caller | Requested RP | Original host's public suffix, given those rules | Decisive comparison |
| --- | --- | --- | --- |
| `tenant.s3.amazonaws.com` | `amazonaws.com` | `s3.amazonaws.com` | Ends with `.amazonaws.com` |
| `login.foo.kawasaki.jp` | `kawasaki.jp` | `foo.kawasaki.jp` | Ends with `.kawasaki.jp` |

These conclusions apply the acquired algorithm, not examples alone. The exact
PSL entries for these two cases were **not independently refreshed in these
lanes**. The stated PRIVATE/wildcard rules are premises; an exception or different
trusted snapshot must be evaluated using its actual prevailing rule.

This document records research, not policy activation, implementation tests,
complete WebAuthn conformance, PSL freshness, or runtime/device acceptance.
All source acquisition described here used this repository's native browser.
Writing this handoff involved only local reading and checksum verification;
no additional public requests, tests, builds, source or index changes occurred.

The separate tested parent-RP implementation remains uncommitted: its focused
commit was denied pending explicit informed user approval for broader
parent-domain credential authorization. Preserving these sources does not
authorize that expansion or an alternate route to the denied commit.

## Sources and evidence locations

For the artifact references below, `C` means
`node_modules/.cache/native-validation`; `R` means
`node_modules/.cache/native-validation/browser-research`. These are path
abbreviations, not additional locations or new copies of historical evidence.

| Label | Official source | Preserved artifact location |
| --- | --- | --- |
| MDN creation | https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialCreationOptions#id_2 | `C/rp-policy-captured-mdn/extraction.json`, `extracted.md`; original captured bytes in `C/mdn-reader-diagnostic/response-body.bin` |
| MDN get | https://developer.mozilla.org/en-US/docs/Web/API/CredentialsContainer/get#exceptions | `R/passkey-rp-followup/01-mdn-get.jsonl`, `01-mdn-get.md` |
| MDN request | https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions#rpid | `R/passkey-rp-followup/02-mdn-request.jsonl`, `02-mdn-request.md` |
| WebAuthn Level 1 | https://www.w3.org/TR/2019/REC-webauthn-1-20190304/ | `R/passkey-rp-boundary-definition/01-webauthn.jsonl`, `01-webauthn.body`, `01-webauthn-context.md`, `offline-context.json`, `offline-context.md` |
| Linked HTML predicate | https://html.spec.whatwg.org/multipage/browsers.html#is-a-registrable-domain-suffix-of-or-is-equal-to | `R/passkey-rp-definition-redirect/read.jsonl`, `wire-2.body`, `context.md` |
| HTML examples | https://html.spec.whatwg.org/multipage/browsers.html#example-registrable-domain-suffix | Same final response; `R/passkey-rp-definition-redirect/example-table.json` preserves an offline native JSON table extraction |

Each research lane retains its own Markdown prompt, commands, report, original
JSONL/time/stderr and checksum ledger. This handoff does not replace or revise
those reports, including reports that correctly described a then-unresolved gap.

## Acquisition chronology and preserved failures

All times in this section are **UTC on September 5, 2026**. A receipt time is
used only where the native report actually contains a response receipt.

| Event | Exact time | Result and distinction |
| --- | --- | --- |
| Earlier Level 3 attempt | Run 05:12:19.137–05:12:19.265 | Network-stage `resource-limit`, no primary response receipt. `R/passkey-rp-policy/02-webauthn-authorized.jsonl`; unchanged URL was not retried in the followups. |
| Earlier MDN creation read | Receipt 05:13:02.357 | HTTP 200, 169,283 decoded bytes, then loader-stage `unsupported`. `R/passkey-rp-policy/04-mdn-authorized.jsonl` remains a failure. |
| Separate MDN diagnostic capture | Receipt 05:25:23.513 | Captured the same 169,283-byte body hash. `C/mdn-reader-diagnostic/capture-receipt.json` and `response-body.bin`; distinct from the earlier receipt. |
| Corrected native MDN replay | Offline 05:34:16.677 | `C/rp-policy-captured-mdn/extraction.json`; no new HTTP request. |
| MDN get followup | Receipt 05:36:29.804 | HTTP 200, 170,227 decoded bytes; readable partial native extraction. |
| MDN request-options followup | Receipt 05:36:37.074 | HTTP 200, 154,254 decoded bytes; readable partial native extraction. |
| Level 1 whole-document attempt | Receipt 05:37:22.419 | HTTP 200, 1,282,709 decoded bytes; loader completed, full extraction hit `resource-limit`. `R/passkey-rp-followup/03-w3c-level1.jsonl` remains unchanged. |
| Level 1 scoped retrieval | Receipt 05:44:55.797 | New authorized native retrieval; same body hash as the preceding failure, now using bounded native root extraction. |
| Zero-redirect HTML attempt | Run 05:45:10.526–05:45:10.613 | Network-stage `resource-limit`; no primary response, status, body or Location returned. `R/passkey-rp-boundary-definition/02-definition.jsonl`. |
| Level 1 neighboring context | Offline 05:46:31.578 | Eight additional scoped extracts of the saved native body, not another live retrieval. |
| Exact linked HTML request | Receipt 05:55:49.087 | HTTP 301, 185 decoded bytes; actual same-origin Location preserved. |
| Location target | Receipt 05:55:49.192 | HTTP 200, 206,596 decoded bytes; definition and examples acquired. |
| HTML table verification | Offline 05:56:48.252 | Native JSON extraction of the saved final body, preserving rows/cells; no network. |

The zero-redirect failure's record does not establish its precise cause or a
security denial. The later successful request directly establishes a 301 at
that later time; it does not retroactively add missing headers or an error
message to the old record. Likewise, an earlier extraction failure is not
reclassified as successful merely because a later scoped extraction succeeded.

### Exact redirect provenance

The final phase started **only** at the W3C source's actual retained link:
`https://html.spec.whatwg.org/multipage/origin.html`.

Its HTTP 301 Location was exactly
`https://html.spec.whatwg.org/multipage/browsers.html`. That target returned 200.
Both have the same HTTPS origin. The separately authorized scope permitted at
most two ordinary redirects and three wire requests; **one redirect and two
wire requests** were used. No guessed route, other origin, extra URL, HTTP retry
or challenge workaround was used. The unused request allowance was not spent.

The native transport used manual redirect mode so each receipt and Location
could be recorded and checked before following. Its automatic redirect metric
therefore remains zero; the harness's explicit redirect ledger records one
followed redirect. Final metrics are two requests, 30,468 encoded bytes,
206,781 decoded bytes, zero mocked requests, zero active requests and closed
transport. No challenge diagnostic or network/extraction failure occurred.

The phase's first approval review timed out before execution and explicitly
permitted one review retry; that retry approved the unchanged scope. This was
not an HTTP retry or an actual approval denial. Failure handling in the final
harness preserves error/cause messages up to 4,096 characters with truncation
flags and up to four causes; this successful run had no errors to record.

## Response-body identity

These hashes identify **transport-decoded bodies before the native loader**,
not extracted Markdown, compressed wire bytes or an implementation build.

| Source/body | SHA-256 |
| --- | --- |
| MDN creation, both recorded receipts | `84d9aa7e6eef1cdf6c10a5d0dcc9f77055ba693370045b7e9c05e4affd5ad96d` |
| MDN get | `067f3af341d8db7da44b7294223ceadfb2c599f2637aa219d0683a46050281bc` |
| MDN request options | `f610f7c2973e3ac0d349f33c926bf5477c866a8f52c5a0bca530eba08af20261` |
| WebAuthn Level 1, failed-full and successful-scoped receipts | `0173a74367a88ac40cc2564abe4b4d5af000a3d81e3eec50bcb14fb16106062e` |
| HTML 301 body | `3e11dd6b24715dd0503dcf35302d987848f748ec38c686b8a11e575a12b6b254` |
| HTML final definition body | `1730d098a60defe272799a0a29554bc0b22bdf36427e9671c49f26ba566663b5` |

Saved bytes support independent verification of MDN creation, scoped Level 1
and both HTML responses. The MDN get/request CLI runs did not export original
bodies: their body hashes remain native receipt measurements, not hashes that
can be independently reconstructed from Markdown. Their JSONL and derivative
artifact hashes were independently checked without conflating those scopes.

## Guidance versus normative evidence

### MDN explanatory guidance

The recovered creation-options guidance distinguishes the HTTPS caller origin
from an RP domain: its `login.example.com` example uses origin port 1337 while
the accepted RP values contain no scheme or port. Its examples accept that
host or `example.com`, but not a deeper child or bare `com`.

The request-options page distinguishes two checks: the browser relates the
requested RP to the caller's domain, while the authenticator relates that RP to
the credential's own RP ID. Omission defaults to the caller's domain; an empty
credential allowlist does not waive RP matching. The get exception entry itself
only describes an invalid calling domain, not a complete suffix algorithm.

These are MDN explanations, not normative proof of PRIVATE/wildcard semantics.
They support keeping caller eligibility, the selected RP and credential
namespace separate. They do not independently specify client-data origin
serialization or authorize dropping a nondefault caller-origin port.

### Historical WebAuthn predicate context

The acquired WebAuthn source is the **March 4, 2019 Level 1 Recommendation**.
Live native roots `e3797` and `e5207` preserve the effective-domain default and
create selection/check; `e7554` preserves the get check. The historical create
anchor is `#CreateCred-DetermineRpId`. Offline neighboring roots `e5147` and
`e5121` preserve valid-domain and opaque-origin checks; `e7580` preserves assigning
the validated supplied get RP to the selected RP variable.

Both create and get reference the same named HTML predicate and reject failed
eligibility with SecurityError. This reference was initially insufficient to
settle boundary skipping: the definition itself was still missing. The later
actual linked HTML retrieval supplies it; no definition was inferred from the
predicate's name alone.

### Captured HTML algorithm

In `R/passkey-rp-definition-redirect/context.md`, live roots `e1644` and `e1661`
preserve the enclosing definition and complete algorithm; `e1754` isolates the
decisive **step 4.3.2** branch. A short source excerpt is:

> hostSuffix, prefixed by U+002E (.), matches the end of originalHost's public suffix

That condition returns false. In summary, the algorithm rejects empty or
unparseable candidates. For unequal parsed hosts it requires domains and a
dot-delimited ancestor relationship, then rejects a candidate equal to its own
public suffix **or** a candidate above the original host's public-suffix boundary.
It subsequently asserts that dot plus the original host's public suffix ends
the candidate. Exact parsed-host equality bypasses the unequal-host checks.

The official illustrative table corroborates the difference: `amazonaws.com`
is rejected for `www.example.compute.amazonaws.com` but accepted for
`test.amazonaws.com`, under the table's stated suffix assumptions. Its live
table root is `e1793`; the offline JSON table root is `e1777`. References are
load-local, not interchangeable persistent source IDs. The saved body hash
ties both extractions to the same source. Table cell boundaries were retained;
missing rowspan cells were not invented. The conclusion comes from the
algorithm, not those examples alone.

The HTML source is a **Living Standard retrieved September 5, 2026**. This does
not prove its wording was identical in 2019 or constitute a full current
WebAuthn Level 3 audit. The separately linked URL Standard public-suffix
definition was not fetched in the exact-origin scope. Data-section selection,
list completeness/freshness and the concrete matcher remain separate concerns.

## Implications and remaining gates

- A same-registrable-boundary restriction is consistent with the verified
  deeper-boundary rejection. A bare equality check is not the full predicate:
  same-boundary siblings still fail the domain-label ancestor condition.
- Preserve candidate-public-suffix rejection, trusted snapshot handling and
  canonical-domain admission. No equivalence proof for an arbitrary matcher,
  malformed dataset or implementation follows from these excerpts.
- Strict same-host defaults and explicit trusted-policy opt-in remain project
  choices. Research does not activate a parent-RP path or establish that it
  exists, is wired correctly or passes tests.
- Do not automatically normalize or admit unsupported IP/numeric forms, root
  dots, schemes, ports or related origins. Generic HTML equality examples do
  not override WebAuthn's separate domain checks or project exclusions.
- Keep selected RP namespaces exact throughout provider context, credential
  selection, consent, persistence and assertion hashing. Do not replace the
  actual caller origin with the selected parent RP, or search alternate RP
  namespaces after a miss.
- Full implementation/security review, trusted ICANN/PRIVATE data policy,
  lifecycle tests and separately authorized guest-runtime, real-vault and
  hardware/passkey acceptance gates remain outside this evidence.

## Native bounds and measurement limits

The followup acquisitions use the fixed isolated native build
`C/reader-marker-integrated.qF5Iaq/dist`, not a rebuilt shared `dist`. The earlier
failed research and diagnostic capture retain their original build provenance;
they are not relabeled as runs of the fixed build.

Transport/source limits stayed at or below 2,000,000 bytes/code units as
applicable. Native DOM limits remained 50,000 nodes, depth 128 and 2,000,000 text
code units, with the reader's own stricter text/token/output limits unchanged.
Scoped extraction used existing native queries, tree relationships and actual
root references, without source-ID reconstruction or DOM mutation.

| Phase | Live extraction | Offline contextual extraction | Combined scoped bytes |
| --- | --- | --- | --- |
| Level 1 boundary definition | 18 scopes; 18,602 bytes | 8 scopes; 9,983 bytes | 28,585 |
| HTML redirect definition | 23 scopes; 25,578 bytes | 1 JSON table scope; 9,022 bytes | 34,600 |

Every scope stayed within 32,000 bytes and each phase within 256,000 total,
including overlapping scopes and serialized extraction metadata. The largest
live HTML scope was 2,263 bytes; the offline table was 9,022. No scope failed in
these successful scoped phases. The earlier MDN Markdown payloads were 36,359
and 24,796 UTF-8 bytes under their separate 256,000-byte whole-extraction limit.

All outputs remain partial native reader results: scripts/styles/other subtrees
are omitted, hidden-content semantics are not implemented, and source IDs are
stripped. Success proves readable selected source content with provenance, not
layout parity, complete browser compatibility or authentication acceptance.

## Independent handoff checksum verification

Existing ledgers were verified read-only with `sha256sum -c`; none were
regenerated, edited or used to overwrite original integrity logs. Every command
returned **exit 0**, with **no checksum mismatch or missing-file exception**.

The ten repository-relative ledgers below were checked from
`/home/kjopek/project/agent-browser` during **06:00:28.278–06:00:28.396 UTC**:

| Ledger | Successful entries |
| --- | ---: |
| `R/passkey-rp-followup/SHA256SUMS` | 23 |
| `R/passkey-rp-followup/INPUT-SHA256SUMS` | 1,584 |
| `R/passkey-rp-followup/PARENT-SHA256SUMS` | 2 |
| `R/passkey-rp-followup/REFERENCED-SHA256SUMS` | 2 |
| `R/passkey-rp-boundary-definition/SHA256SUMS` | 21 |
| `R/passkey-rp-boundary-definition/INPUT-SHA256SUMS` | 1,584 |
| `R/passkey-rp-boundary-definition/PRIOR-FAILURE-SHA256SUMS` | 3 |
| `R/passkey-rp-definition-redirect/SHA256SUMS` | 18 |
| `R/passkey-rp-definition-redirect/INPUT-SHA256SUMS` | 1,584 |
| `R/passkey-rp-definition-redirect/PRIOR-SHA256SUMS` | 3 |

Two additional relevant ledgers were independently checked:

| Ledger | Required working directory | Successful entries | UTC verification interval |
| --- | --- | ---: | --- |
| `R/passkey-rp-policy/SHA256SUMS` | Its own `R/passkey-rp-policy` directory, because entries are lane-relative | 20 | 06:01:06.724–06:01:06.728 |
| `C/mdn-reader-diagnostic/SHA256SUMS` | Repository root, because entries are repository-relative | 33 | 06:01:13.125–06:01:13.131 |

The diagnostic captured body was also directly hashed during the latter check
and matched the MDN creation hash above. Total: **4,877 successful ledger-entry
checks across 12 ledgers**, with overlapping paths and three repeated 1,584-file
fixed-build inventories. This is not 4,877 unique artifacts or a test count.

Coverage limitation: historical ledgers cover their enumerated files, not every
later file in a directory. The new handoff prompt and this document are not
retroactively added to those ledgers. Original source receipts, failed attempts,
measurements and ledger coverage remain unchanged. No project tests were run
for this documentation handoff, and checksum success is not a browser-policy
acceptance gate.
