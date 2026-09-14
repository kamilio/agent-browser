import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { layoutDocument, type DocumentLayout } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { buildFormattingTree, type FormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0}html,body{font-size:8px;line-height:10px}#following{height:4px;background:black}${css}</style>${markup}<footer id="following"></footer>`,
		"https://fixture.invalid/generated-items",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(120, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, queries, id };
}

function pair({
	display = "flex",
	name = "before",
	text = "AB",
	declarations = "width:20px;height:10px",
	css = "",
	transparent = false,
}: {
	display?: "flex" | "grid";
	name?: "before" | "after";
	text?: string;
	declarations?: string;
	css?: string;
	transparent?: boolean;
} = {}) {
	const inside = '<span id="sibling">XY</span>';
	const ordinary = `<span id="ordinary">${text}</span>`;
	const markup = (children: string) =>
		transparent
			? `<main id="container"><span id="target" style="display:contents">${children}</span></main>`
			: `<main id="target">${children}</main>`;
	const container = transparent ? "#container" : "#target";
	const common = `${container}{display:${display};width:90px;grid-template-columns:30px 30px 30px;grid-template-rows:20px 20px}#sibling{width:20px;height:10px;flex:none;color:green}${css}`;
	return {
		name,
		display,
		generated: fixture(
			markup(inside),
			`${common}#target::${name}{content:${JSON.stringify(text)};${declarations}}`,
		),
		ordinary: fixture(
			markup(name === "before" ? ordinary + inside : inside + ordinary),
			`${common}#ordinary{${declarations}}`,
		),
	};
}

function pseudo(formatting: FormattingTree, owner: number, name: string) {
	const found = formatting.nodes.find(
		(node) =>
			node.generatedContent?.owner === owner &&
			node.generatedContent.name === name &&
			node.kind !== "text",
	);
	if (!found) throw new Error(`Missing ::${name} formatting box`);
	return found;
}

function box(layout: DocumentLayout, id: number) {
	const found = layout.boxes.find((entry) => entry.id === id);
	if (!found) throw new Error(`Missing layout box ${id}`);
	return found;
}

function elementBox(
	layout: DocumentLayout,
	page: ReturnType<typeof fixture>,
	selector: string,
) {
	const ref = page.tree.reference(page.id(selector));
	const found = layout.boxes.find((entry) => entry.ref === ref);
	if (!found) throw new Error(`Missing element box ${selector}`);
	return found;
}

function rectangle(value: DocumentLayout["boxes"][number]) {
	return {
		x: value.borderX,
		y: value.borderY,
		width: value.borderBoxWidth,
		height: value.borderBoxHeight,
	};
}

function equivalent(current: ReturnType<typeof pair>) {
	const generated = rasterizeDocument(current.generated.tree);
	const ordinary = rasterizeDocument(current.ordinary.tree);
	const node = pseudo(
		generated.layout.text.horizontal.formatting,
		current.generated.id(),
		current.name,
	);
	const target = box(generated.layout, node.id);
	expect(rectangle(target)).toEqual(
		rectangle(elementBox(ordinary.layout, current.ordinary, "#ordinary")),
	);
	for (const selector of ["#sibling", "#following"])
		expect(
			rectangle(elementBox(generated.layout, current.generated, selector)),
		).toEqual(
			rectangle(elementBox(ordinary.layout, current.ordinary, selector)),
		);
	expect(generated.layout.flowHeight).toBe(ordinary.layout.flowHeight);
	expect(generated.image.pixels).toEqual(ordinary.image.pixels);
	return { generated, ordinary, node, target };
}

it.each(
	(["flex", "grid"] as const).flatMap((display) =>
		(["before", "after"] as const).flatMap((name) =>
			["inline", "inline-block", "block"].map(
				(pseudoDisplay) => [display, name, pseudoDisplay] as const,
			),
		),
	),
)(
	"matches ordinary %s ::%s item geometry and paint from display:%s",
	(display, name, pseudoDisplay) => {
		const current = pair({
			display,
			name,
			declarations: `display:${pseudoDisplay};width:20px;height:10px;padding:1px;margin:2px;border:1px solid red;background:blue`,
		});
		const { node } = equivalent(current);
		expect(node).toMatchObject({
			kind: "block",
			level: "block",
			independentContext: true,
			[display === "flex" ? "flexItem" : "gridItem"]: true,
		});
		expect(node.deferredReason).toBeUndefined();
	},
);

