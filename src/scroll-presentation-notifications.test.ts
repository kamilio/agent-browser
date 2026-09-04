import { afterEach, expect, it } from "vitest";
import { documentScroll } from "./document-scroll.js";
import type { DocumentChange, DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = parseHtmlDocument(
		"<style>html,body{margin:0;padding:0}#extent{width:160px;height:180px}</style><div id=extent></div>",
		"https://fixture.invalid/scroll-presentation",
	);
	trees.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(100, 80);
	const extent = new DocumentQueries(tree).querySelector("#extent");
	if (extent === null) throw new Error("Missing extent");
	const scroll = documentScroll(tree);
	expect(scroll.bounds()).toEqual({ x: 60, y: 100 });
	const changes: Readonly<DocumentChange>[] = [];
	const mutations: unknown[] = [];
	tree.onChange((change) => changes.push(change));
	tree.onMutation((mutation) => mutations.push(mutation));
	return { tree, styles, extent, scroll, changes, mutations };
}

it.each(["to", "by"] as const)(
	"marks a real %s movement as presentation-only while retaining notifications",
	(method) => {
		const test = fixture();
		const before = test.tree.revision;
		expect(test.scroll[method](20, 60)).toBe(true);
		expect(test.scroll.get()).toEqual({ x: 20, y: 60 });
		expect(test.changes).toEqual([
			{
				revision: before + 1,
				kind: "style",
				target: test.tree.root,
				presentationOnly: true,
			},
		]);
		expect(Object.isFrozen(test.changes[0])).toBe(true);
		expect(test.tree.changesSince(before).changes).toEqual(test.changes);
		expect(test.mutations).toEqual([]);
	},
);

it.each([
	[0.5, 10.25, 0.5, 10.25],
	[1000, 1000, 60, 100],
	[-10, 20, 0, 20],
])(
	"publishes only the clamped fractional result for %s/%s",
	(left, top, expectedLeft, expectedTop) => {
		const test = fixture();
		test.scroll.to(left, top);
		expect(test.scroll.get()).toEqual({ x: expectedLeft, y: expectedTop });
		expect(test.changes).toHaveLength(1);
		expect(test.changes[0].presentationOnly).toBe(true);
	},
);

it("does not emit new notifications for equal or repeatedly clamped moves", () => {
	const test = fixture();
	test.scroll.to(1000, 1000);
	const before = test.tree.revision;
	for (const [left, top] of [
		[1000, 1000],
		[60, 100],
		[1001, 1001],
	])
		expect(test.scroll.to(left, top)).toBe(false);
	expect(test.scroll.by(0, 0)).toBe(false);
	expect(test.tree.revision).toBe(before);
	expect(test.changes).toHaveLength(1);
});

it.each([
	["width:80px;height:180px", 0, 60],
	["width:160px;height:50px", 20, 0],
	["width:80px;height:50px", 0, 0],
] as const)(
	"keeps source mutation and automatic clamp distinct for %s",
	(css, expectedLeft, expectedTop) => {
		const test = fixture();
		test.scroll.to(20, 60);
		test.changes.length = 0;
		test.tree.setAttribute(test.extent, "style", css);
		expect(test.scroll.get()).toEqual({ x: expectedLeft, y: expectedTop });
		expect(test.changes).toHaveLength(2);
		expect(test.changes[0]).toMatchObject({
			kind: "attribute",
			target: test.extent,
		});
		expect(test.changes[0].presentationOnly).toBeUndefined();
		expect(test.changes[1]).toMatchObject({
			kind: "style",
			target: test.tree.root,
			presentationOnly: true,
		});
		expect(test.mutations).toHaveLength(1);
	},
);

it("leaves viewport invalidation conservative but marks its automatic clamp", () => {
	const test = fixture();
	test.scroll.to(20, 60);
	test.changes.length = 0;
	test.styles.setViewport(200, 220);
	expect(test.scroll.get()).toEqual({ x: 0, y: 0 });
	expect(test.changes).toHaveLength(2);
	expect(test.changes.map((change) => change.kind)).toEqual(["style", "style"]);
	expect(test.changes[0].presentationOnly).toBeUndefined();
	expect(test.changes[1].presentationOnly).toBe(true);
});

it("emits no clamp notification when resized content still contains the position", () => {
	const test = fixture();
	test.scroll.to(20, 60);
	test.changes.length = 0;
	test.tree.setAttribute(test.extent, "style", "width:150px;height:170px");
	expect(test.scroll.get()).toEqual({ x: 20, y: 60 });
	expect(test.scroll.bounds()).toEqual({ x: 50, y: 90 });
	expect(test.changes.map((change) => change.kind)).toEqual(["attribute"]);
});

it("does not overwrite a later reentrant scroll or merge its notification", () => {
	const test = fixture();
	const stop = test.tree.onChange((change) => {
		if (!change.presentationOnly) return;
		stop();
		test.scroll.to(5, 10);
	});
	expect(test.scroll.to(20, 60)).toBe(true);
	expect(test.scroll.get()).toEqual({ x: 5, y: 10 });
	expect(test.changes).toHaveLength(2);
	expect(test.changes.every((change) => change.presentationOnly)).toBe(true);
	expect(test.changes[1].revision).toBe(test.changes[0].revision + 1);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, null, "10"])(
	"rejects invalid coordinates %s without a paint notification",
	(value) => {
		const test = fixture();
		const before = test.tree.revision;
		expect(() => test.scroll.to(value as number, 10)).toThrow();
		expect(test.tree.revision).toBe(before);
		expect(test.changes).toEqual([]);
	},
);

it("does not publish after the native scrolling owner closes", () => {
	const test = fixture();
	test.scroll.to(20, 60);
	test.scroll.close();
	const before = test.tree.revision;
	expect(() => test.scroll.to(0, 0)).toThrow("closed");
	expect(test.tree.revision).toBe(before);
	expect(test.changes).toHaveLength(1);
});
