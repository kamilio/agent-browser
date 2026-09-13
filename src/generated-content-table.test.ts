import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { layoutDocument } from "./document-layout.js";
import {
	buildFormattingTree,
	type FormattingNode,
	type FormattingTree,
} from "./formatting-tree.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(markup = '<main id="target"></main>', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head><style>html,body{margin:0;font-size:8px;line-height:12px}${css}</style></head><body>${markup}</body></html>`,
		"https://fixture.invalid/generated-content-table",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(160, 120);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, queries, styles, id };
}

function pseudoBox(
	formatting: FormattingTree,
	owner: number,
	name: "before" | "after" = "before",
) {
	const matches = formatting.nodes.filter(
		(node) =>
			node.display === "table" &&
			node.generatedContent?.owner === owner &&
			node.generatedContent.name === name,
	);
	expect(matches).toHaveLength(1);
	return matches[0];
}

function nodeFor(formatting: FormattingTree, ref: string) {
	const matches = formatting.nodes.filter((node) => node.ref === ref);
	expect(matches).toHaveLength(1);
	return matches[0];
}

function onlyChild(
	formatting: FormattingTree,
	parent: Readonly<FormattingNode>,
	display: string,
) {
	expect(parent.children).toHaveLength(1);
	const child = formatting.nodes[parent.children[0]];
	expect(child).toMatchObject({ display, parent: parent.id });
	expect(child.ref).toBeUndefined();
	return child;
}

function anonymousCell(formatting: FormattingTree, table: FormattingNode) {
	const group = onlyChild(formatting, table, "table-row-group");
	const row = onlyChild(formatting, group, "table-row");
	const cell = onlyChild(formatting, row, "table-cell");
	expect(cell).toMatchObject({
		independentContext: true,
		contentMode: "inline",
	});
	return cell;
}

function shape(
	formatting: FormattingTree,
	node: Readonly<FormattingNode>,
): object {
	return {
		kind: node.kind,
		level: node.level,
		display: node.display,
		contentMode: node.contentMode,
		independentContext: node.independentContext,
		deferredReason: node.deferredReason,
		text: node.text,
		box: node.box,
		table: node.table,
		typography: node.typography,
		paint: node.kind === "text" ? { color: node.paint?.color } : node.paint,
		children: node.children.map((child) =>
			shape(formatting, formatting.nodes[child]),
		),
	};
}

function textOrder(formatting: FormattingTree, root = formatting.root): string {
	const node = formatting.nodes[root];
	return (
		(node.text ?? "") +
		node.children.map((child) => textOrder(formatting, child)).join("")
	);
}

function verifyOwnership(formatting: FormattingTree, tree: DocumentTree) {
	const seen = new Set<number>();
	const pending = [formatting.root];
	const linked = (id: number) => {
		expect(Number.isSafeInteger(id)).toBe(true);
		expect(id).toBeGreaterThanOrEqual(0);
		expect(id).toBeLessThan(formatting.nodes.length);
		const node = formatting.nodes[id];
		expect(node.id).toBe(id);
		return node;
	};
	while (pending.length) {
		const current = pending.pop();
		if (current === undefined) throw new Error("Missing pending node");
		expect(seen.has(current)).toBe(false);
		seen.add(current);
		const node = linked(current);
		expect(Object.isFrozen(node)).toBe(true);
		expect(Object.isFrozen(node.children)).toBe(true);
		for (const child of node.children) {
			const childNode = linked(child);
			expect(childNode.parent).toBe(current);
			if (
				(node.kind === "inline" || node.contentMode === "inline") &&
				childNode.floatSide === undefined &&
				childNode.position !== "absolute" &&
				childNode.position !== "fixed"
			)
				expect(childNode.level).toBe("inline");
			if (node.contentMode === "blocks" || node.contentMode === "table")
				expect(linked(child).level).toBe("block");
			pending.push(child);
		}
		if (node.orderModifiedChildren) {
			expect(
				[...node.orderModifiedChildren].sort((left, right) => left - right),
			).toEqual([...node.children].sort((left, right) => left - right));
			for (const child of node.orderModifiedChildren)
				expect(linked(child).parent).toBe(current);
		}
		if (node.fieldsetContent !== undefined) {
			expect(linked(node.fieldsetContent).fieldsetOwner).toBe(current);
			expect(linked(node.fieldsetContent).parent).toBe(current);
		}
		if (node.fieldsetOwner !== undefined)
			expect(linked(node.fieldsetOwner).fieldsetContent).toBe(current);
		if (node.tableGrid !== undefined) {
			expect(linked(node.tableGrid).tableWrapper).toBe(current);
			expect(node.children).toContain(node.tableGrid);
		}
		if (node.tableWrapper !== undefined) {
			expect(linked(node.tableWrapper).tableGrid).toBe(current);
			expect(node.parent).toBe(node.tableWrapper);
		}
		for (const caption of node.tableCaptions ?? [])
			expect(linked(caption)).toMatchObject({
				display: "flow-root",
				parent: node.tableWrapper,
			});
		if (node.collapsedBorderOwner !== undefined)
			expect(linked(node.collapsedBorderOwner).collapsedTable).toBeDefined();
		if (node.collapsedTable) {
			const { placement, segments } = node.collapsedTable;
			for (const entry of [
				...placement.groups,
				...placement.rows,
				...placement.cells,
			])
				if (entry.id !== null)
					expect(linked(entry.id).collapsedBorderOwner).toBe(current);
			for (const segment of segments)
				expect(linked(segment.ownerId).collapsedBorderOwner).toBe(current);
		}
		if (node.generatedContent) {
			expect(tree.get(node.generatedContent.owner).kind).toBe("element");
			expect(node.ref).toBeUndefined();
			expect(node.generated).toBeUndefined();
			expect(node.control).toBeUndefined();
		}
	}
	expect(formatting.nodes[formatting.root].parent).toBeNull();
	expect(seen.size).toBe(formatting.nodes.length);
	expect(formatting.metrics.boxes).toBe(formatting.nodes.length);
}

