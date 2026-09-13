import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { documentStyles } from "./styles.js";
import { documentSvgScene } from "./svg-scene.js";

const documents: DocumentTree[] = [];
const noop = () => {};

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(attributes: Record<string, string> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/svg-scene");
	documents.push(tree);
	const html = tree.createElement("main");
	tree.append(tree.root, html);
	const root = tree.createParserElement("svg", attributes, svgNamespace);
	tree.append(html, root);
	function add(
		tagName: string,
		attrs: Record<string, string> = {},
		parent = root,
		namespace = svgNamespace,
	) {
		const child = tree.createParserElement(tagName, attrs, namespace);
		tree.append(parent, child);
		return child;
	}
	return {
		tree,
		html,
		root,
		add,
		scene: (charge: (amount: number) => void = noop) =>
			documentSvgScene(tree, root, charge),
	};
}

it("inherits paint tokens while resolving currentColor at each shape", () => {
	const { tree, root, add, scene } = fixture({
		fill: "red",
		"fill-opacity": "0.5",
	});
	const group = add("g", {
		fill: "currentColor",
		"fill-rule": "evenodd",
		style: "color:blue;visibility:hidden;pointer-events:none",
	});
	const hidden = add("path", { d: "M0 0L2 2" }, group);
	const inner = add(
		"g",
		{ style: "color:green;visibility:visible;pointer-events:auto" },
		group,
	);
	const visible = add("circle", { r: "2", opacity: "50%" }, inner);
	add("ellipse", { rx: "1", ry: "2", fill: "none" });
	const result = scene();
	expect(result.rootRef).toBe(tree.reference(root));
	expect(result.shapes[0]).toMatchObject({
		id: hidden,
		ref: tree.reference(hidden),
		fill: [0, 0, 255, 128],
		fillRule: "evenodd",
		visible: false,
		pointerEvents: false,
		ancestors: [tree.reference(group)],
	});
	expect(result.shapes[1]).toMatchObject({
		id: visible,
		fill: [0, 128, 0, 64],
		visible: true,
		pointerEvents: true,
		ancestors: [tree.reference(group), tree.reference(inner)],
	});
	expect(result.shapes[2].fill).toBeNull();
});

it("defaults to black and supports inherited none and explicit paint resets", () => {
	const { add, scene } = fixture({ stroke: "none" });
	add("path");
	const group = add("g", {
		fill: "none",
		stroke: "inherit",
		"fill-opacity": ".3",
	});
	add("line", { stroke: "none" }, group);
	add(
		"circle",
		{ fill: "initial", "fill-opacity": "initial", "fill-rule": "initial" },
		group,
	);
	expect(scene().shapes.map((shape) => shape.fill)).toEqual([
		[0, 0, 0, 255],
		null,
		[0, 0, 0, 255],
	]);
});

it("retains root-hidden geometry and lets a descendant visibility override reveal it", () => {
	const { add, scene } = fixture({ style: "visibility:hidden" });
	add("circle", { r: "2" });
	const group = add("g");
	add("path", { d: "M0 0L2 2", style: "visibility:visible" }, group);
	const result = scene();
	expect(result.shapes.map((shape) => shape.visible)).toEqual([false, true]);
	expect(result.shapes[0].path).toHaveLength(4);
	expect(result.shapes[1].path).toHaveLength(2);
});

it("distinguishes transparent painted fills from fill:none for downstream hit testing", () => {
	const { add, scene } = fixture();
	add("circle", { r: "2", "fill-opacity": "0" });
	add("circle", { r: "2", opacity: "0", fill: "red" });
	add("circle", { r: "2", fill: "transparent" });
	add("circle", { r: "2", fill: "none" });
	const result = scene().shapes;
	expect(result.map((shape) => shape.fill)).toEqual([
		[0, 0, 0, 0],
		[255, 0, 0, 0],
		[0, 0, 0, 0],
		null,
	]);
	expect(result.every((shape) => shape.pointerEvents)).toBe(true);
	expect(result.every((shape) => shape.path.length === 4)).toBe(true);
});