it.each(
	(["flex", "grid"] as const).flatMap((display) =>
		(["before", "after"] as const).map((name) => [display, name] as const),
	),
)(
	"retains empty %s ::%s item boxes and ignores float/clear/alignment",
	(display, name) => {
		const current = pair({
			display,
			name,
			text: "",
			declarations:
				"width:8px;height:6px;padding:1px;border:1px solid red;background:blue;float:left;clear:both;vertical-align:middle",
		});
		const { node, target } = equivalent(current);
		expect(node.children).toEqual([]);
		expect(rectangle(target)).toMatchObject({ width: 12, height: 10 });
		expect(node.floatSide).toBeUndefined();
		expect(node.clear).toBeUndefined();
		expect(node.inlineVerticalAlign).toBeUndefined();
	},
);

it.each([
	{
		label: "flex growth and order",
		declarations: "flex:1 0 10px;min-width:0;height:10px;order:2",
	},
	{
		label: "flex shrink",
		declarations: "flex:1 1 120px;min-width:0;height:10px",
	},
	{
		label: "reverse flex",
		declarations: "width:20px;height:10px",
		css: "#target{flex-direction:row-reverse}",
	},
	{
		label: "column flex",
		declarations: "flex:1 0 20px;min-height:0;width:12px;align-self:center",
		css: "#target{height:60px;flex-direction:column}",
	},
	{
		label: "wrapped flex",
		declarations: "width:80px;height:12px;flex:none",
		css: "#target{flex-wrap:wrap;row-gap:3px}",
	},
	{
		label: "grid placement",
		display: "grid",
		declarations:
			"grid-column:2;grid-row:2;width:12px;height:8px;align-self:end",
	},
	{
		label: "grid span",
		display: "grid",
		declarations: "grid-column:1 / span 2;grid-row:2;height:8px;min-width:0",
	},
] as const)(
	"coordinates generated item $label",
	({ declarations, ...scenario }) => {
		equivalent(pair({ ...scenario, declarations }));
	},
);

it.each(["flex", "grid"] as const)(
	"preserves %s item ownership through display:contents",
	(display) => {
		const current = pair({ display, transparent: true });
		const { node } = equivalent(current);
		expect(node.display).toBe("block");
		expect(node.generatedContent?.owner).toBe(current.generated.id());
	},
);

it.each(["flex", "grid"] as const)(
	"routes %s generated-item hits to its DOM owner without adding action targets",
	(display) => {
		const current = pair({
			display,
			text: "",
			declarations: "width:20px;height:12px;background:blue",
		});
		const { tree, id, queries } = current.generated;
		const revision = tree.revision;
		const count = tree.nodeCount;
		const children = [...tree.get(id()).children];
		const controls = documentGeneratedControls(tree);
		const controlCount = controls.metrics().targets;
		const { node, target } = equivalent(current);
		expect(
			documentHitTesting(tree).targetFromPoint(
				target.borderX + 2,
				target.borderY + 2,
			),
		).toEqual({ id: id() });
		expect(node.ref).toBeUndefined();
		expect(node.generated).toBeUndefined();
		expect(queries.querySelectorAll("#target::before")).toEqual([]);
		expect(tree.nodeCount).toBe(count);
		expect(tree.revision).toBe(revision);
		expect(tree.get(id()).children).toEqual(children);
		expect(controls.metrics().targets).toBe(controlCount);
	},
);

it.each(["flex", "grid"] as const)(
	"invalidates %s generated-item dimensions and suppression",
	(display) => {
		const current = pair({
			display,
			css: "#target.changed::before,#target.changed #ordinary{width:28px;height:18px;order:2}#target.suppressed::before{content:none}#target.suppressed #ordinary{display:none}",
		});
		const initial = equivalent(current);
		for (const page of [current.generated, current.ordinary])
			page.tree.setAttribute(page.id(), "class", "changed");
		const changed = equivalent(current);
		expect(changed.target.borderBoxWidth).toBe(28);
		for (const page of [current.generated, current.ordinary])
			page.tree.setAttribute(page.id(), "class", "suppressed");
		const hidden = rasterizeDocument(current.generated.tree);
		expect(hidden.image.pixels).toEqual(
			rasterizeDocument(current.ordinary.tree).image.pixels,
		);
		expect(
			hidden.layout.text.horizontal.formatting.nodes.some(
				(node) => node.generatedContent?.owner === current.generated.id(),
			),
		).toBe(false);
		for (const page of [current.generated, current.ordinary])
			page.tree.removeAttribute(page.id(), "class");
		expect(equivalent(current).generated.image.pixels).toEqual(
			initial.generated.image.pixels,
		);
	},
);