it.each(["before", "after"] as const)(
	"gives ::%s the same table styles and anonymous text structure as a native CSS table",
	(name) => {
		const { tree, id, styles } = fixture(
			'<main id="target"></main><div id="real">Cell</div>',
			`#target::${name}{content:"Cell"}#target::${name},#real{display:table;width:40px;padding:2px;border:1px solid red;background:blue;border-spacing:3px 5px}`,
		);
		const formatting = buildFormattingTree(tree);
		const generated = pseudoBox(formatting, id(), name);
		const real = nodeFor(formatting, tree.reference(id("#real")));
		expect(generated).toMatchObject({
			kind: "deferred",
			level: "block",
			display: "table",
			contentMode: "table",
			independentContext: true,
			deferredReason: "display-layout-not-supported",
			generatedContent: { owner: id(), name },
		});
		expect(generated.table).toEqual(styles.generatedContent(id(), name)?.table);
		expect(generated.table).toEqual(styles.table(id("#real")));
		expect(shape(formatting, generated)).toEqual(shape(formatting, real));
		const cell = anonymousCell(formatting, generated);
		expect(cell.children).toHaveLength(1);
		expect(formatting.nodes[cell.children[0]]).toMatchObject({
			kind: "text",
			text: "Cell",
			generatedContent: { owner: id(), name },
		});
		expect(formatting.issues).toEqual({ "display-layout-not-supported": 2 });
		verifyOwnership(formatting, tree);
	},
);

it.each([
	{ label: "empty string", source: "", decoded: "", whiteSpace: "normal" },
	{ label: "ASCII space", source: " ", decoded: " ", whiteSpace: "normal" },
	{
		label: "escaped space",
		source: "\\20",
		decoded: " ",
		whiteSpace: "normal",
	},
	{
		label: "escaped table whitespace",
		source: "\\9\\a\\d\\c\\20",
		decoded: "\t\n\r\f ",
		whiteSpace: "normal",
	},
	{
		label: "preformatted escaped whitespace",
		source: "\\9\\a\\20",
		decoded: "\t\n ",
		whiteSpace: "pre",
	},
])(
	"omits $label through native table fixup without deleting the table box",
	({ source, decoded, whiteSpace }) => {
		const generated = fixture(
			undefined,
			`#target::before{content:"${source}";display:table;white-space:${whiteSpace}}`,
		);
		const real = fixture(
			'<div id="target" style="display:table"></div>',
			`#target{white-space:${whiteSpace}}`,
		);
		real.tree.setTextContent(real.id(), decoded);
		const formatting = buildFormattingTree(generated.tree);
		const reference = buildFormattingTree(real.tree);
		const table = pseudoBox(formatting, generated.id());
		expect(table.children).toEqual([]);
		expect(table.contentMode).toBe("table");
		expect(shape(formatting, table)).toEqual(
			shape(reference, nodeFor(reference, real.tree.reference(real.id()))),
		);
		expect(
			formatting.nodes.filter((node) => node.generatedContent),
		).toHaveLength(1);
		expect(formatting.metrics.textCodeUnits).toBe(decoded.length);
		expect(formatting.issues).toEqual({ "display-layout-not-supported": 1 });
		verifyOwnership(formatting, generated.tree);
	},
);