it("skips display:none subtrees and nonrendering metadata, not hidden geometry", () => {
	const { tree, add, scene } = fixture();
	const group = add("g", { style: "display:none", fill: "url(external)" });
	add("use", { href: "https://fixture.invalid/forbidden" }, group);
	for (const name of ["title", "desc", "defs", "style"]) {
		const parent = add(name);
		if (name !== "style") add("unsupported", {}, parent);
	}
	const hidden = add("g", { style: "visibility:hidden" });
	add("rect", { style: "width:3px;height:4px" }, hidden);
	tree.append(hidden, tree.createComment("comment"));
	tree.append(hidden, tree.createText(" \n\t"));
	expect(scene().shapes).toHaveLength(1);
	expect(scene().shapes[0]).toMatchObject({ visible: false });
	expect(scene().shapes[0].path).toHaveLength(5);
});

it("composes group and shape transforms without transforming local path points", () => {
	const { add, scene } = fixture();
	const outer = add("g", { transform: "translate(10 20)" });
	const inner = add("g", { transform: "scale(2 3)" }, outer);
	add("path", { d: "M1 2L3 4", transform: "translate(5 7)" }, inner);
	expect(scene().shapes[0].transform).toEqual([2, 0, 0, 3, 20, 41]);
	expect(scene().shapes[0].path[0]).toEqual({
		kind: "move",
		end: { x: 1, y: 2 },
	});
});

it("constructs all supported geometry with scientific and px scalar values", () => {
	const { add, scene } = fixture();
	add("rect", {
		x: "1e1px",
		y: "-2",
		width: "100",
		height: "80",
		style: "width:6px;height:4px",
	});
	add("circle", { cx: "1", cy: "2", r: "3e0" });
	add("ellipse", { cx: "2", cy: "3", rx: "4px", ry: "2" });
	add("polygon", { points: "0,0 2,0 2,2" });
	add("polyline", { points: "0 0, 1e1 2,3 4" });
	add("line", { x1: "-1px", y1: "2", x2: "3", y2: "4" });
	add("path", { d: "M0 0Q1 2 3 4C5 6 7 8 9 10Z" });
	const result = scene().shapes;
	expect(result.map((shape) => shape.path.length)).toEqual([
		5, 4, 4, 4, 3, 2, 4,
	]);
	expect(result[0].path[2].end).toEqual({ x: 16, y: 2 });
	expect(result[1].path[1]).toMatchObject({
		kind: "arc",
		radiusX: 3,
		radiusY: 3,
		start: { x: 4, y: 2 },
		end: { x: -2, y: 2 },
	});
	expect(result[2].path[1]).toMatchObject({
		kind: "arc",
		radiusX: 4,
		radiusY: 2,
	});
	expect(result[3].path[3].kind).toBe("close");
	expect(result[4].path[2].kind).toBe("line");
	expect(result[5].path[0].end).toEqual({ x: -1, y: 2 });
	expect(result[6].path.map((segment) => segment.kind)).toEqual([
		"move",
		"quadratic",
		"cubic",
		"close",
	]);
});

it.each<Record<string, string>>([
	{ rx: "20" },
	{ ry: "20" },
	{ rx: "20", ry: "20" },
])("clamps rounded rect radii with missing-axis fallback: %j", (radii) => {
	const { add, scene } = fixture();
	add("rect", { ...radii, style: "width:10px;height:6px" });
	const path = scene().shapes[0].path;
	expect(path).toHaveLength(10);
	expect(path.filter((segment) => segment.kind === "arc")).toHaveLength(4);
	expect(path[2]).toMatchObject({ kind: "arc", radiusX: 5, radiusY: 3 });
});