it.each(["flex", "grid"] as const)(
	"keeps %s generated-item formatting work bounded and recoverable",
	(display) => {
		const current = pair({ display });
		const formatting = buildFormattingTree(current.generated.tree);
		expect(() =>
			buildFormattingTree(current.generated.tree, {
				maxWork: formatting.metrics.work - 1,
			}),
		).toThrow(/work limit/);
		expect(() =>
			buildFormattingTree(current.generated.tree, {
				maxBoxes: formatting.metrics.boxes - 1,
			}),
		).toThrow(/box limit/);
		expect(() =>
			buildFormattingTree(current.generated.tree, { maxTextCodeUnits: 1 }),
		).toThrow(/text limit/);
		expect(() => layoutDocument(current.generated.tree)).not.toThrow();
	},
);

const itemVariants = (["flex", "grid"] as const).flatMap((display) =>
	(["before", "after"] as const).map((name) => ({ display, name })),
);
const ownerVariants = itemVariants.flatMap((variant) =>
	[false, true].map((transparent) => ({ ...variant, transparent })),
);

it.each(
	itemVariants.flatMap((variant) =>
		[
			{ itemZ: "-1", siblingZ: "auto", order: 2, generatedWins: false },
			{ itemZ: "0", siblingZ: "auto", order: -2, generatedWins: true },
			{ itemZ: "1", siblingZ: "auto", order: -2, generatedWins: true },
			{ itemZ: "auto", siblingZ: "auto", order: 2, generatedWins: true },
			{ itemZ: "auto", siblingZ: "auto", order: -2, generatedWins: false },
			{ itemZ: "0", siblingZ: "0", order: 2, generatedWins: true },
			{ itemZ: "0", siblingZ: "0", order: -2, generatedWins: false },
			{ itemZ: "2", siblingZ: "1", order: -2, generatedWins: true },
		].map((stacking) => ({ ...variant, ...stacking })),
	),
)(
	"stacks static $display ::$name at z-index $itemZ/$siblingZ and order $order",
	({ display, name, itemZ, siblingZ, order, generatedWins }) => {
		const overlap =
			display === "flex" ? "margin-right:-20px" : "grid-column:1;grid-row:1";
		const current = pair({
			display,
			name,
			text: "",
			declarations: `width:20px;height:20px;flex:none;background:red;z-index:${itemZ};order:${order};${overlap}`,
			css: `#sibling{height:20px;font-size:0;background:blue;z-index:${siblingZ};${overlap}}`,
		});
		const { generated, ordinary, node, target } = equivalent(current);
		expect(node.position).toBeUndefined();
		expect(node.zIndex).toBe(itemZ === "auto" ? undefined : Number(itemZ));
		expect(node.flex?.order).toBe(String(order));
		expect(rectangle(target)).toEqual(
			rectangle(elementBox(generated.layout, current.generated, "#sibling")),
		);
		const pointX = target.borderX + 10;
		const pointY = target.borderY + 10;
		const color = generatedWins ? [255, 0, 0, 255] : [0, 0, 255, 255];
		for (const raster of [generated, ordinary]) {
			const start = (pointY * raster.image.width + pointX) * 4;
			expect([...raster.image.pixels.slice(start, start + 4)]).toEqual(color);
		}
		for (const [page, generatedSelector] of [
			[current.generated, "#target"],
			[current.ordinary, "#ordinary"],
		] as const)
			expect(
				documentHitTesting(page.tree).targetFromPoint(pointX, pointY),
			).toEqual({
				id: page.id(generatedWins ? generatedSelector : "#sibling"),
			});
	},
);

