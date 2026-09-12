# Focused offline CSP matching source — September 12, 2026

## Result and identities

**One authorized offline native parse completed; zero HTTP requests.** All ten
targeted sections fit, with no omitted target or truncated section. This is a
new follow-up, not a rewrite or cap increase of the original extraction.

Owned evidence: `node_modules/.cache/native-validation/native-csp-matching-source-september12/`.
The immutable `EXTRACTED.json` is **45,368 serialized bytes**, containing ten
sections, 18,691 bytes of native semantic text, and 64 unfollowed references.
SHA-256: `78e6a993d70e36a9bb99176cc447bef6e40aaa79fc38c0d1a288c77c64d6a76b`.

The input remains the original `native-csp-source-september12/response-1.body`:
**1,010,768 bytes**, SHA-256
`a28120328f5265dbf2028d8a7272bece363016915b3d6e53641643c270ac65b2`.
Its original URL is `https://www.w3.org/TR/CSP/`; original receipt time is
`2026-09-12T18:53:36.513Z`. No newer remote revision was checked.
Earlier extraction SHA-256 remains
`7175d1740a6d8b587e0522b6f1ffa31216a626d3483a315671a50ebcd71cd3ee`.
The earlier report, seal, and all 146 original receipt entries verified unchanged.

Runtime: **approved5164b28/native15421**, full commit
`5164b28a6480c2748a18534ac7799ad0e215bfd1`, from
`native-empty-image-september12-round02/snapshot01/dist`. The new4306022 release
and current working-tree implementation were not used. No production code,
policy admission, tests, manifests, TASKS, Git objects, or prior evidence changed.

## Exact chronology and provenance

All times below are UTC on September 12, 2026:

- Before integrity check: `19:23:32.053Z`.
- Parse supervisor interval: `19:23:43.638979Z`–`19:23:43.986007Z`.
- Native extraction: `19:23:43.731Z`–`19:23:43.969Z`.
- After integrity check: `19:23:55.338Z`.
- Final sealing time is recorded in `SEAL.json`; no subsequent parse is allowed.

Target IDs were resolved against the native heading/anchor index in that same
single parse. The source-list grammar anchor was already present in the earlier
extraction's observed references; the policy-list grammar anchor and algorithm
IDs were observed in the new native index. `targets` records each discovery and
native node identity. No source-document regex parser or external link traversal
was used. Full targeted semantic sections were selected before optional links.

Source intervals are half-open byte offsets in the exact original body. Every
section also retains native tokenizer code-unit boundaries, a source-span hash,
its full native-text hash, and `truncated: false`.

| Target heading ID | Section | Start byte | End byte |
| --- | --- | ---: | ---: |
| parse-response-csp | Response policy-list parsing | 87091 | 92653 |
| framework-policy | Policy and serialized-list grammar | 73395 | 80643 |
| framework-directive-source-list | Source-list grammar | 104162 | 116675 |
| match-url-to-source-list | URL to source list | 469145 | 472306 |
| match-url-to-source-expression | Expression, self/origin, redirects | 472306 | 482897 |
| match-schemes | Scheme matching | 482897 | 486962 |
| match-hosts | Host matching | 486962 | 491054 |
| match-ports | Port matching | 491054 | 493888 |
| match-paths | Path matching | 493888 | 497944 |
| directive-fallback-list | Ordered directive fallback table | 523330 | 526872 |

## Findings from the immutable native text

These are paraphrases of the selected sections, not an implementation or a
claim that arbitrary native images may now be loaded.

1. **Policy lists and dispositions.** `framework-policy` defines serialized
   policies as semicolon-separated directives and serialized policy lists as
   comma-separated policies. A CSP list also carries a self-origin; this matters
   for inherited policies and local-scheme contexts with opaque origins.
   `parse-response-csp` iterates header-list values separately for enforcing and
   report-only headers, invokes serialized-policy parsing with the appropriate
   disposition and header source, retains policies with nonempty directive sets,
   and sets the list's self-origin from the response URL's origin. The actual
   Fetch header-list extraction operation remains an unfollowed dependency.
2. **Source-list syntax versus matching.** The grammar describes whitespace-
   separated expressions, the special none form, optional host schemes/ports/
   paths, wildcard host forms, and ASCII/Punycode requirements. Merely satisfying
   that grammar does not establish a URL match. The necessary generic grammar
   includes nonce/hash forms, but no nonce, integrity, or inline-check algorithm
   was selected instead of the requested matching targets.
3. **Within-list alternatives.** `match-url-to-source-list` rejects an empty list
   and a lone none keyword. Otherwise any matching expression succeeds; a none
   token does not veto another matching expression in the same list. This is
   distinct from the intersection of separate enforcing policies documented by
   the original extraction.
4. **Expression matching and redirect count.** The standalone wildcard is not
   unrestricted across schemes: the URL must be HTTP(S) or share the supplied
   origin's scheme. Host expressions require applicable scheme, host, and port
   matches; schemeless hosts still depend on the supplied origin's scheme.
   A nonempty expression path is checked only when redirect count is zero.
   Nonzero redirect count skips that path comparison, not the other host-source
   checks. Producing the URL and redirect count correctly is a separate Fetch
   integration requirement, not permission to follow redirects here.
