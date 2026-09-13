# Website test inventory — September 13, thirty-fourth update

**Added explicit HTTPBin public-form coverage. Live loading passes; native pointer
submission remains blocked.** This adds a different website to the recent
Internet/Wikipedia/Python checks without claiming a successful echo or POST.

| Scope | Actual outcome | Not established |
| --- | --- | --- |
| Fresh native BrowserSession GET, `https://httpbin.org/forms/post` | HTTP200,1,397bytes,96nodes; no externalCSS/images or access diagnostic | Live form interaction; the harness then has a node-ID API mistake |
| Corrected native captured-body preflight | One form,15controls; all8synthetic fill/check operations pass | Full original response-header parity or fresh live state |
| One genuine offline native pointer submit | Fails before pointer/submit events; two fieldsets and one time input defer | Native pointer/form acceptance or an actual POST |

Live: September 13, 2026, 18:51:40.726–18:51:40.878 UTC.
Offline: 18:54:27.493–18:54:27.668 UTC. Total **one new HTTP GET, zero POSTs**.
There is no retry, disguised request, automated challenge solving, semantic-submit
fallback, synthetic geometry, body rewrite or fabricated echo response.

The failed live harness is preserved. Correcting `formControls` node objects to
their IDs is tested offline before considering more network traffic. That exposes
a real browser formatting limitation: `fieldset` references `e28` and `e52`, and
`input[type=time]` reference `e85`. Values and choices work, but these deferred
elements prevent width resolution for the submit button. Nineteen preparation
events occur; the subsequent pointer attempt emits none. No POST reaches the
offline adapter, so no outbound-denial or echo-verification branch is claimed.

The runtime remains the prior audited **20,672 passed / zero failed / two unchanged
skips**, not a new test-suite result. Selection remains402files/401strictroots/
760manifestentries, leaving358unselected. No production source changes occur here.

Single instrumented live/offline observations use0.14/0.17seconds and85.22/88.48MiB
peak RSS respectively. Different scopes and unsuccessful end-to-end outcomes;
these are not repeatable performance results or evidence of a speedup.

Detailed form controls, failures, resource limits, containment and evidence:
`HTTPBIN-NATIVE-FORM-SEPTEMBER-13.md`.
Previous checkbox/alias checkpoint:
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-THIRTY-THIRD-UPDATE.md`.

Next: real fieldset/legend/border and time-control rendering, then the same native
pointer path before another bounded live echo attempt. Broader website navigation,
Internet/Wikipedia/Python acceptance, repeatable performance, safe access-block
handling and research remain incomplete. Credential/provider, passkey-device,
SafeJS, socket and TTY gates remain separate. Overall goal: **ACTIVE**.
