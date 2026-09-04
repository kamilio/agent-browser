import { describe, expect, it } from "vitest";
import nativeCases from "../reports/cssom-native-cases-2026-09-02.json" with {
	type: "json",
};
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { renderSnapshot, snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const matchingReferenceCases = nativeCases.filter(
	(reference) => reference.id !== "remove-invalid-priority",
);

interface Style {
	cssText: string;
	length: number;
	parentRule: null;
	display: string;
	width: string;
	margin: string;
	padding: string;
	cssFloat: string;
	opacity: string;
	[index: number]: string | undefined;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: unknown, priority?: unknown): void;
	removeProperty(name: string): string;
	item(index: unknown): string;
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(target, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		const indexed = definition.indexed;
		if (!indexed) return target;
		Object.defineProperty(target, "length", { get: indexed.length });
		return new Proxy(target, {
			get(object, key) {
				if (
					typeof key === "string" &&
					Number.isInteger(Number(key)) &&
					Number(key) >= 0 &&
					String(Number(key)) === key
				)
					return Number(key) < indexed.length()
						? indexed.get(Number(key))
						: undefined;
				return Reflect.get(object, key);
			},
		});
	},
};

function fixture(source?: string, limits = {}) {
	const tree = new DocumentTree("https://example.com/");
	const element = tree.createElement("div");
	tree.append(tree.root, element);
	if (source !== undefined) tree.setAttribute(element, "style", source);
	const styles = new InlineStyles(tree, factory, limits);
	return { tree, element, styles, style: styles.get(element) as Style };
}

