import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import {
	buildFormattingTree,
	type FormattingTree,
	resolveFormattingBlockWidths,
	resolveFormattingPageWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function verifyOwnership(formatting: FormattingTree) {
	const seen = new Set<number>();
	const pending = [formatting.root];
	expect(formatting.nodes[formatting.root].parent).toBeNull();
	while (pending.length) {
		const id = pending.pop();
		if (id === undefined) break;
		expect(seen.has(id)).toBe(false);
		seen.add(id);
		const node = formatting.nodes[id];
		expect(node.id).toBe(id);
		expect(Object.isFrozen(node)).toBe(true);
		expect(Object.isFrozen(node.children)).toBe(true);
		if (!node.ref || node.kind === "text" || node.kind === "anonymous-block") {
			expect(node.floatSide).toBeUndefined();
			expect(node.clear).toBeUndefined();
		}
		for (const childId of node.children) {
			const child = formatting.nodes[childId];
			expect(child.parent).toBe(id);
			if (
				child.floatSide === undefined &&
				child.position !== "absolute" &&
				child.position !== "fixed" &&
				(node.kind === "inline" || node.contentMode === "inline")
			)
				expect(child.level).toBe("inline");
			if (node.contentMode === "blocks") expect(child.level).toBe("block");
			pending.push(childId);
		}
	}
	expect(seen.size).toBe(formatting.nodes.length);
}

function textOrder(formatting: FormattingTree, root = formatting.root): string {
	const node = formatting.nodes[root];
	return node.kind === "text"
		? (node.text ?? "")
		: node.children.map((child) => textOrder(formatting, child)).join("");
}

function fixture(markup: string) {
	const tree = parseHtmlDocument(
		markup,
		"https://fixture.invalid/float-formatting",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	const before = snapshotDocument(tree);
	const formatting = buildFormattingTree(tree);
	verifyOwnership(formatting);
	expect(snapshotDocument(tree)).toEqual(before);
	const matches = (selector: string) =>
		formatting.nodes.filter(
			(node) => node.ref === tree.reference(id(selector)),
		);
	const node = (selector: string) => {
		const found = matches(selector);
		expect(found).toHaveLength(1);
		return found[0];
	};
	return { tree, id, formatting, matches, node };
}

it("retains a floated inline descendant without splitting its inline ancestors", () => {
	const { tree, id, formatting, node } = fixture(
		'<main>A<span id="outer">B<span id="inner">C<span id="float" style="float:left">D<div id="inside">E</div>F</span>G</span>H</span>I</main>',
	);
	expect(node("main").contentMode).toBe("inline");
	expect(node("#outer")).toMatchObject({ kind: "inline", fragmentCount: 1 });
	expect(node("#inner")).toMatchObject({ kind: "inline", fragmentCount: 1 });
	expect(node("#float")).toMatchObject({
		kind: "block",
		level: "block",
		display: "block",
		floatSide: "left",
		independentContext: true,
		contentMode: "blocks",
		parent: node("#inner").id,
	});
	expect(node("#float").position).toBeUndefined();
	expect(node("#float").fragmentCount).toBeUndefined();
	expect(
		node("#float").children.map((child) => formatting.nodes[child].kind),
	).toEqual(["anonymous-block", "block", "anonymous-block"]);
	expect(node("#inside").parent).toBe(node("#float").id);
	expect(tree.get(id("#float")).parent).toBe(id("#inner"));
	expect(textOrder(formatting)).toBe("ABCDEFGHI");
});

it("keeps both float sides in the source-ordered anonymous inline run between blocks", () => {
	const { formatting, node } = fixture(
		'<main><div id="before">A</div>B<span id="left" style="float:left">C</span><em id="inline">D</em><span id="right" style="float:right">E</span>F<div id="after">G</div></main>',
	);
	const children = node("main").children;
	expect(children).toHaveLength(3);
	expect(children[0]).toBe(node("#before").id);
	expect(children[2]).toBe(node("#after").id);
	const run = formatting.nodes[children[1]];
	expect(run).toMatchObject({ kind: "anonymous-block", contentMode: "inline" });
	expect(run.children.slice(1, -1)).toEqual([
		node("#left").id,
		node("#inline").id,
		node("#right").id,
	]);
	expect(node("#left").floatSide).toBe("left");
	expect(node("#right").floatSide).toBe("right");
	expect(textOrder(formatting)).toBe("ABCDEFG");
});

it("retains a float-only source anchor between ordinary blocks", () => {
	const { formatting, node } = fixture(
		'<main><div>A</div><span id="float" style="float:left">B</span><div>C</div></main>',
	);
	const children = node("main").children;
	expect(children.map((child) => formatting.nodes[child].kind)).toEqual([
		"block",
		"anonymous-block",
		"block",
	]);
	expect(formatting.nodes[children[1]].children).toEqual([node("#float").id]);
	expect(textOrder(formatting)).toBe("ABC");
});

it("still splits an inline ancestor at a normal block but not at its float", () => {
	const { tree, id, formatting, matches, node } = fixture(
		'<main><span id="inline" style="clear:both">A<span id="float" style="float:right">B</span>C<div id="block">D</div>E</span></main>',
	);
	const fragments = matches("#inline");
	expect(documentStyles(tree).flow(id("#inline")).clear).toBe("both");
	expect(fragments).toHaveLength(2);
	expect(fragments.map((fragment) => fragment.fragmentIndex)).toEqual([0, 1]);
	for (const fragment of fragments) {
		expect(fragment.fragmentCount).toBe(2);
		expect(fragment.clear).toBeUndefined();
		expect(fragment.floatSide).toBeUndefined();
	}
	expect(formatting.issues["clear-layout-not-supported"]).toBeUndefined();
	expect(node("#float").parent).toBe(fragments[0].id);
	expect(node("#block").parent).toBe(node("main").id);
	expect(
		node("main").children.map((child) => formatting.nodes[child].kind),
	).toEqual(["anonymous-block", "block", "anonymous-block"]);
	expect(textOrder(formatting)).toBe("ABCDE");
});

it("retains independent nested float interiors without hoisting their children", () => {
	const { formatting, node } = fixture(
		'<main><div id="outer" style="float:left">A<div id="inner" style="float:right;clear:left">B<div id="block">C</div>D</div>E</div><span id="tail">F</span></main>',
	);
	expect(node("#outer")).toMatchObject({
		floatSide: "left",
		independentContext: true,
		contentMode: "inline",
		parent: node("main").id,
	});
	expect(node("#inner")).toMatchObject({
		floatSide: "right",
		clear: "left",
		independentContext: true,
		contentMode: "blocks",
		parent: node("#outer").id,
	});
	expect(node("#block").parent).toBe(node("#inner").id);
	expect(node("#block").independentContext).toBe(false);
	expect(node("#block").floatSide).toBeUndefined();
	expect(node("#block").clear).toBeUndefined();
	expect(node("#tail").parent).toBe(node("main").id);
	expect(textOrder(formatting)).toBe("ABCDEF");
});

it.each(["left", "right", "inline-start", "inline-end"])(
	"retains %s without rewriting a relative float as absolute or fixed",
	(side) => {
		const { formatting, node } = fixture(
			`<main>A<span id="float" style="float:${side};position:relative;z-index:2">B</span>C</main>`,
		);
		expect(node("#float")).toMatchObject({
			floatSide: side,
			position: "relative",
			zIndex: 2,
			independentContext: true,
		});
		expect(node("#float").staticDisplay).toBeUndefined();
		expect(node("main").contentMode).toBe("inline");
		expect(formatting.issues["float-layout-not-supported"]).toBe(1);
		expect(textOrder(formatting)).toBe("ABC");
	},
);

it.each(["left", "right", "both", "inline-start", "inline-end"])(
	"retains computed clear:%s on principal boxes only",
	(clear) => {
		const { node } = fixture(
			`<main id="clear" style="clear:${clear}">A<span id="float" style="float:left">B</span><div id="child">C</div>D</main>`,
		);
		expect(node("#clear").clear).toBe(clear);
		expect(node("#clear").floatSide).toBeUndefined();
		expect(node("#float").clear).toBeUndefined();
		expect(node("#child").clear).toBeUndefined();
	},
);

it("does not transfer boxless float or clear values to children or anonymous wrappers", () => {
	const { tree, id, formatting, matches, node } = fixture(
		'<main><span id="hidden" style="display:none;float:left;clear:left">hidden</span><span id="contents" style="display:contents;float:right;clear:right"><span id="child">A</span></span><span id="float" style="float:left">B</span><div>C</div></main>',
	);
	expect(matches("#hidden")).toEqual([]);
	expect(matches("#contents")).toEqual([]);
	expect(documentStyles(tree).flow(id("#contents")).float).toBe("right");
	expect(documentStyles(tree).flow(id("#contents")).clear).toBe("right");
	expect(node("#child").floatSide).toBeUndefined();
	expect(node("#child").clear).toBeUndefined();
	expect(
		formatting.nodes.filter((entry) => entry.floatSide !== undefined),
	).toEqual([node("#float")]);
	expect(formatting.issues["float-layout-not-supported"]).toBe(2);
	expect(formatting.issues["clear-layout-not-supported"]).toBeUndefined();
	expect(textOrder(formatting)).toBe("ABC");
});

it.each(["absolute", "fixed"])(
	"keeps %s boxes distinct from float anchors after computed float suppression",
	(position) => {
		const { tree, id, formatting, node } = fixture(
			`<main>A<span id="positioned" style="position:${position};float:right;clear:both"><div>B</div></span>C<span id="float" style="float:left">D</span></main>`,
		);
		expect(documentStyles(tree).flow(id("#positioned")).float).toBe("none");
		expect(documentStyles(tree).flow(id("#positioned")).clear).toBe("both");
		expect(node("#positioned")).toMatchObject({
			position,
			independentContext: true,
			parent: node("main").id,
		});
		expect(node("#positioned").floatSide).toBeUndefined();
		expect(node("#positioned").clear).toBeUndefined();
		expect(formatting.issues["clear-layout-not-supported"]).toBeUndefined();
		expect(node("#float").position).toBeUndefined();
		expect(formatting.issues["float-layout-not-supported"]).toBe(1);
		expect(formatting.issues["positioned-layout-requires-coordination"]).toBe(
			1,
		);
		expect(textOrder(formatting)).toBe("ABCD");
	},
);

it.each(["flex", "grid"])(
	"keeps %s items as diagnosed items rather than floating normal-flow anchors",
	(display) => {
		const { tree, id, formatting, node } = fixture(
			`<main style="display:${display}"><div style="display:contents"><span id="first" style="float:left;clear:right;order:2">A</span></div><span id="second" style="float:right;order:1">B</span></main>`,
		);
		for (const selector of ["#first", "#second"]) {
			expect(node(selector)[display === "flex" ? "flexItem" : "gridItem"]).toBe(
				true,
			);
			expect(node(selector).floatSide).toBeUndefined();
			expect(node(selector).independentContext).toBe(true);
		}
		expect(documentStyles(tree).flow(id("#first")).float).toBe("left");
		expect(documentStyles(tree).flow(id("#first")).clear).toBe("right");
		expect(node("#first").clear).toBeUndefined();
		expect(node("main").children).toEqual([
			node("#first").id,
			node("#second").id,
		]);
		expect(node("main").orderModifiedChildren).toEqual([
			node("#second").id,
			node("#first").id,
		]);
		expect(formatting.issues["float-layout-not-supported"]).toBe(2);
		expect(formatting.issues["display-layout-not-supported"]).toBe(1);
		expect(formatting.issues["clear-layout-not-supported"]).toBeUndefined();
		expect(() => resolveFormattingPageWidths(formatting)).toThrow("issue-free");
	},
);

it("preserves floated table structure and remapped ownership without accepting table layout", () => {
	const { formatting, node } = fixture(
		'<main><table id="float" style="float:left">\n<tr id="row"><td id="cell">A</td></tr>\n</table><span id="tail">B</span></main>',
	);
	expect(node("#float")).toMatchObject({
		kind: "deferred",
		display: "table",
		floatSide: "left",
		independentContext: true,
		contentMode: "table",
	});
	expect(node("main").contentMode).toBe("inline");
	expect(node("#cell").parent).toBe(node("#row").id);
	expect(node("#cell").floatSide).toBeUndefined();
	expect(textOrder(formatting)).toBe("AB");
	expect(formatting.issues["display-layout-not-supported"]).toBe(1);
	expect(formatting.issues["float-layout-not-supported"]).toBe(1);
	expect(() => resolveFormattingPageWidths(formatting)).toThrow("issue-free");
});

it.each([
	["float:left", "float-layout-not-supported"],
	["float:right;clear:both", "clear-layout-not-supported"],
	["float:left;overflow:hidden", "overflow-layout-not-supported"],
	["float:left;position:sticky", "position-layout-not-supported"],
])("keeps the width guard closed for %s", (style, issue) => {
	const { formatting } = fixture(`<main style="${style}">text</main>`);
	expect(formatting.issues[issue]).toBe(1);
	expect(formatting.issues["float-layout-not-supported"]).toBe(1);
	expect(() => resolveFormattingPageWidths(formatting)).toThrow("issue-free");
});

it("requires a float coordinator even for an isolated floated reflow root", () => {
	const { formatting, node } = fixture(
		'<main><span id="float" style="float:left;display:inline-block;width:20px">text</span></main>',
	);
	expect(() =>
		resolveFormattingBlockWidths(formatting, [
			{
				id: node("#float").id,
				containingBlock: node("main").id,
				containingWidth: 100,
				containingHeight: null,
				contentX: 0,
			},
		]),
	).toThrow("Float content requires coordinated page layout");
});

it("omits float layouts from ordinary width results", () => {
	const { formatting } = fixture("<main>text</main>");
	expect(resolveFormattingPageWidths(formatting).floatLayouts).toBeUndefined();
});
