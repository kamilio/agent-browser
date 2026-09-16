# Code-example source qualifications — September 16, 2026

## Change and scope

Add optional sourceCodeContexts for actual HTML pre/code classes, span.boring
and strong/b/em/i source ranges. This retains qualifiers that bare Markdown
fences cannot express without changing examples. Labels are opaque source text,
not inferred language, CSS visibility, execution results or authenticated facts.
See CODE-SOURCE-CONTEXT.md for exact bounds, provenance and UTF16 offset semantics.

Existing content and source/access metadata fit first. Contexts fit whole entries
in remaining JSON UTF8 bytes; prefix fallback has no contexts. Native DOM,
Markdown, structured content and reader accounting are unchanged. No dependency,
page execution, global budget increase or challenge bypass is introduced.

## Executed checks

- Final release02: 3,838 passes, zero failures, 45 explicitly selected manifest
  files; 64 new helper and 58 new integration cases. Build, strict types, format
  and lint pass. Canonical manifest has 956 entries; this is not its full run.
- The same integration file on prior extraction plus the new helper gives
  15 passes and 43 failures. Initial release01 had 3,826 passes and 12 failures
  from missing terminal newlines in expectations. Correcting expectations retains
  existing renderer behavior. Prior artifacts remain unmodified.
- Independent static release02 review finds no unresolved concrete blockers.
  Not every source-metadata early-return combination has a dedicated integration
  case; synthetic helper stress cases do not establish native admission latency.
- 123 pinned complete bodies: 120 successful pairs and three matching non-HTML
  failures. All prior extraction fields, content, DOM, diagnostics, classifications
  and reader accounting match after normalizing only opaque refs and excluding
  the new optional field. Structured output has 116 successful pairs and four
  matching size-limit failures. No new live requests occur in this replay.
- Five real native CLI saved-response commands match complete final API output:
  Rust book, PostgreSQL WITH, Rust Future trait, Reqwest and Go generics. Each
  uses one mocked request under kernel/JS socket denial; no scripts or credentials.

## Recovered associations

| Saved page | Code contexts | Class attributes | Source ranges |
| --- | ---: | ---: | ---: |
| developer-mdn | 18 | 18 | 0 |
| reference-rust | 11 | 16 | 55 |
| reference-postgresql | 23 | 23 | 24 |
| reference-rust-future-trait | 1 | 1 | 0 |
| reference-reqwest-crate | 6 | 6 | 0 |

No emitted entries are truncated on these five pages. Independent source audit
checks the emitted associations against captured HTML and retained example text;
its full procedure, per-record offsets and limitations are in the companion JSON.
Go's 19 classless, unmarked pre blocks produce no contexts, rather than guessed
language labels. Absence of contexts in general does not establish absence of
qualifiers: selection and fitting limits still apply.

## Measured cost, not speedup

Warm extraction only, six saved pages, four warmups and 20 timed samples per
version/page, alternating baseline/candidate in one process without forced GC.
Source loading/network/cold startup are excluded. All repeated outputs match.

| Saved page | Baseline median ms | Candidate median ms |
| --- | ---: | ---: |
| developer-mdn | 5.160 | 5.328 |
| reference-rust | 1.924 | 2.390 |
| reference-postgresql | 3.225 | 3.734 |
| reference-rust-future-trait | 1.564 | 1.680 |
| reference-reqwest-crate | 2.105 | 2.324 |
| reference-go-generics | 2.105 | 2.241 |

These small convenience-sample timings show added extraction cost, not a browser
speedup. Shared-process JIT/GC and noise limit interpretation; raw samples are
preserved. No full-browser or real-site latency improvement is claimed.

## Provenance and remaining work

Baseline commit: 1f505ae342ec98a779d348231b75a331ec234f08. Candidate overlays four files on that commit;
1542 source inputs and 2320 compiled files are pinned.
Only four new helper artifacts and four extraction artifacts differ in dist.
19 recorded feature validation process groups are absent;
no recorded timeout or termination signal, and isolated HOME/TMP directories are
empty. Expected failed tests/quality checks remain visible in earlier evidence.

Artifact inventory: 171 files, 13128213 bytes.
ARTIFACTS SHA256: 81889f883f1be088e4852c5d0d9681ff97e87d2fa81c47ecf0054bf1a734e891.
Inventory excludes itself and SEALED.json. Local evidence is under
node_modules/.cache/native-validation/code-source-context-september16.

Three fresh reference visits ran on the baseline, not this feature; see
reports/code-reference-pages-2026-09-16.md. Historical 100-page results are not
rewritten as new passes. Broader 62 failures/22 missing committed tests and
SafeJS, credentials, passkeys, rendering, device, TTY and access gates remain.
The overall browser goal remains active; no push is performed by this change.