it.each([
	{ source: "\\a0", text: "\u00a0" },
	{ source: " A ", text: " A " },
])(
	"keeps non-table-whitespace content $source in a real anonymous cell",
	({ source, text }) => {
		const { tree, id } = fixture(
			undefined,
			`#target::before{content:"${source}";display:table}`,
		);
		const formatting = buildFormattingTree(tree);
		const cell = anonymousCell(formatting, pseudoBox(formatting, id()));
		expect(textOrder(formatting, cell.id)).toBe(text);
		expect(formatting.nodes[cell.children[0]].generatedContent).toEqual({
			owner: id(),
			name: "before",
		});
		verifyOwnership(formatting, tree);
	},
);

it("orders two independently owned table pseudos around real children", () => {
	const { tree, id } = fixture(
		'<main id="target"><span id="child">Body</span></main>',
		'#target::before{content:"Before";display:table}#target::after{content:"After";display:table}',
	);
	const formatting = buildFormattingTree(tree);
	const before = pseudoBox(formatting, id());
	const after = pseudoBox(formatting, id(), "after");
	expect(before.id).not.toBe(after.id);
	anonymousCell(formatting, before);
	anonymousCell(formatting, after);
	expect(textOrder(formatting)).toBe("BeforeBodyAfter");
	expect(
		nodeFor(formatting, tree.reference(id("#child"))).generatedContent,
	).toBeUndefined();
	expect(formatting.issues).toEqual({ "display-layout-not-supported": 2 });
	verifyOwnership(formatting, tree);
});

it("retains physical clearance on an empty generated table for native coordination", () => {
	const { tree, id } = fixture(
		'<div style="float:left;width:10px;height:12px"></div><main id="target"></main>',
		'#target::before{content:" ";display:table}#target::after{content:" ";display:table;clear:both}',
	);
	const formatting = buildFormattingTree(tree);
	expect(pseudoBox(formatting, id(), "after")).toMatchObject({
		clear: "both",
		contentMode: "table",
		children: [],
		deferredReason: "display-layout-not-supported",
	});
	expect(
		formatting.issues["generated-content-clear-layout-not-supported"],
	).toBeUndefined();
	expect(formatting.issues["clear-layout-not-supported"]).toBe(1);
	verifyOwnership(formatting, tree);
});

it.each(["before", "after"] as const)(
	"splits an inline host around its ::%s table",
	(name) => {
		const { tree, id } = fixture(
			'<main>L<span id="target">M</span>R</main>',
			`#target::${name}{content:"X";display:table}`,
		);
		const formatting = buildFormattingTree(tree);
		const table = pseudoBox(formatting, id(), name);
		expect(table.parent).not.toBeNull();
		expect(formatting.nodes[table.parent!].contentMode).toBe("blocks");
		expect(textOrder(formatting)).toBe(name === "before" ? "LXMR" : "LMXR");
		anonymousCell(formatting, table);
		expect(formatting.issues).toEqual({ "display-layout-not-supported": 1 });
		verifyOwnership(formatting, tree);
	},
);

it.each(["before", "after"] as const)(
	"repairs a ::%s table inside a table parent without changing its origin",
	(name) => {
		const { tree, id } = fixture(
			'<main id="target" style="display:table"><div style="display:table-row"><div style="display:table-cell">Body</div></div></main>',
			`#target::${name}{content:"X";display:table}`,
		);
		const formatting = buildFormattingTree(tree);
		const table = pseudoBox(formatting, id(), name);
		const cell = formatting.nodes[table.parent!];
		const row = formatting.nodes[cell.parent!];
		const group = formatting.nodes[row.parent!];
		expect([cell.display, row.display, group.display]).toEqual([
			"table-cell",
			"table-row",
			"table-row-group",
		]);
		expect(group.parent).toBe(nodeFor(formatting, tree.reference(id())).id);
		expect(table.generatedContent).toEqual({ owner: id(), name });
		expect(textOrder(formatting)).toBe(name === "before" ? "XBody" : "BodyX");
		anonymousCell(formatting, table);
		expect(formatting.issues).toEqual({ "display-layout-not-supported": 2 });
		verifyOwnership(formatting, tree);
	},
);

