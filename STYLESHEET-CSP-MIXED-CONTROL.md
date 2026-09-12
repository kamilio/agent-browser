# Mixed stylesheet/image CSP control — September 12, 2026

**The retained ordinary-stylesheet failure now passes its intended behavior.**
This is one constructed native memory-fixture load, not a website visit or replay.
It uses committed native15946,
`00761341d8516ef842f7050faf4522e33c75fb50`, exclusively from the audited
`native-stylesheet-csp-september12-round01/snapshot01/dist` runtime.

At **21:31:25.667–21:31:25.724 UTC**, the native session loads the same HTML and
policy used by the earlier control:

```html
<link rel="stylesheet" href="/blocked.css"><img src="/admitted/entry.png">
```

Policy: `img-src 'self'; style-src 'none'`.
HTML SHA-256: `c1157fae1192101a437a80f7eb7f9d301f61c39c48925d5d8a0625f0b3f3ad30`.

- Exactly two memory-transport callbacks: the document and admitted PNG.
- **Zero stylesheet callbacks, zero installed external sheets.** Native issues
  retain `stylesheet-policy-denied` and `external-stylesheet-not-loaded`.
- The PNG completes with natural dimensions **2 × 4**, `originClean: true`, and
  no image error. One document commits. No explicit formatting/used-layout,
  screenshot or click acceptance is claimed.
- **Zero HTTP requests** and no new attempted website host. Synthetic transport
  counters are not wire-byte measurements.
- Cleanup leaves zero pending loads, nodes, active/queued image work, resources,
  or waiters, and no cleanup errors. Session, transport and image owner close;
  private HOME/TMPDIR remain empty. Supervisor exit is zero, without signals.

## Preserved comparison

The earlier native15601 control at
`image-csp-work-september12/plain-stylesheet-control00/` fetched the document and
blocked CSS, installed one sheet, and denied the image under its older blanket
image-CSP guard. The subsequent image-candidate worker's thirteenth fixture also
retained the ordinary-style bypass while admitting the image. Neither old result
is rewritten. The new control directly checks simultaneous stylesheet denial and
image admission; it is separate from the 77 new unit cases and 15,946-case release
result, not added to those counts.

## Verification and limits

Private control: `node_modules/.cache/native-validation/stylesheet-csp-work-september12/mixed-control00/`.
Main read-only verification completes **21:32:35.628 UTC**, checking result and
cleanup, exact old fixture identity, 1,196 source files, 2,008 compiled files,
the 20 release receipts and eight control receipts. The commit proof separately
verifies all 13 committed runtime inputs against the tested snapshot. No further
native load or HTTP request occurs during verification.

- Result SHA-256: `2338b69534d52e84523d0fd901f4242287e3beb6b0a2b0cb8decd7289e1cbafa`.
- Eight-receipt ledger: `97ca3ae375bfe5b5728166ed83fa94725b9f59bb1ffdc73887cf55b76e68e497`.
- Release audit: `0fd87c51fba6215dc07325456e346b3116207f5efe06ac26188b28963a5679df`.

`STYLESHEET-CONTENT-SECURITY-POLICY.md` retains the full scope and limitations:
this does not implement complete inline/nonce/meta/browser-wide CSP. The fresh
IANA website remains blocked at unsupported SVG decoding. Broader website,
research, performance, credential-provider, passkey-device, SafeJS and challenge
handoff gates remain separate. No credentials, device, socket self-probe,
alternative browser, dependency, cap increase, bypass or push is involved.
