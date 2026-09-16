# Native reader link workflows

The original 100-page citation-derived corpus and every per-site outcome remain
in `reports/agent-citation-pages-2026-09-15.md`. It is not a measured global ranking
of agent page visits. Navigation attempted, body captured, nonempty extraction,
useful content, and full website functionality are different acceptance levels.

## Choose an explicit interaction

Current support for inline owners with block descendants is documented in
`SPLIT-INLINE-ACTIONS.md`: native pointer actions now retain the owned blocks'
real actionable rectangles. Ordinary split-inline CSS geometry remains explicit
unsupported behavior. The measured follow-up below records the older runtime and
is retained unchanged; the subsequent pointer fix has its own report.

For a real pointer workflow, use `BrowserSession.click(tabId, reference)` and
respect its geometry, visibility and hit-testing failures. The native reader
retains source anchors but does not reconstruct external CSS or execute scripts.
Before split-inline action ownership was retained, an inline anchor wrapping
block children hit the deliberately unsupported client-geometry contract.

For a keyboard link workflow, use the existing targeted Enter action:

```ts
const result = await session.press(tab.id, "Enter", { target: reference });
if (result.navigation?.kind === "document") {
	const destination = session.page(tab.id).document;
	const extracted = extractDocument(destination, { format: "markdown" });
}
```

Obtain the reference from the current native document, verify that it is the
intended source anchor, and check its resolved destination against the task's
read-only origin/path policy. The targeted action focuses the element and sends
keyboard/click events before its default action; cancellation prevents navigation.
An unfocusable non-link still fails. Relative links and a retained document base
resolve through the normal action path. This is not a naked transport fetch.

Do not silently replace pointer clicks with keyboard actions: their events and
requirements differ. Do not use Enter as a generic fallback on submit buttons,
account actions or unknown controls. It is not a way around authentication,
CAPTCHAs, response limits, or policy-denied requests. Scripts were disabled in
the recorded website workflows; fixture event cancellation is tested separately.

## Measured follow-up

`reports/native-link-workflows-2026-09-15.md` records three pointer workflows and
one separate keyboard workflow using clean committed native runtime `9e98f59`:

- Cambridge root → definition: pointer navigation and useful source extraction.
- Wikipedia root → source-linked article: destination exceeded the 2MB response
  limit; no completed article body or limit bypass.
- RunRepeat root → source-linked review: pointer geometry unsupported, with no
  destination request from that action.
- RunRepeat root → the same review: explicit targeted Enter navigated and
  extracted 27,423 Markdown bytes in a separate fresh workflow.

The RunRepeat keyboard result also has a network-denied saved-body replay.
Eight focused regression cases cover the supported keyboard path and cancellation.
No pointer-geometry implementation, automatic fallback, dependency, or production
API changed. The original website outcomes are not retrospectively upgraded.

## September 16 publisher-reader follow-up

The latest complete entry-page checklist is
`reports/agent-citation-revalidation-v2.md:85`. A separate source-linked follow-up
is recorded in `reports/reader-publisher-workflows-2026-09-16.md`: CNET,
Engineerfix and Reviewed each complete an actual native reader-profile click
from a fresh landing page to one exact, source-audited article URL. Six native
GETs return HTTP200 and nonempty extracted target text, with no retries or
redirects. Content availability is reviewed separately in that report.

This deliberately uses `loadResearchDocument` for both pages. It is a useful
content-reading workflow, not evidence that the original site's full CSS,
scripts, widgets or physical layout work. In particular, CNET's prior full-source
click remains unsupported even though this explicitly different reader workflow
can retrieve the article. Do not silently switch profiles after a failed action
and call that the same workflow passing.

Choose references and selectors from the actual current reader document, not
solely from raw-source attributes. The reader omits `rel=bookmark`, so
Engineerfix's source selector needed that predicate removed while retaining the
same heading and exact href. Reviewed's source card has an inline handler;
the reader omits it and tests only the retained public hyperlink's default
action. Checks on projected attributes do not prove their absence in raw source.

The follow-up requires one eligible exact-target anchor, same-origin HTTPS,
unchanged document base, native actionability, actual click events, and the
resulting destination document before extraction. It has no direct-navigation
fallback, alternate link, login, form submission, identity impersonation or
challenge solver. Barriers remain reasons to stop. Main-content-v2 and explicit
text-prefix-v1 retain their existing partial/fallback provenance; nonempty text
is not a claim of factual accuracy, completeness or successful scripted behavior.

## Six additional publisher tasks

`reports/reader-diverse-workflows-2026-09-16.md` records native reader workflows
for Business Insider, Good Housekeeping, Car and Driver, Bob Vila, CarBuzz and
IGN. The initial batch completes five article extractions; CarBuzz stops before
requesting its target because the supplied selector does not match.

A separate source-only diagnostic shows title metadata on an `h5` headline
container rather than the older `h3` anchor. A fixed-`h3` correction also fails
offline. An explicit class-and-exact-href selector succeeds in a second offline
proof and one separately planned live validation of the same requested article.
The diagnostic body differs from the failed run, so it is a later observation,
not exact-body proof of the original cause. Keep the first attempt failed.

Total new traffic is fourteen native GETs: eleven in the initial batch, one
source diagnostic and two in the explicit corrected-selector follow-up. There
are no automatic retries, redirects, credential use, script execution or direct
target-navigation fallback. The historical100-root-page verdicts do not change.
