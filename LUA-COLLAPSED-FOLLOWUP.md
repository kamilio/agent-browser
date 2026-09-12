# Lua collapsed-border follow-up and evidence review

The unchanged Lua contents capture still fails the real manual-link click on
both sealed native runtimes. The old11599 and new11784 runs each replay exactly
four responses, commit one document and attempt one discovered link click;
neither requests the destination. There is no additional HTTP traffic and no
third page replay. Original live capture and replay timestamps remain separate
in `LUA-COLLAPSED-TABLE-REPLAY.md`.

The measured result is **no removed guard**: one presentation-hint issue, one
table deferred entry and seven collapsed-border issues remain, alongside the
same applicable CSS counts. Formatting work rises from27918 to30299. Native DOM
serialization and body text match; the bounded extraction attempt fails on both
runtimes rather than proving successful extraction. The table's original
`width="100%"` is retained. This is not proof that that attribute alone explains
the failure, nor evidence to remove unrelated table or CSS guards.

## Parent verification

The parent reproduces all27 original replay checks and both113/115-entry
ledgers across116 artifacts, with zero new page sessions. It verifies both full
source/compiled inventories and source Git-blob identities. The historical safe
Lua verifier runs separately under socket denial; its actual result and the two
locally read pinned Git trees are hashed before the main socket-denied verifier
reads them. This avoids Node's subprocess socketpair requirement without
permitting network access or modifying the sealed replay lane.

Parent evidence:
`node_modules/.cache/native-validation/collapsed-model-work-september12/parent-lua-verification-fixed01`.
The method and exact command proof are in that work lane's
`LUA-VERIFIER-NOTE.md` and `lua-command-inputs/COMMAND-VERIFICATION.json`.

## Additional defect found during review

Passing the original27 checks did **not** establish that every CSS source
excerpt was correct. Parent inspection found that the diagnostic for selector
`a` starts its claimed rule excerpt inside `background-color`, then includes a
`body` rule. It is not the actual anchor rule. The historical report and sealed
outputs retain that mistake; they must not be used as verified exact source
attribution for that record. The parser's issue counts and failed native click
are separate observations and are not changed by this reporting defect.

The refinement asking for detailed records came from the parent coding agent,
not a separate direct user message as the historical replay report states.
This correction does not change the two-run authorization or any measurement.

## Verified correction

The exhaustive follow-up in `LUA-CSS-DIAGNOSTIC-CORRECTION.md` checks all38
grouped records. Exactly two are inaccurate: the `a` record in each runtime.
The other36 already have correct excerpts and offsets. A bounded locator using
the released native CSS scanner and whole-rule parser finds the actual rule at
the zero-based, end-exclusive span `[581,611)`, rather than the original offset9.
Only the excerpt and offset fields change; original records remain alongside
corrected records. It rejects ambiguous duplicate selectors and unsupported
grouping rules instead of guessing.

The parent independently reproduces **21 correction checks and60 regression
cases**, both52/54-entry ledgers and55 correction artifacts under socket denial.
These are separate offline parser checks, not additional tests added to the
11848-case selected native regression. No page, selector matching, geometry,
click, HTTP or extraction is rerun. The first parent correction-verifier launch
omitted its required `verify` argument and failed before analysis; that failure
and the corrected invocation remain recorded in the private parent work lane.

The original failed page flow is unchanged. A future browser fix still needs a
focused failing fixture and a new separately scoped acceptance check. The71-host
inventory is unchanged because replay and offline diagnostic correction add no
website. This report supersedes the earlier inventory's pending Lua review note,
not its retained historical host records or measurements.