it("keeps zero, missing and auto dimensions empty while preserving shape ownership", () => {
	const { add, scene } = fixture();
	add("rect");
	add("rect", { style: "width:auto;height:10px" });
	add("rect", { style: "width:0px;height:10px" });
	add("circle", { r: "0" });
	add("ellipse", { rx: "1" });
	add("path");
	add("polygon");
	expect(scene().shapes.map((shape) => shape.path.length)).toEqual([
		0, 0, 0, 0, 0, 0, 0,
	]);
});

it("zero radius on either rect axis makes square corners", () => {
	const { add, scene } = fixture();
	add("rect", { rx: "0", ry: "5", style: "width:10px;height:10px" });
	expect(scene().shapes[0].path).toHaveLength(5);
});

it("parses viewBox and default preserveAspectRatio", () => {
	const { scene } = fixture({ viewBox: "-1, 2 3e1 40" });
	expect(scene()).toMatchObject({
		viewBox: { x: -1, y: 2, width: 30, height: 40 },
		preserveAspectRatio: { alignX: 0.5, alignY: 0.5, mode: "meet" },
		disabled: false,
	});
	expect(fixture().scene().viewBox).toBeNull();
});

for (const [horizontal, alignX] of [
	["Min", 0],
	["Mid", 0.5],
	["Max", 1],
] as const) {
	for (const [vertical, alignY] of [
		["Min", 0],
		["Mid", 0.5],
		["Max", 1],
	] as const) {
		it.each(["meet", "slice"])(
			`supports x${horizontal}Y${vertical} %s`,
			(mode) => {
				expect(
					fixture({
						preserveAspectRatio: `x${horizontal}Y${vertical} ${mode}`,
					}).scene().preserveAspectRatio,
				).toEqual({ alignX, alignY, mode });
			},
		);
	}
}

it.each(["none", "none meet", "none slice"])(
	"supports %s aspect ratio",
	(preserveAspectRatio) => {
		expect(
			fixture({ preserveAspectRatio }).scene().preserveAspectRatio.mode,
		).toBe("none");
	},
);

