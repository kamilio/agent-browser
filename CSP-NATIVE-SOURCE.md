# Native CSP primary-source capture — September 12, 2026

## Result and scope

One authorized native GET and one separately locked offline native parse completed.
No production implementation, policy bypass, tests, manifests, TASKS, Git objects,
old lanes, or historical reports were changed. This report and
`node_modules/.cache/native-validation/native-csp-source-september12/` are the
only owned outputs. The worker authorization is preserved in
`archive/SOURCE-TASK.md` within that lane.

The immutable early extraction is `EXTRACTED.json`: **52,603 bytes**, 19 selected
headings, 20,300 bytes of native semantic text, 64 observed and unfollowed
references. Its SHA-256 is
`7175d1740a6d8b587e0522b6f1ffa31216a626d3483a315671a50ebcd71cd3ee`.
This is useful but incomplete research, not CSP conformance evidence or
authorization to admit currently blocked images.

## Capture identity and chronology

All times are UTC on September 12, 2026:

- Before integrity check: `18:53:30.692Z`.
- Live supervisor interval: `18:53:36.259148Z`–`18:53:36.519709Z`.
- Native HTTPS request: `18:53:36.434Z`; decoded response saved: `18:53:36.513Z`.
- Offline extraction: `18:56:01.553Z`–`18:56:01.799Z`.
- After integrity check: `18:56:11.932Z`.
- Report evidence cutoff: `18:57:08.918Z`; final sealing time is in `SEAL.json`.

Target and final URL: `https://www.w3.org/TR/CSP/`. HTTP 200,
`text/html; charset=utf-8`, native title **Content Security Policy Level 3**.
Exactly one request and zero redirects. The native transport used its original
DNS/public-address checks and verified TLS 1.3 to `www.w3.org`, with
`AgentBrowser/0.1`, a bodyless GET, manual redirects, and omitted credentials.
No request cookie, authorization, or proxy credential header was present.
The server supplied a response cookie, preserved privately in the raw metadata;
the cookie jar accepted and retained zero cookies. No cookie was replayed.

- Encoded response: 128,008 bytes, Brotli; SHA-256
  `874135ecf322a0e8b340a045473c9f3f2e28d9348e1c5d6da8aeafe0f3d8d50b`.
- Decoded response: 1,010,768 bytes; SHA-256
  `a28120328f5265dbf2028d8a7272bece363016915b3d6e53641643c270ac65b2`.
- `LIVE-RESULT.json` SHA-256:
  `7e01279d2733298bff2bc0c53c45e839a59e37a3cab082b689ebc96976fc969e`.

The server reported a cache hit, age 462,706 seconds, and Last-Modified
`August 13, 2026, 11:01:32 UTC`. These are observed response headers, not proof of
the latest editorial revision. There was no redirect, Retry-After header,
challenge header, or challenge title detected; no retry or alternate client.

## Bounded findings, paraphrased

The following refer to section IDs in the immutable extraction, not to a second
fetch or a replacement HTML parser.

1. **Serialized policy parsing** (`parse-serialized-policy`, section 2.2.1):
   parsing creates a policy carrying its source and disposition, separates
   directives at semicolons, trims ASCII whitespace, ignores empty/non-ASCII
   directive tokens, and folds directive names to ASCII lowercase. A duplicate
   directive name does not replace its first occurrence. This excerpt does not
   supply the full response-header/policy-list parsing algorithm.
2. **Multiple headers and policies** (`csp-header`, `cspro-header`,
   `multiple-policies`): the header grammar supports a list of serialized policies.
   Every enforcing policy must be enforced, while report-only policies are
   monitored rather than enforced. The explicitly non-normative multiple-policy
   example explains the intersection effect: a second policy cannot relax a
   restriction imposed by the first. This is not a license to union allowed hosts
   across policies or collapse enforcing and report-only dispositions.
3. **Image selection and fallback** (`directive-img-src`,
   `directive-default-src`, `effective-directive-for-a-request`,
   `should-directive-execute`): ordinary image-destination requests use `img-src`.
   `default-src` supplies fallback for an absent applicable fetch directive;
   an explicit directive is not supplemented by default-src's source list.
   Directive applicability is part of the decision, not just header presence.
   The full fallback-list table itself was not selected.
4. **Pre- and post-request checks** (`img-src-pre-request`,
   `img-src-post-request`, `match-request-to-source-list`,
   `match-response-to-source-list`): image checks first determine whether the
   directive applies, then test the source list. The pre-request wrapper passes
   the request's current URL, the protected origin, and redirect count to URL
   matching. The post-request wrapper instead passes the response URL with the
   request's redirect count. A URL decision therefore needs context that a
   blanket document-level CSP boolean does not represent. This last statement is
   an architectural inference, not a completed native implementation review.
5. **Meta delivery and mutation limits** (`meta-element`): meta-delivered policies
   are enforced alongside other active policies, do not apply to content before
   the element, and ignore later changes to the parsed element's content
   attribute. This delivery mode does not support report-only policy, report-uri,
   frame-ancestors, or sandbox. Detailed HTML processing is delegated to an
   unfollowed external reference, so dynamic insertion/removal and all timing
   cases are not established by this capture.

