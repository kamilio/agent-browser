# Native head/table policy source trial

On September 8, 2026, one separately authorized native GET of
`https://www.w3.org/TR/webauthn-3/` runs at 01:34:08.739–01:34:09.014 UTC.
The frozen native engine selects table `optional-end-tags-v2` and head
`explicit-body-boundary-v1` without changing any numeric limits. HTTP 200 returns
UTF-8 HTML with Brotli encoding, 323,792 encoded bytes and 2,739,242 decoded bytes.
Actual metrics report one request, zero redirects/mocks/active requests and
closed transport. No other browser/client, cookie, authentication, script runtime,
source fallback or challenge bypass is used.

## Actual failure, not guessed recovery

The operation fails `unsupported` at `native-source-heading-discovery` with:

```text
kind: source-heading-structure
reason: heading-inline-structure
position: 250858
positionSemantics: last-committed-source-utf16
```

This guard runs inside an active heading. The actual rejected tag and whether
the non-inline or self-closing predicate rejected it are not recorded and remain
unknown. No source text, attributes, heading label, intermediate event history
or raw body was inspected. There is no scope-close/context diagnostic, candidate
discovery, extracted text, outline or body capture.

The earlier coordinate than source05's 872144 is a different guard path, not a
numeric measure of progress or regression. Policy selection alone does not prove
which implicit head/table transition occurred. In particular, the new result
does not retroactively repair or enrich the older scope failure. It does not
justify permitting images, SVG, block elements or unknown inline tags blindly.

The transport declares body SHA-256
`157030c980d44a3ce4b1ec5bcfaa16790c7dfefac20709af6ed2b11c7120970b`.
Encoded size differs from source05's 323,705 bytes; equal decoded-size/hash
declarations are not an independent body-byte identity check. No historical
capture was read, decoded or replayed.

## Fresh checks and integrity

- Five shell-only supervisor controls pass at 01:30:30.768–01:30:37.796 UTC.
  Both shell scripts receive separate syntax checks, alongside operation/control
  Node syntax checks. The first approval review times out; one identical retry
  is approved. These controls execute no native source operation.
- Twenty-eight actual-native synthetic integration cases pass at
  01:32:42.952–01:32:45.839 UTC, checking 1,757 inputs with zero forwarding,
  actual cursor/transport cleanup and one output write per case. All 21 prior
  fixture strings remain, using current selected-policy expectations; seven
  additions exercise real head/table transitions and disqualification. Only two
  explicitly disclosed mock metric counters are masked. These are fresh fixture
  executions, not renamed old evidence or a live source acceptance.
- The actual verifier status helper passes 4,817 rows at
  01:31:17.067–01:31:17.100 UTC: two admitted and 4,815 rejected, with no import
  output/file mutations, native imports, receipt reads or requests. Syntax checks
  pass. Independent operation review finds no actionable integration regression;
  the parent reviews stable control/probe/verifier changes.
- Actual source supervision runs 01:34:07.696815605–01:34:09.768095888 UTC.
  Native, timeout, pre-final and terminal statuses are one; availability completed;
  input/engine checks zero and stderr empty.
- Separately authorized zero-GET verification runs
  01:35:20.873–01:35:21.245 UTC. Integrity passes 1,748 compiled files and 37 RUN
  artifacts with no issues, retaining `evidence-only` / `native-failure`, expected
  exit one and 2,588 metadata bytes. Candidate availability and replay readiness
  remain false; body identity and outline integrity remain null. Verifier stdout
  and stderr are empty. Full malformed policy/schema/IO/candidate-success
  verifier controls remain unrun; status controls do not establish those gates.

Frozen evidence: `node_modules/.cache/native-validation/native-source-heading-source-06/`.

| Artifact | SHA-256 |
| --- | --- |
| `SOURCE-INPUT-SHA256SUMS` | `1a82ac91b1a20258308d4de3746bbf6dbac4230e3560b30801f714df5b24941b` |
| `RUN-SHA256SUMS` | `62d1651fc6624d351b88eb457b3ae9f2406bfd7d1b59800d59d1d7cfb9d0f7ad` |
| `exit-code.txt` | `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865` |
| `stdout.jsonl` | `a2b8e3f9c16b690b902e3c90418be670407d0c2022a9d3a059981595899b6b44` |
| `INTEGRITY.json` | `3902c5cd979987549602e73c0144f2bad2e49b4bccb86592654f2954cd88c64a` |
| `FINAL-SHA256SUMS` (362 entries) | `c72f44dd7c2dff57c2033363e8381a66aa0796fca10a6be185ae88b731bfc8d0` |

Operation `abdcf89c02d22ae83d0502d4bd5fb8e5edda6731aa49fc3a9a7188a8702b2f33`;
verifier `88238ebbe489d35b30c12dade23ab573a25418cb3c68f3a0da813cee3f5c8cd6`.
Frozen engine commit label `f7628bce15b29d4983ddc3dbebe52b9735b40895`, inventory
`e7738fd413c38043da4b812d71158ff3924c2d9bf7edb111cf6c1f31aedda11a`.
Its package/dist match the exact 856-test head-boundary snapshot byte-for-byte;
that feature validation is distinct from this source trial.

## Next bounded work

Design trusted finite heading-inline failure metadata while preserving the
existing short-circuit predicate order, generic error shape, private diagnostic
authority and every grammar/resource limit. Diagnose the actual rejected branch
and finite known tag category before proposing any acceptance change. New code,
review, native tests, wrapper/probe activation and source authorization remain
separate gates. Modern WebAuthn privacy research, provider/vault/device/page/
consent, blocked topic research and all stopped/denied gates remain unresolved.
