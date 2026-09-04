import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	PageBindings,
	type PageBindingContext,
	type PageBindingLifecycle,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface CssNamespace {
	escape(...args: unknown[]): string;
	supports(...args: unknown[]): boolean;
}
interface Element {
	textContent: string;
	matches(selector: string): boolean;
	closest(selector: string): Element | null;
}
interface Window {
	CSS: CssNamespace;
	document: { querySelector(selector: string): Element | null };
}
const trees: DocumentTree[] = [];
function fixture(
	setup?: (context: PageBindingContext, tree: DocumentTree) => void,
) {
	const tree = parseHtmlDocument(
		"<!doctype html><style>html,body{margin:0}div,aside{display:block;width:20px;height:10px}</style><main><div id=target>Before</div><aside id=other>Other</aside></main>",
		"https://fixture.invalid/page-css",
	);
	trees.push(tree);
	const context: PageBindingContext = {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, descriptor);
			for (const [name, value] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value });
			if (definition.indexed)
				Object.defineProperty(object, "length", {
					get: definition.indexed.length,
				});
			return object;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => {},
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback: vi.fn(() => {
			throw new Error("No guest callback expected");
		}),
		fail: vi.fn(),
		onConsoleCall: () => {},
	};
	const interactions = documentInteractions(tree);
	setup?.(context, tree);
	const bindings = new PageBindings(
		{ document: tree, interactions },
		context,
		lifecycle,
	);
	const window = bindings.window as Window;
	const queries = new DocumentQueries(tree);
	const target = queries.querySelector("#target");
	if (target === null) throw new Error("Missing fixture target");
	return {
		tree,
		context,
		lifecycle,
		bindings,
		window,
		css: window.CSS,
		queries,
		target,
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("publishes one document-owned CSS namespace on Window and global bindings", () => {
	const { tree, window, css, bindings } = fixture();
	expect(css).toBeDefined();
	expect(window.CSS).toBe(css);
	expect(bindings.globals.CSS).toBe(css);
	expect(pageBindingGlobalNames(tree)).toContain("CSS");
	expect(typeof css).toBe("object");
	expect(typeof css.supports).toBe("function");
});

it.each([
	["", ""],
	["_item-42", "_item-42"],
	["8tile", "\\38 tile"],
	["-8tile", "-\\38 tile"],
	["--8tile", "--8tile"],
	["tile8", "tile8"],
	["-", "\\-"],
	["--", "--"],
	["a\0b", "a\ufffdb"],
	["row:3", "row\\:3"],
	["two words", "two\\ words"],
	["a\tb\nc\rd\fe", "a\\9 b\\a c\\d d\\c e"],
	["\u0001f\u001f9\u007f0", "\\1 f\\1f 9\\7f 0"],
	["[](),#*+~>.=", "\\[\\]\\(\\)\\,\\#\\*\\+\\~\\>\\.\\="],
	["'\"\\", "\\'\\\"\\\\"],
	["é_表_🦊", "é_表_🦊"],
	["\u0080\u00a0", "\u0080\u00a0"],
	["\ud800x\udfff", "\ud800x\udfff"],
])("serializes the identifier %j", (source, expected) => {
	expect(fixture().css.escape(source)).toBe(expected);
});

it.each([
	[undefined, "undefined"],
	[null, "null"],
	[false, "false"],
	[true, "true"],
	[83, "\\38 3"],
	[-83, "-\\38 3"],
	[-0, "\\30 "],
	[83n, "\\38 3"],
	[Number.NaN, "NaN"],
])("converts the supported primitive %s", (source, expected) => {
	expect(fixture().css.escape(source)).toBe(expected);
});

it("requires an argument, rejects Symbols and ignores extra arguments", () => {
	const { css } = fixture();
	expect(() => css.escape()).toThrow(TypeError);
	expect(() => css.escape(Symbol("id"))).toThrow(TypeError);
	expect(css.escape("card:2", Symbol("unused"))).toBe("card\\:2");
});

it("does not execute object coercion across the native capability boundary", () => {
	const { css } = fixture();
	const convert = vi.fn(() => "forged");
	expect(() => css.escape({ toString: convert })).toThrow("conversion");
	expect(() => css.escape(convert)).toThrow("conversion");
	expect(convert).not.toHaveBeenCalled();
});

it.each([
	"8tile",
	"-9",
	"row:3",
	"two words",
	"close}open",
	"x), #other",
	"[x='y']",
	"path\\end",
	"😀表",
	"line\nend",
])(
	"round-trips escaped identifiers through native DOM queries: %j",
	(source) => {
		const { tree, css, bindings, window, queries, target } = fixture();
		tree.setAttribute(target, "id", source);
		const selector = `#${css.escape(source)}`;
		const element = bindings.dom.node(target) as Element;
		expect(window.document.querySelector(selector)).toBe(element);
		expect(queries.querySelectorAll(selector)).toEqual([target]);
		expect(element.matches(selector)).toBe(true);
		expect(element.closest(selector)).toBe(element);
		const selected = window.document.querySelector(selector);
		if (selected === null) throw new Error("Missing selected element");
		selected.textContent = "Changed";
		expect(tree.textContent(target)).toBe("Changed");
	},
);

it("round-trips ASCII controls and punctuation without broadening the ID selector", () => {
	const { tree, css, queries, target } = fixture();
	for (let point = 1; point < 128; point++) {
		const source = `left${String.fromCharCode(point)}right`;
		tree.setAttribute(target, "id", source);
		expect(queries.querySelectorAll(`#${css.escape(source)}`)).toEqual([
			target,
		]);
	}
});

it("uses escaped identifiers in shared stylesheet matching and native layout", () => {
	const { tree, css, target, queries } = fixture();
	const source = "x}, aside {width:99px}/*";
	tree.setAttribute(target, "id", source);
	const sheet = tree.createElement("style");
	tree.setTextContent(sheet, `#${css.escape(source)} {width:60px}`);
	const head = queries.querySelector("head");
	if (head === null) throw new Error("Missing document head");
	tree.append(head, sheet);
	documentStyles(tree).setViewport(200, 100);
	expect(documentGeometry(tree).getBoundingClientRect(target).width).toBe(60);
	const other = queries.querySelector("#other");
	if (other === null) throw new Error("Missing other element");
	expect(documentGeometry(tree).getBoundingClientRect(other).width).toBe(20);
});

it("keeps identifier escaping separate from class tokenization and NULL replacement", () => {
	const { tree, css, queries, target } = fixture();
	tree.setAttribute(target, "class", "part:one part:two");
	expect(queries.querySelector(`.${css.escape("part:one")}`)).toBe(target);
	expect(
		queries.querySelector(`.${css.escape("part:one part:two")}`),
	).toBeNull();
	tree.setAttribute(target, "id", "a\ufffdb");
	expect(queries.querySelector(`#${css.escape("a\0b")}`)).toBe(target);
});

it("bounds input and expanded output separately without mutating document state", () => {
	const { tree, css, lifecycle } = fixture();
	const revision = tree.revision;
	expect(css.escape("x".repeat(65_536))).toHaveLength(65_536);
	expect(() => css.escape("x".repeat(65_537))).toThrow("input");
	expect(css.escape("\u007f".repeat(16_384))).toHaveLength(65_536);
	expect(() => css.escape("\u007f".repeat(16_385))).toThrow("output");
	expect(css.escape("ok")).toBe("ok");
	expect(tree.revision).toBe(revision);
	expect(lifecycle.startCallback).not.toHaveBeenCalled();
	expect(lifecycle.fail).not.toHaveBeenCalled();
});

it.each(["bindings", "document", "lifecycle"])(
	"revokes retained CSS methods on %s closure",
	(mode) => {
		const { tree, css, window, bindings, lifecycle } = fixture();
		const escapeIdentifier = css.escape;
		if (mode === "bindings") bindings.close();
		else if (mode === "document") tree.close();
		else lifecycle.isClosed = () => true;
		expect(() => window.CSS).toThrow("closed");
		expect(() => escapeIdentifier("id")).toThrow("closed");
		expect(() => css.escape(Symbol())).toThrow("closed");
		expect(() => css.supports("width", "1px")).toThrow("closed");
	},
);

it("does not share namespace ownership between documents", () => {
	const first = fixture();
	const second = fixture();
	expect(first.css).not.toBe(second.css);
	first.tree.close();
	expect(second.css.escape("still:open")).toBe("still\\:open");
});

it("cleans up when namespace publication fails", () => {
	expect(() =>
		fixture((context) => {
			const create = context.createHostObject;
			context.createHostObject = (definition) => {
				if (definition.methods?.escape)
					throw new Error("namespace publication failed");
				return create(definition);
			};
		}),
	).toThrow("namespace publication failed");
	expect(
		documentInteractions(trees[trees.length - 1]).events.metrics().listeners,
	).toBe(0);
});

it("rejects namespace publication if its provider closes the document reentrantly", () => {
	expect(() =>
		fixture((context, tree) => {
			const create = context.createHostObject;
			context.createHostObject = (definition) => {
				const capability = create(definition);
				if (definition.methods?.escape) tree.close();
				return capability;
			};
		}),
	).toThrow("closed");
});

it("advertises only implemented CSS utilities and their native bounds", async () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("No session expected");
		},
	});
	try {
		expect((await host.execute(["capabilities"])).data).toMatchObject({
			cssUtilities: {
				partial: true,
				escape: true,
				supports: true,
				supportsProfile: "native-declaration-values-and-conditions",
				selectorQueries: true,
				selectorProfile: "single-complex-native-selector",
				selectorLimits: {
					maxSelectorCodeUnits: 8192,
					maxComponents: 256,
					maxNesting: 16,
				},
				supportsLimits: {
					maxSourceCodeUnits: 65_536,
					maxDepth: 32,
					maxConditions: 1024,
				},
				limits: { maxInputCodeUnits: 65_536, maxOutputCodeUnits: 65_536 },
			},
		});
	} finally {
		await host.close();
	}
});
