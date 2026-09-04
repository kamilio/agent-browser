import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { focusTabIndex } from "./focus.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface TestNode {
	contentEditable: unknown;
	readonly isContentEditable: boolean;
	tabIndex: number;
	readonly activeElement: TestNode;
	getElementById(id: string): TestNode;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
}

function createHostObject(definition: ScriptHostObjectDefinition): object {
	const result = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(result, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(result, name, { value: method });
	return Object.preventExtensions(result);
}

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content = '<div id="editor" contenteditable>Editable</div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}#editor{width:140px;min-height:40px}#after{height:700px}</style><button id="before">Before</button>${content}<button id="next">Next</button><div id="after"></div>`,
		"https://fixture.invalid/editable-focus",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	};
	const ref = (selector: string) => tree.reference(id(selector));
	const actions = documentInteractions(tree);
	const dom = new ScriptDom(tree, { createHostObject });
	const document = dom.document as TestNode;
	documentStyles(tree).setViewport(240, 180);
	return { tree, queries, id, ref, actions, document, dom };
}

it.each(["", "true", "TRUE", "TrUe", "plaintext-only", "PLAINTEXT-ONLY"])(
	"focuses root contenteditable=%j without changing reflected tabIndex",
	(value) => {
		const { actions, document, id, ref, queries } = fixture(
			`<div id="editor" contenteditable="${value}">Edit</div>`,
		);
		expect(actions.focus.focus(ref("#editor"))).toBe(id("#editor"));
		expect(document.getElementById("editor").tabIndex).toBe(-1);
		expect(document.activeElement).toBe(document.getElementById("editor"));
		expect(queries.querySelector(":focus-visible")).toBe(id("#editor"));
	},
);

it.each(["false", "FALSE", "inherit", "invalid", " true ", "plaintext-only "])(
	"does not invent a focus stop for root contenteditable=%j",
	(value) => {
		const { tree, id, actions, ref } = fixture();
		actions.focus.focus(ref("#editor"));
		tree.setAttribute(id("#editor"), "contenteditable", value);
		expect(actions.focus.active()).toBeNull();
		expect(focusTabIndex(tree, id("#editor"))).toBeNull();
		expect(() => actions.focus.focus(ref("#editor"))).toThrow(
			/cannot receive focus/,
		);
	},
);

it.each([
	["", "true", true],
	["TRUE", "true", true],
	["PLAINTEXT-ONLY", "plaintext-only", true],
	["FALSE", "false", false],
	["inherit", "inherit", false],
	["invalid", "inherit", false],
	[" true ", "inherit", false],
] as const)(
	"reflects contenteditable=%j as %s",
	(value, reflected, editable) => {
		const { document } = fixture(
			`<div id="editor" contenteditable="${value}"></div>`,
		);
		const editor = document.getElementById("editor");
		expect(editor.contentEditable).toBe(reflected);
		expect(editor.isContentEditable).toBe(editable);
		expect(editor.getAttribute("contenteditable")).toBe(value);
	},
);

it.each([
	["true", "true"],
	[true, "true"],
	["TrUe", "true"],
	[false, "false"],
	["FALSE", "false"],
	["PLAINTEXT-ONLY", "plaintext-only"],
	["inherit", null],
	["INHERIT", null],
] as const)("sets and canonicalizes contentEditable=%j", (value, attribute) => {
	const { document } = fixture();
	const editor = document.getElementById("editor");
	editor.contentEditable = value;
	expect(editor.getAttribute("contenteditable")).toBe(attribute);
	expect(editor.contentEditable).toBe(attribute ?? "inherit");
	expect(editor.isContentEditable).toBe(
		attribute === "true" || attribute === "plaintext-only",
	);
});

it.each(["", "invalid", " true ", 0, 1, null, undefined])(
	"rejects invalid contentEditable assignment %j without mutation",
	(value) => {
		const { tree, document } = fixture();
		const editor = document.getElementById("editor");
		const revision = tree.revision;
		expect(() => {
			editor.contentEditable = value;
		}).toThrow(expect.objectContaining({ name: "SyntaxError" }));
		expect(tree.revision).toBe(revision);
		expect(editor.getAttribute("contenteditable")).toBe("");
	},
);

