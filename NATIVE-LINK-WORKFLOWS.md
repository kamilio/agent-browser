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
