# Explicit native table-section policy v2

The host-only source-heading scanner now accepts
`tableScopePolicy: "optional-end-tags-v2"`. It inherits the explicitly selected
v1 policy and adds just one transition: a `tbody` start may replace a canonical
`thead` group and its optional row/cell. Strict/default behavior and the existing
v1 literal retain their prior semantics; neither selects v2 automatically.

## Contract

For an untouched outer prefix P, the eligible suffix is exactly:

```text
P table thead
P table thead tr
P table thead tr td
P table thead tr th
```

An admitted, non-self-closing `tbody` start replaces that suffix with
`P table tbody`. The existing matcher inspects at most four charged stack slots.
The existing application path charges all removals plus the push and checks
depth before atomic mutation, then performs its normal yield/checkpoint. There
is no ancestor search, invented container, reprocessed token or raised limit.

Later alternating cells and rows reuse the existing own-depth rules; no new
cell or row transition is added. An intervening tracked opaque scope or an
already noncanonical suffix prevents this new plan. A canonical inner table
can transition without discarding its outer prefix. Any remaining outer scope
continues suppressing candidate headings.

V2 does not add thead-to-tfoot, tfoot-to-tbody, tbody-to-thead, implicit header or
footer closure at `</table>`, head recovery, EOF repair or arbitrary pop-to-table
behavior. Existing no-plan pushes and exact/plain close handling remain; this
is not a newly strict validator for every unusual table start.

Own-data option admission rejects unknown values, proxies and accessors without
coercion. Successful report provenance and trusted scope-context provenance
retain the exact selected version. Absence retains the prior report shape and
strict context. Private diagnostic branding, owned frozen context, source
identity, UTF-16 anchors, resource caps and cursor cleanup are unchanged.

## Why a separate version

The September 8, 2026 native trial in `SOURCE-SCOPE-CONTEXT-TRIAL.md` reports an
actual accumulated table stack under v1, with no raw source or event history.
A missed header-to-body transition is one consistent hypothesis, not an
observed live event. Local native DOM table code supplies section-transition
precedent, but its broader tree repair algorithm is not imported here.

V1's historical behavior and receipts must not silently acquire new semantics.
V2 is prospective and explicit. A synthetic construction can explain a possible
accumulation mechanism without reconstructing the website. The observed outer
`head` remains a separate unresolved scope; this patch must not promote headings
through it or claim that the W3C source will now extract.

No CLI, page API, source-operation wrapper, dependency or automatic retry is
activated by this feature. Native lexical candidates remain partial and are not
DOM visibility, HTML conformance, trusted source truth or WebAuthn acceptance.

## Validation

All 790 tests pass in five explicitly listed native files on September 8, 2026,
at 00:59:26.655917263–00:59:30.582571405 UTC: source-headings 463, source-input
105, token-cursor 139, tokenizer-issues 49 and resource-limit 34. Exactly 50 cases
exercise the new policy; 740 prior cases remain. The one intentional previous
fixture update changes an invalid v2 value to invalid v3, preserving unknown
policy rejection coverage rather than silently deleting it.

The new cases cover four canonical suffixes, depth-four alternating cells/rows,
outer head/template and nested table preservation, the synthetic 31-name v1
accumulation, opaque and malformed suffixes, excluded group pairs, unchanged
end/EOF behavior, selected provenance across yields, fixed strict/v1 counters,
UTF-16 anchors across windows, cursor cleanup and work/operation/window/abort/
timeout bounds. Resource errors have no scope brand; the pre-mutation budget
case does not pretend to inspect the failing attempt's private stack. Atomic
mutation order is separately reviewed in the runtime code.

Two-file formatting passes at 00:57:53.167068342–00:57:53.263252915 UTC. An
initial approval-review timeout is followed by one approved identical retry.
Build, five-file strict typing and scoped Biome all pass at
00:58:57.013115197–00:59:05.225122743 UTC. The isolated snapshot starts from
`0053a7ab28fd73d254538b1315f6c6042329a48b` and mirrors only this runtime/test
patch with full-file context and exact before/after byte guards. Unrelated and
denied pending work is excluded. Formatting does not change the independently
reviewed runtime. No actual old-runtime negative control is claimed.

Reconciliation at 01:00:28.941 UTC passes 2,716 native input identities, all 334
preserved source05 artifacts, the exact test totals and the five-file selection
from the committed 516-file manifest. This is not a full-suite result or live
source acceptance.

Frozen evidence: `node_modules/.cache/native-validation/native-source-table-sections/`.

| Artifact | SHA-256 |
| --- | --- |
| Runtime source | `f6f36a19af1ab9a3affac0494ac7a73e24de862db434b5aa9b89c99557b02f70` |
| Formatted test source | `b8c8546187af6a1ca33b491b87af8da16849096da7e0e8cddaa5d848184251cd` |
| `REVIEW.md` | `0b19a116fcaa1f781b6a16ac9f8e100a238648a6fdb0b8ebd962eedf53e1e607` |
| `evidence/native-01-INPUT-SHA256SUMS` | `73761395689bbd7b5d6152357e16d50b0071ee751c4c695670e6276e0f54be6e` |
| `AUDIT.json` | `5bd91112604ffd6f4a1d044f2e00caf7b28a4430555af0b4d30c089b01f13dd0` |
| `FINAL-SHA256SUMS` (48 entries) | `4be4abfa395f31d8fdc0fdcb6b02ad9b91c8b420e51841b70f7070ac6943864a` |

No fresh source request or wrapper activation is part of this feature. The
independent explicit-body head-boundary design is a proposal only, requiring
its own implementation, review and tests. Modern privacy, provider/vault/device/
page/consent, blocked research and all stopped/denied gates remain unresolved.