it.each(["0 0 0 10", "0 0 10 0"])(
	"disables zero viewBox %s without bypassing validation",
	(viewBox) => {
		const { add, scene } = fixture({ viewBox });
		add("circle", { r: "3" });
		expect(scene().disabled).toBe(true);
		add("use");
		expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);

it.each([
	"",
	"0 0 10",
	"0 0 -1 1",
	"0 0 1 -1",
	"0 0 1 1 1",
	"0 0 1 1 1 1",
	"0,0,,1,1",
	"0 0 1 1,",
	"0 0 1px 1",
	"NaN 0 1 1",
])("rejects malformed viewBox %j", (viewBox) => {
	expect(fixture({ viewBox }).scene).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([
	"",
	"defer xMidYMid meet",
	"xMidYmid",
	"xMidYMid stretch",
	"none extra",
	"xMinYMin meet extra",
])("rejects malformed aspect ratio %j", (preserveAspectRatio) => {
	expect(fixture({ preserveAspectRatio }).scene).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([
	"text",
	"use",
	"image",
	"foreignObject",
	"svg",
	"a",
	"switch",
	"animate",
	"script",
	"unknown",
])("rejects active unsupported %s", (tag) => {
	const { add, scene } = fixture();
	add(tag, { style: "display:block" });
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it("rejects foreign roots, non-svg roots, disconnected roots and foreign descendants", () => {
	const { tree, html, root, add, scene } = fixture();
	for (const namespace of [htmlNamespace, mathmlNamespace]) {
		const foreign = tree.createParserElement("svg", {}, namespace);
		tree.append(html, foreign);
		expect(() => documentSvgScene(tree, foreign, noop)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	}
	const group = add("g");
	expect(() => documentSvgScene(tree, group, noop)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	const foreign = add("rect", {}, root, htmlNamespace);
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	tree.remove(foreign);
	tree.remove(root);
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each<Record<string, string>>([
	{ fill: "context-fill" },
	{ fill: "bogus" },
	{ "fill-rule": "invalid" },
	{ "fill-opacity": "NaN" },
	{ stroke: "context-stroke" },
	{ "stroke-linejoin": "arcs" },
	{ filter: "url(#filter)" },
	{ mask: "url(external)" },
	{ "clip-path": "url(https://example.invalid/external.svg#clip)" },
	{ "vector-effect": "non-scaling-stroke" },
	{ opacity: ".5" },
	{ transform: "translate(0)" },
])("rejects unsupported root paint/transform %j", (attributes) => {
	expect(fixture(attributes).scene).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("rejects nonunit group opacity and malformed shape transforms", () => {
	const { tree, add, scene } = fixture();
	const group = add("g", { opacity: ".5" });
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	tree.setAttribute(group, "opacity", "1");
	add("path", { transform: "perspective(5)" }, group);
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
});

for (const property of ["marker-start", "marker-mid", "marker-end"]) {
	it.each(["root", "group", "shape"])(
		`rejects active ${property} on a %s even without stroke or fill`,
		(target) => {
			const { tree, root, add, scene } = fixture();
			const group = add("g");
			const shape = add(
				"path",
				{ d: "M10 10L40 10L40 40", fill: "none" },
				group,
			);
			tree.setAttribute(
				target === "root" ? root : target === "group" ? group : shape,
				property,
				"url(#marker)",
			);
			expect(scene).toThrow(
				expect.objectContaining({
					code: "unsupported",
					message: "SVG scene: marker painting is not implemented",
				}),
			);
		},
	);

	it.each(["none", "inherit", "unset", "initial"])(
		`retains the none state for ${property}=%s through containers`,
		(value) => {
			const { add, scene } = fixture({ [property]: value });
			const group = add("g", { [property]: value });
			add("path", { d: "M0 0L2 2", [property]: value }, group);
			expect(scene().shapes).toHaveLength(1);
		},
	);
}

it("rejects a marker referenced from nonrendering definitions", () => {
	const { add, scene } = fixture();
	const definitions = add("defs");
	const marker = add("marker", { id: "marker" }, definitions);
	add("path", { d: "M0 0H8V8H0Z", fill: "blue" }, marker);
	add("path", {
		d: "M10 10L40 10L40 40",
		fill: "none",
		"marker-end": "url(#marker)",
	});
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each([
	"20px 20px",
	"50% 50%",
	"center",
	"0",
	"inherit",
	"initial",
	"unset",
	"0 0 1px",
	"invalid",
])(
	"rejects unsupported transform-origin %s on a transformed shape",
	(origin) => {
		const { add, scene } = fixture();
		add("rect", {
			x: "20",
			y: "20",
			style: "width:10px;height:10px",
			transform: "scale(2)",
			"transform-origin": origin,
		});
		expect(scene).toThrow(
			expect.objectContaining({
				code: "unsupported",
				message: "SVG scene: nondefault transform-origin is not implemented",
			}),
		);
	},
);

it("rejects unsupported transform-origin on a transformed group", () => {
	const { add, scene } = fixture();
	const group = add("g", {
		transform: "scale(2)",
		"transform-origin": "20px 20px",
	});
	add("path", { d: "M0 0L2 2" }, group);
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each([
	"0 0",
	"0px 0px",
	"0% 0%",
	"left top",
	"top left",
	"left 0px",
	"0% top",
	" -0.0px\t+.0% ",
])(
	"accepts a zero transform-origin %s on transformed groups and shapes",
	(origin) => {
		const { add, scene } = fixture();
		const group = add("g", {
			transform: "scale(2)",
			"transform-origin": origin,
		});
		add(
			"path",
			{ d: "M0 0L2 2", transform: "scale(3)", "transform-origin": origin },
			group,
		);
		expect(scene().shapes[0].transform).toEqual([6, 0, 0, 6, 0, 0]);
	},
);

it.each([undefined, ""])(
	"ignores a nondefault origin without an active local transform %j",
	(transform) => {
		const { add, scene } = fixture({ "transform-origin": "50% 50%" });
		const group = add("g", {
			"transform-origin": "20px 20px",
			...(transform === undefined ? {} : { transform }),
		});
		add("path", { d: "M0 0L2 2", transform: "scale(2)" }, group);
		expect(scene().shapes[0].transform).toEqual([2, 0, 0, 2, 0, 0]);
	},
);

it("rejects inheriting an inactive ancestor origin into a transformed child", () => {
	const { add, scene } = fixture({ "transform-origin": "20px 20px" });
	add("path", {
		d: "M0 0L2 2",
		transform: "scale(2)",
		"transform-origin": "inherit",
	});
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each(["marker-end", "transform-origin"])(
	"does not let visibility:hidden bypass unsupported %s admission",
	(property) => {
		const { add, scene } = fixture();
		add("path", {
			d: "M0 0L2 2",
			style: "visibility:hidden",
			transform: "scale(2)",
			[property]: property === "marker-end" ? "url(#marker)" : "20px 20px",
		});
		expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);

it("keeps marker and origin attributes inactive in metadata and display-none subtrees", () => {
	const { add, scene } = fixture();
	const attributes = {
		"marker-start": "url(#marker)",
		"marker-mid": "url(#marker)",
		"marker-end": "url(#marker)",
		"transform-origin": "20px 20px",
		transform: "scale(2)",
	};
	const definitions = add("defs", attributes);
	add("path", { d: "M0 0L2 2", ...attributes }, definitions);
	const group = add("g", { ...attributes, style: "display:none" });
	add("path", { d: "M0 0L2 2", ...attributes }, group);
	add("path", { d: "M0 0L2 2" });
	expect(scene().shapes).toHaveLength(1);
});

it.each(["5%", "2em", "NaN", "Infinity", "1 2", "", "-1"])(
	"rejects unsupported radius %j",
	(r) => {
		const { add, scene } = fixture();
		add("circle", { r });
		expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);

it.each(["1e10", "1e999"])("bounds radius magnitude %s", (r) => {
	const { add, scene } = fixture();
	add("circle", { r });
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each(["50%", "-1", "2em"])(
	"does not silently discard invalid rect attribute width %s",
	(width) => {
		const { add, scene } = fixture();
		add("rect", { width, style: "width:10px;height:10px" });
		expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);

it("rejects unresolved computed percentage rect dimensions", () => {
	const { add, scene } = fixture();
	add("rect", { style: "width:50%;height:10px" });
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each(["0 0 1", "0 0,", "0,,0", "0x0", "0 0 1px 2"])(
	"rejects malformed points %j",
	(points) => {
		const { add, scene } = fixture();
		add("polygon", { points });
		expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);

it("rejects naked text and graphics nested inside shapes", () => {
	const first = fixture();
	first.tree.append(first.root, first.tree.createText("not a shape"));
	expect(first.scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	const second = fixture();
	const circle = second.add("circle", { r: "1" });
	second.add("path", {}, circle);
	expect(second.scene).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("maps path syntax and range failures but preserves owner failures exactly", () => {
	const { tree, add, scene } = fixture();
	const path = add("path", { d: "M0" });
	expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
	tree.setAttribute(path, "d", "M1e99 0");
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
	tree.setAttribute(path, "d", "M0 0L1 1");
	for (const error of [
		new SyntaxError("owner"),
		new RangeError("owner"),
		new AgentBrowserError("aborted", "owner"),
	]) {
		let thrown: unknown;
		try {
			scene((amount) => {
				if (amount === 16) throw error;
			});
		} catch (caught) {
			thrown = caught;
		}
		expect(thrown).toBe(error);
	}
});

it("admits exactly 512 shapes and rejects the next", () => {
	const { add, scene } = fixture();
	for (let index = 0; index < 512; index++) add("path");
	expect(scene().shapes).toHaveLength(512);
	add("path");
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("shares the 16384 segment ceiling across parsed and generated paths", () => {
	const { add, scene } = fixture();
	const data = `M0 0${"L1 1".repeat(8190)}`;
	add("path", { d: data });
	add("path", { d: data });
	add("line");
	expect(
		scene().shapes.reduce((total, shape) => total + shape.path.length, 0),
	).toBe(16384);
	add("path", { d: "M0 0" });
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("bounds large points before unbounded segment allocation", () => {
	const { add, scene } = fixture();
	add("polyline", { points: "0 0 ".repeat(16385) });
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("shares source accounting across nodes and charges before scanning oversized fields", () => {
	const { tree, root, add, scene } = fixture();
	const first = add("path", { d: " ".repeat(130000) });
	const second = add("path", { d: " ".repeat(130000) });
	expect(scene().sourceCodeUnits).toBe(260013);
	tree.setAttribute(second, "d", " ".repeat(132131));
	expect(scene().sourceCodeUnits).toBe(262144);
	tree.setAttribute(second, "d", " ".repeat(132132));
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
	tree.remove(first);
	tree.remove(second);
	tree.setAttribute(root, "fill", " ".repeat(4097));
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("enforces the 4096 visited-node limit even for ignored metadata", () => {
	const { tree, root, scene } = fixture();
	for (let index = 0; index < 4095; index++)
		tree.append(root, tree.createComment(""));
	expect(scene().shapes).toHaveLength(0);
	tree.append(root, tree.createComment(""));
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("enforces 64 ancestry depth including nonrendering descendants", () => {
	const { root, add, scene } = fixture();
	let parent = root;
	for (let index = 0; index < 64; index++) parent = add("g", {}, parent);
	expect(scene().shapes).toHaveLength(0);
	add("g", {}, parent);
	expect(scene).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("charges positive bounded work and allows owner cancellation before traversal", () => {
	const { add, scene } = fixture();
	add("circle", { r: "2" });
	let work = 0;
	scene((amount) => {
		expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
		work += amount;
	});
	expect(work).toBeGreaterThan(100);
	const error = new AgentBrowserError("aborted", "cancelled");
	expect(() =>
		scene(() => {
			throw error;
		}),
	).toThrow(error);
});

it("returns deeply frozen detached scene data across mutations and document closure", () => {
	const { tree, add, scene } = fixture({ viewBox: "0 0 10 10" });
	const group = add("g", { fill: "red" });
	const path = add("path", { d: "M0 0Q1 2 3 4C5 6 7 8 9 10" }, group);
	const first = scene();
	const serialized = JSON.stringify(first);
	function frozen(value: unknown): void {
		if (!value || typeof value !== "object") return;
		expect(Object.isFrozen(value)).toBe(true);
		for (const child of Object.values(value)) frozen(child);
	}
	frozen(first);
	tree.setAttribute(path, "d", "M2 3");
	tree.setAttribute(group, "fill", "blue");
	const second = scene();
	expect(second).not.toBe(first);
	expect(second.shapes[0].fill).toEqual([0, 0, 255, 255]);
	tree.close();
	expect(JSON.stringify(first)).toBe(serialized);
	expect(scene).toThrow(expect.objectContaining({ code: "closed" }));
});

it("applies CSS fill and stroke without unsupported-property diagnostics", () => {
	const { tree, add, scene } = fixture();
	add("path", { d: "M0 0", fill: "red", style: "fill:blue;stroke:green" });
	expect(scene().shapes[0].fill).toEqual([0, 0, 255, 255]);
	expect(scene().shapes[0].stroke?.paint).toEqual([0, 128, 0, 255]);
	expect(documentStyles(tree).metrics()).toMatchObject({
		issues: {},
	});
});
