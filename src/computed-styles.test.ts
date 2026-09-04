import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	[index: number]: string | undefined;
	length: number;
	width: string;
	height: string;
	color: string;
	backgroundColor: string;
	margin: string;
	padding: string;
	cssText: string;
	parentRule: null;
	getPropertyValue(name?: unknown): string;
	getPropertyPriority(name?: unknown): string;
	setProperty(...args: unknown[]): void;
	removeProperty(...args: unknown[]): void;
	item(index?: unknown): string;
}
const documents: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		if (definition.indexed)
			Object.defineProperty(object, "length", {
				get: definition.indexed.length,
			});
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, { ...property, enumerable: true });
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value });
		return new Proxy(object, {
			get(target, key) {
				if (
					typeof key === "string" &&
					/^(0|[1-9]\d*)$/.test(key) &&
					definition.indexed
				)
					return Number(key) < definition.indexed.length()
						? definition.indexed.get(Number(key))
						: undefined;
				return Reflect.get(target, key);
			},
		});
	},
};
function fixture(css = "", content = '<div id="target">ab</div>') {
	const tree = parseHtmlDocument(
		`<style>main{width:200px;font-size:8px} ${css}</style><main>${content}</main>`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target") as number;
	const dom = new ScriptDom(tree, factory);
	const style = dom.getComputedStyle(dom.node(id)) as Style;
	return {
		tree,
		queries,
		id,
		dom,
		style,
		read: (name: string) => resolvedStyleValue(tree, id, name),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("exposes live sorted longhand names, aliases and empty computed cssText", () => {
	const { style } = fixture("#target{background-color: red}");
	expect(style.length).toBe(68);
	expect(
		Array.from({ length: style.length }, (_value, index) => style[index]),
	).toEqual(computedStyleProperties);
	expect(style.item(0)).toBe("align-content");
	expect(style.backgroundColor).toBe("rgb(255, 0, 0)");
	expect(style.getPropertyValue("BACKGROUND-COLOR")).toBe(
		style.backgroundColor,
	);
	expect(style.getPropertyValue("backgroundColor")).toBe("");
	expect(style.cssText).toBe("");
	expect(style.parentRule).toBeNull();
});

it("resolves cascade, inheritance, currentcolor and alpha without layout", () => {
	const { tree, style } = fixture(
		"main{color:rebeccapurple} #target{display:flex;flex-direction:column;flex-wrap:wrap;position:absolute;background-color:currentcolor}",
	);
	expect(style.color).toBe("rgb(102, 51, 153)");
	expect(style.backgroundColor).toBe(style.color);
	expect(documentGeometry(tree).metrics().builds).toBe(0);
	expect(() => style.width).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("returns used block widths, heights, margins and padding, not authored percentages", () => {
	const { style } = fixture(
		"#target{width:50%;height:12px;padding:5%;margin:0 auto}",
	);
	expect(style.width).toBe("100px");
	expect(style.height).toBe("12px");
	expect(style.padding).toBe("10px");
	expect(style.margin).toBe("0px 40px");
});

it("uses the box-sizing property for resolved dimensions", () => {
	const { style } = fixture(
		"#target{box-sizing:border-box;width:100px;height:30px;padding:5px}",
	);
	expect(style.width).toBe("100px");
	expect(style.height).toBe("30px");
});

it("resolves automatic heights from real line layout and min/max constraints", () => {
	const { style } = fixture(
		"#target{width:10px;min-height:40px;max-width:5px}",
	);
	expect(style.width).toBe("5px");
	expect(style.height).toBe("40px");
	expect(style.getPropertyValue("max-width")).toBe("5px");
});

it("keeps computed values where dimensions do not apply to ordinary inlines", () => {
	const { style } = fixture(
		"#target{width:50%;height:auto;padding:10% 0;margin-top:20%}",
		'<span id="target">ab</span>',
	);
	expect(style.width).toBe("50%");
	expect(style.height).toBe("auto");
	expect(style.padding).toBe("20px 0px");
	expect(style.getPropertyValue("margin-top")).toBe("20%");
});

it("uses computed dimensions for display none, hidden ancestors and contents", () => {
	for (const css of [
		"#target{display:none}",
		"main{display:none}",
		"#target{display:contents}",
	]) {
		const { tree, style } = fixture(`${css} #target{width:50%;padding:5%}`);
		expect(style.width).toBe("50%");
		expect(style.padding).toBe("5%");
		expect(documentGeometry(tree).metrics().builds).toBe(0);
	}
});

it("visibility hidden still has used sizes", () => {
	const { style } = fixture("#target{width:50%;visibility:hidden}");
	expect(style.width).toBe("100px");
});

it("resolves line-height numbers to pixels but preserves normal", () => {
	const { tree, id, read } = fixture("#target{font-size:10px;line-height:1.5}");
	expect(read("line-height")).toBe("15px");
	tree.setAttribute(id, "style", "font-size:20px;line-height:normal");
	expect(read("line-height")).toBe("normal");
	tree.setAttribute(id, "style", "font-size:20px;line-height:150%");
	expect(read("line-height")).toBe("30px");
});

it("saved declarations update across style and viewport revisions using one layout cache", () => {
	const { tree, id, style } = fixture("main{width:50%} #target{width:50%}");
	documentStyles(tree).setViewport(400, 200);
	expect(style.width).toBe("100px");
	expect(style.height).toBe("10px");
	documentGeometry(tree).getClientRects(id);
	expect(documentGeometry(tree).metrics().builds).toBe(1);
	documentStyles(tree).setViewport(800, 200);
	expect(style.width).toBe("200px");
	tree.setAttribute(id, "style", "width:25%;color:#1234");
	expect(style.width).toBe("100px");
	expect(style.color).toBe("rgba(17, 34, 51, 0.267)");
	expect(documentGeometry(tree).metrics().builds).toBe(3);
});

it("saved declarations empty on detach and repopulate on reattachment", () => {
	const { tree, id, style } = fixture();
	const parent = tree.get(id).parent as number;
	tree.remove(id);
	expect(style.width).toBe("");
	expect(style.length).toBe(0);
	expect(style[0]).toBeUndefined();
	expect(style.item(0)).toBe("");
	tree.append(parent, id);
	expect(style.width).toBe("200px");
	expect(style.length).toBe(68);
});

it("returns fresh objects, not cached mutable style identity", () => {
	const { dom, id, style } = fixture();
	expect(dom.getComputedStyle(dom.node(id))).not.toBe(style);
	expect(dom.metrics().computedStyles.objects).toBe(2);
});

it("rejects all supported write routes without mutating authored style", () => {
	const { tree, id, style } = fixture("#target{color:red!important}");
	const revision = tree.revision;
	for (const write of [
		() => {
			style.width = "1px";
		},
		() => {
			style.cssText = "color:blue";
		},
		() => style.setProperty("unknown", ""),
		() => style.removeProperty("missing"),
	]) {
		try {
			write();
			throw new Error("Expected read-only failure");
		} catch (error) {
			expect((error as Error).name).toBe("NoModificationAllowedError");
		}
	}
	expect(style.getPropertyPriority("color")).toBe("");
	expect(tree.revision).toBe(revision);
	expect(tree.get(id).attributes.style).toBeUndefined();
});

it("enforces required arguments, scalar conversion and unsigned indices", () => {
	const { style } = fixture();
	expect(() => style.getPropertyValue()).toThrow(/Missing/);
	expect(() => style.setProperty("width")).toThrow(/Missing/);
	expect(() => style.item()).toThrow(/Missing/);
	expect(() => style.item(1n)).toThrow();
	expect(() => style.item({ valueOf: () => 0 })).toThrow(/coercion/);
	expect(() => style.getPropertyValue("x".repeat(1025))).toThrow(/limit/);
	expect(style.item(-1)).toBe("");
	expect(style.item(4_294_967_296)).toBe(style.item(0));
	expect(style.item(Number.NaN)).toBe(style.item(0));
	expect(style[999]).toBeUndefined();
	expect(style.getPropertyValue("--CUSTOM")).toBe("");
});

it("rejects forged, foreign and non-element targets", () => {
	const { dom, tree } = fixture();
	const other = fixture();
	expect(() => dom.getComputedStyle({})).toThrow();
	expect(() => dom.getComputedStyle(other.dom.node(other.id))).toThrow();
	expect(() => dom.getComputedStyle(dom.document)).toThrow(/element/);
	expect(() => resolvedStyleValue(tree, tree.root, "width")).toThrow(/element/);
});

it("does not silently substitute base styles for pseudo-elements", () => {
	const { dom, id } = fixture();
	for (const pseudo of ["::before", ":before", "::part(foo)", ":invalid"])
		expect(() => dom.getComputedStyle(dom.node(id), pseudo)).toThrow(
			/Pseudo-element/,
		);
	for (const pseudo of [undefined, null, "", "ignored"])
		expect((dom.getComputedStyle(dom.node(id), pseudo) as Style).width).toBe(
			"200px",
		);
});

it("revokes saved capabilities on close", () => {
	const { tree, style } = fixture();
	tree.close();
	for (const read of [
		() => style.color,
		() => style.cssText,
		() => style.parentRule,
		() => style.length,
		() => style.getPropertyValue("color"),
		() => style.item(0),
		() => style.setProperty("width", "1px"),
	])
		expect(read).toThrow(/closed/);
});

it("bounds cumulative object creation without charging failed construction", () => {
	const { tree, id } = fixture();
	let fail = true;
	const styles = new ComputedStyles(
		tree,
		{
			createHostObject(definition) {
				if (fail) {
					fail = false;
					throw new Error("fixture");
				}
				return factory.createHostObject(definition);
			},
		},
		1,
	);
	expect(() => styles.get(id)).toThrow("fixture");
	expect(styles.metrics().objects).toBe(0);
	styles.get(id);
	expect(() => styles.get(id)).toThrow(/object limit/);
	expect(() => new ComputedStyles(tree, factory, 0)).toThrow(/Invalid/);
});