it("inherits owner typography and table properties without copying noninherited sizing", () => {
	const { tree, id, styles } = fixture(
		'<main id="target" lang="tr" style="font-size:10px;line-height:14px;color:red;text-transform:uppercase;border-spacing:3px 7px;empty-cells:hide;caption-side:bottom;table-layout:fixed;padding:9px"></main>',
		'#target::before{content:"i";display:table;font-weight:700}',
	);
	const formatting = buildFormattingTree(tree);
	const table = pseudoBox(formatting, id());
	expect(table.table).toEqual(styles.generatedContent(id(), "before")?.table);
	expect(table.table).toMatchObject({
		"border-spacing": "3px 7px",
		"empty-cells": "hide",
		"caption-side": "bottom",
		"table-layout": "auto",
	});
	expect(table.typography).toMatchObject({
		"font-size": "10px",
		"line-height": "14px",
		"font-weight": "700",
	});
	expect(table.box?.["padding-left"]).toBe("0px");
	const cell = anonymousCell(formatting, table);
	expect(cell.table?.["border-spacing"]).toBe("3px 7px");
	expect(formatting.nodes[cell.children[0]]).toMatchObject({
		text: "i",
		language: "tr",
		paint: { color: [255, 0, 0, 255] },
	});
	expect(formatting.issues["table-fixed-layout-not-supported"]).toBeUndefined();
	verifyOwnership(formatting, tree);
});

interface InlineStyle {
	cssText: string;
	getPropertyValue(name: string): string;
	setProperty(name: string, value: string): void;
	removeProperty(name: string): string;
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value });
		return target;
	},
};

it("retains CSSOM declarations while custom-property edits rebuild pseudo table formatting", () => {
	const { tree, id, styles } = fixture(
		'<main id="target" style="--mode:table;--label:\' \';--layout:auto"></main>',
		"#target::before{content:var(--label);display:var(--mode);table-layout:var(--layout,auto)}",
	);
	const inline = new InlineStyles(tree, factory);
	const declaration = inline.get(id()) as InlineStyle;
	const source = tree.textContent(id("style"));
	const initial = buildFormattingTree(tree);
	expect(pseudoBox(initial, id()).children).toEqual([]);
	declaration.setProperty("--label", '"Cell"');
	const populated = buildFormattingTree(tree);
	anonymousCell(populated, pseudoBox(populated, id()));
	expect(textOrder(populated)).toBe("Cell");
	expect(populated.revision).toBeGreaterThan(initial.revision);
	declaration.setProperty("--mode", "block");
	const block = buildFormattingTree(tree);
	expect(block.issues).toEqual({});
	expect(
		block.nodes.find((node) => node.generatedContent && node.kind !== "text"),
	).toMatchObject({ kind: "block", display: "block", contentMode: "inline" });
	declaration.setProperty("--mode", "inline-table");
	expect(
		buildFormattingTree(tree).issues[
			"generated-content-display-layout-not-supported"
		],
	).toBe(1);
	expect(declaration.getPropertyValue("--mode")).toBe("inline-table");
	declaration.setProperty("--mode", "table");
	declaration.setProperty("--layout", "fixed");
	expect(
		buildFormattingTree(tree).issues["table-fixed-layout-not-supported"],
	).toBe(1);
	expect(declaration.getPropertyValue("--layout")).toBe("fixed");
	expect(declaration.cssText).toContain("--layout: fixed;");
	expect(declaration.removeProperty("--layout")).toBe("fixed");
	const restored = buildFormattingTree(tree);
	expect(restored.issues).toEqual({ "display-layout-not-supported": 1 });
	expect(styles.generatedContent(id(), "before")?.display).toBe("table");
	expect(tree.textContent(id("style"))).toBe(source);
	expect(inline.get(id())).toBe(declaration);
	expect(pseudoBox(initial, id()).children).toEqual([]);
	expect(textOrder(populated)).toBe("Cell");
	verifyOwnership(restored, tree);
});

it("invalidates table generation after class, stylesheet and inherited-style mutations", () => {
	const { tree, id } = fixture(
		'<main id="target" class="active"></main>',
		'#target.active::after{content:"One";display:table}',
	);
	const first = buildFormattingTree(tree);
	pseudoBox(first, id(), "after");
	tree.removeAttribute(id(), "class");
	expect(
		buildFormattingTree(tree).nodes.some((node) => node.generatedContent),
	).toBe(false);
	tree.setTextContent(
		id("style"),
		'#target::after{content:"Two";display:table}',
	);
	tree.setAttribute(id(), "style", "color:blue;font-size:12px");
	const second = buildFormattingTree(tree);
	expect(pseudoBox(second, id(), "after")).toMatchObject({
		typography: { "font-size": "12px" },
		paint: { color: [0, 0, 255, 255] },
	});
	expect(second.revision).toBe(tree.revision);
	expect(second.revision).toBeGreaterThan(first.revision);
	expect(textOrder(second)).toBe("Two");
	expect(textOrder(first)).toBe("One");
	verifyOwnership(second, tree);
});

