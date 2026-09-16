import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { DocumentElementSizes, documentElementSizes } from "./element-sizes.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
function fixture(content = '<div id="target">a</div>', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>main{width:100px;font-size:8px}${css}</style><main>${content}</main>`,
		"https://fixture.invalid/element-sizes",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const sizes = documentElementSizes(tree);
	return {
		tree,
		id,
		sizes,
		read: (selector = "#target") => sizes.get(id(selector)),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("reports real block padding sizes rather than authored content sizes or margins", () => {
	const { read } = fixture(
		undefined,
		"#target{width:30px;height:10px;padding:2px 3px;margin:5px}",
	);
	expect(read()).toEqual({
		clientWidth: 36,
		clientHeight: 14,
		clientTop: 0,
		clientLeft: 0,
		offsetWidth: 36,
		offsetHeight: 14,
	});
});

it("does not add padding twice for border-box sizing", () => {
	const { read } = fixture(
		undefined,
		"#target{box-sizing:border-box;width:30px;height:10px;padding:2px 3px}",
	);
	expect(read()).toMatchObject({
		clientWidth: 30,
		clientHeight: 10,
		offsetWidth: 30,
		offsetHeight: 10,
	});
});

it.each([
	[5.1, 5],
	[5.5, 6],
	[5.9, 6],
])(
	"rounds size %s to %s without quantizing fractional rectangles",
	(input, expected) => {
		const { read, tree, id } = fixture(
			undefined,
			`#target{width:${input}px;height:${input}px}`,
		);
		expect(read()).toMatchObject({
			clientWidth: expected,
			clientHeight: expected,
			offsetWidth: expected,
			offsetHeight: expected,
		});
		expect(
			documentGeometry(tree).getBoundingClientRect(id("#target")).width,
		).toBe(input);
	},
);

it("rounds the complete padding box instead of separately rounding its parts", () => {
	const { read } = fixture(
		undefined,
		"#target{width:5.1px;height:5.1px;padding:0.2px}",
	);
	expect(read()).toMatchObject({
		clientWidth: 6,
		clientHeight: 6,
		offsetWidth: 6,
		offsetHeight: 6,
	});
});

it("returns zero inline client dimensions while offset dimensions cover wrapped padding fragments", () => {
	const { read } = fixture(
		'<span id="target">ab cd</span>',
		"main{width:22px}span{padding:0 2px;margin:0 1px}",
	);
	expect(read()).toEqual({
		clientWidth: 0,
		clientHeight: 0,
		clientTop: 0,
		clientLeft: 0,
		offsetWidth: 15,
		offsetHeight: 18,
	});
});

it("unions degenerate fragments rather than reusing the client bounding-rectangle shortcut", () => {
	const { read, tree, id } = fixture('<span id="target"><br><br></span>');
	const geometry = documentGeometry(tree);
	expect(geometry.getClientRects(id("#target")).length).toBeGreaterThan(1);
	expect(geometry.getBoundingClientRect(id("#target")).height).toBe(8);
	expect(read().offsetHeight).toBe(28);
	expect(read().offsetWidth).toBe(0);
});

it("uses the viewport for root client size, not for root offset or body client size", () => {
	const { read, tree } = fixture();
	documentStyles(tree).setViewport(320, 200);
	expect(read("html")).toMatchObject({
		clientWidth: 320,
		clientHeight: 200,
		offsetWidth: 320,
		offsetHeight: 10,
	});
	expect(read("body").clientHeight).toBe(10);
	documentStyles(tree).setViewport(600, 400);
	expect(read("html")).toMatchObject({
		clientWidth: 600,
		clientHeight: 400,
		offsetHeight: 10,
	});
});

it("follows actual root blockification instead of treating authored inline display as an inline box", () => {
	const { read, tree } = fixture(undefined, "html{display:inline}");
	documentStyles(tree).setViewport(320, 200);
	expect(read("html")).toMatchObject({ clientWidth: 320, clientHeight: 200 });
});

it("keeps viewport client dimensions distinct from an explicitly sized root box", () => {
	const { read, tree } = fixture(undefined, "html{width:40px;height:20px}");
	documentStyles(tree).setViewport(320, 200);
	expect(read("html")).toMatchObject({
		clientWidth: 320,
		clientHeight: 200,
		offsetWidth: 40,
		offsetHeight: 20,
	});
});

it.each([
	"#target{display:none}",
	"main{display:none}",
	"#target{display:contents}",
])("returns zero for elements without associated boxes: %s", (css) => {
	const { read } = fixture(undefined, css);
	expect(Object.values(read())).toEqual([0, 0, 0, 0, 0, 0]);
});

it("does not substitute viewport dimensions for a hidden root without a box", () => {
	const { read } = fixture(undefined, "html{display:none}");
	expect(Object.values(read("html"))).toEqual([0, 0, 0, 0, 0, 0]);
});

it("visibility-hidden elements keep their real sizes", () => {
	const { read } = fixture(undefined, "#target{visibility:hidden;width:30px}");
	expect(read().clientWidth).toBe(30);
});

it("shares layout with rectangles and caches repeated size reads without additional work", () => {
	const { tree, id, sizes, read } = fixture();
	const snapshot = read();
	const work = sizes.metrics().work;
	for (let index = 0; index < 1000; index++) expect(read()).toBe(snapshot);
	documentGeometry(tree).getBoundingClientRect(id("#target"));
	expect(sizes.metrics()).toMatchObject({ measurements: 1, work });
	expect(documentGeometry(tree).metrics().builds).toBe(1);
});

