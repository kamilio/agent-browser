# Bounded native layout paint-order comparison

September 12, 2026. **Single BA process completed; the originally planned
counterbalanced AB/BA comparison did not complete.** Both authorized process
runs are consumed. This is bounded primitive regression evidence, not whole
browser performance, website validation, pixel evidence, or end-state acceptance.

## Result and decision boundary

The new runtime has higher observed median time for ordinary blocks (+3.3%) and
separate-border tables (+10.5%), but lower observed median time for the collapsed
rowspan fixture (-4.8%). These are observations from one process running new
before old, not statistically established regressions or speedups. The slower
noncollapsed cases must not be hidden; neither should this noisy, incomplete
comparison alone justify a production optimization.

| Profile | Boxes | Items | Charge units old → new | Old median µs | New median µs | New / old | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ordinary blocks | 50 | 50 | 493 → 493 | 21.078 | 21.768 | 1.032744 | +3.3% |
| Separate-border table | 76 | 76 | 767 → 767 | 47.312 | 52.302 | 1.105475 | +10.5% |
| Collapsed rowspan table | 76 | 78 | 1,046 → 832 | 49.574 | 47.218 | 0.952487 | -4.8% |

Units are microseconds per complete `layoutContentItems` iteration, including
the same bounded charge callback and item-count/checksum consumer. Medians are
computed from nine samples of 300 iterations each. Charge-call counts equal
charge-unit counts in these fixtures. The collapsed case uses 214 fewer charged
units (-20.5%); this does not imply a general reduction in wall time.

Static inspection of the pinned new `layout-paint-order.ts` confirms that an
empty collapsed-background map selects the original paint-index comparator.
Ordinary/separate ordering and charged work are unchanged here, but the new
map allocation and per-box collapsed-background checks still execute. This is
not proof that the noncollapsed fast path has zero additional CPU cost.

## Scope and method

Only committed native modules from the two release snapshots were imported:
`html-parser`, `styles`, `document-layout`, and `layout-paint-order`, with their
native dependencies. No working-tree runtime modules were used. Parsing and
native layout setup completed before any timing. Layouts were reused, with
unchanged native CSS/layout limits, including the 2,000,000 layout-work ceiling.

Identical synthetic HTML was supplied to both runtimes at 320 × 240:

- Ordinary blocks: 48 empty three-pixel-high blocks, yielding 50 boxes.
- Separate-border tables: two sibling tables, each with four rows, eight
  columns and a first cell spanning two rows; 31 cells per table, 76 boxes total.
- Collapsed-border tables: the same table fixture with only the CSS
  `border-collapse` value changed to `collapse`; 76 boxes and 78 paint items.

All profiles are below the predeclared 128-box limit. They contain no `bgcolor`,
scripts, images, text glyphs, font resources or resource requests. Fixture URL
strings are parser context only; no URL is fetched. Native setup-work counts
match old/new at 300, 10,209 and 24,422 respectively; these setup counts and
setup time are not the measured primitive.

The successful process runs each profile in BA order (new, then old), with
exactly 100 warmups and nine samples × 300 iterations per runtime/profile.
It retains all 54 samples, totaling 16,200 measured iterations. Every timed
sample consumes and checks item counts, charge counts and a rolling checksum;
serialization and semantic hashing are outside the timed interval. No samples
were dropped, no outliers removed, no warmup increased and no reruns added.

## Semantics

Ordinary and separate-table item sequences are exactly equal between runtimes,
including compact item identity and hashes of the full item payloads with
runtime-specific `ref` strings omitted. All three profiles have equal item
multisets. No body or glyph dump is included in the evidence.

Collapsed-table order intentionally differs:

- Each table retains all 31 cell backgrounds and its border item.
- Old: 23 cell backgrounds per table precede that table's last row background.
- New: zero cell backgrounds precede their own last row or structural
  background; all cells precede their own collapsed-border item.
- Cell-relative order remains stable. The first table's last cell still
  precedes the second table's table background: cells wait for their own table,
  not every table in the document.

These are native layout-item ordering checks, not guessed pixel or hit-testing
claims. Saved compact records and hashes support read-only verification of the
recorded comparisons; the verifier does not recreate layouts or rerun rendering.

## All timing samples

Sample order is retained. Values below are µs/iteration rounded to three
decimals; `run1/stdout.jsonl` retains exact integer elapsed nanoseconds, exact
iteration counts, calculated per-iteration values, UTC timestamps and checksums.

