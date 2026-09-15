# Native link workflows — September 15, 2026

## Original 100-page coverage

All **100 selected URLs were attempted** in the original native-browser sweep.
The complete list and unchanged per-site outcomes are in
`reports/agent-citation-pages-2026-09-15.md` (the 100-row table).
This is a reproducible **AI-citation-derived host-root proxy**, not a verified
ranking of pages most visited by agents. No ChatGPT/Claude visit telemetry was
established, and citation frequency is not browsing frequency.

A new independent local evidence audit checked selection from 250 ranking rows,
113 hosts, 100 selections and 13 exclusions; all 100 receipts and executions;
all 95 body hashes; the 107 target GET starts/closes and socket closes; and every
Markdown result row against JSON. No mismatch was found. The original recorded
review remains **48 useful, 20 consent/access, 11 HTTP error, six navigation-only,
five empty, five transport failure, three other failure and two login-required**.
This is integrity checking of historical evidence, not a second live 100-site run
or a new independent reading of every extraction. Full audit: local evidence
`HUNDRED-AUDIT.md`; its hash is pinned in the adjacent JSON.

## New functional workflows

Clean committed native runtime: `9e98f59fcfb154821fdfa75c78d4c04274761d2e`. All 1,498 committed
runtime source/script/config inputs match the archived build; source and compiled
hashes were checked before launch and after runs. No dirty working runtime used.

| Workflow | Result | Destination Markdown |
| --- | --- | ---: |
| Wikipedia root → source-linked Wikipedia article, pointer | 2MB decoded response limit; article not captured | — |
| Cambridge root → patronize definition, pointer | Native document navigation and useful source content | 37,391 bytes |
| RunRepeat root → Brooks Revel 9, pointer | Unsupported block-in-inline geometry; no review request | — |
| RunRepeat root → Brooks Revel 9, explicit Enter | Separate fresh native navigation and useful source content | 27,423 bytes |

Exact observed source hrefs, labels, status/body hashes, timestamps and individual
outcomes are in the adjacent JSON. The keyboard workflow uses the existing
`session.press(tab.id, "Enter", { target: reference })` API. It does not patch the
pointer guard, silently substitute another action, fetch a guessed URL, or bypass
an access restriction. See `NATIVE-LINK-WORKFLOWS.md` for the explicit action choice.

**Four workflows, eight real HTTPS GETs including one redirect, six complete body
captures, zero retries.** These are follow-ups on three existing corpus roots,
not four additional members of the 100-page corpus. Wikipedia's failing article
request received headers but did not complete within the retained response cap.
RunRepeat's pointer failure occurred before any destination network request.

Sampled Cambridge definition paragraphs and RunRepeat review verdict, pros/cons
and cushioning sections contain substantive source content beyond navigation.
These are partial source extractions, not factual verification or product advice.
The reader does not execute page scripts or reproduce externally styled rendering.

## Reproducibility and limits

A separate kernel/socket-denied replay loaded the captured RunRepeat root and
previous review body through synthetic transport: pointer rejected at one mock
request, explicit targeted Enter navigated at two. It extracted 27,423 Markdown
bytes; both returned trees closed exactly once. JavaScript network/process guard
recorded zero attempts. This replay is not a fresh live request.

All four live sessions/transports closed with zero active requests and cleanup
errors. All eight observed requests/sockets closed; all child processes/groups
were reaped. The keyboard live run independently observed its two tree close
calls. The earlier pointer harness wrote empty tree objects because
`resourceUsage().closed` is not an API property; those entries are **not** tree
closure evidence. No live run was repeated to conceal that instrumentation gap.

The first post-run audit compared a pinned transport IP to an origin hostname;
it failed before emitting AUDIT.json. The retained corrected audit checks HTTP
Host authority instead. No observer, receipt, production behavior or website
request was changed by that correction.

Every child used an empty HOME/TMP, minimal environment, one tab, at most two
navigations, credential omission, same-origin HTTPS GETs, a 192MiB heap and 60s
outer deadline. Existing 2MB response, 8MB total and 256KB extraction limits stayed
unchanged. No credentials, account actions, page scripts, SafeJS SDK, alternate
browser, challenge solver, spoofing or site retries. Details and scope amendments
are pinned in the private local evidence lane.

## Selected native validation

- Baseline: **343 passed, zero failed**, six explicit native-manifest test files.
- Candidate: **351 passed, zero failed**, seven files, including eight new cases.
- Build, strict selected types, formatting and lint all pass.
- New tests cover pointer rejection followed by explicit Enter, direct Enter,
  canceled keydown/keypress/click, relative/base-relative hrefs and non-link failure.
- No production changes; no full-manifest run or actual SafeJS acceptance claimed.
- Existing uncommitted work is preserved; this checkpoint is not pushed.

Outstanding: split-inline pointer geometry, bounded recovery of over-limit bodies,
other original login/access/source failures and separately authorized credential,
passkey and SDK acceptance. The overall browser-improvement goal remains active.