it("inherits through missing and invalid attributes and honors false islands", () => {
	const { document, tree, id, actions, ref } = fixture(
		'<div id="editor" contenteditable><span id="child"><b id="invalid" contenteditable="invalid">Text</b></span><section contenteditable="false"><div id="island" contenteditable="plaintext-only">Island</div></section><div id="nested" contenteditable="true">Nested</div></div>',
	);
	for (const name of ["editor", "child", "invalid", "island", "nested"])
		expect(document.getElementById(name).isContentEditable).toBe(true);
	expect(document.getElementById("child").contentEditable).toBe("inherit");
	for (const selector of ["#child", "#invalid", "#nested"])
		expect(focusTabIndex(tree, id(selector))).toBeNull();
	expect(actions.focus.focus(ref("#island"))).toBe(id("#island"));
	tree.setAttribute(id("#nested"), "tabindex", "0");
	expect(actions.focus.focus(ref("#nested"))).toBe(id("#nested"));
});

it.each([false, true])(
	"includes root editors in sequential focus, reverse=%s",
	(reverse) => {
		const { actions, id, ref } = fixture();
		actions.focus.focus(ref(reverse ? "#next" : "#before"));
		expect(actions.focus.move(reverse)).toBe(id("#editor"));
		expect(actions.focus.move(reverse)).toBe(id(reverse ? "#before" : "#next"));
	},
);

it("honors explicit negative and positive tabindex on editors", () => {
	const { actions, tree, id, ref } = fixture();
	actions.focus.focus(ref("#editor"));
	tree.setAttribute(id("#editor"), "tabindex", "-1");
	actions.focus.focus(ref("#before"));
	expect(actions.focus.move()).toBe(id("#next"));
	expect(actions.focus.focus(ref("#editor"))).toBe(id("#editor"));
	tree.setAttribute(id("#editor"), "tabindex", "2");
	actions.focus.focus(null);
	expect(actions.focus.move()).toBe(id("#editor"));
});

it.each([false, true])(
	"indicates direct and coordinate pointer focus, coordinates=%s",
	(coordinates) => {
		const { tree, actions, id, ref, queries } = fixture();
		if (coordinates) {
			const rect = documentGeometry(tree).getBoundingClientRect(id("#editor"));
			actions.mouse.move(rect.x + 5, rect.y + 5);
			actions.mouse.down();
			actions.mouse.up();
		} else actions.click(ref("#editor"));
		expect(actions.focus.active()).toBe(id("#editor"));
		expect(queries.querySelector(":focus-visible")).toBe(id("#editor"));
	},
);

it("keeps editing navigation keys from scrolling the viewport", () => {
	const { tree, actions, ref } = fixture();
	actions.focus.focus(ref("#editor"));
	for (const key of ["ArrowDown", "PageDown", "End"])
		actions.keyboard.press(key);
	expect(() => actions.keyboard.press("Space")).toThrow(
		/editing.*not implemented/,
	);
	expect(documentScroll(tree).get()).toEqual({ x: 0, y: 0 });
});

it("does not execute unsupported object string coercion", () => {
	const { document, tree } = fixture();
	const editor = document.getElementById("editor");
	expect(editor.contentEditable).toBe("true");
	let converted = false;
	const revision = tree.revision;
	expect(() => {
		editor.contentEditable = {
			toString() {
				converted = true;
				return "false";
			},
		};
	}).toThrow(/conversion is not implemented/);
	expect(converted).toBe(false);
	expect(tree.revision).toBe(revision);
});

