# Man7 fieldset-height captured recheck — September 14, 2026

## Outcome

**The native date(1) click now reaches a destination navigation request.** The
previous percentage-table-width and percentage-cell-descendant-height layout
guards are no longer the stopping point for this exact captured workload. The
flow instead stops before transport because the original archive has no date(1)
response: `ReplayMiss`, code `replay-miss`.

This is verified progress through native loading, discovery and link activation,
not a completed two-page flow or live website acceptance. There is no destination
response or commit, no wire request and no online fallback. The missing capture
was previously only an independent future limitation; this run actually reaches
it. Do not repeat the same incomplete replay to infer a destination result.

The observation runs **15:24:52.577–15:24:53.765 UTC** on adopted runtime
`71d0c8b59f7e92532eb956a972c3cb118789e9b7`. All eight workload/framework files,
including the ordinary click and corrected image-owner instrumentation, are
byte-identical to the preceding table-width recheck. Original September 12
responses and prior reports remain immutable.

## Actual native behavior

| Observation | Recorded result |
| --- | --- |
| Initial document | ls(1) commits, title `ls(1) - Linux manual page`, 722 nodes, revision 727 |
| Discovery | 64 of 64 anchors inspected, two selector queries; selected native reference `e472` |
| Link | `date(1)`, href `../man1/date.1.html`, target `_self` |
| Action | One ordinary BrowserSession click; cleanup records one mouse action |
| Destination attempt | Native-session, top-level bodyless GET for the resolved date(1) URL |
| Missing response | Sixth adapter attempt; `transportEntered:false`, `accepted:false`, no fabricated response or online fallback |
| Navigation counts | One explicit initial navigate call; two session navigation attempts, one document commit |
| Post-failure document | Same URL, root, node count and history; revision changes 727→732 |
| Accepted replay | Four original mocked responses, 39,562 decoded bytes, each served once |
| Other denial | Original optional cross-origin tracker denied locally before transport |
| Wire / scripts | Zero / zero |

The post-click document is **not claimed to be revision-unchanged**. Native
interaction occurred before the destination request was rejected. The retained
initial URL and history are not evidence that activation was skipped.

The single bounded formatting inspection records 719 boxes, 707 visited DOM
nodes, 10,626 text code units, 18,869 work units and three deferred table
coordination shells. Applicable cached CSS issues are empty. Neither diagnostic
changes the document revision or cached metrics. These counters and elapsed
times are observations, not a performance benchmark.

## Verification and execution boundary

The unchanged evidence verifier passes **18 checks / zero failures** at
15:25:15.391 UTC. Child and supervisor each retain **exit 1** for the failed
destination flow; the verifier exits 0. Verifier success establishes scoped
execution, intact inputs and cleanup, not website acceptance.

Preflight passes at 15:24:51.895 UTC. The parent separately binds and reviews the
final audited runtime: 23,851 native passes, zero failures, two unchanged
exclusions; 482 selected files / 481 strict roots; 2,941 source and 2,200 compiled
files; all 1,391 committed runtime files byte-match the snapshot. The full native
suite is not rerun for this observation.

The supervisor runs 15:24:52.433–15:24:53.815 UTC with a 30-second deadline,
five-second grace, pipe-only I/O and a 6 MiB output cap. Actual output is 62,237
bytes. Kernel, network and process guards remain unchanged. No timeout, truncation,
stream/spawn error, retry, direct destination fallback, forced click, extra asset,
script, SafeJS, credential/provider/passkey/device access or real TTY/PTY probe
occurs. This run grants no live-network allowance.

Session, transport, document, image, query and interaction owners close without
cleanup errors. Pending work settles in two samples, approximately 2.49 ms, with
stable counters. Private HOME/TMP directories are empty and removed; the process
group is absent. Runtime, original fixture/receipt inventories, historical seals,
prepared frameworks and 1,483 protected worktree files verify unchanged.

## Evidence and next step

New lane: `/dev/shm/agent-browser-man7-fieldset-recheck-september14/`.
Durable copy:
`node_modules/.cache/native-validation/man7-fieldset-recheck-september14/`.
`SEAL.json`, `EVIDENCE.sha256` and `PERSISTENCE.json` separately record closed
artifacts and byte-verified persistence. No new data is appended to old captures.

| Artifact | SHA-256 |
| --- | --- |
| `before-RESULT.json` | `b692c2de031c7b596150470c84a4ee685c8673ec6dbee922345a4fe26212a822` |
| `before.jsonl` | `78f3412344b7338bd74587dc38c9fcbd252b6fd0862960ce3da1ef9ea0d34726` |
| `before-EXECUTION.json` | `b6f61592088c7ec4f8b68ee37098d4b17afc171ed79dcdf6c00d68ec32b1d2ec` |
| Runtime release audit | `7180bfe9da686e5f987f4fbbd63240ec2a32ae398f06b51ecdb328eac7558fcb` |

Next obtain fresh, separately scoped native live-flow evidence that can include
the naturally requested destination, while retaining old captures and failures.
The new live-flow lane is preparation-only until parent review and launch release;
it does not change this replay's zero-wire scope. Restrictions/challenges must
stop that flow for human handoff, not trigger spoofing, bypass or repeated requests.
Broader site coverage, HN CSS gaps, research, providers/passkeys and device gates
remain open. Existing dirty work is preserved; no push occurs for this report.
