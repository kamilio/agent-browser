import { expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles, type DocumentStyles } from "./styles.js";
import { documentSvgScene } from "./svg-scene.js";

interface Fixture {
	tree: DocumentTree;
	root: number;
	target: number;
	parent: number;
	styles: DocumentStyles;
	value(name: string): string;
	scene(): ReturnType<typeof documentSvgScene>;
}

interface InlineStyle {
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

const noCharge = () => {};
const rectangle = '<rect id="target" width="4" height="2"/>';
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

function withFixture(
	content: string,
	css: string,
	inspect: (fixture: Fixture) => void,
) {
	const tree = parseHtmlDocument(
		`<style>${css}</style><main id="ancestor"><svg width="4" height="2" viewBox="0 0 4 2"><g id="parent">${content}</g></svg></main>`,
		"https://fixture.invalid/svg-css-paint",
	);
	try {
		const queries = new DocumentQueries(tree);
		let root: number | null;
		let target: number | null;
		let parent: number | null;
		try {
			root = queries.querySelector("svg");
			target = queries.querySelector("#target");
			parent = queries.querySelector("#parent");
		} finally {
			queries.close();
		}
		if (root === null || target === null || parent === null)
			throw new Error("Missing SVG CSS paint fixture");
		const rootId = root;
		const targetId = target;
		const styles = documentStyles(tree);
		inspect({
			tree,
			root,
			target,
			parent,
			styles,
			value: (name) => resolvedStyleValue(tree, targetId, name),
			scene: () => documentSvgScene(tree, rootId, noCharge),
		});
	} finally {
		tree.close();
	}
}

it("applies author fill properties above zero-specificity presentation attributes", () => {
	withFixture(
		'<rect id="target" width="4" height="2" fill="red" fill-opacity="1" fill-rule="nonzero"/>',
		"rect{fill:blue;fill-opacity:50%;fill-rule:evenodd}",
		({ value, scene, styles }) => {
			expect(value("fill")).toBe("rgb(0, 0, 255)");
			expect(value("fill-opacity")).toBe("0.5");
			expect(value("fill-rule")).toBe("evenodd");
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 0, 255, 128],
				fillRule: "evenodd",
			});
			expect(styles.metrics().issues).toEqual({});
		},
	);
});

it("gives normal inline fill declarations precedence over author selectors", () => {
	withFixture(
		'<rect id="target" width="4" height="2" fill="red" style="fill:blue;fill-opacity:.25;fill-rule:evenodd"/>',
		"#target{fill:green;fill-opacity:.8;fill-rule:nonzero}",
		({ value, scene }) => {
			expect(value("fill-opacity")).toBe("0.25");
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 0, 255, 64],
				fillRule: "evenodd",
			});
		},
	);
});

it("gives important author rules precedence over normal inline fill", () => {
	withFixture(
		'<rect id="target" width="4" height="2" style="fill:blue;fill-opacity:.25;fill-rule:nonzero"/>',
		"rect{fill:green!important;fill-opacity:.5!important;fill-rule:evenodd!important}",
		({ scene }) => {
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 128, 0, 128],
				fillRule: "evenodd",
			});
		},
	);
});

it("gives important inline fill declarations precedence over important author rules", () => {
	withFixture(
		'<rect id="target" width="4" height="2" style="fill:blue!important;fill-opacity:.25!important;fill-rule:evenodd!important"/>',
		"#target{fill:red!important;fill-opacity:1!important;fill-rule:nonzero!important}",
		({ scene }) => {
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 0, 255, 64],
				fillRule: "evenodd",
			});
		},
	);
});

it("inherits all three fill properties through groups without multiplying inherited opacity", () => {
	withFixture(
		`<g><g>${rectangle}</g></g>`,
		"#parent{fill:green;fill-opacity:.5;fill-rule:evenodd}",
		({ value, scene }) => {
			expect(value("fill-opacity")).toBe("0.5");
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 128, 0, 128],
				fillRule: "evenodd",
			});
		},
	);
});

it("uses black, full fill opacity and nonzero as initial values", () => {
	withFixture(rectangle, "", ({ value, scene }) => {
		expect(value("fill")).toBe("rgb(0, 0, 0)");
		expect(value("fill-opacity")).toBe("1");
		expect(value("fill-rule")).toBe("nonzero");
		expect(scene().shapes[0]).toMatchObject({
			fill: [0, 0, 0, 255],
			fillRule: "nonzero",
		});
	});
});

it.each(["inherit", "unset", "revert"])(
	"restores inherited fill properties for %s rather than initial values",
	(keyword) => {
		withFixture(
			`<rect id="target" width="4" height="2" fill="blue" style="fill:${keyword};fill-opacity:${keyword};fill-rule:${keyword}"/>`,
			"#parent{fill:red;fill-opacity:.4;fill-rule:evenodd}",
			({ value, scene }) => {
				expect(value("fill")).toBe("rgb(255, 0, 0)");
				expect(value("fill-opacity")).toBe("0.4");
				expect(value("fill-rule")).toBe("evenodd");
				expect(scene().shapes[0].fill).toEqual([255, 0, 0, 102]);
			},
		);
	},
);

