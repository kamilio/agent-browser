# Native browsing, credentials and passkeys: four-day continuation

Requested September 5, 2026, with continuation through September 9, 2026
(UTC), within the existing overall continuation through September 10. This adds
focus to the active browser-improvement work; it does not turn
historical seven-day or five-hour measurements into new acceptance evidence.
Stop earlier if the user asks. No automatic claim of unattended execution or
four-day completion is made by this document.

## Work in progress

- Four research lanes use only this repository's native BrowserSession,
  NodeNetworkTransport, HTML loader and extractor: local LLM hardware, benchmark
  strengths/weaknesses, Astra discussion on Twitter/X, and Reddit opinions on Poe.
- Preserve timestamped native browsing attempts, including denied requests,
  challenge pages, script requirements, incomplete extraction and redirects.
  A loaded challenge is not access to the requested content. Social samples are
  not representative surveys; uncertain model names require primary evidence.
- Implemented bounded trusted extensible password providers, starting with explicit `.env`
  files and `pass` entries. Commands carry constant references, never resolved
  passwords. Native reference-only form submission is tested with synthetic
  credentials; real vault/service/runtime acceptance remains open. Never inspect
  the user's real vault or environment while developing.
- Implement passkey ceremonies behind explicit authenticator providers, with
  origin/RP binding, challenge handling, cancellation and real consent/verification
  requirements. A synthetic test provider is not a platform authenticator.
- Investigate native fingerprint consistency and challenge diagnostics without
  switching to Chromium, Firefox or a remote engine or promising challenge bypass.

## Execution sequence

1. Finish the already-tested normalization transfer change atomically. In parallel,
   use native browsing to collect real research and identify navigation defects.
2. Land a bounded credential provider boundary with synthetic adversarial tests,
   then reference-only command integration and agent-output confinement.
3. Land passkey broker and page-facing integration, then test registration and
   assertion against a synthetic relying party. Keep real authenticator, hardware,
   OS, synchronized passkeys and SafeJS acceptance separate until authorized.
4. Turn observed browsing failures into focused compatibility fixes and repeat
   browser-only research rounds. Report remaining challenge/login/script gates
   explicitly rather than replacing the engine or fabricating source access.

## Credential safety boundary

The intended first release resolves credentials only in trusted host code after
an exact HTTPS origin check. The agent supplies `secret:NAME`, not a provider key,
filesystem path, shell command or password. Providers are explicitly configured;
no ambient environment/vault discovery or page-visible secret lookup API exists.

Password masking alone is insufficient: a page can copy a password into text,
URLs, console output, screenshots, errors or encoded strings. Initial command
integration therefore seals the entire named session before resolving a secret:
data-returning commands are denied, allowed actions return fixed acknowledgments,
and tracing/cached exports are cleared. The session stays confidential until
closed; navigation or clearing an input does not prove secrets have disappeared.
This deliberately sacrifices post-login agent inspection until a stronger,
separately reviewed declassification boundary exists. The authorized target page
and trusted embedding application can still receive the password; this is not
protection against a malicious authorized site or a compromised host process.

No private key export or fabricated user verification is acceptable for passkeys.
An unavailable authenticator must report unavailable rather than emulate success.

## Evidence and gates

New work uses focused atomic commits and the explicit native test manifest.
Existing pending work remains separate. Native in-memory tests do not establish
live website, actual SafeJS, socket, TTY/PTY or platform authenticator acceptance.
The user has now requested native live browsing; this does not reopen previously
denied broad validation or authorize using real passwords, accounts or keyrings.
Research runner and raw round-one evidence currently reside in
`node_modules/.cache/native-validation/browser-research/`; durable summaries and
reproduction commands will be promoted only with accurate provenance.