it.each(
	ownerVariants.flatMap((variant) =>
		(["absolute", "fixed"] as const).map((position) => ({
			...variant,
			position,
		})),
	),
)(
	"restores $display ::$name items after $position positioning with transparent=$transparent",
	({ display, name, transparent, position }) => {
		const container = transparent ? "#container" : "#target";
		const current = pair({
			display,
			name,
			transparent,
			text: "",
			declarations: "width:20px;height:10px;flex:none;order:-1;background:red",
			css: `body{position:relative}${container}{height:60px}#target.positioned::${name},#target.positioned #ordinary{position:${position};left:60px;top:40px}`,
		});
		const initial = equivalent(current);
		const initialSibling = elementBox(
			initial.generated.layout,
			current.generated,
			"#sibling",
		);
		expect(initial.node.flexItem).toBe(display === "flex" ? true : undefined);
		expect(initial.node.gridItem).toBe(display === "grid" ? true : undefined);
		expect(initial.node.staticFlex).toBeUndefined();
		expect(initial.node.position).toBeUndefined();
		expect(initialSibling.borderX - initial.target.borderX).toBe(
			display === "flex" ? 20 : 30,
		);
		for (const page of [current.generated, current.ordinary])
			page.tree.setAttribute(page.id(), "class", "positioned");
		const positioned = equivalent(current);
		expect(positioned.node).toMatchObject({
			position,
			staticDisplay: "block",
			staticFlex: initial.node.flex,
			generatedContent: { owner: current.generated.id(), name },
		});
		expect(positioned.node.flexItem).toBeUndefined();
		expect(positioned.node.gridItem).toBeUndefined();
		expect(positioned.node.flex).toBeUndefined();
		expect(positioned.node.grid).toBeUndefined();
		expect(rectangle(positioned.target)).toEqual({
			x: 60,
			y: 40,
			width: 20,
			height: 10,
		});
		expect(
			elementBox(positioned.generated.layout, current.generated, "#sibling")
				.borderX,
		).toBe(initial.target.borderX);
		expect(
			documentHitTesting(current.generated.tree).targetFromPoint(65, 45),
		).toEqual({ id: current.generated.id() });
		for (const page of [current.generated, current.ordinary])
			page.tree.removeAttribute(page.id(), "class");
		const restored = equivalent(current);
		expect(restored.node.flexItem).toBe(initial.node.flexItem);
		expect(restored.node.gridItem).toBe(initial.node.gridItem);
		expect(restored.node.flex).toEqual(initial.node.flex);
		expect(restored.node.grid).toEqual(initial.node.grid);
		expect(restored.node.position).toBeUndefined();
		expect(restored.node.staticDisplay).toBeUndefined();
		expect(restored.node.staticFlex).toBeUndefined();
		expect(rectangle(restored.target)).toEqual(rectangle(initial.target));
		expect(
			rectangle(
				elementBox(restored.generated.layout, current.generated, "#sibling"),
			),
		).toEqual(rectangle(initialSibling));
		expect(restored.generated.image.pixels).toEqual(
			initial.generated.image.pixels,
		);
	},
);

it.each(ownerVariants)(
	"offsets relative $display ::$name items without reallocating siblings with transparent=$transparent",
	({ display, name, transparent }) => {
		const current = pair({
			display,
			name,
			transparent,
			text: "",
			declarations: "width:20px;height:10px;flex:none;order:-1;background:red",
			css: `#target.shifted::${name},#target.shifted #ordinary{position:relative;left:7px;top:4px}`,
		});
		const initial = equivalent(current);
		for (const page of [current.generated, current.ordinary])
			page.tree.setAttribute(page.id(), "class", "shifted");
		const shifted = equivalent(current);
		expect(shifted.node.position).toBe("relative");
		expect(shifted.node.flexItem).toBe(initial.node.flexItem);
		expect(shifted.node.gridItem).toBe(initial.node.gridItem);
		expect(shifted.node.staticFlex).toBeUndefined();
		expect(rectangle(shifted.target)).toEqual({
			...rectangle(initial.target),
			x: initial.target.borderX + 7,
			y: initial.target.borderY + 4,
		});
		for (const selector of ["#sibling", "#following"])
			expect(
				rectangle(
					elementBox(shifted.generated.layout, current.generated, selector),
				),
			).toEqual(
				rectangle(
					elementBox(initial.generated.layout, current.generated, selector),
				),
			);
		expect(shifted.generated.layout.flowHeight).toBe(
			initial.generated.layout.flowHeight,
		);
	},
);
