# Developer content paths and Rustdoc source cleanup

Date: **September 15, 2026 (UTC)**. This is a follow-up to the citation-derived
100-page sweep, not a replacement ranking or retroactive change to its results.
The complete original list is in `agent-citation-pages-2026-09-15.md` under
“Every attempted page”; the original 100 attempts and 48 useful-content judgments
remain unchanged. Citation frequency is not measured agent visit frequency.

## Live scope and results

The initial nine navigations, starting at 21:06 UTC, used committed runtime
`8928f3a25e97349d52bdb8033fa325d1bb8865c9`, pinned against 1,487 committed
source/script/config inputs and the sealed previous compiled manifest. One
post-fix navigation at 21:22:53 UTC used the clean `release02` candidate overlay pinned in the
adjacent JSON. No dirty root build was used.

**10 navigations to nine distinct targets, 11 HTTPS GETs including one redirect,
10 hash-verified captures, nine useful source observations and one Cloudflare
barrier.** Nine observations include the same Tokio source before and after
the fix; this is not nine independently passing websites. All ten children and
process groups, and all eleven observed requests/sockets, closed. Zero automatic
retries, plaintext requests, credential headers, scripts, SDK calls, challenge
solvers or account/form interactions. npm was not retried.

Options: reader, body capture, `separate-omitted-raw-v1`, explicit UTF-8 fallback.
Default source completeness and HTTPS downgrade protection remain; no visibility,
content-focus, long-document or HTTPS redirect-upgrade policy was enabled.
Each child had empty HOME/TMP, a 192MiB heap and 45-second outer deadline. Existing
2MB response and 256KB extraction limits were retained. At most four same-origin
HTTPS GETs were permitted per target, with sequential navigations and two-second
gaps within each multi-target batch.

| Target | HTTP | Body bytes | Markdown bytes | Observation |
| --- | ---: | ---: | ---: | --- |
| `https://github.com/psf/requests` | 200 | 318863 | 23240 | Repository links and README; navigation/table noise remains. |
| `https://pypi.org/project/requests/` | 200 | 251417 | 41254 | Package description, examples and release history. |
| `https://www.npmjs.com/package/axios` | 403 | 5507 | — | Cloudflare challenge, no extraction; stopped. |
| `https://docs.rs/tokio/latest/tokio/` | 200 | 57038 | 28293 | Rust documentation and examples. |
| `https://github.com/psf/requests/tree/main/src/requests` | 200 | 274248 | 19747 | Source directory with followable file links. |
| `https://github.com/psf/requests/blob/main/README.md` | 200 | 263993 | 11061 | Rendered README/code examples plus site UI. |
| `https://docs.rs/tokio/latest/src/tokio/lib.rs.html#1-709` | 200 | 85760 | 32118 | Source present, but 709 line-number labels contaminate code. |
| `https://requests.readthedocs.io/` | 200 | 22519 | 14832 | One redirect to `/en/latest/`; documentation index and examples. |
| `https://github.com/psf/requests/blob/main/src/requests/api.py` | 200 | 335591 | 17039 | Function/docstring content, but source is flattened and Markdown-escaped. |
| Tokio source, fresh post-fix | 200 | 85760 | 30099 | Same body hash; all 709 recognized gutter labels omitted. |

Follow-up targets were exact links observed in the captured parent pages.
`LINK-CHAIN.json` and `GITHUB-CODE-LINK.json` retain parent receipt pins and link
checks. No guessed raw-source URL, raw CDN redirect or code example was executed.
The `/latest/` URL and visible release labels are observed page metadata, not an
independent claim that a particular package release is the newest available.

## Implemented fix

Rustdoc source uses anchors such as `<a href=#1 id=1 data-nosnippet>1</a>` inside
syntax-highlighted `pre.rust > code`. Previously the extractor concatenated the
anchor label with source text, producing `1#![allow(` and numbered later lines.
The new bounded predicate and traversal line state omit only qualifying gutters.
Reader sanitization retains the empty marker so both loaders apply the rule.
`sourceCodeGutters` records the omission kind/count without changing the DOM.
Ordinary numbers, links, source whitespace and all source node/depth budgets
remain. Details and conservative negative cases: `../SOURCE-CODE-GUTTERS.md`.

## Separate validation gates

- Selected native baseline: **862 passed / 0 failed**, 12 manifest-listed files.
- Final old production plus final new tests: **893 passed / 9 failed**. The nine
  expected failures reproduce the missing behavior; collection/build/types pass.
- Final candidate: **902 passed / 0 failed**, 13 files, including all **40 new
  regressions**. Build, selected test types, formatting and lint pass.
- Early runs retained in the lane: first candidate also passed all 902 tests,
  but two test-only template-style lint findings were corrected. An initial
  formatter lookup used an absent `.bin` shim; the installed tool's explicit
  entrypoint was then used. No production changes were needed after the first
  candidate test run. This is not a full 917-file native-manifest run.
- Offline comparison: eight captured successful pages, **19 loaded/closed
  documents**, one isolated child, zero network/IO attempts under JS and kernel
  socket-denial guards. Seven unaffected full Markdown outputs are byte-identical.
- Tokio's expected output was independently derived by literal gutter-anchor
  removal from saved HTML followed by old-reader extraction. This transformed
  oracle is synthetic, not a new HTTP receipt. New full Markdown exactly equals
  that oracle; scoped JSON source text also matches. DOM text/revision stay fixed.
  The 709 labels account for exactly **2,019 removed bytes**; code is retained.
- Fresh post-fix Tokio source: HTTP200, identical 85,760-byte body SHA256 to the
  original capture, 30,099 Markdown bytes, exact offline-output hash and omission
  metadata. No old receipt was modified to make this check appear successful.

The first audit asserted null content success for every receipt; npm correctly
reports false. The audit was corrected for that known blocked outcome only;
no browser result changed. Final machine audit passes.

## Remaining work and evidence

GitHub source still needs code-faithful structural extraction. UI/navigation
noise and source-only/JavaScript-only gaps remain. npm is access-blocked, not an
extractor success. None of these checks validate interactive applications,
authentication, passkeys, a real SafeJS SDK, PTYs or challenge solving.

Machine summary and SHA256 pins: `developer-content-paths-2026-09-15.json`.
Detailed local artifacts retain original paths under
`node_modules/.cache/native-validation/developer-content-paths-september15/`:
`live/`, `followup/`, `github-code/`, `fresh/`, `comparison/`, the native check
logs, source/compiled manifests and `AUDIT.json`. The separate `CORPUS-AUDIT.md`
confirms 100 distinct original URLs/reviews and the recorded aggregate counts;
it does not independently re-run those sites or establish global popularity.
