# JSON source selection and package API workflows — September 16, 2026

## Real native browsing

Three anonymous native GETs retrieve PyPI JSON API documentation, Requests
project metadata and TypeScript registry-tag metadata. HTTP200 and no classified
barrier are recorded for all three. No scripts, credentials, downloads of package
artifacts, installation, redirects, retries or challenge solver were used.
The docs contain both project/release GET routes and their example responses;
this is inspected API documentation, not a successful PyPI search workflow.

Requests metadata:192,973 decoded bytes /43,299 encoded bytes at
2026-09-16T20:25:46.934Z; TypeScript metadata:4,833 /1,537 bytes at
2026-09-16T20:25:49.235Z. Initial Markdown contains192,983 and4,842 bytes.
Independent comparison preserves the JSON source except the existing display's
terminal LF removal on the Requests body. Package names, versions and metadata
are source claims, not independently verified release/security recommendations.
The separate native RFC6901 reference GET is not a fourth application test.

## Implemented and verified

Add explicit lossless JSON Pointer selection to document extraction, research
CLI and pinned saved-response replay. Full-source grammar validation and
duplicate-member rejection precede success. Preserve raw number/string spelling,
CRLF and Unicode; provide exact decoded-text UTF16 spans. Bounds, unsupported
documents, missing pointers and output overflow fail rather than returning a
partial JSON value. See JSON-SOURCE-SELECTION.md for contracts and examples.

- Release01:2,957 passed/0 failed in38 explicit native files, including205 new
  tests (20scanner,66document,73CLI,46replay). Build/types/format/lint all pass.
- Full02:46,304 passed/1 failed in941 available files, 591.469 seconds.
  The963-entry canonical manifest still lists22 missing files; no completeness
  or SafeJS/device/TTY/live-script claim follows from this native run.
  The failure is the unchanged checkpoint-file mutation test, not a JSON test.
  Three isolated58-case baseline runs pass; candidate runs give58/0,57/1,58/0,
  with the same mutation failure. The cause remains unresolved, and the full
  gate is NOT green. Do not describe it as baseline-reproduced or erase it with
  passing repetitions. The checkpoint source and assertion are not changed here.
-135 saved bodies:128 successful comparison pairs preserve all extraction
  fields/Markdown/source DOM/reader metadata/classifications;7 matching long-profile
  non-HTML refusals. The new package JSON bodies separately pass default-profile
  selection, so these long-profile refusals are not package API access failures.
-13 pointers in two formats give26 maintained replay checks and26 native parsed
  CLI-batch checks. Independent Python JSON decoding and UTF16 slicing verify
  every selected value. Four actual CLI processes additionally pass under kernel
  and JavaScript network denial; original response receipts remain unchanged.
-Requests /info yields5,054 literal bytes and7,427 replay JSONL bytes instead of
  the192,983-byte original whole-document Markdown. TypeScript /engines yields
  a20-byte literal and2,158 replay JSONL bytes. These are output-size observations,
  not equal-format ratios, speedups or network bandwidth savings.

## Failed attempts retained

Core01 exposed two wrong resource-limit expectations, an incorrect long-profile
admission expectation and a lint-only fixture issue. Core02's first diagnosis
of the admission failure was wrong; the narrowed core03 reveals its actual
Invalid research evidence error. Existing long-v1 capture admission requires
text/html before decoding, so the final test asserts rejection before ownership
or document creation. No production rule was weakened to make tests green.
The independent reviewer identified the CLI limit expectation issue and found
no other concrete production defect within its bounded static review.

The first API replay supplied nonzero historical encoded bytes to a synthetic
route, which correctly rejected it. Its successor uses zero at that offline
boundary only. The first CLI verifier assumed triple backticks, whereas PyPI's
description needs four; the child itself succeeded. A corrected balanced-fence
verifier passes. Preserve all earlier snapshots, logs and failed checks.

## Remaining scope

This is a source-content feature, not package search, JavaScript execution,
CAPTCHA bypass or authentication acceptance. Historical100-entry citation-proxy
verdicts stay33 useful/67 other. SafeJS scheduling/runtime, rendering, crawler
access/handoffs, real password providers/passkeys/devices/TTY and the four
research topics remain unfinished. The full browser goal remains active.

Evidence: node_modules/.cache/native-validation/json-source-selection-september16/
and node_modules/.cache/native-validation/package-api-content-september16/.
The adjacent JSON retains hashes, captured request times, test executions and
all26 selected-output measurements.42 prior dirty tracked files and697 prior
untracked files are preserved separately from this feature.
