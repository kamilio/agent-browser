# Heading and section rate-limit coverage

September 13, 2026, follow-up to `RESEARCH-FRAGMENTS.md`. This is a test-only
correction and coverage extension. Production rate-limit behavior is unchanged.

## Corrected expectations

Four old heading-outline/heading-section cases expected content extraction after
HTTP429. A fresh isolated run of the current audited source reproduced exactly
those four failures: 264 passed, four failed, no exclusions. They are now changed
to require the actual stop-before-extraction contract, with original HTTP status,
failure stage, null section match count or absent heading outline, and explicit
stop-without-retry advice. Expectations for other HTTP failures remain intact.

Sixteen additional cases cover both native and reader modes, body-capture on/off
and a simultaneous confirmed Cloudflare challenge on/off. An asset-bearing429
body must not reach either document loader, heading discovery or section
extraction. The existing request/cleanup assertions require one request,
credentials omitted, unchanged source body, recorded body digest and closed
session/transport. Retry-After120 advice remains relative to response receipt;
capture preserves the body only when requested. A confirmed header challenge
retains semantic-barrier precedence without losing rate-limit advice.

## Verified scope

The final isolated run passes **496 tests, zero failures, zero exclusions** across
five explicitly manifested suites: research-headings, research-section,
research-rate-limit, research-fragment-navigation and research-admission-evidence.
Strict TypeScript, configured formatting and source immutability checks pass.
No live HTTP, sockets, credentials, device, SafeJS or realTTY probes occur in this
test run. The 16 new cases are part of496, not added to that total.

Run: September13,2026,04:41:56.080–04:43:06.918UTC. The snapshot derives from the
audited17741 production source and overlays only the two changed test files.
Evidence: `node_modules/.cache/native-validation/site-functionality-work-september13/`:

- `baseline00/results`: fresh264/4/0 reproduction, unchanged source.
- `fixed00/results`: strict pass; formatting failure; no tests executed.
- `fixed01/results`: final496/0/0, strict/format and unchanged source inventories.

The previous2614/0/4 focused result remains historical; its four excluded cases
are not retroactively relabeled. The older broad17741/0/2 gate is also unchanged:
the two legacy suites were not selected by that broad gate. This new focused run
is not a new broader audit, cannot be added to17741 because coverage overlaps,
and does not close any live website or human challenge-handoff acceptance gate.
