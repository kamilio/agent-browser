# Native Markdown table representation diagnostic

September 8, 2026. Two new owned synthetic fixtures pass their explicit native
representation and safety checks; a separate artifact verifier confirms the
retained observations. Both original-style raw-label verdicts remain false.
This is not a repaired ROCm control, table-association guarantee or live source run.

## What ran

The unchanged historical `research-long-cli-verified` engine processes exactly
the old literal synthetic table and a short hyphenated paragraph. Each uses
BrowserSession, synchronous native route fulfillment, the native semantic reader
and native Markdown extraction. No alternate parser or Markdown decoder is used.
All1732engine files are pinned by inventory
`3bad32d30cef7acce61c8f0a455cdebd88f5ef0c494ae1fd129ecc22b88535b2`.

Diagnostic child: **10:14:58.429Z–10:14:58.730Z**,301.652436ms, exit0;
supervisor10:14:58.321Z–10:14:58.832Z, outer exit0. Each fixture records one
mocked request and zero forwarded requests/redirects; active0 and transport
closed. DNS/wire/server/process guards record no attempts. No source GET occurs.
Both fixtures retain partial native-semantic-reader evidence, not page execution.

Verifier child: **10:15:41.629Z–10:15:41.878Z**,248.31079799999998ms, exit0;
supervisor10:15:41.520Z–10:15:41.980Z, outer exit0. It checks pinned artifacts,
native-export byte equality and raw/escaped predicates independently, without
native reexecution. Its artifact-integrity/diagnostic/representation flags are
true with no errors. Neither action has stream overflow or unstable inputs.
Child stdout/stderr are empty; complete phase streams have126 and22events.

The diagnostic approval timed out before execution; one identical retry received
approval. The independent verifier received fresh approval on its first request.
Those approval events are conversation evidence, not claims inferred from files.

## Observed representation

| Fixture | Native export bytes | SHA256 |
| --- | ---: | --- |
| Literal table | 78 | `81f2086daed55b1d06665b32c5efc4a692667819cfa2b81a78fd3fd01b631976` |
| Paragraph | 65 | `0443d90e3e7281a4598c70171dddb07095ddffcbc83b6e1399b9c7e3df69fcf6` |

In both exports, the raw labels Release-A, Release-B, GPU-A and GPU-B are absent;
their literal backslash-escaped hyphen spellings are present. The heading and
Yes/No labels remain present. Each original-style raw check still expects true:
the four false results are retained, not stripped, normalized or relabeled passes.
Separate representation predicates use their declared escaped/raw expectations.

The actual table export concatenates header labels without table delimiters and
renders following cells as separate text blocks. Token presence does **not**
establish which release/GPU a value belongs to. The paragraph shows escaping
outside tables; neither fixture identifies the missing assertion in the old failed
ROCm run. `ROCM-TABLE-CONTROL-TRIAL.md` remains unchanged and supplies no GPU facts.

## Preparation, limits and evidence

Initial static review found a too-small Bash input cap and cleanup phase writes
that could skip cleanup. Narrow fixes retain exact pins and attempt all cleanup
operations while preserving prior errors if later publication fails. Original
modules/ledger and both reviews remain intact. A stale standalone Driver hash was
corrected before execution. No syntax or failure-injection test is claimed.

Child60+2s and outer90+5s deadlines are finite. Supervisor startup/publication are
outside the child timer but inside the outer timer; outer shell startup/redirection
and final status publication are outside it. Reports are capped at64KiB, Markdown
at16KiB, ordinary payload at128KiB and action artifacts at256KiB. No guarantee of
complete publication after kill/disk failure or general OS network isolation is made.

Input authority: `b02f541cf938439a9f19faeeb9c6742b31513046c9341badfff3b54197b8fefe`.
Diagnostic ledger: `f37f97b2c6217109954a440282ac9f8c328c3937621d3548d058fdd887222850`.
Verifier REVIEW.json: `28b4f21c3cc875383262f47837175ce79f0225318d6927300fed141e89318f70`.
Evidence lane: `node_modules/.cache/native-validation/native-rocm-table-diagnostic-01/`.
Independent static evidence review checks all14inputs,1732engine files and both
run ledgers with exact directory coverage. It discloses the reviewer's earlier
static-review role and parent-supplied approval chronology. Parent final audit
checks all48inventory entries;49files including the inventory are frozen under
`dfc321fe2df4da51ca55d712b23c076240ca8a2f5a7aededa1c2f1db5be03eb6`.

The result motivates future bounded table extraction, not relaxed validation or
another source request. Real websites, table association, credentials, devices,
SafeJS, fingerprinting and challenge acceptance gates remain outstanding.