| Profile / runtime | Samples 1–9, µs/iteration |
| --- | --- |
| Ordinary / new | 35.854, 29.390, 27.718, 20.243, 22.101, 20.185, 21.642, 20.145, 21.768 |
| Ordinary / old | 35.390, 28.278, 24.489, 19.622, 21.478, 19.757, 21.078, 19.664, 21.049 |
| Separate / new | 57.236, 74.667, 48.465, 48.706, 46.789, 52.764, 52.302, 54.329, 52.250 |
| Separate / old | 55.246, 47.554, 45.787, 47.458, 45.658, 47.295, 45.334, 59.579, 47.312 |
| Collapsed / new | 63.773, 47.218, 48.218, 46.921, 46.923, 47.076, 47.055, 58.775, 48.252 |
| Collapsed / old | 66.084, 49.895, 49.647, 49.384, 49.347, 49.339, 49.574, 49.283, 60.912 |

Observed sample ranges overlap: ordinary old 19.622–35.390 / new 20.145–35.854;
separate old 45.334–59.579 / new 46.789–74.667; collapsed old 49.283–66.084 /
new 46.921–63.773. Early-sample changes and occasional high samples are visible.
No CPU isolation, scheduler control, GC isolation, JIT convergence assessment,
confidence interval or significance test was performed. The successful process
lasted only 969 ms including setup and logging. Fixed BA order and the missing
AB timing process materially limit attribution of these small timings.

## Preserved failure and exact execution times

The original protocol and inputs were declared before execution. Process 0
(AB) started at **2026-09-12T11:53:24.796Z** and stopped at
**2026-09-12T11:53:24.904Z**, during setup and before warmup, semantic comparison
or timing. It produced zero timing samples. The harness incorrectly required
an empty formatting issue map after native table layout. The actual map was
`{"display-layout-not-supported":2}`.

The committed formatting-tree implementation records that counter for table
containers and explicitly handles it through the native layout coordinator.
The correction admits exactly those two counters for the two-table fixtures;
ordinary blocks still require none, and all other semantic checks remain.
This is a harness assertion correction, not a native guard relaxation.

`AMENDMENT.md` and `AMENDED-PREDECLARATION.json` document the correction before
the second and final process. The original harness and its failed-run artifacts
remain unchanged. `benchmark-ba.mjs` differs only in the expected issue map.
No replacement AB run was performed.

Process 1 (BA) completed successfully from **2026-09-12T11:55:13.936Z** through
**2026-09-12T11:55:14.905Z**. Its external command interval was
2026-09-12T11:55:13.907Z–2026-09-12T11:55:14.925Z. Original release inputs were
verified before and after both processes, and again at sealing.

## Release and runtime pins

| Pin | Old | New |
| --- | --- | --- |
| Release commit | `96541506e7878af0bea70ed002bf13111765da3c` | `fa49059b123243f1b220a8b198607a62c5dc4927` |
| Historical native pass count | 13,042 | 13,226 |
| Release lane | `native-quirks-image-september12-round01` | `native-html-background-color-september12-round00` |
| Release receipts verified | 20 | 20 |
| Actual source files verified | 1,144 | 1,148 |
| Actual compiled files verified | 1,960 | 1,964 |
| Actual `git show` snapshot inputs | 10 | 8 |

All source files additionally match the named commit's Git blob identities.
The 10/8 explicit inputs include each release's owned files and
`native-tests.json`; they were read from Git, not inferred from a receipt alone.
The historic test counts were verified as release evidence, not rerun here.

Source inventory SHA-256:

- Old: `d6def5f5dc5b444fd5f1ef05c02e95ad961c83d0124bfb0316ff466b989d3815`
- New: `9dfcd694f03843d14853dd74fb21fd394e4665e9e77f654a17f91dc1d6362e43`

Compiled inventory SHA-256:

- Old: `a6a08e4c041dd8f7adadf214dd7c385e43d0ccc14078a39856d9c2c862d9ecf7`
- New: `b9e8be9c784221a44d0375b8b8ca2ce1e1f8dac47cbddc94245a41d95821319d`

Release receipt-manifest SHA-256:

- Old: `2a895e3b6fefb9b38148faac3fe14c32279109b38f97a1e6e1e7cae330d437c1`
- New: `2018a312829cafa38e2d8f2010c13d24fa11f8d1027639f49e30e52bb86744ff`

