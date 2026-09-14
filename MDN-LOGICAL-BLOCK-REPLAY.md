# MDN: captured logical-block recheck

## Observed result

On September 14, 2026, **08:53:38.387–08:53:38.811 UTC**, the committed native
runtime completed one separately scoped replay of the original MDN
`Document.querySelector` capture. Prepared verification and the independent
parent outcome checks pass. This is a captured-page diagnostic, **not a new
live website test, successful interaction or complete page rendering**.

The runtime is commit `565aa1ef23c6cb5621fdda7813ad5bfed66a7cb1`, bound to
`/dev/shm/agent-browser-logical-block-september14/release01/snapshot01/dist`.
The final 22,926-pass native gate/two unchanged exclusions, all 1,360 source and
2,184 compiled files, 155 receipts, nine owned committed sources and clean
manifest are rechecked. The earlier 22,910-pass development revision is not used.
The native suite is not rerun here; its acceptance scope remains separate.

## Comparison with the latest MDN baseline

Baseline: `node_modules/.cache/native-validation/mdn-font-wide-preparation-september14/before-RESULT.json`,
the September 14 07:55:01 UTC observation on runtime `fefbb8b`, not the older
decoration-alias replay. Its result, verification and 35-entry evidence seal
are rehashed without rerunning or changing them.

| Native diagnostic measurement | Font-wide baseline | Logical-block runtime |
| --- | ---: | ---: |
| Raw unsupported-property occurrences | 132 | 126 |
| Applicable unsupported-property occurrences | 68 | 64 |
| Total overlapping formatting occurrences | 210 | 206 |
| Retained CSS diagnostic samples | 128 | 128 |
| Omitted diagnostic occurrences | 37 | 31 |
| Cascade work units | 4,206,307 | 4,208,458 |

All other raw/applicable issue counts stay unchanged, including raw invalid
values 31 and applicable invalid values 15. Ten formatting issue categories
remain. These are diagnostic occurrences, not distinct failed elements,
completeness percentages or proof that width/geometry guards would admit the
page. No retained block-margin/padding rejection remains; the samples are not
exhaustive. The earlier two retained `padding-block` samples were not a complete
count of all six raw/four applicable occurrences affected in this comparison.

Every formatting metric stays unchanged: 1,954 visited DOM nodes, 2,054 boxes
including seven outside markers, 15,270 text code units, 83,210 formatting work
units and 65 deferred subtrees. These are formatting metrics, not a claim that
the document contains only 1,954 DOM nodes. The stylesheet metrics still report
18 external sheets, no imported sheets, 591 rules, 1,446 declarations and 84,329
code units. Their declaration counter does not enumerate accepted expanded
longhands.

The cached diagnostics read leaves style metrics unchanged and reuses cascade
build 1. Work increases by **2,151 units** across runtimes; the observation does
not establish a speed or memory improvement. Actual spacing, pixel and hit-target
behavior is established by the separate synthetic tests in
`LOGICAL-BLOCK-SPACING.md`, not by this formatting-only page inspection.

## Bounded samples and remaining gaps

Native diagnostics report `exhaustive: false`, 128 retained samples and 31
omissions. Retained states are 57 unmatched/active, 51 matched/active,
18 not-evaluated/inactive, one matched/uncertain and one unresolved/active.
The bounded window now exposes later `margin-inline-start`, inline padding,
mask and alignment samples. Their appearance in the window does not mean new
regressions appeared; removing earlier rejections changes which samples fit.

The separate attribution pass uses 127 lookups and retains five candidate
records. Its lookup budget leaves 36 generated and 530 inline candidates
unexamined. Empty sampled categories do not establish absence of a layout issue;
this pass is not an exhaustive per-node explanation of the aggregate counts.

Inline-axis logical spacing, remaining units, masks, display/positioning and
other unsupported features remain. The MDN destination is still uncaptured.
No click, width resolution, geometry call or raster is attempted in this run.

## Scope, integrity and cleanup

The native BrowserSession performs one navigation; the loader serves **19
original captured resources/270,288 decoded bytes**, exactly once each. It uses
the original corpus/header/body hashes and unchanged documented bounds. Only
the native browser interprets HTML/CSS; surrounding tooling reads metadata,
native-produced JSON and opaque hashes. There is one default formatting build,
one cached diagnostics read, one hint query and the unchanged bounded native
attribution pass. No new assets or missing destination are fetched.

Wire requests, page scripts, clicks and recorded JavaScript network/process
guard attempts are zero. The seccomp wrapper does not collect denied-syscall
telemetry, so empty JS guard arrays are not a count of every kernel denial.
The source-only loader and byte-identical existing guards/supervisor retain
pipes, a private empty environment, 30-second timeout plus five-second grace,
35-second watchdog, 6 MiB aggregate output cap and 10 MiB file-size ceiling.
New binding, scope and provenance labels do not reuse an old authorization.

Supervisor interval: 08:53:38.260–08:53:38.825 UTC. PID/process group **1454864**
exits zero and is absent at verification; output is 139,239 bytes, with no cap,
watchdog, stream, integrity or cleanup error. Session, transport, query/image
owners and documents close; documents have zero nodes, private home/tmp are
empty and removed. Before/after source, compiled, fixture and framework pins
match. No credential/provider, passkey/device, SafeJS, socket, real-terminal or
challenge acceptance is established.

Independent scope review notes one inherited label: the byte-identical
supervisor's invocation still says `Font-wide release01 snapshot01`. It is a
stale descriptive label, not the runtime identity. Release pins, imports, result
runtime and workload provenance bind the logical-block release01 shown here.
The sealed supervisor/invocation are preserved unchanged rather than rewritten.

## Evidence

Original execution lane: `/dev/shm/agent-browser-mdn-logical-block-september14/`.
New RAM evidence is volatile, so a byte-identical durable copy is retained at
`node_modules/.cache/native-validation/mdn-logical-block-replay-september14/`.
Its persistence receipt records original paths and copied hashes. Embedded paths
continue to identify the original execution; the copy is not another run or a
relocation of historical evidence.

| Artifact | SHA-256 |
| --- | --- |
| `before-RESULT.json` | `65b10ac4c6188f59e8af9aa83c3d1c5a8770ce22998041b6ee336b624c575da9` |
| `VERIFICATION.json` | `abdb3cad4a043682a4f13b7ae6b22bfa7271ee23a5ce4ca90672e68668ceeece` |
| `PARENT-VERIFICATION.json` | `22540f037e376bf583afc60399a49edf7211fa094e3288f80c93ce40b1eee317` |
| `EVIDENCE.sha256` (40 entries) | `d0e49e2e4347b16ed3529a90c7faa3458f5c05cf8406adbf323c72bbb54e61da` |
| `PARENT-GATE-PROOF.json` | `13f5007049309aac2599396d193d9cf1f7adadd78aa83401686634902f511408` |
| `RELEASE.json` | `d94f467b492b545c15236600d94e618f6647529776673356a0f58a9ea4fdb7a3` |

Next is a separately scoped current-runtime replay of Python's existing
two-page capture, exercising actual interaction on another site rather than
treating repeated MDN diagnostics as broad coverage. Continue observed logical
spacing/unit gaps afterward. Original research, broader live sites/forms,
credentials/passkeys/devices and runtime/challenge gates remain open. Overall
browser goal active; existing work and historical evidence preserved; no push.