it("dispatches ordinary async focus events for an editable root", async () => {
	const { actions, ref, id, queries } = fixture();
	const events: string[] = [];
	for (const type of ["focus", "focusin", "blur", "focusout"])
		actions.events.addEventListener(id("#editor"), type, () => {
			events.push(type);
		});
	await actions.focus.focusAsync(ref("#editor"));
	expect(queries.querySelector(":focus")).toBe(id("#editor"));
	await actions.focus.focusAsync(ref("#next"));
	expect(events).toEqual(["focus", "focusin", "blur", "focusout"]);
});

it("revalidates an editable destination changed during blur", () => {
	const { actions, tree, ref, id } = fixture();
	actions.focus.focus(ref("#editor"));
	actions.focus.focus(ref("#before"));
	actions.events.addEventListener(id("#before"), "blur", () => {
		tree.setAttribute(id("#editor"), "contenteditable", "false");
	});
	expect(() => actions.focus.focus(ref("#editor"))).toThrow(/target changed/);
	expect(actions.focus.active()).toBeNull();
});

it("invalidates cached focus selectors after a reflected editability change", () => {
	const { actions, document, queries, id, ref } = fixture();
	actions.focus.focus(ref("#editor"));
	expect(queries.querySelector(":focus-visible")).toBe(id("#editor"));
	expect(queries.querySelector("body:has(:focus-visible)")).not.toBeNull();
	document.getElementById("editor").contentEditable = "false";
	expect(queries.querySelector(":focus-visible")).toBeNull();
	expect(queries.querySelector("body:has(:focus-visible)")).toBeNull();
	expect(actions.focus.active()).toBeNull();
});

it("does not make inherited descendants extra sequential stops", () => {
	const { actions, ref, id } = fixture(
		'<div id="editor" contenteditable><span id="child">Child</span><div id="nested" contenteditable>Nested</div></div>',
	);
	actions.focus.focus(ref("#before"));
	expect(actions.focus.move()).toBe(id("#editor"));
	expect(actions.focus.move()).toBe(id("#next"));
});

it.each([
	"hidden",
	"inert",
	'style="display:none"',
	'style="visibility:hidden"',
])("preserves %s focus exclusions after becoming editable", (attribute) => {
	const { tree, actions, ref, id } = fixture();
	actions.focus.focus(ref("#editor"));
	const name = attribute.split("=")[0];
	const value = attribute.includes("=") ? attribute.split('"')[1] : "";
	tree.setAttribute(id("#editor"), name, value);
	expect(actions.focus.active()).toBeNull();
	expect(() => actions.focus.focus(ref("#editor"))).toThrow(
		/cannot receive focus/,
	);
});

it("recomputes editing roots after reparenting and parent attribute changes", () => {
	const { tree, actions, id, ref, document } = fixture(
		'<div id="editor" contenteditable>Outer</div><div id="other" contenteditable>Other</div>',
	);
	actions.focus.focus(ref("#other"));
	tree.insert(id("#editor"), id("#other"));
	expect(actions.focus.active()).toBeNull();
	expect(document.getElementById("other").isContentEditable).toBe(true);
	tree.setAttribute(id("#editor"), "contenteditable", "false");
	expect(actions.focus.focus(ref("#other"))).toBe(id("#other"));
	tree.remove(id("#other"));
	expect(actions.focus.active()).toBeNull();
	expect(document.getElementById("editor").isContentEditable).toBe(false);
});

it("guards retained editable properties when the binding closes", () => {
	const { dom, document, tree } = fixture();
	const editor = document.getElementById("editor");
	expect(editor.isContentEditable).toBe(true);
	dom.close();
	const revision = tree.revision;
	expect(() => editor.contentEditable).toThrow(/closed/i);
	expect(() => editor.isContentEditable).toThrow(/closed/i);
	expect(() => {
		editor.contentEditable = "false";
	}).toThrow(/closed/i);
	expect(tree.revision).toBe(revision);
});

it("keeps isContentEditable read-only", () => {
	const { document } = fixture();
	const editor = document.getElementById("editor");
	expect(editor.isContentEditable).toBe(true);
	expect(() => Object.assign(editor, { isContentEditable: false })).toThrow(
		TypeError,
	);
	expect(editor.isContentEditable).toBe(true);
});
