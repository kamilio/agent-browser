# Bounded connection-verification diagnosis

The native challenge classifier recognizes connection-verification pages instead
of leaving their notices under only a generic failure. The observed case is the saved
September 15, 2026 Trustpilot HTTP403 response: it contains a verification screen,
not consumer reviews. Its original live report remains unchanged.

## Recognition and handoff

The existing HTML challenge rule now admits exact titles `Verifying connection`
and `Verifying your connection`, with optional trailing periods, exclamation marks
or ellipses. Its bounded text alternatives include the complete phrase
`Please wait while we verify your browser`. Title and text evidence are required;
an ordinary article title with that quoted phrase is not enough.

Existing case/whitespace normalization, 256-code-unit title and 8192-code-unit
text limits, cut-word checks, valid HTML MIME/status gates and header validation
remain. Existing challenge titles can match the new phrase, and the new titles
can match the existing challenge phrases. This is a bounded heuristic, not proof
of a provider, a rendered screen, malicious traffic or a required CAPTCHA type.

The observed Trustpilot result is `kind: challenge`, `provider: unspecified`,
`confidence: possible`, evidence `html-challenge-markers`, and action
`stop-and-request-user-handoff`. Existing header-confirmed Cloudflare precedence
and bounded Cloudflare-text attribution are unchanged. The hostname alone does
not select a provider. Retry advice retains its existing contract.

The research caller stops before extraction after recognizing the document
barrier. Selecting a main/section does not hide surrounding challenge evidence.
A requested bounded capture remains evidence, not replay permission; failed
reports remain evidence-only. The existing earlier HTTP429 stop retains precedence
for a headerless rate-limited response.

## Limitations

This improves diagnosis and avoids presenting verification notices as content.
It does not solve or avoid a challenge, authenticate, retry, change fingerprints,
execute JavaScript/SafeJS, or recover the blocked website's content. A null
diagnostic is not proof of unrestricted access. Reader visibility remains partial;
source-only hidden notices may differ from what a rendered browser would display.

Offline comparisons use available captured headers, which may omit original
challenge-header evidence. They supplement rather than rewrite historical live
classifications. See `reports/connection-challenge-2026-09-15.md` for fixture,
saved-body and caller validation, exclusions and remaining gates.
