# Preferred color scheme: bounded native primary-source findings

## Decision boundary

**A known absence of active preference maps to `light`. An unimplemented or
unknown media-condition evaluation is not evidence of that absence.** These
sources do not justify treating an unknown dark query as false to make an
unsupported CSS declaration disappear from applicable diagnostics.

Native source: `https://www.w3.org/TR/mediaqueries-5/`, retrieved **September 11,
2026**. Two accepted native heading sections were extracted: **§12.5
`#prefers-color-scheme`** and **§13 `#script-control-user-prefs`**. Parent discovery
is not evidence; all findings below come from those extracted sections.

## Directly established preference facts

Source: §12.5, `section-1.jsonl`.

| Question | Extracted rule or explicit boundary |
| --- | --- |
| Values | `prefers-color-scheme` is a discrete media feature with values **`light` and `dark`**. |
| `light` | Represents a preference for dark text on a light background, **or no expressed active preference**, which receives the light web default. |
| `dark` | Represents a preference for light text on a dark background. It is not defined as a test of the page's existing background or paint colors. |
| Legacy `no-preference` | The historical note says this value formerly existed; UAs converged on representing default behavior as `light` and **never matching `no-preference`**. It is not a third current value in the feature's value table. |
| Preference source | The user's expression may come from OS-wide settings or a UA setting. The feature represents the user's desire for the page, not simply what the author has painted. |
| Medium | Preferences may differ for screen and printing. UAs are expected to reflect a preference appropriate to the medium, not apply one out of context. No unconditional “printing means light” rule is supplied. |
| Embedded exception | In an SVG document using **Secure Animated** embedding mode, the preferred scheme **must reflect the embedding node's used color scheme**. The text explains that the outermost document needs the user's preference directly. |
| Privacy boundary | The SVG restriction limits an embedding-to-embedded communication channel: that mode cannot load external resources or run scripts, preventing an externally observable response. The extract says iframe extension is under discussion, not a settled general iframe inheritance rule. |
| Future values | A note anticipates possible added values and recommends complementary dark/not-dark author conditions. It does not define a general unknown-value parsing or matching algorithm. |

**Operational distinction:** no active user preference → light; no site override
→ the UA's preference, which may be light or dark. These are not interchangeable
states. Ordinary page theme/used-color-scheme state must not be substituted for
the user's preference without an applicable rule such as the specified SVG
embedding exception or an accepted preference override.

## Overrides and notifications actually extracted

Source: §13, `section-2.jsonl`; this is specification prose, not executed scripts
or proof that the native browser implements the API.

- **§13.1.3 `#color-scheme-attribute`:** valid color-scheme override values are
  `light` and `dark`. If an override exists, the UA must use it for the media
  feature in all stylesheets applied to an origin, including UA styles; for
  `matchMedia()`; when calculating used color scheme; for
  `Sec-CH-Prefers-Color-Scheme`; and for affected UA features.
- **§13.1.8.1–2 `#override-attribute`, `#preference-value-attribute`:** the override
  accessor returns the override or null. The effective value uses an override
  if one exists; otherwise it uses the **UA value**, not necessarily light.
- **§13.1.8.5 `#request-override-method`:** a UA-defined permission decision can
  reject a request with `NotAllowedError`. Null/empty input requests clearing;
  other input is checked against that preference's valid values. Its invalid
  API-value rejection is **not** a rule for matching unknown CSS media values.
  The interfaces are marked Window-exposed and SecureContext.
- **§13.1.8.4–6 `#onchange-attribute`, `#request-override-method`,
  `#clear-override-method`:** the text defines PreferenceObject `change`
  notifications when the UA knows its value changed; a Window with no document
  or a document that is not fully active terminates the update algorithm.
  Setting a first override or clearing an override can also fire a change event
  even when the effective value is unchanged. This does not establish the
  separate full MediaQueryList notification algorithm.
- **Draft limitations are explicit:** §13 includes open editorial questions about
  the details of setting an override and the proposed `TypeError` rejection.
  Do not infer a complete persistence, permission, or cross-document propagation
  implementation from this extract.

## What the two sections do not establish

- The result of bare boolean **`(prefers-color-scheme)`**, or the general parsing,
  unknown-value/unsupported-feature, negation, and matching rules. The separate
  boolean-context heading was discovered but **not extracted**. The legacy
  `no-preference` note does not settle every other unknown value.
- The actual OS/UA/medium preference or any site override in this native session.
  **No preference API, OS setting, page script, or protected fixture was probed.**
- General HTML/iframe inheritance, complete used-color-scheme calculation, or
  how arbitrary page CSS selects an effective user preference.
- A forced-colors-to-light/dark mapping. §13.1.4 `#contrast-attribute` only notes
  that contrast override cannot select `custom` because that value is coupled
  to forced colors; the dedicated forced-colors section was not extracted.