These excerpts support researching directive-aware image policy checks; they do
not establish that any specific Hacker News image is safe to load. No HN fetch,
image request, page resource, page script, SafeJS runtime, or layout ran here.
Header parsing and security behavior still require separately authorized tests
and review before implementation. Main retains ownership of overall gates.

## Native source provenance

The parser built 28,732 nodes under the 30,000-node/depth-256/2-MiB-text limits.
It reports `independent-html-subset`, `partial: true`, `scripting: false`, and
five `script-not-executed` issues. “Partial” is preserved, not converted into a
full-HTML-conformance claim. Selection work was 60,611 debits, with native query
lastWork 61 and one 28,732-node index build; query work was capped at 100,000 and
selection work at 1,900,000. The document revision stayed unchanged. Cleanup
closed queries and the document, leaving zero nodes and restoring the tokenizer.

Extraction used native DOM nodes and native tokenizer heading boundaries. Each
selected entry records its node ID, heading ID, code-unit and byte spans, a hash
of its captured source span, and native-text hashes. Byte intervals are half-open
and refer to the exact decoded response body above. Representative boundaries:

| Section ID | Start byte | End byte |
| --- | ---: | ---: |
| parse-serialized-policy | 80643 | 87091 |
| csp-header | 132693 | 135003 |
| cspro-header | 135003 | 138257 |
| meta-element | 138257 | 142659 |
| directive-default-src | 300363 | 310233 |
| directive-img-src | 327834 | 329916 |
| img-src-pre-request | 329916 | 331773 |
| img-src-post-request | 331773 | 333821 |
| match-request-to-source-list | 465291 | 467129 |
| match-response-to-source-list | 467129 | 469145 |
| multiple-policies | 547566 | 549883 |

All 19 retained sections have `truncated: false`, but **13 candidate sections
were omitted** at the conservative serialized-output reservation boundary.
Selection reached 64 references, all unfollowed. The result is 52,603 bytes under
the 65,536-byte semantic-output cap; there was no second parse to change coverage.
The heading-ranking heuristic also retained nonce/integrity and inline sections
that were lower priority for this image investigation. Their presence does not
fill the following gaps:

- Full serialized policy-list/response-header parsing and malformed-list cases.
- Serialized source-list grammar and the underlying URL-to-list/expression
  algorithms, including precise self/origin, scheme, host, port, path, wildcard,
  and redirect-dependent matching. Only the pre/post wrapper inputs are captured.
- Full request/response policy-enforcement integration and fallback-list table.
- External HTML/Fetch/RFC definitions, dynamic meta processing, and browser-wide
  or CSP-wide conformance. The raw body is preserved but unselected raw content
  is not claimed as extracted semantic evidence.

## Release integrity, resource gates, and seal

The runtime is the existing committed15421 gate
`native-empty-image-september12-round02`, commit
`5164b28a6480c2748a18534ac7799ad0e215bfd1`, not the former15065 release.
Before and after verification checked 1,181 source files, 1,992 compiled files,
20 gate receipts, 13 snapshot inputs, and 16 actual committed Git objects.
Commit/tree/blob identities and snapshot bytes matched, as did both inventories:

- Source inventory: `0d032903dd0004267cd30134bb6045ebabecb4e345c1b9dd09daa2d2da1895c8`.
- Compiled inventory: `b45c9a79c82dd9603952c4de3838d8412f385c1a1673e8337c31a425146e25eb`.
- Gate receipt ledger: `91e0424bb6b2bcdc68a9360e8a7ddc5e463c1b02574b8fed3ac01df032c766cf`.

Pinned Node `v22.22.0` SHA-256:
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
The historical gate's 15,421 passed / 0 failed / 2 excluded counts are verified
existing evidence, not tests rerun by this worker and not live acceptance proof.

Live bounds were 45 seconds plus five-second termination grace, 2 MiB each
encoded/decoded response, 6 MiB artifacts/output, 16 MiB lane, and at least
64 MiB available. Receipts show no timeout, cap termination, output truncation,
or remaining child group; transport and cookie owners closed. Private HOME and
TMPDIR under this /home workspace remained empty. Offline children denied
network syscalls with seccomp; local read-only Git object retrieval alone ran
outside that seal. No socket self-probe or TTY/PTY was used.

An initial `df /home` observation referred to the full root filesystem, not the
workspace's separate mount. `statfs` of the actual lane showed over 4 GiB free;
this was corrected before the sole GET. No storage limit was raised or unrelated
data removed. A preflight patch-generation attempt and a shell here-document
attempt failed locally before their intended commands; neither made a request
or parsed the page. Subsequent shell temporary files used the private TMPDIR.

`verify.mjs` checks captured counts, hashes, source-span bytes, cleanup, unchanged
runtime identities, authorization, and execution receipts without reparsing.
`RECEIPTS.sha256` covers the lane's evidence and this report; `SEAL.json` pins the
ledger and immutable extraction. Files and directories are made read-only for
the owner after sealing. This is a permissions/hash seal, not a claim of
filesystem-level immutability against the owner. Main independently verifies.
