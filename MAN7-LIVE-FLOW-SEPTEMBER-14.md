# Verified native live man7 flow — September 14, 2026

## Result

**The native browser completes a fresh live ls(1) → discovered date(1) flow.**
Both documents commit. The selected link is rediscovered from the current page,
not replayed from a historical reference or navigated to through a fallback.
The destination is `date(1) - Linux manual page`, with 531 native DOM nodes and
9,897 extracted body-text code units. The initial document is released with zero
remaining nodes. No mock response, page script, external browser or forced click
is used.

Native observation: **15:47:57.021–15:48:00.348 UTC on September 14, 2026**.
Runtime: `71d0c8b59f7e92532eb956a972c3cb118789e9b7`; documentation-only HEAD at
launch: `64e82f027faf97e7b2370b49626bb3e3cef01f36`. The supervisor and child exit 0.
Independent verification passes **14 checks**, with `flowPassed:true`, followed
by a successful separate seal recheck. This proves this specific live workflow,
not all of man7, other websites, full-page visual fidelity or the overall goal.

## Actual requests and native actions

| Observation | Verified result |
| --- | --- |
| Initial page | ls(1), title `ls(1) - Linux manual page`, 722 nodes, revision 727 |
| Discovery | Native `body a[href]` inspection, capped at 96 anchors; date(1) selected at index 17, reference `e472` |
| Activation | One ordinary native click on the discovered relative link, browsing target `_self` |
| Navigation | One explicit initial navigate; two session navigations and two document commits |
| Destination | HTTP 200, native date(1) title/text, different document, old document released |
| Real exchanges | Eight bodyless HTTPS GETs, eight HTTP 200 responses, zero redirects |
| Network volume | 46,184 original encoded payload bytes; 78,042 decoded bytes |
| Native adapter entries | Ten: eight transport admissions plus two local optional-image denials |
| Mocked requests | Zero |
| Request spacing | Every observed wire interval exceeds 250 ms; minimum approximately 317.98 ms |
| Restrictions | No HTTP restriction, Retry-After, challenge or human handoff encountered |

The eight real exchanges cover five distinct URLs: the two manual-page HTML
documents and three shared resources. Each document loads the root stylesheet,
book-cover PNG and manual-page stylesheet through the original native loader.
The optional cross-origin tracker is rejected locally on both pages before
transport; it is neither a visited host nor a server-side access restriction.

The first four decoded response bodies match the earlier September 12 inputs,
but these are **fresh live responses**, not relabeled old captures. Actual native
HTTPS requests, response headers/timestamps, encoded payloads and decoded bodies
are separately recorded. The destination response is now present in this new
eight-response corpus. No new response is appended to an older archive.

## Scope and preparation corrections

The user requested continued native-browser website testing. This fresh lane
receives its own parent-reviewed, time-limited one-shot release. It is separate
from the preceding zero-wire captured recheck and does not reuse an exhausted
authorization. Only `https://man7.org` is admitted, with native public-address,
TLS certificate/hostname and resource-provenance checks; credentials are omitted
with fresh empty state. User agent remains `AgentBrowser/0.1`.

Before launch, parent review catches a copied harness accounting bug: locally
rejected images consumed the eight-real-request allowance. The still-unlaunched
harness is corrected to cap ten adapter entries, eight transport admissions/real
requests and two local image denials independently. The eight-wire cap and origin,
pacing, TLS, credential and challenge restrictions are not loosened. Original
prepared bytes remain as exact reference copies.

A final metadata check then stops before authorization because it still selected
the earlier syntax receipt after those code changes. A separately named final
syntax receipt is generated and bound, preserving both earlier receipts and the
same per-file hash checks. All ten final harness syntax checks and metadata
validation pass before release. **Neither preparation correction launches a
browser; only one live attempt occurs.**

No scripts, SafeJS, credentials/providers/passkeys, devices, form submission,
alternate transport/browser, fingerprint spoofing, CAPTCHA bypass, direct
destination fallback or retry is authorized or used. Stop-on-restriction rules
remain enforced, but the clean response path is not evidence that real challenge
handoff has been exercised successfully.

## Cleanup, verification and limits

The supervisor runs **15:47:56.864–15:48:00.371 UTC**, below its 30-second deadline
and five-second grace allowance. Combined stdout/stderr is 214,896 bytes, below
the 6 MiB cap. There is no timeout, truncated output, spawn/stream error or forced
residual cleanup. Both process and process group are absent afterward.

Session, transport, both documents and observed resource/interaction owners close
without pending requests or cleanup errors. Cookie state remains empty. Private
0700 HOME/TMP directories remain empty in the closed evidence lane; they are not
claimed to have been removed. The 12 MiB lane cap and 64 MiB minimum free-space
guard remain in force. Root storage was full, so runtime outputs stay in RAM;
no unrelated files are deleted.

The verifier checks request provenance, caps/timestamps, original wire bytes,
decoded payload linkage, headers, counters, real discovery/destination commit,
owner/process cleanup and immutable runtime/reference/harness inputs. Credential
headers would be redacted with pair counts retained; **zero header pairs require
redaction in these eight responses**. Native wire events are instrumentation,
not packet capture. No comparative speed or memory benchmark is claimed.

Verification seals 83 files at **15:48:22.942 UTC**; a separate `--check` succeeds
at **15:48:40.935 UTC**. Parent independently rechecks the flow, seal, historical
body equality and worktree preservation. Existing 42 dirty tracked paths, original
TASKS/manifest residuals and 697 original untracked file hashes remain intact.

## Evidence and next work

Original live lane: `/dev/shm/agent-browser-man7-live-flow-september14/`.
Parent closeout: `/dev/shm/agent-browser-man7-live-parent-september14/`.
Durable byte-verified copies:
`node_modules/.cache/native-validation/man7-live-flow-september14/`, with separate
`live/` and `parent/` directories plus `PERSISTENCE.json`. Persistence is not
another execution. Prior failed captures and reports retain their paths/results.

| Artifact | SHA-256 |
| --- | --- |
| Native observation `stdout.jsonl` | `e51dc4bf86ef7324213e4c30006e206bd188a5a0bb9211aa988895bdc47bf168` |
| Independent `VERIFICATION.json` | `9cc8f9563305cf0319e57900a951d2b299d1fcf2242addca4b1062ef242baad6` |
| Live `EVIDENCE.sha256` | `50c3182abdff9fe3d1b02e3a70e3186ad0064ccbf68b4f68ba2502efc3ac1eeb` |
| Decoded destination HTML | `78ca8044dd8d35f5d380dafced3bcf9ca4fe5964072e83b15b8496c136f81220` |

Next retain this complete corpus for regression work and move to other website
blockers rather than repeatedly requesting man7. Static HN investigation identifies
word-break handling and its intrinsic-width distinction as a concrete next
candidate, with semantics confirmation and native tests still required. Layered
backgrounds, wider complete/live coverage, performance measurements, original
research, providers/passkeys and device/challenge gates remain open. No push.