it.each(["before", "after"] as const)(
	"remaps every ownership link when a leading ::%s table loses whitespace",
	(name) => {
		const { tree, id } = fixture(
			'<main id="target" style="--space:\'\'"></main><fieldset id="fieldset"><fieldset id="nested"><span id="field">Field</span></fieldset></fieldset><table id="table" style="border-collapse:collapse;border:1px solid red">\n<caption id="caption">Caption</caption>\n<tbody id="group">\n<tr id="row">\n<td id="cell" style="border:1px solid blue">Cell</td>\n</tr>\n</tbody>\n</table><button id="button"><span id="button-child">Go</span></button><div id="flex" style="display:flex"><div id="first" style="order:2">First</div><div id="second" style="order:1">Second</div></div><div id="later">Later</div>',
			`fieldset{border:1px solid black}#target::${name}{content:var(--space);display:table}#later::before{content:"Tail";display:block}#later::after{content:"End";display:table}`,
		);
		const initial = buildFormattingTree(tree);
		verifyOwnership(initial, tree);
		tree.setAttribute(id(), "style", '--space:" "');
		const compacted = buildFormattingTree(tree);
		verifyOwnership(compacted, tree);
		expect(compacted.nodes).toEqual(initial.nodes);
		expect(compacted.issues).toEqual(initial.issues);
		expect(compacted.metrics.textCodeUnits).toBe(
			initial.metrics.textCodeUnits + 1,
		);
		for (const selector of ["#fieldset", "#nested"])
			expect(
				nodeFor(compacted, tree.reference(id(selector))).fieldsetContent,
			).toBeTypeOf("number");
		const table = nodeFor(compacted, tree.reference(id("#table")));
		expect(table.tableWrapper).toBeTypeOf("number");
		expect(table.tableCaptions).toEqual([
			nodeFor(compacted, tree.reference(id("#caption"))).id,
		]);
		expect(table.collapsedTable).toBeDefined();
		expect(nodeFor(compacted, tree.reference(id("#button"))).buttonLayout).toBe(
			true,
		);
		expect(nodeFor(compacted, tree.reference(id("#button-child"))).ref).toBe(
			tree.reference(id("#button-child")),
		);
		expect(
			nodeFor(compacted, tree.reference(id("#flex"))).orderModifiedChildren,
		).toEqual([
			nodeFor(compacted, tree.reference(id("#second"))).id,
			nodeFor(compacted, tree.reference(id("#first"))).id,
		]);
		expect(
			pseudoBox(compacted, id("#later"), "after").generatedContent,
		).toEqual({ owner: id("#later"), name: "after" });
		const later = compacted.nodes.filter(
			(node) => node.generatedContent?.owner === id("#later"),
		);
		expect(
			later.some((node) => node.kind === "text" && node.text === "Tail"),
		).toBe(true);
	},
);

