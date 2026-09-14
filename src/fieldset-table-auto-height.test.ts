import { afterEach, expect, it } from "vitest";
import { initialBoxStyle } from "./css-box.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { fieldsetContentStyle } from "./fieldset-layout.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(
	model = "separate",
	css = "",
	content = '<div id="leaf"></div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}#host{width:240px}table{width:100%;border:0;border-spacing:0;border-collapse:${model}}td{padding:0;border:0;vertical-align:top}#cell{width:50%}fieldset{width:auto;min-width:0;margin:0;padding:3px 5px;border:2px solid red}#leaf{width:20px;height:10px}#tall{height:64px}#after{height:4px}${css}</style><main id="host"><table id="table"><tbody><tr id="row"><td id="cell"><div><form><fieldset id="target">${content}</fieldset></form></div></td><td><div id="tall"></div></td></tr></tbody></table><div id="after"></div></main>`,
		"https://fixture.invalid/fieldset-table",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(260, 160);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	const rect = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const boxes = (selector = "#target") => {
		const layout = layoutDocument(tree);
		const formatting = layout.text.horizontal.formatting;
		const outerNode = formatting.nodes.find(
			(node) => node.ref === tree.reference(id(selector)),
		);
		if (!outerNode || outerNode.fieldsetContent === undefined)
			throw new Error("Missing fieldset owner");
		const innerNode = formatting.nodes[outerNode.fieldsetContent];
		const outer = layout.boxes.find((box) => box.id === outerNode.id);
		const inner = layout.boxes.find((box) => box.id === innerNode.id);
		if (!outer || !inner) throw new Error("Missing fieldset geometry");
		return { layout, outerNode, innerNode, outer, inner };
	};
	return { tree, styles, id, rect, boxes };
}

it.each(["separate", "collapse"])(
	"keeps an auto-height fieldset natural inside a taller %s table row",
	(model) => {
		const page = fixture(model);
		const revision = page.tree.revision;
		const { outerNode, innerNode, outer, inner } = page.boxes();
		expect(page.rect("#table").width).toBe(240);
		expect(page.rect("#cell")).toMatchObject({ width: 120, height: 64 });
		expect(page.rect("#target")).toMatchObject({
			x: 0,
			y: 0,
			width: 120,
			height: 20,
		});
		expect(page.rect("#leaf")).toMatchObject({
			x: 7,
			y: 5,
			width: 20,
			height: 10,
		});
		expect(page.rect("#after").y).toBe(64);
		expect(outer).toMatchObject({
			paddingTop: 0,
			paddingLeft: 0,
			borderBoxHeight: 20,
		});
		expect(inner).toMatchObject({
			contentHeight: 10,
			borderBoxHeight: 16,
			paddingTop: 3,
			paddingLeft: 5,
		});
		expect(innerNode).toMatchObject({
			parent: outerNode.id,
			fieldsetOwner: outerNode.id,
			box: { height: "auto" },
		});
		expect(innerNode.ref).toBeUndefined();
		expect(page.tree.revision).toBe(revision);
	},
);

it.each([
	["min-height:40px", 44],
	["max-height:5px", 9],
] as const)(
	"does not turn an auto owner's %s into a definite content height",
	(rule, expected) => {
		const page = fixture("separate", `#target{${rule}}`);
		const { innerNode, inner } = page.boxes();
		expect(innerNode.box?.height).toBe("auto");
		expect(inner.contentHeight).toBe(10);
		expect(page.rect("#target").height).toBe(expected);
		expect(page.rect("#leaf").height).toBe(10);
		expect(page.rect("#after").y).toBe(64);
	},
);

it.each(["separate", "collapse"])(
	"preserves empty and nested %s fieldset padding",
	(model) => {
		const empty = fixture(model, "", "");
		expect(empty.boxes().inner.contentHeight).toBe(0);
		expect(empty.rect("#target").height).toBe(10);
		const nested = fixture(
			model,
			"",
			'<fieldset id="nested"><div id="leaf"></div></fieldset>',
		);
		expect(nested.rect("#target").height).toBe(30);
		expect(nested.rect("#nested").height).toBe(20);
		expect(nested.rect("#leaf")).toMatchObject({ x: 14, y: 10, height: 10 });
		expect(nested.boxes("#nested").innerNode.box?.height).toBe("auto");
	},
);

