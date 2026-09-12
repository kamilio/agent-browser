# CSS Text — separately recorded offline extraction

## Outcome and provenance

Independent verification on September 12, 2026 confirms the preserved failed
source capture and Main's **separate** successful offline extraction. The original
GET returned 200 with 540,326 decoded / 95,159 encoded bytes; its absent
`cf-mitigated` header caused a TypeError before parsing. That lane remains a
failure: exit 1, zero parses, zero extracted contexts. Its report and 135-entry
seal are unchanged; its original read-only verifier passes under socket denial.

Main's existing extraction ran at **2026-09-12 15:48:45.457–15:48:45.624 UTC**:
one native parse, no HTTP, 12,733 nodes, revision 12,732, 74 headings. Indent
context: 3,504 UTF-16 code units / 18 inspected siblings; transform: 6,804 / 44;
combined: 10,308. Query closure reports zero cached selectors/indexed nodes.
The probe imports only the gated snapshot's native parser and selectors.
This verification did not execute that probe/supervisor or parse any page.

Captured response metadata is **Last-Modified August 14, 2026, 15:43:35 GMT**,
with server cache HIT. This is not a latest remote-content, document-date,
implementation-conformance or feature-acceptance claim.

## Source-rule paraphrase

Text-indent inherits and accepts a length-percentage with optional hanging and
each-line. Percentages use the block container's own inline-axis inner size;
intrinsic size contributions treat percentage indentation as zero. Indentation
acts like a margin at the line's start. Normally the first formatted line is
affected; an anonymous block's first line qualifies only when that block is its
parent's first child. Each-line also selects lines following forced breaks, not
soft wraps; hanging reverses the selected lines. Inheritance reaches descendant
inline-blocks.

Text-transform changes presentation, not source content or plain-text copying.
Full Unicode mappings include conditional casing; applicable language-specific
mappings apply only when the content language is known. Capitalize uses
UA-dependent word boundaries, ignoring inline-box and out-of-flow boundaries.
Transformation follows whitespace phase I and precedes phase II; combined
transformations apply casing, then full-width, then full-size-kana.

## Independent checks and pins

Release: `4c2d78c8b7c6c10acef91a04ed6b17613ce0f345`.
Exactly 17 actual local Git objects were recaptured outside kernel isolation:
14 input blobs plus commit/root/src trees. All match both archived captures
(34 byte comparisons), object IDs, tree links and snapshot inputs. All 20 gate
receipts and complete current 1,160-source / 1,972-compiled inventories match.
The historical 13,769-pass native gate was not rerun.

- Decoded body SHA-256: `17c26f1b41455947f106dac81736944b12da328ee4892c7c5b601f5b65ced55a`.
- Source inventory: `dc7656ca4237cd1cc04abeae7cc0e5f32160b21cdd387218e76e330a105eb481`.
- Compiled inventory: `1694a83c51d8a3f2659174bbb8d288feda6d74113ef54114852231ec528584d3`.
- Main's unchanged stdout: `d6c0e69df4ebb6d8974378f2c4d3268b083b986254426f918b07833bd7cbd42e`.

The new extraction `RECEIPTS.sha256` and `SEAL.json` bind this report, original
extraction files, new verifier, independent Git/verification evidence, original
source seal/body and release proofs. Exact additional pins and named checks are
in private `text-indent-work-september12/parent-source-verification/runs/audit-001/stdout.txt`.
All lane paths are under `node_modules/.cache/native-validation/`.

## Limits and evidence gaps

Recorded values fit the unchanged 2 MiB source, 50,000-node, 256-heading,
512-sibling/context, 40,000-context-code-unit, 65,536-serialized-code-unit,
5,000,000-query-work and 30-second limits. Supervisor maxBuffer is 256 KiB
per stream, not an explicit aggregate cap; actual stdout/stderr total 12,244/0
bytes. No rerun or cap increase was used.

The program asserts unchanged revision, and nodeCount/structuralNodesBuilt both
report 12,733, but it does **not** assert or report a post-extraction nodeCount.
Query closure has metrics; document close is called without post-close metrics.
Main's summary lacks contemporaneous script/wrapper hashes, kernel status,
process-group absence, resource sampling and private-directory-empty receipts.
Current hashes, reviewed wrapper code and currently empty directories cannot
retroactively supply those attestations. Independent verification itself records
kernel mode, supervisor cleanup and private-directory emptiness.

Actual text-transform implementation, full CSS-PSEUDO first-line semantics,
layout and overall browser acceptance remain unproved. No sockets/network,
SafeJS, external browser, credentials, protected source-heading payloads,
source/TASKS/manifest edits, commits or pushes were used by this verification.
The original failure is not converted into extraction success.

## Read-only verification interface

From the repository root, the following directly runs the new read-only verifier
with socket/socketpair denial, minimal environment, private HOME/TMPDIR and
DEVNULL stdin; it neither executes Git nor imports/parses the page:

```sh
ROOT=/home/kjopek/project/agent-browser
CACHE="$ROOT/node_modules/.cache/native-validation"
PRIVATE="$CACHE/text-indent-work-september12/parent-source-verification"
env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C TZ=UTC HOME="$PRIVATE/home" TMPDIR="$PRIVATE/tmp" \
  /usr/bin/prlimit --fsize=6291456:6291456 --core=0:0 -- \
  /usr/bin/python3 -I -B "$CACHE/native-text-indent-transform-source-september12/sealed-exec.py" \
  /home/kjopek/.nvm/versions/node/v22.22.0/bin/node \
  "$CACHE/native-text-indent-transform-extract-september12/verify.mjs" sealed </dev/null
```

Output schema: `text-indent-source-extraction-verification/v1`; `verified`,
`mode`, `release`, `readOnly`, `network`, `pageImports`, `newPageParses`,
`gitExecutedInsideKernel`, named `checks` and explicit `limitations`.
Audit has 11 checks; sealed mode adds `new-evidence-seal` (12 total).
For retained supervision use `python3 -I -B "$PRIVATE/run-verification.py" sealed review-001`
with a fresh tag. Its exclusive files go only to `postseal/review-001/`; those
post-seal receipts bind the existing seal/ledger but are not self-included in it.