it("replaces cached records on DOM/style revisions without changing saved native snapshots", () => {
	const { tree, id, sizes, read } = fixture();
	const previous = read();
	tree.setAttribute(id("#target"), "style", "width:20px;padding:3px");
	expect(read().clientWidth).toBe(26);
	expect(previous.clientWidth).toBe(100);
	expect(Object.isFrozen(previous)).toBe(true);
	expect(sizes.metrics()).toMatchObject({ retained: 1, measurements: 2 });
});

it("returns zero after detach, then remeasures after reattachment", () => {
	const { tree, id, read } = fixture();
	const target = id("#target");
	const parent = tree.get(target).parent as number;
	read();
	tree.remove(target);
	expect(Object.values(documentElementSizes(tree).get(target))).toEqual([
		0, 0, 0, 0, 0, 0,
	]);
	tree.append(parent, target);
	expect(read().clientWidth).toBe(100);
});

it.each([
	"display:flex;flex-direction:column;flex-wrap:wrap;position:sticky",
	"display:grid",
])(
	"measures %s boxes and replaces cached sizes after mutation",
	(declaration) => {
		const { tree, id, sizes, read } = fixture(
			'<div id="target"><div></div><div></div></div>',
			`#target{${declaration};width:30px;height:20px;padding:2px 3px;border:1px solid black}#target>div{flex:none;width:10px;height:12px}`,
		);
		const expected = {
			clientWidth: 36,
			clientHeight: 24,
			clientTop: 1,
			clientLeft: 1,
			offsetWidth: 38,
			offsetHeight: 26,
		};
		const previous = read();
		expect(previous).toEqual(expected);
		expect(read()).toBe(previous);
		expect(sizes.metrics()).toMatchObject({ retained: 1, measurements: 1 });
		tree.setAttribute(
			id("#target"),
			"style",
			"width:40px;height:30px;padding:4px;border-width:2px",
		);
		expect(read()).toEqual({
			clientWidth: 48,
			clientHeight: 38,
			clientTop: 2,
			clientLeft: 2,
			offsetWidth: 52,
			offsetHeight: 42,
		});
		expect(previous).toEqual(expected);
		expect(Object.isFrozen(previous)).toBe(true);
		expect(sizes.metrics()).toMatchObject({ retained: 1, measurements: 2 });
	},
);

it("includes dashed border widths in offsets but not client dimensions after mutation", () => {
	const { tree, id, read } = fixture(
		undefined,
		"#target{width:30px;height:10px;padding:2px 3px;border-left:2px dashed red}",
	);
	expect(read()).toEqual({
		clientWidth: 36,
		clientHeight: 14,
		clientTop: 0,
		clientLeft: 2,
		offsetWidth: 38,
		offsetHeight: 14,
	});
	tree.setAttribute(
		id("#target"),
		"style",
		"border-left-width:4px;border-top:3px dashed blue",
	);
	expect(read()).toEqual({
		clientWidth: 36,
		clientHeight: 14,
		clientTop: 3,
		clientLeft: 4,
		offsetWidth: 40,
		offsetHeight: 17,
	});
});

it("rejects unsupported transforms and block-in-inline sizes instead of publishing guessed zeros", () => {
	expect(() =>
		fixture(undefined, "#target{transform:scale(2)}").read(),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
	const split = fixture('<span id="target">a<div>b</div>c</span>');
	expect(() => split.read()).toThrow(/block-in-inline/);
});

it("does not cache an unsupported measurement as zero and recovers on a supported revision", () => {
	const { tree, id, sizes, read } = fixture(
		'<div id="target" style="transform:scale(2)">a</div>',
		"#target{width:30px;height:10px}",
	);
	expect(read).toThrow(expect.objectContaining({ code: "unsupported" }));
	expect(sizes.metrics()).toMatchObject({ retained: 0, measurements: 0 });
	tree.setAttribute(id("#target"), "style", "");
	expect(read()).toEqual({
		clientWidth: 30,
		clientHeight: 10,
		clientTop: 0,
		clientLeft: 0,
		offsetWidth: 30,
		offsetHeight: 10,
	});
	expect(sizes.metrics()).toMatchObject({ retained: 1, measurements: 1 });
});

it("bounds cache and work, and releases data on document close", () => {
	const { tree, id } = fixture();
	const small = new DocumentElementSizes(tree, { maxElements: 1 });
	small.get(id("#target"));
	expect(() => small.get(id("main"))).toThrow(/cache limit/);
	tree.setAttribute(id("#target"), "style", "width:20px");
	expect(small.get(id("main")).clientWidth).toBe(100);
	const work = new DocumentElementSizes(tree, { maxWork: 1 });
	expect(() => work.get(id("#target"))).toThrow(/work limit/);
	expect(() => new DocumentElementSizes(tree, { maxElements: 0 })).toThrow(
		/Invalid/,
	);
	expect(() => small.get(tree.root)).toThrow(/element/);
	tree.close();
	expect(small.metrics()).toMatchObject({ retained: 0, closed: true });
	expect(() => small.get(1)).toThrow(/closed/);
	expect(() => new DocumentElementSizes(tree)).toThrow(/closed/);
});

it("exposes live readonly numeric guest properties without allocating DOMRect capabilities", () => {
	const { tree, id } = fixture();
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	};
	const dom = new ScriptDom(tree, factory);
	const element = dom.node(id("#target")) as {
		clientWidth: number;
		offsetHeight: number;
	};
	expect(element.clientWidth).toBe(100);
	expect(element.offsetHeight).toBe(10);
	expect(() => {
		element.clientWidth = 999;
	}).toThrow();
	expect(dom.metrics().geometry.created).toBe(0);
	tree.setAttribute(id("#target"), "style", "width:30px");
	expect(element.clientWidth).toBe(30);
	dom.close();
	expect(() => element.clientWidth).toThrow(/closed/);
	expect(documentElementSizes(tree).get(id("#target")).clientWidth).toBe(30);
});
