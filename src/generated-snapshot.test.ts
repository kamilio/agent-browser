import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { generateLocator } from "./locator-generation.js";
import { DocumentQueries } from "./selectors.js";
import { findInDocument } from "./snapshot-search.js";
import {
	diffSnapshots,
	renderSnapshot,
	scanSnapshotEntries,
	snapshotDocument,
	snapshotRoleCandidates,
	type SnapshotEntry,
} from "./snapshot.js";
import { documentStyles } from "./styles.js";
import { resolveBrowserTarget } from "./target-locator.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture(
	markup = '<details id="host"><button id="body">Body</button></details>',
) {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		markup,
		"https://fixture.invalid/generated-snapshot",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const queries = new DocumentQueries(tree);
	const host = queries.querySelector("#host");
	if (host === null) throw new Error("Missing host");
	const controls = documentGeneratedControls(tree);
	const target = controls.detailsSummary(host);
	if (!target) throw new Error("Missing generated header");
	const actions = documentInteractions(tree);
	const resolve = (source: string) =>
		resolveBrowserTarget(tree, queries, source);
	return { tree, host, target, controls, actions, queries, resolve };
}

it("publishes a closed fallback button without DOM children or revision changes", () => {
	const { tree, host, target, queries } = fixture();
	const revision = tree.revision;
	const count = tree.nodeCount;
	const snapshot = snapshotDocument(tree);
	expect(snapshot.entries).toEqual([
		{
			ref: target.ref,
			role: "button",
			name: "Details",
			depth: 0,
			expanded: false,
		},
	]);
	expect(snapshot.truncated).toBe(false);
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(count);
	expect(tree.textContent(host)).toBe("Body");
	expect(queries.querySelector("summary")).toBeNull();
	expect(() => tree.resolve(target.ref)).toThrow();
	expect(renderSnapshot(snapshot)).toContain(
		`button "Details" [ref=${target.ref}] [expanded=false]`,
	);
});

it("orders an open fallback before its body, under the real semantic parent", () => {
	const { tree, host, target } = fixture(
		'<details id="host" role="group" aria-label="Section" open><button>Body</button></details>',
	);
	const entries = snapshotDocument(tree).entries;
	expect(
		entries.map(({ ref, role, name, depth }) => [ref, role, name, depth]),
	).toEqual([
		[tree.reference(host), "group", "Section", 0],
		[target.ref, "button", "Details", 1],
		[expect.stringMatching(/^e/), "button", "Body", 1],
	]);
	expect(entries[1].expanded).toBe(true);
});

it("distinguishes generated focus from explicit host focus in snapshots", () => {
	const { tree, host, target, actions } = fixture(
		'<details id="host" role="group" tabindex="0"></details>',
	);
	actions.focus.focus(target.ref);
	expect(
		snapshotDocument(tree)
			.entries.filter((entry) => entry.focused)
			.map((entry) => entry.ref),
	).toEqual([target.ref]);
	actions.focus.focus(tree.reference(host));
	expect(
		snapshotDocument(tree)
			.entries.filter((entry) => entry.focused)
			.map((entry) => entry.ref),
	).toEqual([tree.reference(host)]);
});

it("scopes generated snapshots to the header rather than its open host body", () => {
	const { tree, target } = fixture(
		'<details id="host" open><button>Body</button></details>',
	);
	const snapshot = snapshotDocument(tree, { root: target.ref });
	expect(snapshot.scope).toBe(target.ref);
	expect(snapshot.entries).toEqual([
		{
			ref: target.ref,
			role: "button",
			name: "Details",
			depth: 0,
			expanded: true,
		},
	]);
});

it.each([
	"hidden",
	"inert",
	'aria-hidden="true"',
	'style="display:none"',
	'style="visibility:hidden"',
])("omits unavailable generated controls: %s", (attributes) => {
	const { tree } = fixture(`<details id="host" ${attributes}></details>`);
	expect(snapshotDocument(tree).entries).toEqual([]);
	expect(snapshotRoleCandidates(tree, "button")).toEqual([]);
});

it("omits generated headers inside a closed enclosing disclosure", () => {
	const { tree, target } = fixture(
		'<details><summary>Outer</summary><details id="host"></details></details>',
	);
	expect(
		snapshotDocument(tree).entries.some((entry) => entry.ref === target.ref),
	).toBe(false);
	expect(snapshotDocument(tree, { root: target.ref }).entries).toEqual([]);
});

it("uses fallback text rather than host naming attributes", () => {
	const { tree, target } = fixture(
		'<details id="host" aria-label="Host label" title="Host title" data-testid="host-test"></details>',
	);
	expect(
		snapshotDocument(tree).entries.find((entry) => entry.ref === target.ref)
			?.name,
	).toBe("Details");
});

it.each([false, true])(
	"shares inherited aria-disabled state with generated actionability, override=%s",
	(override) => {
		const { tree, target } = fixture(
			`<div aria-disabled="true"><details id="host" ${override ? 'aria-disabled="false"' : ""}></details></div>`,
		);
		expect(
			snapshotDocument(tree).entries.find((entry) => entry.ref === target.ref)
				?.disabled,
		).toBe(override ? undefined : true);
	},
);