5. **Self/origin.** The self keyword accepts same-origin matches and also has
   explicitly constrained host/port/scheme cases for secure-scheme upgrades.
   Host equality alone or string comparison with the current document URL is
   insufficient. Port equality or each scheme's default-port condition is part
   of the additional branch. Origin construction/inheritance and default-port
   definitions remain external dependencies.
6. **Schemes.** The matching relation is ASCII-case-insensitive and asymmetric:
   besides equality, the section permits http to https; ws to wss, http, or https;
   and wss to https. The reverse downgrade is not implied.
7. **Hosts.** The detailed host algorithm first rejects URL hosts that are not
   domains. For domain hosts it supports the wildcard, a case-folded dotted
   subdomain suffix, or case-insensitive exact matching. A dotted wildcard does
   not mean an undelimited string suffix. **Unresolved source tension:** the
   earlier source-list explanatory note mentions a 127.0.0.1 exception, while
   the captured detailed host algorithm has no explicit IP exception and rejects
   non-domain hosts. This review preserves both statements rather than silently
   creating an IP allowance or claiming the external URL host definitions have
   been resolved.
8. **Ports.** A port wildcard matches directly. Other inputs are absent/null or
   decimal digits; the normalized value is compared with the URL port, and an
   absent URL port additionally allows comparison with its scheme's default.
   This is not a blanket equivalence between arbitrary insecure/secure ports.
9. **Paths.** The algorithm handles empty-path cases, distinguishes trailing-
   slash prefixes from exact segment counts, splits on slash, then compares
   corresponding percent-decoded segments. It does not describe plain raw
   string-prefix matching or decoding the entire path before splitting.
10. **Fallback order.** The table includes the effective directive itself first.
    Images use `img-src` then `default-src`; frame requests include `child-src`
    before default, and workers have their own longer chain. This supplies the
    previously missing ordered table; it is not a union of every listed policy
    directive's source expressions. The applicability procedure is preserved in
    the earlier extraction.

## Remaining semantic and acceptance limits

There are **no missing targets in this follow-up's ten-section selection**.
That statement is narrower than completing every CSP or browser semantic:

- External Fetch header-list extraction, malformed-header handling, URL/request/
  response construction, redirect-count production, and policy-enforcement
  integration have not been extracted in full or tested.
- HTML origins, inherited/opaque/local-scheme contexts, URL host types,
  canonicalization, path serialization, percent decoding, default ports, Infra
  operations, and referenced RFC grammar/list rules remain incomplete external
  definitions. Section 2.1's referenced grammar modifications were not selected.
- The IP-host explanatory-note/algorithm tension needs clarification before
  implementation. The broad introductory host examples must not replace the
  more specific scheme/host/port/path algorithms.
- Meta delivery/mutation limitations and multiple-policy effects remain in the
  original extraction, not newly revalidated here. Full top-level request and
  response enforcement algorithms remain outside this follow-up selection.
- Only 64 observed references are retained and none were followed. No network,
  page resource, live site, SafeJS, layout, or behavioral conformance probe ran.

Native parsing produced **28,732 nodes** and reports `independent-html-subset`,
`partial: true`, `scripting: false`, and five `script-not-executed` issues. These
qualifications are retained; complete target excerpts are not full HTML/CSP
conformance. Main independently reviews the evidence before any separately
authorized implementation, header/security tests, or policy change.

## Integrity, caps, and sealing

Before/after verification matched **1,181 source files, 1,992 compiled files,
20 gate receipts, 13 snapshot inputs, and 16 actual committed Git objects**.
Actual Git object reads ran outside syscall denial; parse/integrity/verification
children used the original kernel socket/syscall denial. Source inventory
SHA-256 is `0d032903dd0004267cd30134bb6045ebabecb4e345c1b9dd09daa2d2da1895c8`;
compiled inventory SHA-256 is
`b45c9a79c82dd9603952c4de3838d8412f385c1a1673e8337c31a425146e25eb`.
The existing 15,421 passed / 0 failed / 2 excluded gate was checked, not rerun.

Pinned Node 22.22.0 SHA-256:
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
Caps stayed at 30,000 nodes, depth 256, 2 MiB text, 100,000 query work,
1,900,000 selection work, 65,536 serialized semantic bytes, 32 headings,
64 references, 45 seconds plus five-second kill grace, 6 MiB artifacts/output,
16 MiB lane, and at least 64 MiB free. Selection used 33,056 debits; native query
lastWork was 61 with one 28,732-node structural index build. The extraction child
completed in about 0.346 seconds with no timeout, truncation, or cap termination.

No second parse followed `PARSE-ONCE.lock`. One preparatory syntax-only check
did not execute the extractor. Cleanup left zero document nodes, closed query
state, a restored tokenizer, no child group, and empty private HOME/TMPDIR under
this /home workspace. No credentials, providers, device/TTY, socket self-probe,
or protected heading payload was accessed.

Read-only verification checks exact body/extraction hashes, every section's
source-span bytes and native-text hash, target coverage, recorded caps/cleanup,
unchanged original evidence, and before/after release identities without parsing.
`RECEIPTS.sha256` covers this lane and this report; `SEAL.json` pins the ledger,
report, and extraction. The seal uses hashes and owner-read-only permissions,
not a filesystem immutable flag. Earlier artifacts are not rewritten.
