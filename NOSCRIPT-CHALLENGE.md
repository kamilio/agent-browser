# Bounded noscript challenge fallback

The native challenge classifier recognizes the paired HTML-source markers:

- A complete normalized title exactly `Just a moment`, followed only by supported
  periods, exclamation marks or ellipses.
- The complete bounded phrase `Enable JavaScript and cookies to continue`.

Both are necessary for this fallback. Generic JavaScript application notices,
documentation titles, partial phrases and misleading title suffixes do not match.
The existing raw-input limits (256 title and 8192 text code units), normalization,
word boundaries, status/MIME checks and data-property checks remain. Confirmed
`cf-mitigated: challenge` headers still take precedence.

Without independent provider evidence this is a **possible**, **unspecified**
challenge, not confirmed Cloudflare identification. Existing bounded Cloudflare
markers can identify the provider. The action is to stop and request human
handoff. This does not enable scripts, accept cookies, retry, rotate identities,
solve a CAPTCHA or bypass access controls.

## Why this matters

The September 15 Library of Congress capture was correctly blocked live by a
confirmed Cloudflare header. Its receipt retains that classification, but the
minimal saved primary-header projection intentionally omits `cf-mitigated`.
Ordinary replay of that failed receipt is denied and remains denied.

An explicit offline development experiment supplied only its captured response
body and projected headers to an in-memory transport. Previously the recognizable
noscript gate became an HTTP failure with no challenge diagnostic. The fallback
identifies the paired markers without inventing the missing header or changing
the original evidence. The experiment is not a fresh website request.

Explicit source-visibility filtering still checks the unfiltered title and body
first. Hiding either marker is not a way to turn a challenge into usable content.
This remains a bounded heuristic, not universal challenge detection.

## Content filtering is separate

For pages whose hidden source UI pollutes extraction, existing explicit filtering
can improve useful content without page JavaScript:

```sh
node dist/scripts/research-browser.js --reader \
  --reader-raw-policy separate-omitted-raw-v1 \
  --reader-visibility-policy source-hidden-inline-v1 \
  --format markdown PUBLIC_HTTPS_URL
```

The saved GOV.UK example drops an entirely hidden cookie banner, including both
contradictory confirmations and its buttons, while retaining driving-services
content. No cookie consent action occurred. Source filtering is not rendered
visibility: hidden menus, deferred panels and other intentionally hidden source
also disappear. Defaults are unchanged, and original captures are not silently
reinterpreted. See `READER-SOURCE-VISIBILITY.md` and
`READER-INLINE-VISIBILITY.md` for limitations and replay provenance.

Evidence: `reports/content-visibility-evaluation-2026-09-15.md`.