it("diffs expansion and generated focus without replacing the identity", () => {
	const { tree, target, actions } = fixture();
	const before = snapshotDocument(tree);
	actions.click(target.ref);
	const diff = diffSnapshots(before, snapshotDocument(tree));
	expect(diff).toMatchObject({
		reset: false,
		removed: [],
		updated: expect.arrayContaining([
			expect.objectContaining({
				ref: target.ref,
				expanded: true,
				focused: true,
			}),
		]),
	});
});

it("removes and restores the same generated reference around authored summary insertion", () => {
	const { tree, host, target, resolve } = fixture();
	const before = snapshotDocument(tree);
	const summary = tree.createElement("summary");
	tree.append(summary, tree.createText("Authored"));
	tree.append(host, summary);
	const after = snapshotDocument(tree);
	expect(after.entries.map((entry) => entry.ref)).toEqual([
		tree.reference(summary),
	]);
	expect(diffSnapshots(before, after)).toMatchObject({ removed: [target.ref] });
	expect(() => resolve(target.ref)).toThrow(/available/);
	tree.remove(summary);
	expect(snapshotDocument(tree).entries[0].ref).toBe(target.ref);
});

it("includes generated entries in bounded entry scanning and text search", () => {
	const { tree, target } = fixture();
	const entries: SnapshotEntry[] = [];
	const scan = scanSnapshotEntries(tree, (entry) => entries.push(entry));
	expect(scan.scannedEntries).toBe(1);
	expect(entries[0].ref).toBe(target.ref);
	const found = findInDocument(tree, "Details", { context: 0 });
	expect(found.matched).toBe(1);
	expect(found.matches[0].ref).toBe(target.ref);
});

it("counts generated entries against entry, depth and string limits", () => {
	const { tree, target } = fixture(
		'<details id="host" role="group" aria-label="Group" open><button>Body</button></details>',
	);
	const limited = snapshotDocument(tree, { maxEntries: 2 });
	expect(limited.entries.map((entry) => entry.ref)).toContain(target.ref);
	expect(limited.entries).toHaveLength(2);
	expect(limited.truncated).toBe(true);
	const shallow = snapshotDocument(tree, { maxDepth: 0 });
	expect(shallow.entries).toHaveLength(1);
	expect(shallow.truncated).toBe(true);
	const clipped = snapshotDocument(tree, {
		root: target.ref,
		maxStringLength: 3,
	});
	expect(clipped.entries[0].name).toBe("Det");
	expect(clipped.truncated).toBe(true);
});

it("keeps generated snapshot JSON within its byte budget", () => {
	const { tree } = fixture(
		`<details id="host" role="group" aria-label="${"Long label ".repeat(20)}"></details>`,
	);
	const result = snapshotDocument(tree, { maxBytes: 256 });
	expect(
		new TextEncoder().encode(JSON.stringify(result)).length,
	).toBeLessThanOrEqual(256);
	expect(result.truncated).toBe(true);
});

it("resolves generated references and unique semantic locators without CSS aliases", () => {
	const { tree, host, target, resolve, queries } = fixture();
	expect(resolve(target.ref)).toBe(target.ref);
	expect(resolve('getByRole("button", {name:"Details", exact:true})')).toBe(
		target.ref,
	);
	expect(resolve("#host")).toBe(tree.reference(host));
	expect(queries.querySelectorAll("summary")).toEqual([]);
	expect(() => resolve('getByText("Details", {exact:true})')).toThrow();
});

it("generates only a round-tripping semantic locator for a unique fallback", () => {
	const { tree, target, queries, resolve } = fixture(
		'<details id="host" data-testid="host-id"></details>',
	);
	const locator = generateLocator(tree, queries, target.ref);
	expect(locator).toMatchObject({
		ref: target.ref,
		strategy: "role",
		structural: false,
		partial: true,
	});
	expect(resolve(locator.locator)).toBe(target.ref);
	expect(locator.locator).not.toContain("host-id");
});

it.each(["<details></details>", "<button>Details</button>"])(
	"rejects ambiguous generated role locators rather than returning the host: %s",
	(other) => {
		const { tree, target, queries, resolve } = fixture(
			`<details id="host" data-testid="host-id"></details>${other}`,
		);
		expect(() =>
			resolve('getByRole("button", {name:"Details", exact:true})'),
		).toThrow(/multiple/);
		expect(() => generateLocator(tree, queries, target.ref)).toThrow(
			/unique generated-control/,
		);
		expect(resolve(target.ref)).toBe(target.ref);
	},
);

it("rejects foreign, unallocated and stale generated references", () => {
	const { tree, host, target, resolve } = fixture();
	const foreign = fixture();
	expect(() => resolve(foreign.target.ref)).toThrow();
	expect(() => resolve(`u${tree.root}-details-${host + 10000}`)).toThrow();
	tree.remove(host);
	expect(() => resolve(target.ref)).toThrow();
	expect(() => snapshotDocument(tree, { root: target.ref })).toThrow();
});

it("does not publish a generated subtree below a leaf-role host", () => {
	const { tree, target } = fixture(
		'<details id="host" role="button" aria-label="Host"></details>',
	);
	expect(
		snapshotDocument(tree).entries.some((entry) => entry.ref === target.ref),
	).toBe(false);
	expect(
		snapshotRoleCandidates(tree, "button").some(
			(entry) => entry.ref === target.ref,
		),
	).toBe(true);
});
