import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureLayoutOverflow } from "./layout-overflow.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}#port{width:80px;height:60px;overflow:hidden}#target{display:block;width:160px;height:140px;flex-shrink:0}</style><div id="port">${content}</div>`,
		"https://fixture.invalid/overflow-ownership",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(240, 180);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, id, layout: layoutDocument(tree) };
}

function reachableNodes(layout: Readonly<DocumentLayout>) {
	const formatting = layout.text.horizontal.formatting;
	const reachable = new Set<number>();
	const pending = [formatting.root];
	while (pending.length) {
		const current = pending.pop() as number;
		reachable.add(current);
		pending.push(...formatting.nodes[current].children);
	}
	return reachable;
}

it.each(["missing", "index", "noninteger"])(
	"rejects a discarded arena node with a %s identity",
	(kind) => {
		const { layout } = fixture(
			'<section style="display:flex"> \n <a id="target">text</a> \n </section>',
		);
		const formatting = layout.text.horizontal.formatting;
		const reachable = reachableNodes(layout);
		const discarded = formatting.nodes.find((node) => !reachable.has(node.id));
		if (!discarded) throw new Error("Missing discarded node");
		const nodes = formatting.nodes.map((node) =>
			node.id !== discarded.id
				? node
				: kind === "missing"
					? (undefined as unknown as typeof node)
					: { ...node, id: kind === "index" ? node.id + 1 : Number.NaN },
		);
		expect(() =>
			measureLayoutOverflow({
				...layout,
				text: {
					...layout.text,
					horizontal: {
						...layout.text.horizontal,
						formatting: { ...formatting, nodes },
					},
				},
			}),
		).toThrow("Invalid overflow ownership");
	},
);

it.each(["flex", "grid"])(
	"measures %s whitespace discarded from the reachable formatting tree",
	(display) => {
		const { tree, id, layout } = fixture(
			`<section style="display:${display}"> \n <a id="target" href="/next">Tutorial</a> \n </section>`,
		);
		const formatting = layout.text.horizontal.formatting;
		const reachable = reachableNodes(layout);
		expect(reachable.size).toBeLessThan(formatting.nodes.length);
		expect(() => measureLayoutOverflow(layout)).not.toThrow();
		const owner = documentElementScroll(tree);
		expect(owner.get(id("#port"))).toEqual({
			scrollLeft: 0,
			scrollTop: 0,
			scrollWidth: 160,
			scrollHeight: 140,
		});
		owner.to(id("#port"), 30, 20);
		expect(
			documentGeometry(tree).getBoundingClientRect(id("#target")),
		).toMatchObject({ x: -30, y: -20, width: 160, height: 140 });
	},
);

it.each([
	["inline splitting", '<span>before<div id="target"></div>after</span>'],
	[
		"caption",
		'<table><caption>caption</caption><tr><td id="target"></td></tr></table>',
	],
	[
		"anonymous table",
		'<div style="display:table"><div id="target"></div></div>',
	],
	["float", '<div style="float:left"><div id="target"></div></div>'],
])("measures reachable ownership after %s normalization", (_name, content) => {
	const { tree, id, layout } = fixture(content);
	expect(() => measureLayoutOverflow(layout)).not.toThrow();
	expect(() => documentElementScroll(tree).get(id("#port"))).not.toThrow();
	expect(() =>
		documentGeometry(tree).getBoundingClientRect(id("#target")),
	).not.toThrow();
});

it.each(["box", "containing block", "fixed", "context", "fragment", "glyph"])(
	"rejects a rendered %s that references a discarded formatting node",
	(kind) => {
		const { layout } = fixture(
			'<section style="display:flex"> \n <a id="target"><span>text</span></a> \n </section>',
		);
		const formatting = layout.text.horizontal.formatting;
		const reachable = reachableNodes(layout);
		const discarded = formatting.nodes.find((node) => !reachable.has(node.id));
		if (!discarded) throw new Error("Missing discarded node");
		const context = layout.contexts.find(
			(entry) => entry.fragments.length && entry.glyphs.length,
		);
		if (!context) throw new Error("Missing text context");
		let changed: Readonly<DocumentLayout> = layout;
		if (kind === "box" || kind === "containing block")
			changed = {
				...layout,
				boxes: layout.boxes.map((box, index) =>
					index === 0
						? {
								...box,
								[kind === "box" ? "id" : "containingBlock"]: discarded.id,
							}
						: box,
				),
			};
		else if (kind === "fixed")
			changed = { ...layout, fixedIds: [discarded.id] };
		else
			changed = {
				...layout,
				contexts: [
					{
						...context,
						...(kind === "context" ? { id: discarded.id } : {}),
						...(kind === "fragment"
							? {
									fragments: [
										{ ...context.fragments[0], formattingId: discarded.id },
									],
								}
							: {}),
						...(kind === "glyph"
							? {
									glyphs: [
										{ ...context.glyphs[0], formattingId: discarded.id },
									],
								}
							: {}),
					},
				],
			};
		expect(() => measureLayoutOverflow(changed)).toThrow(
			"Invalid overflow ownership",
		);
	},
);