- The full Privacy Considerations section, comprehensive fingerprinting policy,
  detailed Client Hints behavior, or full media-query change-event scheduling.

For implementation planning, establish an explicit effective preference and
environment contract first. A declared no-active-preference environment can use
the sourced light default. A missing evaluator cannot manufacture that state.
No OpenBSD layout acceptance, CSS implementation compliance, or runtime preference
behavior is claimed by this source investigation.

## Evidence receipt

Lane: `node_modules/.cache/native-validation/native-preferred-color-scheme-source-september11/`

| Artifact | Evidence |
| --- | --- |
| `section-1.jsonl` | §12.5; **17,116 bytes / 206 selected nodes**. |
| `section-2.jsonl` | §13 and its subsections; **99,830 bytes / 1,626 selected nodes**. |
| `response-1.body`, `response-1.json`, `live.jsonl` | Original HTML, response metadata and original-byte native capture. |
| `LIVE-AUDIT.json`, `RESULT.json`, `*-EXECUTION.json` | **1 navigation, 1 bodyless GET, HTTP 200, 0 redirects/retries/mocks; 2 offline sections, 0 offline navigation/wire.** |
| `AUTHORIZATION.md`, `PROMPT.md`, `RELEASE-GO.md`, `RELEASE.json` | Source authorization and new-release metadata. |
| `PREFLIGHT.json`, `OWNED-COMMIT-VERIFICATION.json`, `*-INTEGRITY.json`, `*.sha256` | Before/after release/harness pins; six inputs checked against the release commit. |
| `LANE-PERMISSIONS.json`, `CHECKS.json`, `EVIDENCE.sha256`, `final-check.mjs` | Permission-timing exception, named final checks and artifact/report digest ledger; ledger excludes itself. |

Body: **697,033 decoded / 104,412 encoded bytes**;
SHA-256 `9e761f96f6a9935591264b470bdf5e4c1b5b15874c376b9de70e670171671c95`.
Receipt: **956,902 bytes**;
SHA-256 `83ed98d65dec410b32506b78bd08d92fb87326d5228ed6bab95ab31b96480820`.
Section hashes:
`fbbf347c5e2ef3ec75f52a76cb9cf015694d77be1675b4f109d6bc767cdaf457` and
`6645fd6d01f16dbd4f2b584542e93286c76df711d48d100bd04461dff32a69d0`.
Response Last-Modified was February 17, 2026; that is not a claimed publication
date or fresh browser compatibility validation.

Live child: **22:19:49.615–22:19:49.965 UTC**; offline child:
**22:20:22.911–22:20:23.439 UTC**, September 11, 2026. Unchanged native `long-v1`
admission; 14,061 outline nodes scanned without truncation. Each phase used one
child/capacity one, 30s+5s, 6 MiB output/file and environment allowlisting; offline
kernel/network guards remained active. Native 250 ms pacing was configured but
not measured between requests because there was only one. No body/node cap,
restriction, Retry-After, raw-body search/trimming, alternate client, subresource,
page script, credential, device/TTY, fixture read, build, gate rerun, source edit,
commit, or deletion occurred. Extracts remain partial native semantic results,
`extracted-unverified`; closed offline documents retain zero nodes.

**Permissions exception:** all runtime HOME/TMP directories were created `0700`
and remain empty. The enclosing lane inherited **`0775` during execution** and
was tightened to **`0700` before sealing**. This is recorded, not retroactively
treated as a private lane throughout; full constraint compliance is not claimed.
Final checks enforce lane ≤12 MiB and free space ≥64 MiB. Two preflight-only
metadata checks stopped on a copied Markdown's trailing blank line; original
source bytes are pinned and normalized text plus complete JSON metadata were
verified before GO. There was no browser relaunch or request retry.

## New release provenance

Runtime: `native-css-diagnostic-applicability-september11-round01/snapshot01/dist`;
commit `11f31bfd279b60520d07bafb0cd929884b384257`, audit base
`9b38bec02a06688f728a147ce75309e9ab112087`. Five owned source inputs plus the
manifest were verified against commit blobs; 20 gate receipts and all authorized
audit/result/full-ledger pins match. **10,390 passed / 0 failed / 2 existing
exclusions; 175 selected / 174 strict / 579 manifest** are historical release
facts. Full ledgers cover **1,066 source / 1,908 compiled** entries. Fixture-safe
rehashing covers 374 executable source/1,496 compiled entries; excluded entries
are not claimed freshly rehashed, while the six owned inputs were separately
verified. `native-source-heading-source-10/stdout.jsonl` and other protected
fixtures were not read. The older source harness/evidence remains unchanged;
its old runtime was not used. Only this report and the new lane were written.
