import { afterEach, describe, expect, it } from "vitest";
import { DocumentTree, type DocumentLimits } from "./document.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { serializeHtml } from "./html-serialization.js";
import { documentStyles } from "./styles.js";
import { rasterizeDocument } from "./document-raster.js";
import { snapshotDocument } from "./snapshot.js";
import { BrowserEvent, DocumentEvents } from "./events.js";
import { AgentBrowserError } from "./errors.js";

interface NodeCapability {
	insertAdjacentElement(...args: unknown[]): NodeCapability | null;
	insertAdjacentText(...args: unknown[]): void;
	childNodes: NodeCapability[];
	parentNode: NodeCapability | null;
	textContent: string;
	querySelector(selector: string): NodeCapability | null;
	getBoundingClientRect(): { top: number };
	addEventListener(type: string, callback: unknown): void;
}

const documents: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition) {
		const object = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		Object.assign(object, definition.methods);
		return object;
	},
};
function fixture(limits: Partial<DocumentLimits> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/adjacent", limits);
	documents.push(tree);
	const parent = tree.createElement("main");
	const first = tree.createElement("i", { id: "first" });
	const target = tree.createElement("div", { id: "target" });
	const last = tree.createElement("i", { id: "last" });
	const original = tree.createText("original");
	tree.append(tree.root, parent);
	for (const child of [first, target, last]) tree.append(parent, child);
	tree.append(target, original);
	const dom = new ScriptDom(tree, factory);
	const node = (id: number) => dom.node(id) as NodeCapability;
	return {
		tree,
		dom,
		node,
		parent,
		first,
		target,
		last,
		original,
		element: node(target),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

const positions = [
	"beforebegin",
	"afterbegin",
	"beforeend",
	"afterend",
] as const;

describe("adjacent element and text insertion", () => {
	it.each(positions)(
		"inserts a fresh element at %s with stable identity",
		(position) => {
			const test = fixture();
			const inserted = test.tree.createElement("strong", { id: "inserted" });
			const capability = test.node(inserted);
			expect(test.element.insertAdjacentElement(position, capability)).toBe(
				capability,
			);
			const parent =
				position === "afterbegin" || position === "beforeend"
					? test.target
					: test.parent;
			const expected = {
				beforebegin: [test.first, inserted, test.target, test.last],
				afterbegin: [inserted, test.original],
				beforeend: [test.original, inserted],
				afterend: [test.first, test.target, inserted, test.last],
			}[position];
			expect(test.tree.get(parent).children).toEqual(expected);
			expect(capability.parentNode).toBe(test.node(parent));
			expect(test.node(parent).querySelector("#inserted")).toBe(capability);
		},
	);

	it.each(positions)(
		"inserts literal text at %s without parsing or merging",
		(position) => {
			const test = fixture();
			const text = "<b>&amp;</b>\r\n\0\ud800";
			const before = test.tree.nodeCount;
			expect(test.element.insertAdjacentText(position, text)).toBeUndefined();
			expect(test.tree.nodeCount).toBe(before + 1);
			const parent =
				position === "afterbegin" || position === "beforeend"
					? test.target
					: test.parent;
			const index = {
				beforebegin: 1,
				afterbegin: 0,
				beforeend: 1,
				afterend: 2,
			}[position];
			const inserted = test.tree.get(parent).children[index];
			expect(test.tree.get(inserted)).toMatchObject({
				kind: "text",
				data: text,
			});
			expect(test.tree.get(test.original).data).toBe("original");
			expect(test.element.querySelector("b")).toBeNull();
		},
	);

	it.each(positions)("accepts ASCII case variants of %s", (position) => {
		const test = fixture();
		expect(() =>
			test.element.insertAdjacentText(position.toUpperCase(), "text"),
		).not.toThrow();
		const child = test.tree.createElement("span");
		expect(
			test.element.insertAdjacentElement(
				position.toUpperCase(),
				test.node(child),
			),
		).toBe(test.node(child));
	});

	it.each(positions)("creates an empty text node at %s", (position) => {
		const test = fixture();
		const before = test.tree.nodeCount;
		test.element.insertAdjacentText(position, "");
		expect(test.tree.nodeCount).toBe(before + 1);
		expect(test.tree.textContent(test.parent)).toBe("original");
	});

	it.each(["beforebegin", "afterend"] as const)(
		"returns null/undefined at %s of a parentless element without allocating",
		(position) => {
			const test = fixture();
			test.tree.remove(test.target);
			const count = test.tree.nodeCount;
			const revision = test.tree.revision;
			expect(
				test.element.insertAdjacentElement(position, test.node(test.first)),
			).toBeNull();
			expect(
				test.element.insertAdjacentText(position, "discarded"),
			).toBeUndefined();
			expect(test.tree.get(test.first).parent).toBe(test.parent);
			expect(test.tree.nodeCount).toBe(count);
			expect(test.tree.revision).toBe(revision);
		},
	);

	it.each(["beforebegin", "afterend"] as const)(
		"works at %s under a document fragment",
		(position) => {
			const test = fixture();
			const fragment = test.tree.createFragment();
			test.tree.append(fragment, test.target);
			expect(
				test.element.insertAdjacentElement(position, test.node(test.first)),
			).toBe(test.node(test.first));
			test.element.insertAdjacentText(position, "text");
			const children = test.tree.get(fragment).children;
			expect(children[0]).toBe(
				position === "beforebegin" ? test.first : test.target,
			);
			expect(children[2]).toBe(
				position === "beforebegin" ? test.target : test.first,
			);
			expect(test.tree.get(children[1])).toMatchObject({
				kind: "text",
				data: "text",
			});
			expect(test.tree.get(test.first).parent).toBe(fragment);
		},
	);

	it.each(positions)(
		"moves an existing sibling at %s rather than cloning it",
		(position) => {
			const test = fixture();
			const before = test.tree.nodeCount;
			const reference = test.tree.reference(test.last);
			expect(
				test.element.insertAdjacentElement(position, test.node(test.last)),
			).toBe(test.node(test.last));
			expect(test.tree.nodeCount).toBe(before);
			expect(test.tree.reference(test.last)).toBe(reference);
			const expected = {
				beforebegin: [test.first, test.last, test.target],
				afterbegin: [test.first, test.target],
				beforeend: [test.first, test.target],
				afterend: [test.first, test.target, test.last],
			}[position];
			expect(test.tree.get(test.parent).children).toEqual(expected);
			if (position === "afterbegin" || position === "beforeend")
				expect(test.tree.get(test.target).children).toEqual(
					position === "afterbegin"
						? [test.last, test.original]
						: [test.original, test.last],
				);
		},
	);

	it.each(["beforebegin", "afterend"] as const)(
		"allows inserting an element next to itself at %s",
		(position) => {
			const test = fixture();
			expect(test.element.insertAdjacentElement(position, test.element)).toBe(
				test.element,
			);
			expect(test.tree.get(test.parent).children).toEqual([
				test.first,
				test.target,
				test.last,
			]);
		},
	);

	it.each([
		"",
		" beforeend",
		"beforeend ",
		"before-end",
		"beforｅend",
		"x".repeat(100),
	])(
		"rejects invalid position %j before allocation or movement",
		(position) => {
			const test = fixture();
			const count = test.tree.nodeCount;
			const revision = test.tree.revision;
			for (const operation of [
				() =>
					test.element.insertAdjacentElement(position, test.node(test.first)),
				() => test.element.insertAdjacentText(position, "new"),
			]) {
				expect(operation).toThrow(DOMException);
				try {
					operation();
				} catch (error) {
					expect(error).toMatchObject({ name: "SyntaxError" });
				}
			}
			expect(test.tree.nodeCount).toBe(count);
			expect(test.tree.revision).toBe(revision);
		},
	);

	it("enforces argument counts and Element type before the insertion algorithm", () => {
		const test = fixture();
		for (const method of [
			test.element.insertAdjacentElement,
			test.element.insertAdjacentText,
		]) {
			expect(() => method()).toThrow(TypeError);
			expect(() => method("beforeend")).toThrow(TypeError);
		}
		for (const child of [
			test.original,
			test.tree.root,
			test.tree.createComment("comment"),
			test.tree.createFragment(),
		])
			expect(() =>
				test.element.insertAdjacentElement("invalid", test.node(child)),
			).toThrow(TypeError);
		expect(
			test.element.insertAdjacentElement(
				"beforeend",
				test.node(test.first),
				"ignored",
			),
		).toBe(test.node(test.first));
	});

	it("converts primitive text without invoking object conversion hooks", () => {
		const test = fixture();
		for (const value of [null, undefined, false, 12])
			test.element.insertAdjacentText("beforeend", value, "ignored");
		expect(test.element.textContent).toBe("originalnullundefinedfalse12");
		let converted = false;
		expect(() =>
			test.element.insertAdjacentText("beforeend", {
				toString() {
					converted = true;
					return "hidden";
				},
			}),
		).toThrow(/conversion is not implemented/);
		expect(converted).toBe(false);
	});

	it.each(["afterbegin", "beforeend"] as const)(
		"rejects ancestor and self cycles at %s without detaching nodes",
		(position) => {
			const test = fixture();
			const revision = test.tree.revision;
			for (const child of [test.target, test.parent]) {
				expect(() =>
					test.element.insertAdjacentElement(position, test.node(child)),
				).toThrow(DOMException);
				try {
					test.element.insertAdjacentElement(position, test.node(child));
				} catch (error) {
					expect(error).toMatchObject({ name: "HierarchyRequestError" });
				}
			}
			expect(test.tree.get(test.target).parent).toBe(test.parent);
			expect(test.tree.get(test.parent).parent).toBe(test.tree.root);
			expect(test.tree.revision).toBe(revision);
		},
	);

	it.each(["beforebegin", "afterend"] as const)(
		"preserves document hierarchy at %s of its root element",
		(position) => {
			const test = fixture();
			const root = test.node(test.parent);
			const before = test.tree.nodeCount;
			expect(() => root.insertAdjacentText(position, "text")).toThrow(
				DOMException,
			);
			expect(() =>
				root.insertAdjacentElement(position, test.node(test.first)),
			).toThrow(DOMException);
			expect(root.insertAdjacentElement(position, root)).toBe(root);
			expect(test.tree.nodeCount).toBe(before);
			expect(test.tree.get(test.first).parent).toBe(test.parent);
		},
	);

	it("preflights text depth and node/text quotas without leaking orphan nodes", () => {
		for (const limits of [
			{ maxDepth: 2 },
			{ maxNodes: 6 },
			{ maxTextCodeUnits: 43 },
		]) {
			const tree = new DocumentTree("https://fixture.invalid/limits", limits);
			documents.push(tree);
			const parent = tree.createElement("main");
			const target = tree.createElement("div");
			tree.append(tree.root, parent);
			tree.append(parent, target);
			if (limits.maxNodes)
				while (tree.nodeCount < limits.maxNodes) tree.createText("");
			const dom = new ScriptDom(tree, factory);
			const count = tree.nodeCount;
			const revision = tree.revision;
			expect(() =>
				(dom.node(target) as NodeCapability).insertAdjacentText(
					"beforeend",
					"x".repeat(44),
				),
			).toThrow(/limit exceeded/);
			expect(tree.nodeCount).toBe(count);
			expect(tree.revision).toBe(revision);
		}
	});

	it("invalidates existing query and serialized views after insertion", () => {
		const test = fixture();
		const queries = new DocumentQueries(test.tree);
		expect(queries.querySelector("main > strong + div")).toBeNull();
		const inserted = test.tree.createElement("strong");
		test.element.insertAdjacentElement("beforebegin", test.node(inserted));
		test.node(inserted).insertAdjacentText("afterbegin", "<literal>");
		expect(queries.querySelector("main > strong + div")).toBe(test.target);
		expect(serializeHtml(test.tree, inserted)).toBe("&lt;literal&gt;");
		queries.close();
	});

	it("does not expose these methods on non-elements or accept foreign capabilities", () => {
		const test = fixture();
		const foreign = fixture();
		for (const child of [
			test.tree.root,
			test.original,
			test.tree.createFragment(),
			test.tree.createComment(""),
		]) {
			expect(test.node(child).insertAdjacentElement).toBeUndefined();
			expect(test.node(child).insertAdjacentText).toBeUndefined();
		}
		expect(() =>
			test.element.insertAdjacentElement("beforeend", foreign.element),
		).toThrow(/this script document/);
		expect(foreign.tree.get(foreign.target).parent).toBe(foreign.parent);
	});

	it("updates shared computed styles, geometry, snapshots and raster output", () => {
		const test = fixture();
		documentStyles(test.tree).setViewport(80, 60);
		test.tree.setAttribute(test.first, "style", "display:none");
		test.tree.setAttribute(test.last, "style", "display:none");
		test.tree.setAttribute(
			test.target,
			"style",
			"height:10px;width:40px;font-size:8px",
		);
		const stylesheet = test.tree.createElement("style");
		test.tree.append(
			stylesheet,
			test.tree.createText(
				"#target{background:red}h2 + #target{background:blue}",
			),
		);
		test.tree.append(test.parent, stylesheet);
		const style = test.dom.getComputedStyle(test.element) as {
			backgroundColor: string;
		};
		const top = test.element.getBoundingClientRect().top;
		expect(style.backgroundColor).toBe("rgb(255, 0, 0)");
		const before = rasterizeDocument(test.tree).image.pixels;
		const heading = test.tree.createElement("h2", {
			style: "height:10px;margin:0;font-size:8px",
		});
		test.node(heading).insertAdjacentText("beforeend", "New title");
		test.element.insertAdjacentElement("beforebegin", test.node(heading));
		expect(style.backgroundColor).toBe("rgb(0, 0, 255)");
		expect(test.element.getBoundingClientRect().top).toBe(top + 10);
		expect(snapshotDocument(test.tree).entries).toContainEqual(
			expect.objectContaining({
				role: "heading",
				name: "New title",
				ref: test.tree.reference(heading),
			}),
		);
		expect(rasterizeDocument(test.tree).image.pixels).not.toEqual(before);
		test.tree.remove(heading);
		expect(style.backgroundColor).toBe("rgb(255, 0, 0)");
		expect(test.element.getBoundingClientRect().top).toBe(top);
		expect(rasterizeDocument(test.tree).image.pixels).toEqual(before);
	});

	it("preserves listeners and uses the moved node's current event ancestry", async () => {
		const test = fixture();
		const events = new DocumentEvents(test.tree);
		const dom = new ScriptDom(test.tree, factory, {
			events,
			callbacks: {
				isClosed: () => false,
				startCallback(callback, args, options) {
					if (typeof callback !== "function")
						throw new Error("Expected native test callback");
					const result = Promise.resolve(
						callback.apply(options.thisValue, args),
					);
					return { synchronous: Promise.resolve(), result };
				},
			},
		});
		const button = test.tree.createElement("button");
		test.tree.append(test.parent, button);
		const capability = dom.node(button) as NodeCapability;
		const order: string[] = [];
		capability.addEventListener(
			"click",
			function (this: unknown, event: { target: unknown }) {
				expect(this).toBe(capability);
				expect(event.target).toBe(capability);
				order.push("button");
			},
		);
		(dom.node(test.target) as NodeCapability).addEventListener("click", () =>
			order.push("target"),
		);
		(dom.node(test.parent) as NodeCapability).addEventListener("click", () =>
			order.push("parent"),
		);
		expect(
			(dom.node(test.target) as NodeCapability).insertAdjacentElement(
				"afterbegin",
				capability,
			),
		).toBe(capability);
		await events.dispatchEventAsync(
			button,
			new BrowserEvent("click", { bubbles: true }),
		);
		expect(order).toEqual(["button", "target", "parent"]);
	});

	it("does not relabel post-mutation observer failures as hierarchy errors", () => {
		const test = fixture();
		const failure = new AgentBrowserError(
			"invalid-input",
			"Native resource observer failed",
		);
		const unregister = test.tree.onChange((change) => {
			if (change.kind === "insert" && change.target === test.first)
				throw failure;
		});
		let observed: unknown;
		try {
			test.element.insertAdjacentElement("afterbegin", test.node(test.first));
		} catch (error) {
			observed = error;
		} finally {
			unregister();
		}
		expect(observed).toBe(failure);
		expect(test.tree.get(test.first).parent).toBe(test.target);
	});

	it("revokes saved methods when their owning script DOM closes", () => {
		const test = fixture();
		const element = test.element.insertAdjacentElement;
		const text = test.element.insertAdjacentText;
		test.dom.close();
		expect(() => element("beforeend", test.element)).toThrow(/closed/);
		expect(() => text("beforeend", "text")).toThrow(/closed/);
	});
});
