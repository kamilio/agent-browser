# Conservative article focus inside a main landmark

`main-content-v3` is an opt-in extension of `main-content-v2`. It can select a
single substantive article inside a navigation-heavy main landmark, rather than
returning the entire main. No-policy, v1 and v2 behavior remain unchanged.

```ts
extractDocument(tree, {
  contentFocus: "main-content-v3",
  format: "markdown",
});
```

The native command host accepts `extract --content-focus=main-content-v3`.
The research browser, link-content workflow and replay CLI accept
`--content-focus main-content-v3` with their existing option/format constraints.
The link-content workflow's default remains v2. Build the source before using
new flags; no implicit network retry or page-script execution is introduced.

## Refinement rule

V3 first applies v2's landmark and admission rules. With exactly one nonempty
outer main, it can refine that scope when all of these hold:

- Exactly one nonempty outer semantic article exists within that main outside
  ancillary subtrees. Nested articles belong to their outer article.
- No admitted visible nonwhitespace text or nonblank HTML image alt text exists
  outside eligible local article ancestry, except within navigation subtrees.
- Ancillary means HTML header/footer/nav/aside or the native banner/contentinfo/
  navigation/complementary role. Their articles cannot become local candidates,
  but only HTML nav or the native navigation role excludes outside context.
  Header/footer/aside prose, credits, disclosures and image alternatives retain
  the main unless they are within navigation. No CSS class, ID, domain, wording
  or content-length heuristic identifies which prose matters.

The main boundary resets local article/ancillary/navigation ancestry. An outer article or
navigation ancestor cannot suppress substantive evidence inside the main.
Nested main landmarks remain part of the selected outer main. Multiple local
articles, outside warnings/headings/text/image alternatives, or no local article
retain the whole main. No-main and ambiguous-main cases retain v2 behavior.

This uses one existing bounded focus traversal. All admitted branches are scanned
even after finding a candidate; node/depth limits are not increased. Existing
omission, namespace, visibility and leaf-descent rules apply. Ancillary context
only affects the refinement decision: it does not hide nodes inside a selected
article or change global landmark counts. It is not a complete readability or
rendering algorithm and does not identify important information from image pixels.

The initial September 16 implementation excluded all ancillary context. The
saved/live source review in `reports/focus-corpus-2026-09-16.md` found that this
discarded a funding disclosure in a main header and source credits in a footer.
The corrected local rule retains such context without domain-specific exceptions.
Historical outputs and measurements in that report are unchanged. Content placed
inside an actual navigation landmark can still be excluded by this explicit
policy; it does not promise complete rendered-page context preservation.

## Metadata

V3 includes v2's global `outsideArticleContent`. With a unique main, it also
includes `mainArticleCandidates` and `outsideMainArticleContent`. Those two local
fields are absent without a unique main. Successful refinement records
`selected: "article"` and `reason: "unique-article-in-main"`; other reasons retain
their existing meaning. Global and local article counts can differ because
ancillary article cards are not local refinement candidates.

Metadata remains frozen and charged to output limits. Global outside content
does not overrule the existing main priority; the local signal determines
whether narrowing that main is permitted.

## Preserve source visibility provenance

V3 does not invent visibility. A reader capture with
`hiddenContentSemantics: false` can still expose authored hidden controls. The
saved vLLM guide contains a hidden Back to top button outside its article; under
that original interpretation v3 correctly retains the main and can still exceed
the output budget. Do not discard arbitrary buttons to force article selection.

For a new explicitly configured reader operation, the existing
`--reader-visibility-policy source-hidden-v1` can apply authored hidden attributes
before v3 focus. This is a different source interpretation, not a retroactive
change to a receipt or proof of CSS/rendered visibility. Saved-source reprocessing
must record the changed policy separately; ordinary replay preserves captured
policy. Source/access classification remains a separate gate.

## Recover a complete failed-output capture

The replay CLI now accepts `--recover-output-limit --content-focus POLICY` for
v1, v2 or v3, on the default profile. The caller supplies the same trusted receipt
and complete-body pins required by existing selector/section recovery. The API
entry is `recoverResearchOutputLimitContentFocus` in
`scripts/research-json-replay.ts`.

The new path uses the existing failed-output admission without weakening its
receipt, body, profile or original-failure checks. It preserves captured reader
policies and records recovery kind `captured-output-limit-content-focus`, the
original failure and `originalRequestRetried: false`. It makes zero requests.
It does not guarantee that the automatically chosen scope fits the output budget.

JSON/Markdown and table options retain their existing restrictions. MIME repair,
text-prefix fallback and empty-outline recovery cannot be combined with this
path. Ordinary successful captures still use ordinary replay without the recovery
flag. This feature does not relax authentication, access, runtime or sandbox gates.