describe("inline CSSOM declarations", () => {
	it("keeps variable longhands and custom values live through native cascade mutations", () => {
		const { tree, element, style } = fixture("--Width:20px;width:var(--Width)");
		const computed = documentStyles(tree);
		expect(style.width).toBe("var(--Width)");
		expect(computed.box(element).width).toBe("20px");
		style.setProperty("--Width", "50px");
		expect(computed.box(element).width).toBe("50px");
		expect(style.width).toBe("var(--Width)");
		style.width = "var(--missing,30px)";
		expect(computed.box(element).width).toBe("30px");
		tree.close();
	});

	it("preserves unresolved shorthand source while editing custom properties", () => {
		const { tree, element, style } = fixture(
			"--space:2px 4px;margin:var(--space)",
		);
		const computed = documentStyles(tree);
		expect(style.margin).toBe("var(--space)");
		expect(style.getPropertyValue("margin-left")).toBe("");
		style.setProperty("--space", "3px 7px");
		expect(style.margin).toBe("var(--space)");
		expect(computed.box(element)["margin-left"]).toBe("7px");
		expect(style.removeProperty("margin")).toBe("var(--space)");
		expect(style.margin).toBe("");
		expect(computed.box(element)["margin-left"]).toBe("0px");
		tree.close();
	});

	it("orders later longhand overrides after an unresolved shorthand", () => {
		const { tree, element, style } = fixture(
			"margin-left:1px;--space:2px 4px;margin:var(--space)",
		);
		style.setProperty("margin-left", "9px");
		expect(documentStyles(tree).box(element)["margin-left"]).toBe("9px");
		expect(documentStyles(tree).box(element)["margin-right"]).toBe("4px");
		expect(style.getPropertyValue("margin-left")).toBe("9px");
		expect(style.margin).toBe("");
		style.margin = "var(--space)";
		expect(documentStyles(tree).box(element)["margin-left"]).toBe("4px");
		style.margin = "6px";
		expect(style.margin).toBe("6px");
		expect(documentStyles(tree).box(element)["margin-left"]).toBe("6px");
		tree.close();
	});

	it("supports partial pending-shorthand removal and reprioritization", () => {
		const { tree, style } = fixture(
			"--space:2px 4px;margin:var(--space)!important",
		);
		expect(style.removeProperty("margin-left")).toBe("");
		style.setProperty("margin-left", "10px");
		expect(style.getPropertyPriority("margin-left")).toBe("");
		expect(style.getPropertyPriority("margin-right")).toBe("important");
		style.setProperty("margin-left", "10px", "important");
		expect(style.getPropertyValue("margin-left")).toBe("10px");
		tree.close();
	});

	it("retains custom-value comments, Unicode, case and an explicitly empty declaration", () => {
		const { tree, style } = fixture(
			"/* prefix:ignored */ --Theme:/*keep*/ blue;--色:red;--empty:;--invalid:initial",
		);
		expect(style.getPropertyValue("--Theme")).toBe("/*keep*/ blue");
		expect(style.getPropertyValue("--theme")).toBe("");
		expect(style.getPropertyValue("--色")).toBe("red");
		expect(style.getPropertyValue("--empty")).toBe(" ");
		style.width = "10px";
		expect(style.getPropertyValue("--Theme")).toBe("/*keep*/ blue");
		style.setProperty("--empty", "");
		expect(style.getPropertyValue("--empty")).toBe("");
		style.setProperty("--empty", " ", "important");
		expect(style.getPropertyValue("--empty")).toBe(" ");
		expect(style.getPropertyPriority("--empty")).toBe("important");
		tree.close();
	});

	it("does not reinterpret adjoining variable tokens as a CSS dimension", () => {
		const { tree, element, style } = fixture("--number:10;width:5px");
		style.width = "var(--number)px";
		expect(style.width).toBe("var(--number)px");
		expect(documentStyles(tree).box(element).width).toBe("auto");
		tree.close();
	});

	it("retains borders across other CSSOM edits and expands/removes their shorthands", () => {
		const { tree, element, style } = fixture(
			"border:2px solid red; border-left-width:4px",
		);
		style.width = "10px";
		expect(style.getPropertyValue("border-left-width")).toBe("4px");
		expect(style.getPropertyValue("border-top")).toBe("2px solid red");
		expect(style.getPropertyValue("border")).toBe("");
		style.setProperty("border-color", "blue green");
		expect(style.getPropertyValue("border-color")).toBe("blue green");
		expect(documentStyles(tree).box(element)["border-left-width"]).toBe("4px");
		style.setProperty("border", "3px solid navy", "important");
		expect(style.getPropertyValue("border")).toBe("3px solid navy");
		expect(style.getPropertyPriority("border")).toBe("important");
		expect(style.removeProperty("border")).toBe("3px solid navy");
		expect(style.getPropertyValue("border-left-width")).toBe("");
		expect(style.width).toBe("10px");
		tree.close();
	});
	it.each(matchingReferenceCases)(
		"matches the actual reference browser for $id",
		(reference) => {
			const { tree, element, style } = fixture(reference.input);
			if (reference.set)
				style.setProperty(reference.set[0], reference.set[1], reference.set[2]);
			const names = Array.from({ length: style.length }, (_, index) =>
				style.item(index),
			);
			expect({
				cssText: style.cssText,
				attribute: tree.get(element).attributes.style,
				length: style.length,
				names,
				declarations: names.map((name) => [
					name,
					style.getPropertyValue(name),
					style.getPropertyPriority(name),
				]),
				margin: style.margin,
				padding: style.padding,
				cssFloat: style.cssFloat,
				item99: style.item(99),
				index99: style[99] === undefined,
			}).toEqual({
				cssText: reference.cssText,
				attribute: reference.attribute,
				length: reference.length,
				names: reference.names,
				declarations: reference.declarations,
				margin: reference.margin,
				padding: reference.padding,
				cssFloat: reference.cssFloat,
				item99: reference.item99,
				index99: reference.index99,
			});
		},
	);

	it("keeps an empty style absent until a real mutation", () => {
		const { tree, element, style, styles } = fixture();
		expect(style.cssText).toBe("");
		expect(style.parentRule).toBeNull();
		expect(style.length).toBe(0);
		expect(styles.get(element)).toBe(style);
		expect(style.removeProperty("width")).toBe("");
		style.setProperty("not-a-property", "anything");
		expect(tree.get(element).attributes.style).toBeUndefined();
		style.width = "0";
		expect(tree.get(element).attributes.style).toBe("width: 0px;");
	});

	it("reflects external attribute replacement and removal through the saved object", () => {
		const { tree, element, style } = fixture("display: none");
		expect(style.display).toBe("none");
		tree.setAttribute(element, "style", "opacity: .25; display: block");
		expect(style.opacity).toBe("0.25");
		expect(style[1]).toBe("display");
		tree.removeAttribute(element, "style");
		expect(style.length).toBe(0);
		expect(style.display).toBe("");
	});

	it("replaces cssText, preserves priorities and removes all shorthand members", () => {
		const { style } = fixture("width: 1px;");
		style.cssText = "margin: 1px 2px !important; display:none";
		expect(style.width).toBe("");
		expect(style.getPropertyPriority("margin")).toBe("important");
		expect(style.removeProperty("margin")).toBe("1px 2px");
		expect(style.length).toBe(1);
		expect(style.cssText).toBe("display: none;");
	});

	it("shares style updates with the actual visibility cascade and semantic snapshots", () => {
		const tree = parseHtmlDocument(
			'<style>#target { display:none!important }</style><div id="target">Visible after override</div>',
			"https://example.com/",
		);
		const target = [...tree.walk()].find(
			(entry) => entry.node.attributes.id === "target",
		)?.node.id;
		if (target === undefined) throw new Error("Missing target");
		const styles = new InlineStyles(tree, factory);
		const style = styles.get(target) as Style;
		style.display = "block";
		expect(documentStyles(tree).get(target).visible).toBe(false);
		style.setProperty("display", "block", "important");
		expect(documentStyles(tree).get(target).visible).toBe(true);
		expect(renderSnapshot(snapshotDocument(tree))).toContain(
			"Visible after override",
		);
		style.display = "none";
		expect(renderSnapshot(snapshotDocument(tree))).not.toContain(
			"Visible after override",
		);
	});

	it("wires element.style forwarding and gives cloned nodes independent declaration objects", () => {
		const tree = parseHtmlDocument(
			'<div id="target" style="opacity:.5">value</div>',
			"https://example.com/",
		);
		const dom = new ScriptDom(tree, factory);
		const doc = dom.document as {
			getElementById(id: string): {
				style: Style;
				cloneNode(): { style: Style };
			};
		};
		const element = doc.getElementById("target");
		const style = element.style;
		expect(style.opacity).toBe("0.5");
		const clone = element.cloneNode();
		expect(clone.style).not.toBe(style);
		clone.style.opacity = "0.1";
		expect(style.opacity).toBe("0.5");
		(element as unknown as { style: string }).style = "display: none";
		expect(element.style).toBe(style);
		expect(style.display).toBe("none");
		dom.close();
		expect(() => style.cssText).toThrow(/closed/i);
	});

	it("retains custom-property case and quoted delimiters without fetching values", () => {
		const { style } = fixture();
		style.setProperty("--Asset", 'url("https://example.invalid/a;b")');
		style.setProperty("--asset", '"/*literal*/ !important"');
		expect(style.getPropertyValue("--Asset")).toBe(
			'url("https://example.invalid/a;b")',
		);
		expect(style.getPropertyPriority("--asset")).toBe("");
		expect(style.getPropertyValue("--ASSET")).toBe("");
	});

	it("ignores invalid properties, values, priorities and malformed declarations", () => {
		const { style } = fixture("width: 2px; display:block");
		style.setProperty("width", "red");
		style.setProperty("display", "none!important");
		style.setProperty("display", "none", "invalid");
		expect(style.cssText).toBe("width: 2px; display: block;");
		style.cssText = 'width: 3px; --bad: "unterminated';
		expect(style.cssText).toBe("width: 3px;");
	});

	it("bounds parsing and mutations atomically", () => {
		const { tree, element, style } = fixture("width:1px", {
			maxCodeUnits: 32,
			maxDeclarations: 2,
		});
		for (const source of ["x".repeat(33), "top:1px;left:2px;width:3px"]) {
			expect(() => {
				style.cssText = source;
			}).toThrow(/limit/i);
			expect(tree.get(element).attributes.style).toBe("width:1px");
		}
		expect(() => {
			style.cssText = `--x:${"(".repeat(40)}${")".repeat(40)}`;
		}).toThrow(/limit/i);
	});

	it("bounds active declaration objects and cached source independently", () => {
		const { tree, styles, style } = fixture("width: 1px", {
			maxObjects: 1,
			maxCachedCodeUnits: 12,
		});
		expect(style.width).toBe("1px");
		const another = tree.createElement("p");
		expect(() => styles.get(another)).toThrow(/limit/i);
		expect(() => {
			style.cssText = "display: block;";
		}).toThrow(/limit/i);
	});

	it("can clear oversized external source and rejects post-close reads", () => {
		const { tree, element, styles, style } = fixture(undefined, {
			maxCodeUnits: 16,
		});
		tree.setAttribute(element, "style", "x".repeat(30));
		expect(() => style.cssText).toThrow(/limit/i);
		style.cssText = "";
		expect(style.cssText).toBe("");
		styles.close();
		expect(styles.stats.cachedCodeUnits).toBe(0);
		expect(() => style.cssText).toThrow(/closed/i);
	});

	it("rejects object coercion and missing arguments before invoking host code", () => {
		const { style } = fixture("width:1px");
		let coerced = false;
		const object = {
			toString() {
				coerced = true;
				return "3px";
			},
		};
		expect(() => style.setProperty("width", object)).toThrow(/coercion/i);
		expect(() => style.item(object)).toThrow(/coercion/i);
		expect(() => (style.setProperty as unknown as () => void)()).toThrow(
			/argument/i,
		);
		expect(coerced).toBe(false);
		expect(style.width).toBe("1px");
	});

	it("revokes saved capabilities when the document closes", () => {
		const { tree, styles, style } = fixture("width:1px");
		expect(style.width).toBe("1px");
		tree.close();
		expect(styles.stats).toEqual({ objects: 0, cachedCodeUnits: 0 });
		expect(() => style.removeProperty("width")).toThrow(/closed/i);
		expect(() => {
			style.width = "2px";
		}).toThrow(/closed/i);
	});

	it("parses comment delimiters before locating declaration names", () => {
		const { style } = fixture('/* : ; */ width: 1px; --text: "a:b;/*c*/"');
		expect(style.width).toBe("1px");
		expect(style.getPropertyValue("--text")).toBe('"a:b;/*c*/"');
	});

	it("keeps the source, cache and revision intact when the document text budget rejects a mutation", () => {
		const tree = new DocumentTree("https://example.com/", {
			maxTextCodeUnits: 30,
		});
		const element = tree.createElement("div");
		tree.setAttribute(element, "style", "width:1px");
		const styles = new InlineStyles(tree, factory);
		const style = styles.get(element) as Style;
		expect(style.width).toBe("1px");
		const revision = tree.revision;
		const cached = styles.stats.cachedCodeUnits;
		expect(() => {
			style.cssText = "width:1px;height:2px;display:block";
		}).toThrow(/limit/i);
		expect(tree.revision).toBe(revision);
		expect(tree.get(element).attributes.style).toBe("width:1px");
		expect(style.width).toBe("1px");
		expect(styles.stats.cachedCodeUnits).toBe(cached);
	});

	it("does not smuggle delimiters or duplicate priorities through custom properties", () => {
		const { style } = fixture("--safe: before;");
		for (const value of [
			"after;display:none",
			"after!important!important",
			"unbalanced)",
		])
			style.setProperty("--safe", value);
		expect(style.getPropertyValue("--safe")).toBe("before");
	});
});