it.each(["separate", "collapse"])(
	"reflows natural fieldset content after %s table width mutation",
	(model) => {
		const page = fixture(
			model,
			"#tall{height:0}#leaf{width:auto;height:auto}",
			'<div id="leaf">AAAA AAAA AAAA</div>',
		);
		const before = page.boxes();
		const height = page.rect("#target").height;
		const afterY = page.rect("#after").y;
		page.tree.setAttribute(page.id("#host"), "style", "width:100px");
		const after = page.boxes();
		expect(page.rect("#target").height).toBeGreaterThan(height);
		expect(page.rect("#after").y).toBeGreaterThan(afterY);
		expect(after.inner.contentHeight).toBeGreaterThan(
			before.inner.contentHeight,
		);
		expect(before.outer.borderBoxHeight).toBe(height);
		expect(Object.isFrozen(before.outer)).toBe(true);
	},
);

it.each(["separate", "collapse"])(
	"invalidates auto-to-fixed-to-auto fieldsets without weakening %s table guards",
	(model) => {
		const page = fixture(model);
		const before = page.rect("#target");
		page.tree.setAttribute(page.id("#target"), "style", "height:40px");
		expect(() => page.rect("#target")).toThrow(
			"Percentage cell descendant heights require table reflow",
		);
		page.tree.setAttribute(page.id("#target"), "style", "height:auto");
		expect(page.rect("#target")).toEqual(before);
		expect(page.boxes().innerNode.box?.height).toBe("auto");
	},
);

it.each([
	"height:50%",
	"min-height:50%",
	"max-height:50%",
	"height:calc(50% + 2px)",
])("retains the table reflow guard for authored descendant %s", (rule) => {
	const page = fixture("separate", `#leaf{${rule}}`);
	expect(() => page.rect("#target")).toThrow(
		"Percentage cell descendant heights require table reflow",
	);
});

it.each(["0px", "40px", "50%", "calc(50% + 2px)"])(
	"retains internal percentage sizing for an explicit owner height %s",
	(height) => {
		const style = Object.freeze({ ...initialBoxStyle, height });
		expect(fieldsetContentStyle(style).height).toBe("100%");
		expect(style.height).toBe(height);
	},
);

it.each(["inline", "inline-block"])(
	"keeps %s fieldset content natural during table atomic layout and mutation",
	(display) => {
		const page = fixture(
			"separate",
			`#target{display:${display};width:100px}#leaf{width:auto;height:auto}`,
			'<div id="leaf">AAAA AAAA AAAA</div>',
		);
		const before = page.boxes();
		expect(before.outerNode.level).toBe("inline");
		expect(before.innerNode.box?.height).toBe("auto");
		expect(before.inner.contentHeight).toBe(8);
		expect(page.rect("#row").height).toBe(64);
		page.tree.setAttribute(page.id("#target"), "style", "width:40px");
		const after = page.boxes();
		expect(after.inner.contentHeight).toBeGreaterThan(
			before.inner.contentHeight,
		);
		expect(after.outer.borderBoxHeight).toBeLessThan(64);
		expect(page.rect("#row").height).toBe(64);
		expect(before.inner.contentHeight).toBe(8);
	},
);

it.each([
	["min-height:40px", 44],
	["max-height:5px", 9],
] as const)(
	"keeps percentage children indefinite under a constrained normal-flow auto fieldset: %s",
	(rule, expected) => {
		const page = fixture(
			"separate",
			`#host{height:80px}#target{${rule}}#leaf{height:50%}`,
			'<div id="leaf"><div style="height:10px"></div></div>',
		);
		page.tree.append(page.id("#host"), page.id("#target"));
		const automatic = page.boxes();
		expect(automatic.outer.definiteHeight).toBeNull();
		expect(automatic.inner.definiteHeight).toBeNull();
		expect(automatic.inner.contentHeight).toBe(10);
		expect(page.rect("#target").height).toBe(expected);
		expect(page.rect("#leaf").height).toBe(10);
		page.tree.setAttribute(
			page.id("#target"),
			"style",
			"height:50%;min-height:0;max-height:none",
		);
		const definite = page.boxes();
		expect(definite.innerNode.box?.height).toBe("100%");
		expect(definite.outer.definiteHeight).toBe(40);
		expect(definite.inner.definiteHeight).toBe(40);
		expect(definite.inner.contentHeight).toBe(40);
		expect(page.rect("#leaf").height).toBe(20);
	},
);

it("does not manufacture a percentage dependency for an auto-height owner", () => {
	const style = Object.freeze({
		...initialBoxStyle,
		"padding-top": "3px",
		"padding-left": "5px",
		"min-height": "40px",
	});
	const content = fieldsetContentStyle(style);
	expect(content).toMatchObject({
		height: "auto",
		"min-height": "auto",
		"padding-top": "3px",
		"padding-left": "5px",
	});
	expect(Object.isFrozen(content)).toBe(true);
	expect(style.height).toBe("auto");
});
