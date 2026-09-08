# Native NVIDIA directory attempt

September 8, 2026. A fresh native-browser investigation of
`https://www.nvidia.com/en-us/design-visualization/desktop-graphics/` stops at a
network-policy refusal. This public-directory attempt is separate from the earlier
proposed product endpoint's404. Neither old endpoint nor another source is retried.

## Recorded outcome

The native operation ends08:16:49.990Z with `outcome:failure`, `stage:network`,
`failure.category:policy-denied` and `primary:null`. Transport accounting reports
one request, zero redirects/encoded/decoded/mock bytes, zero active requests and
closed transport. That count is not proof of a completed HTTP exchange. No HTTP
status, final response URL, redirect target, body identity or source content is
admitted; no document loading/extraction occurs and no native export exists.

The bounded category does not identify the precise policy branch. It does not
establish403, a redirect, a challenge, a nonexistent directory, or product facts.
No message expansion or follow-up probe is used to guess the cause. Runtime
policy refusal is distinct from execution approval: all three actions below
receive separate fresh approvals and actually execute.

| Action | UTC interval | Result |
| --- | --- | --- |
| Synthetic controls | 08:16:22.819–08:16:23.040 | 12/12pass,exit0,zero real requests |
| Single native navigation | 08:16:49.828–08:16:50.098 | completed exit1,network policy-denied |
| Independent zero-GET verifier | 08:17:14.945–08:17:15.274 | completed exit1,failure integrity admitted |

The verifier retains `verified:true`, `usefulOutput:false`, `export:null`; it does
not turn failure into research success. All actions have unchanged pinned inputs,
empty stdout/stderr and no signal. The frozen1732-file engine is unchanged.
Controls include actual native retention of a fictional label/link without
following it. That synthetic fixture supplies no observed NVIDIA product or URL.

## Evidence and limits

Evidence: `node_modules/.cache/native-validation/native-hardware-nvidia-index-source-01/`.
Parent static metadata inspection confirms the statuses and missing source result;
all28final-ledger entries pass opaque read-only rehash. No source receipt prose,
body, capture or linked page is read. Audit:
`/tmp/native-hardware-nvidia-index-source-01-final-audit.log`.
Final ledger SHA256:
`65ffab341f8ead582e4ff2fb03a8ab926ab07fed9ad5520d04dd6afaa4d9e895`.
Verifier INTEGRITY SHA256:
`500681ede02cd24b921b32ba0818cdc199496f6771f126b26ef6c32c07a74d45`.

No GPU name, specification, usable model capacity, runtime support, measured LLM
performance, price or purchase recommendation follows from this attempt. There
is no retry, alternate endpoint/client, impersonation or challenge workaround.
Earlier research in `BROWSER-RESEARCH-SEPTEMBER-08.md` remains unchanged. A future
bounded diagnostic improvement may make newly thrown native policy reasons more
specific, but cannot retroactively supply this failure's cause or authorize access.