it("keeps DOM revisions, references and action targets unchanged and revokes reads on close", () => {
	const { tree, queries, id, styles } = fixture(
		'<main id="target"><button id="button">Go</button></main>',
		'#target::before{content:" ";display:table}#target::after{content:"End";display:table}',
	);
	const owner = id();
	const controls = documentGeneratedControls(tree);
	const targets = controls.metrics().targets;
	const revision = tree.revision;
	const count = tree.nodeCount;
	const children = [...tree.get(owner).children];
	const references = queries
		.querySelectorAll("*")
		.map((element) => tree.reference(element));
	const formatting = buildFormattingTree(tree);
	verifyOwnership(formatting, tree);
	expect(buildFormattingTree(tree).nodes).toEqual(formatting.nodes);
	expect(tree.revision).toBe(revision);
	expect(tree.nodeCount).toBe(count);
	expect(tree.get(owner).children).toEqual(children);
	expect(tree.textContent(owner)).toBe("Go");
	expect(queries.querySelectorAll("#target::before, #target::after")).toEqual(
		[],
	);
	expect(
		queries.querySelectorAll("*").map((element) => tree.reference(element)),
	).toEqual(references);
	expect(controls.metrics().targets).toBe(targets);
	expect(
		nodeFor(formatting, tree.reference(id("#button"))).control,
	).toMatchObject({
		kind: "button",
		text: "Go",
	});
	tree.close();
	expect(() => buildFormattingTree(tree)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => styles.generatedContent(owner, "before")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(textOrder(formatting)).toBe("End");
});

it("charges generated text, anonymous table boxes, depth and work to existing limits", () => {
	const { tree, id } = fixture(
		undefined,
		'#target::before{content:"Cell";display:table}',
	);
	const complete = buildFormattingTree(tree);
	anonymousCell(complete, pseudoBox(complete, id()));
	const revision = tree.revision;
	expect(() =>
		buildFormattingTree(tree, {
			maxOwnedNodes: tree.nodeCount - 1,
		}),
	).toThrow("owned-node limit");
	expect(() => buildFormattingTree(tree, { maxTextCodeUnits: 3 })).toThrow(
		"text limit",
	);
	expect(() =>
		buildFormattingTree(tree, { maxBoxes: complete.metrics.boxes - 1 }),
	).toThrow("box limit");
	expect(() =>
		buildFormattingTree(tree, { maxWork: complete.metrics.work - 1 }),
	).toThrow("work limit");
	let depth = 0;
	let current: number | null = id();
	while (current !== null && current !== tree.root) {
		depth++;
		current = tree.get(current).parent;
	}
	expect(() => buildFormattingTree(tree, { maxDepth: depth + 1 })).toThrow(
		"depth limit",
	);
	expect(() =>
		buildFormattingTree(tree, {
			maxTextCodeUnits: 4,
			maxBoxes: complete.metrics.boxes,
			maxWork: complete.metrics.work,
		}),
	).not.toThrow();
	expect(tree.revision).toBe(revision);
});

it("charges omitted whitespace text without requiring a transient formatting box", () => {
	const { tree, id } = fixture(
		undefined,
		`#target::before{content:"${" ".repeat(64)}";display:table}`,
	);
	const complete = buildFormattingTree(tree);
	expect(pseudoBox(complete, id()).children).toEqual([]);
	expect(complete.metrics.textCodeUnits).toBe(64);
	expect(() => buildFormattingTree(tree, { maxTextCodeUnits: 63 })).toThrow(
		"text limit",
	);
	expect(() =>
		buildFormattingTree(tree, { maxBoxes: complete.metrics.boxes - 1 }),
	).toThrow("box limit");
	expect(() =>
		buildFormattingTree(tree, {
			maxTextCodeUnits: 64,
			maxBoxes: complete.metrics.boxes,
		}),
	).not.toThrow();
	verifyOwnership(complete, tree);
});

it("bounds empty-to-whitespace incremental work independently of unrelated siblings", () => {
	const deltas: number[] = [];
	for (const siblings of [8, 256]) {
		const { tree, id } = fixture(
			`<main id="target" style="--space:''"></main>${"<div>Sibling</div>".repeat(siblings)}`,
			"#target::before{content:var(--space);display:table}",
		);
		const empty = buildFormattingTree(tree);
		expect(pseudoBox(empty, id())).toMatchObject({
			contentMode: "table",
			deferredReason: "display-layout-not-supported",
			children: [],
		});
		tree.setAttribute(id(), "style", '--space:" "');
		const whitespace = buildFormattingTree(tree);
		expect(pseudoBox(whitespace, id())).toMatchObject({
			contentMode: "table",
			deferredReason: "display-layout-not-supported",
			children: [],
		});
		expect(whitespace.nodes).toEqual(empty.nodes);
		expect(whitespace.issues).toEqual({ "display-layout-not-supported": 1 });
		expect(empty.issues).toEqual(whitespace.issues);
		expect(whitespace.metrics.textCodeUnits).toBe(
			empty.metrics.textCodeUnits + 1,
		);
		expect(whitespace.metrics.visitedDomNodes).toBe(
			empty.metrics.visitedDomNodes,
		);
		const delta = whitespace.metrics.work - empty.metrics.work;
		expect(delta).toBeGreaterThanOrEqual(1);
		expect(delta).toBeLessThanOrEqual(32);
		deltas.push(delta);
		verifyOwnership(whitespace, tree);
	}
	expect(deltas[1]).toBe(deltas[0]);
});

it("remaps later fieldsets and captioned tables when a real table loses whitespace", () => {
	const { tree, id } = fixture(
		'<main id="target"></main><table id="leading"><tbody id="leading-group"><tr><td>Lead</td></tr></tbody></table><fieldset id="fieldset"><fieldset id="nested"><span>Field</span></fieldset></fieldset><table id="table" style="border-collapse:collapse"><caption id="caption">Caption</caption><tbody><tr><td style="border:1px solid red">Cell</td></tr></tbody></table><button id="button"><span id="button-child">Go</span></button><div id="later">Body</div>',
		'fieldset{border:1px solid black}#target::before{content:" ";display:table}#later::after{content:"Tail";display:table}',
	);
	const initial = buildFormattingTree(tree);
	verifyOwnership(initial, tree);
	const whitespace = tree.createText("\n\t ");
	tree.insert(id("#leading"), whitespace, id("#leading-group"));
	const revision = tree.revision;
	const compacted = buildFormattingTree(tree);
	verifyOwnership(compacted, tree);
	expect(compacted.nodes).toEqual(initial.nodes);
	expect(compacted.issues).toEqual(initial.issues);
	expect(compacted.metrics.textCodeUnits).toBe(
		initial.metrics.textCodeUnits + 3,
	);
	expect(
		compacted.nodes.some((node) => node.ref === tree.reference(whitespace)),
	).toBe(false);
	for (const selector of ["#fieldset", "#nested"]) {
		const outer = nodeFor(compacted, tree.reference(id(selector)));
		expect(outer.fieldsetContent).toBeTypeOf("number");
		expect(compacted.nodes[outer.fieldsetContent!].fieldsetOwner).toBe(
			outer.id,
		);
	}
	const table = nodeFor(compacted, tree.reference(id("#table")));
	expect(table.tableCaptions).toEqual([
		nodeFor(compacted, tree.reference(id("#caption"))).id,
	]);
	expect(table.collapsedTable).toBeDefined();
	expect(nodeFor(compacted, tree.reference(id("#button"))).buttonLayout).toBe(
		true,
	);
	expect(pseudoBox(compacted, id("#later"), "after").generatedContent).toEqual({
		owner: id("#later"),
		name: "after",
	});
	expect(tree.revision).toBe(revision);
	expect(tree.textContent(whitespace)).toBe("\n\t ");
});

function collapsedShape(node: Readonly<FormattingNode>) {
	const collapsed = node.collapsedTable;
	if (!collapsed) throw new Error("Missing resolved collapsed table");
	return {
		rowCount: collapsed.placement.rowCount,
		columnCount: collapsed.placement.columnCount,
		groups: collapsed.placement.groups.map(({ rowStart, rowEnd }) => ({
			rowStart,
			rowEnd,
		})),
		rows: collapsed.placement.rows.map(({ index }) => index),
		cells: collapsed.placement.cells.map((cell) => ({
			rowStart: cell.rowStart,
			rowEnd: cell.rowEnd,
			columnStart: cell.columnStart,
			columnEnd: cell.columnEnd,
		})),
		segments: collapsed.segments.map((segment) => ({
			orientation: segment.orientation,
			row: segment.row,
			column: segment.column,
			width: segment.width,
			color: segment.color,
			ownerKind: segment.ownerKind,
		})),
	};
}

it.each([
	{
		label: "zero-border empty grid",
		content: "",
		border: "0",
		emptyCells: "show",
	},
	{
		label: "zero-border text grid",
		content: "Cell",
		border: "0",
		emptyCells: "show",
	},
	{
		label: "solid outer borders",
		content: "Cell",
		border: "2px solid red",
		emptyCells: "show",
	},
	{
		label: "collapsed hidden-empty-cell policy",
		content: "Cell",
		border: "2px solid red",
		emptyCells: "hide",
	},
])(
	"matches native collapsed-border formatting for $label",
	({ content, border, emptyCells }) => {
		const declaration = `display:table;border-collapse:collapse;border:${border};empty-cells:${emptyCells}`;
		const generated = fixture(
			undefined,
			`#target::before{content:"${content}";${declaration}}`,
		);
		const real = fixture(
			`<div id="target" style="${declaration}">${content}</div>`,
		);
		const formatting = buildFormattingTree(generated.tree);
		const reference = buildFormattingTree(real.tree);
		const table = pseudoBox(formatting, generated.id());
		const realTable = nodeFor(reference, real.tree.reference(real.id()));
		expect(formatting.issues).toEqual({ "display-layout-not-supported": 1 });
		expect(formatting.issues).toEqual(reference.issues);
		expect(collapsedShape(table)).toEqual(collapsedShape(realTable));
		expect(shape(formatting, table)).toEqual(shape(reference, realTable));
		expect(table.collapsedBorderOwner).toBe(table.id);
		expect(table.ref).toBeUndefined();
		if (content) {
			const cell = anonymousCell(formatting, table);
			expect(cell.collapsedBorderOwner).toBe(table.id);
			expect(formatting.nodes[cell.children[0]].generatedContent).toEqual({
				owner: generated.id(),
				name: "before",
			});
		} else {
			expect(table.children).toEqual([]);
			expect(table.collapsedTable?.segments).toEqual([]);
		}
		verifyOwnership(formatting, generated.tree);
		verifyOwnership(reference, real.tree);
	},
);

it("retains the native collapsed-border guard for a bordered empty grid", () => {
	const generated = fixture(
		undefined,
		'#target::before{content:" ";display:table;border-collapse:collapse;border:2px solid red}',
	);
	const real = fixture(
		'<div id="target" style="display:table;border-collapse:collapse;border:2px solid red"> </div>',
	);
	for (const { tree } of [real, generated]) {
		const formatting = buildFormattingTree(tree);
		expect(formatting.issues).toEqual({
			"display-layout-not-supported": 1,
			"table-collapsed-borders-not-supported": 1,
		});
		expect(() => layoutDocument(tree)).toThrow(
			/table-collapsed-borders-not-supported/,
		);
	}
});

it.each(["inline-table", "flex", "grid", "contents"])(
	"keeps generated display:%s unsupported",
	(display) => {
		const { tree, id, styles } = fixture(
			undefined,
			`#target::before{content:"X";display:${display}}`,
		);
		expect(styles.generatedContent(id(), "before")?.display).toBe(display);
		expect(
			buildFormattingTree(tree).issues[
				"generated-content-display-layout-not-supported"
			],
		).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			/generated-content-display-layout-not-supported/,
		);
	},
);