Both processes use Node v22.22.0 at
`/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, SHA-256
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
The unconditional kernel-denial launcher is the existing
`grid-placement-worker-september11/sealed-exec.py`, SHA-256
`de2004bda2a17062d584e601f800d7f0a6b46dba398dc6e4bf9e6c65093d2d91`.
Python, timeout, libseccomp and commit-verification receipt hashes are retained
in `protocol.json` and the before/after proofs.

## Enforcement, artifacts and verification

Private evidence lane, relative to the repository:

`node_modules/.cache/native-validation/native-background-paint-benchmark-september12`

Each benchmark executes under the pinned unconditional kernel seccomp rules
denying `socket`, `socketpair` and the launcher's additional network/io_uring
syscalls. The runtime records seccomp filter mode 2. No socket probe was used.
Git proof capture occurs outside benchmark denial. Each process has its own
empty HOME/TMP, an explicit six-variable environment, ignored stdin and no TTY.

Limits remain two process runs, 40 seconds plus five seconds kill grace each,
6 MiB output, 16 MiB lane and 64 MiB minimum free space. The two processes
produced 79,288 combined stdout/stderr bytes. Space checks passed before/after;
the lane is far below its limit. Neither time nor space bounds were raised.

Artifacts include the original declaration, corrected-run amendment, original
and corrected harnesses, exact fixtures, both process outputs and execution
receipts, release/source/compiled/tool/Git proofs, all samples, `SUMMARY.json`,
the analyzer, and verification scripts. The original `SEAL.json` and every
artifact it lists remain byte-for-byte unchanged. Its report is retained as
`LAYOUT-PAINT-ORDER-PERFORMANCE.original.md`. The follow-up
`VERIFICATION-SEAL.json` covers this clarified report, the original seal and
artifacts, and the new split-verification handoff. Digests are supplied
separately for independent verification.

A sealing-only syntax failure (missing `collect()` closing brace) is also
retained in `SEALING-FAILURE.md` and `seal-syntax-failure-original.mjs`. It
occurred before that script's module body ran; correcting it did not execute
another benchmark or alter samples.

### Outside-seal actual Git verification

The original `verify-readonly.mjs` was run **without the kernel-denial launcher**.
It called `verifyInputs()`, which invokes actual `git ls-tree` and `git show`.
That was read-only verification with no benchmark rerun, but it was not a
kernel-confined offline verification run. No socket-denial guarantee is claimed
for that invocation. The original script remains an immutable historical
artifact, not the current split-verification entry point.

To independently recapture and compare the actual Git proofs, run this new
entry point outside the kernel-denial launcher:

```sh
/home/kjopek/.nvm/versions/node/v22.22.0/bin/node \
  node_modules/.cache/native-validation/native-background-paint-benchmark-september12/verify-git-outside.mjs
```

This separately verifies the 10/8 actual Git inputs and every source blob at
the pinned commits, checks the original artifact hashes, and emits the actual
paths, SHA-256 values and Git object identities. Its output explicitly labels
the operation as outside-seal Git verification, not strictly offline execution.

### Socket-denied artifact and sample verification

`verify-artifacts-sealed.mjs` uses only filesystem reads, hashing and analysis of
retained records. Its dependency graph contains no Git or subprocess invocation
and does not import `verify-inputs.mjs`, native layout modules, or benchmark
scripts. It verifies the original and follow-up seals, current 20/20 release
receipts, actual 1144/1148 source and 1960/1964 compiled inventories, retained
outside-seal proof integrity, semantic records and all 54 timing samples.
It **does not recapture actual Git provenance**; that is the separate step above.

Run under the same pinned socket/socketpair-denying launcher, with empty local
HOME/TMP and no TTY. From the repository root, using Bash:

```sh
set -o pipefail
lane="$PWD/node_modules/.cache/native-validation/native-background-paint-benchmark-september12"
launcher="$PWD/node_modules/.cache/native-validation/grid-placement-worker-september11/sealed-exec.py"
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC \
  HOME="$lane/run1/home" TMPDIR="$lane/run1/tmp" \
  /usr/bin/python3 -I -B "$launcher" \
  /home/kjopek/.nvm/versions/node/v22.22.0/bin/node \
  "$lane/verify-artifacts-sealed.mjs" EXPECTED_VERIFICATION_SEAL_SHA256 \
  </dev/null 2>&1 | cat
```

Supply the independently provided follow-up seal digest. The pipe keeps stdout
and stderr non-TTY and preserves failure with `pipefail`. Neither verification
entry point reruns benchmarks or writes files. The kernel constraint here is
socket/socketpair denial, not a filesystem read-only mount or a claim that every
possible I/O channel is disabled. `VERIFICATION-HANDOFF.md` records the split
and limitations. Every pre-execution benchmark input remains unchanged.

Only this new report and the private lane were written. No production source,
shared documentation, TASKS, manifest or index was changed; no commit or push
was made. No live website, network, replay, real SafeJS, provider, credential,
device or TTY validation was performed. Parent replay evidence is separate and
is neither incorporated nor claimed by this performance report.
