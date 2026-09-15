# Website inventory: thirty-ninth update

## Scope and result

Recorded September 15, 2026, 00:20–00:31 UTC: five native browser navigations,
five actual HTTP requests, two URLs and two hosts. All returned 200, with zero
redirects, mocked requests or automatic retries. These are partial read-only
content observations, not rendering, interaction or general site acceptance.
All original reports remain `extracted-unverified`, `contentSuccess: null`.

| Public URL | Observation | MIME | Encoded body bytes | Decoded body bytes | Extracted Markdown bytes |
| --- | --- | --- | ---: | ---: | ---: |
| `https://docs.ollama.com/gpu` | Default request | HTML | 38,404 | 297,611 | 20,502 |
| `https://docs.ollama.com/gpu` | Explicit Accept experiment | Markdown | 3,788 | 12,570 | 12,580 |
| `https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Content_negotiation` | Default request | HTML | 24,874 | 222,455 | 74,889 |
| `https://docs.ollama.com/gpu` | New CLI flag | Markdown | 3,788 | 12,570 | 12,580 |
| `https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Content_negotiation` | New CLI flag, preference ignored | HTML | 24,874 | 222,455 | 74,889 |

The initial experiment changes only Accept at the native transport boundary;
the final two observations use the compiled research CLI's actual
`--reader --prefer-markdown` implementation without that override. Native identity,
credential omission, request/source/output limits and challenge handling remain.
Every process/group is reaped, every transport closed with zero active requests,
and private HOME/TMP directories remain empty. No SafeJS/page execution,
credential/device access, server listener or TTY/PTY probe occurred.

## Useful content and measured benefit

- Ollama: hardware support, Nvidia, AMD Radeon, Vulkan and GPU-selection content
  survive both representations. Negotiated Markdown exactly matches the prior
  publisher `.md` capture SHA-256
  `dc6569345668d8dac4a2ab36e338600782650704e5cd1d2908cfc9d1e61a942a`.
- The first same-URL pair saves 34,616 encoded body bytes, or 90.1%. One publisher
  and differently encoded representations do not establish general latency or
  semantic-equivalence claims. No lower global limits or identity masking are used.
- MDN: ten substantive prose anchors, article headings and eight table cells
  survive the default extraction. The new preference still returns HTML, with
  byte-identical captured body and extracted Markdown. No second-request fallback
  is needed. Navigation/sidebar/footer clutter remains a readability limitation.
- Markdown stays inert source, not parsed headings, links, tables or scripts.
  DOM selection and long-profile combinations are rejected before networking.

## Validation and unresolved failures

The isolated candidate is a clean archive of
`f5108dddf2949c1d67f824da79a6abbf48680eb8` plus this increment's source overlay.
All 51 new tests pass. The full selected 22-file native run has **1,914 passed,
four failed** across 1,918 cases; it is not green. Build, 22-root strict typecheck,
two-file formatting and lint pass. Canonical manifest membership becomes 849;
this is not a full native release rerun.

The four existing failures reproduce on unmodified baseline source: two
`research-selector.test.ts` assertions omit current extraction-limit provenance;
two `research-body-capture.test.ts` assertions expect content after an early
challenge stop. That two-file baseline has 252 passed/four failed. No tests are
dropped or source behavior weakened to hide those failures. Three initial new
assertion failures were corrected to compare stable extraction fields while
requiring fresh per-navigation document/scope references; original logs remain.

The first offline parent content verifier incorrectly compared linked Markdown
with unformatted MDN prose. It stopped after two Ollama checks; the revised
verifier normalizes formatting for anchors only and still checks raw hashes.
Its initial script, partial evidence and refinement note remain. No live request
was repeated for that correction. The MDN agent's review check-count typo has an
addendum; the actual machine-verification count is 23, not 22.

## Evidence

Original paths:

- `/dev/shm/agent-browser-accept-probe-september15/`: scopes, initial/final source
  and compiled ledgers, five-observation parent verification, initial/final test
  logs, exact baseline-failure comparison, integration receipts and staged audit.
- `/dev/shm/agent-browser-mdn-negotiation-september15/`: original default MDN
  receipt, passive request events, extracted content, 23-check verification,
  review and additive check-count correction.
- `/dev/shm/agent-browser-accept-baseline-september15/`: clean baseline source,
  full two-file log, exact four failures, source/diff hashes and exit evidence.

Durable copies use the matching names below
`node_modules/.cache/native-validation/`, omitting only dependency symlinks and
temporary test-cache directories. Historical paths and measurements are unchanged.

The overall performance/functionality goal remains active. Broader research,
restricted-site access, JS-only content, rendering/pointer compatibility, full
native release and separate runtime/service/credential/passkey-device gates remain
open. Nothing here retries previously blocked sites or solves their challenges.