it.each(["flex", "grid"])(
	"retains the generated-item guard for a table in a %s owner",
	(display) => {
		const { tree } = fixture(
			undefined,
			`#target{display:${display}}#target::before{content:"X";display:table}`,
		);
		expect(
			buildFormattingTree(tree).issues[
				"generated-content-item-layout-not-supported"
			],
		).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			/generated-content-item-layout-not-supported/,
		);
	},
);

it.each(["left", "right"])(
	"retains the generated float:%s guard for tables",
	(side) => {
		const { tree } = fixture(
			undefined,
			`#target::before{content:"X";display:table;float:${side}}`,
		);
		expect(
			buildFormattingTree(tree).issues[
				"generated-content-float-layout-not-supported"
			],
		).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			/generated-content-float-layout-not-supported/,
		);
	},
);

it.each(["hidden", "scroll"])(
	"retains the generated overflow:%s guard for tables",
	(overflow) => {
		const { tree } = fixture(
			undefined,
			`#target::before{content:"X";display:table;overflow:${overflow}}`,
		);
		expect(
			buildFormattingTree(tree).issues[
				"generated-content-overflow-layout-not-supported"
			],
		).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			/generated-content-overflow-layout-not-supported/,
		);
	},
);

it.each(["relative", "absolute", "fixed", "sticky"])(
	"preserves real and generated position:%s table guards",
	(position) => {
		const generated = fixture(
			undefined,
			`#target::before{content:"Cell";display:table;position:${position};left:1px;top:1px}`,
		);
		const real = fixture(
			`<div id="target" style="display:table;position:${position};left:1px;top:1px">Cell</div>`,
		);
		expect(
			buildFormattingTree(real.tree).issues[
				"table-position-layout-not-supported"
			],
		).toBe(1);
		expect(() => layoutDocument(real.tree)).toThrow(
			/table-position-layout-not-supported/,
		);
		expect(
			buildFormattingTree(generated.tree).issues[
				"generated-content-display-layout-not-supported"
			],
		).toBe(1);
		expect(() => layoutDocument(generated.tree)).toThrow(
			/generated-content-display-layout-not-supported/,
		);
	},
);