it("resets all inherited fill properties with initial", () => {
	withFixture(
		'<rect id="target" width="4" height="2" style="fill:initial;fill-opacity:initial;fill-rule:initial"/>',
		"#parent{fill:red;fill-opacity:.4;fill-rule:evenodd}",
		({ value, scene }) => {
			expect(value("fill-opacity")).toBe("1");
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 0, 0, 255],
				fillRule: "nonzero",
			});
		},
	);
});

it("substitutes inherited custom properties into actual shape paint", () => {
	withFixture(
		rectangle,
		"#parent{--paint:blue;--alpha:25%;--rule:evenodd}#target{fill:var(--paint);fill-opacity:var(--alpha);fill-rule:var(--rule)}",
		({ value, scene, styles }) => {
			expect(value("fill")).toBe("rgb(0, 0, 255)");
			expect(value("fill-opacity")).toBe("0.25");
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 0, 255, 64],
				fillRule: "evenodd",
			});
			expect(styles.metrics().issues).toEqual({});
		},
	);
});

it("resolves inherited currentColor using the painting element color", () => {
	withFixture(
		rectangle,
		"#parent{color:red;fill:currentColor;fill-opacity:.5}#target{color:blue}",
		({ value, scene }) => {
			expect(value("color")).toBe("rgb(0, 0, 255)");
			expect(scene().shapes[0].fill).toEqual([0, 0, 255, 128]);
		},
	);
});

it("carries HTML ancestor fill declarations across the SVG namespace boundary", () => {
	withFixture(
		rectangle,
		"#ancestor{fill:rebeccapurple;fill-opacity:50%;fill-rule:evenodd}",
		({ value, scene }) => {
			expect(value("fill")).toBe("rgb(102, 51, 153)");
			expect(value("fill-opacity")).toBe("0.5");
			expect(scene().shapes[0]).toMatchObject({
				fill: [102, 51, 153, 128],
				fillRule: "evenodd",
			});
		},
	);
});

it("invalidates computed paint and scene observations after CSSOM mutation and removal", () => {
	withFixture(
		rectangle,
		"#target{fill:red!important;fill-opacity:1;fill-rule:nonzero}",
		({ tree, target, value, scene }) => {
			const owner = new InlineStyles(tree, factory);
			const style = owner.get(target) as InlineStyle;
			const original = scene();
			expect(original.shapes[0].fill).toEqual([255, 0, 0, 255]);
			const revision = tree.revision;
			style.setProperty("fill", "blue", "important");
			style.setProperty("fill-opacity", "50%");
			style.setProperty("fill-rule", "evenodd");
			expect(tree.revision).toBeGreaterThan(revision);
			expect(style.getPropertyValue("fill")).toBe("blue");
			expect(style.getPropertyPriority("fill")).toBe("important");
			expect(value("fill")).toBe("rgb(0, 0, 255)");
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 0, 255, 128],
				fillRule: "evenodd",
			});
			expect(original.shapes[0].fill).toEqual([255, 0, 0, 255]);
			expect(style.removeProperty("fill")).toBe("blue");
			expect(value("fill")).toBe("rgb(255, 0, 0)");
			expect(scene().shapes[0].fill).toEqual([255, 0, 0, 128]);
			style.setProperty("fill", "none", "important");
			expect(value("fill")).toBe("none");
			expect(scene().shapes[0].fill).toBeNull();
		},
	);
});

it("recomputes inherited variable paint when the ancestor CSSOM value changes", () => {
	withFixture(
		rectangle,
		"#parent{--paint:red;--alpha:1}#target{fill:var(--paint);fill-opacity:var(--alpha)}",
		({ tree, parent, value, scene }) => {
			const owner = new InlineStyles(tree, factory);
			const style = owner.get(parent) as InlineStyle;
			expect(scene().shapes[0].fill).toEqual([255, 0, 0, 255]);
			style.setProperty("--paint", "blue");
			style.setProperty("--alpha", "25%");
			expect(value("fill-opacity")).toBe("0.25");
			expect(scene().shapes[0].fill).toEqual([0, 0, 255, 64]);
		},
	);
});

it("invalidates presentation paint after an attribute mutation", () => {
	withFixture(
		'<rect id="target" width="4" height="2" fill="red"/>',
		"",
		({ tree, target, value, scene }) => {
			expect(scene().shapes[0].fill).toEqual([255, 0, 0, 255]);
			tree.setAttribute(target, "fill", "blue");
			tree.setAttribute(target, "fill-opacity", ".5");
			tree.setAttribute(target, "fill-rule", "evenodd");
			expect(value("fill")).toBe("rgb(0, 0, 255)");
			expect(scene().shapes[0]).toMatchObject({
				fill: [0, 0, 255, 128],
				fillRule: "evenodd",
			});
		},
	);
});
