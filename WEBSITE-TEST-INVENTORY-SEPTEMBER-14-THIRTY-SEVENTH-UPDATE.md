# Website inventory: September 14, 2026, thirty-seventh update

This round uses existing native capabilities to recover useful large-page content,
checks another hardware reference, and corrects stale find regression expectations.
There are **two navigation launches, three actual HTTP requests and one redirect**,
plus six offline section replays making zero HTTP requests. Native responses and
replay outputs remain partial and `extracted-unverified` with null content success;
independent content findings are additive. This is not full research completion.

## SWE-bench: existing larger-page path works

One separately scoped request to `https://www.swebench.com/` runs at
23:44:49.648403–23:44:50.063224 UTC. It explicitly uses existing `long-v1` admission,
reader, captured body, separate omitted-raw accounting and heading discovery.
It does not retry an access challenge or change default limits. The preceding
default-profile byte-limit failure in the thirty-sixth inventory stays unchanged.

The native request returns HTTP 200 without redirects: 342,899 encoded and
2,392,125 decoded bytes, 239 ms native elapsed, eleven nontruncated native headings.
The original receipt is 3,198,205 bytes. Body SHA-256:
`c862011a4ee1d1a7199fad6ca0905fa5c64f58216f7217ac1eddf37f28788433`.
It matches the body recorded on September 11; this is a new request, not evidence
that the website content changed or that loading became faster.

Six unique level-four headings from this new receipt supply selectors to the
existing admitted JSON replay API. Each matches once and yields substantive
benchmark-description text:

| Section | JSONL bytes | Content distinction recovered |
| --- | ---: | --- |
| SWE-bench | 3,466 | Original repository-issue task collection. |
| Bash Only | 3,682 | Shared agent environment for comparisons. |
| Lite | 3,472 | Reduced-cost evaluation subset. |
| Verified | 3,491 | Human-filtered subset. |
| Multilingual | 3,502 | Tasks spanning multiple programming languages. |
| Multimodal | 3,861 | Issue descriptions involving visual information. |

The six JSONL outputs total 21,474 bytes. Replays use exact trusted receipt/body
pins, socket-denying seccomp, a deny preload, no addons, empty private HOME/TMP,
and the original unchanged captured response. Their HTTP count is zero. The
owned input-receipt buffer is zeroed after use. No linked posts, datasets or
interactive leaderboard controls are visited or validated; no model scores or
dataset counts are independently reproduced.

`CONTENT-FIRST-RESEARCH.md` makes this capture → heading → bounded local section
workflow discoverable without relaxing budgets or disguising a new request.

## NVIDIA: content verified, scope caveat retained

The supplied native launcher visits `https://developer.nvidia.com/cuda-gpus` once
at 23:44:59.801633–23:45:00.466639 UTC. Native transport follows one automatic
redirect to `https://developer.nvidia.com/cuda/gpus`: **two HTTP requests**, not one.
Final HTTP status is 200; the exact intermediate status is not retained. There
are 7,934 encoded and 25,066 decoded bytes, 520 ms native elapsed and 5,192 Markdown
bytes. Body SHA-256:
`e48d681f121ce04a502e1b9683d6e9411a6c4ad916845b51d923c774220b1a65`.

Independent inspection matches all 48 normalized cell texts in source order:
four columns and twelve rows, including the header and eleven compute-capability
groups. It verifies a useful GPU reference table, not just navigation or a title.
Compact output preserves native boundary markers and explicitly leaves header
associations unspecified. No driver, toolkit, hardware, performance or purchase
recommendation is established by reading this table.

The reviewer flags the scope's “no extra request/non2xx” wording under a strict
single-HTTP-request interpretation. The launcher requested one navigation but did
not enforce that stricter transaction count. **This is not recorded as a clean
strict-one-request scope pass.** Original wording, reviewer warning, redirect and
both requests remain visible. There is no relaunch or further link following.
Future scopes must distinguish one navigation from permitted automatic redirects;
the guide now makes this distinction explicit rather than claiming one HTTP call.

## Regression alignment and integrity

The browser production implementation is unchanged in this increment. Its 2,208
compiled files are byte-identical to the prior literal-feed candidate anchored
to `eed6d0e3cfed3e6de573f89d3cc8675a76a98060`. The isolated test candidate comes from
a clean archive of that commit with only `src/research-find.test.ts` overlaid.
The live candidate's five documentation-only differences from that commit are
retained in the GPU review; it is not described as a byte-identical full checkout.

The five previous find failures were stale expectations: one rejected supported
fragments and four expected discovery after HTTP 429. They are replaced with
positive fragment/redaction/cleanup coverage and explicit early rate-limit-stop
tests, not skipped or worked around by weakening browser policy. Feed MIME cases
also verify literal coordinates, source integrity and opt-in-only capture.
The find file now passes 260 cases; the full selected **21 files pass 1,597 cases**.
Production build, 21 strict test roots, formatting and lint pass. Earlier failed
logs and their baseline reproduction remain unchanged in the previous scope.

Evidence starts at `/dev/shm/agent-browser-research-find-alignment-september14/`,
with `/dev/shm/agent-browser-swebench-long-september14/` and
`/dev/shm/agent-browser-gpu-compatibility-september14/`. Durable copies use the
same scope names without the `agent-browser-` prefix under
`node_modules/.cache/native-validation/`. See native logs, `LIVE-VERIFICATION.json`,
per-site `PARENT-VERIFICATION.json`, the six replay artifacts and original GPU
`VERIFICATION.json` / `REVIEW.md`.

All browser/replay processes terminate and transports close; no credentials,
page scripts, SafeJS, other browsers, service listeners or real TTY/PTY are used.
No full native release, device/runtime acceptance, challenge solution, interactive
leaderboard, hardware recommendation or broad research-completion claim. Original
dirty work is preserved; no push in this increment.