it("keeps fixed table layout unsupported without conflating it with generated display", () => {
	const generated = fixture(
		undefined,
		'#target::before{content:"Cell";display:table;table-layout:fixed}',
	);
	const real = fixture(
		'<div id="target" style="display:table;table-layout:fixed">Cell</div>',
	);
	for (const { tree } of [real, generated]) {
		const formatting = buildFormattingTree(tree);
		expect(formatting.issues).toEqual({
			"display-layout-not-supported": 1,
			"table-fixed-layout-not-supported": 1,
		});
		expect(() => layoutDocument(tree)).toThrow(
			/table-fixed-layout-not-supported/,
		);
	}
});

it.each(["", "Cell"])(
	"matches native empty-cells:hide diagnostics for anonymous content %j",
	(content) => {
		const generated = fixture(
			undefined,
			`#target::before{content:"${content}";display:table;empty-cells:hide}`,
		);
		const real = fixture(
			`<div id="target" style="display:table;empty-cells:hide">${content}</div>`,
		);
		const formatting = buildFormattingTree(generated.tree);
		const reference = buildFormattingTree(real.tree);
		expect(formatting.issues).toEqual(reference.issues);
		expect(shape(formatting, pseudoBox(formatting, generated.id()))).toEqual(
			shape(reference, nodeFor(reference, real.tree.reference(real.id()))),
		);
		verifyOwnership(formatting, generated.tree);
	},
);
