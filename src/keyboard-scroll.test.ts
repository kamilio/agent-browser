import { afterEach, expect, it } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
function fixture(content = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}main{width:200px;height:400px}</style><main>${content}</main>`,
		"https://fixture.invalid/keyboard-scroll",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const actions = documentInteractions(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const focus = (selector: string) =>
		actions.focus.focus(tree.reference(id(selector)));
	return {
		tree,
		actions,
		keyboard: actions.keyboard,
		events: actions.events,
		scroll: documentScroll(tree),
		id,
		focus,
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it.each([
	["ArrowDown", 0, 40],
	["ArrowRight", 40, 0],
	["PageDown", 0, 70],
	["Space", 0, 70],
	["End", 0, 320],
] as const)(
	"scrolls the root with %s without a focused element",
	(key, horizontal, vertical) => {
		const { keyboard, scroll, actions } = fixture();
		expect(keyboard.press(key)).toMatchObject({
			canceled: false,
			scroll: { x: horizontal, y: vertical },
		});
		expect(scroll.get()).toEqual({ x: horizontal, y: vertical });
		expect(actions.focus.active()).toBe(null);
	},
);

it.each([
	["ArrowUp", 50, 160],
	["ArrowLeft", 10, 200],
	["PageUp", 50, 130],
	["Shift+Space", 50, 130],
	["Home", 50, 0],
] as const)(
	"scrolls backward with %s while preserving the other axis",
	(key, horizontal, vertical) => {
		const { keyboard, scroll } = fixture();
		scroll.to(50, 200);
		expect(keyboard.press(key)).toMatchObject({
			scroll: { x: horizontal, y: vertical },
		});
	},
);

it("uses current viewport size and clamps endpoints without duplicate scroll events", () => {
	const { tree, keyboard, scroll, events } = fixture();
	let count = 0;
	events.addEventListener(tree.root, "scroll", () => count++);
	keyboard.press("Home");
	expect(count).toBe(0);
	documentStyles(tree).setViewport(100, 40);
	keyboard.press("PageDown");
	expect(scroll.get().y).toBe(35);
	keyboard.press("End");
	keyboard.press("PageDown");
	expect(scroll.get().y).toBe(360);
	expect(count).toBe(2);
});

it.each(["keydown", "keypress"])(
	"honors Space cancellation at %s and still releases the key",
	(type) => {
		const { tree, keyboard, scroll, events } = fixture();
		let released = 0;
		events.addEventListener(tree.root, type, (event) => event.preventDefault());
		events.addEventListener(tree.root, "keyup", () => released++);
		expect(keyboard.press("Space").canceled).toBe(true);
		expect(scroll.get().y).toBe(0);
		expect(released).toBe(1);
	},
);

it("honors navigation-key cancellation and observes immediate geometry in scroll events", () => {
	const { tree, keyboard, scroll, events, id } = fixture();
	let block = true;
	const trace: string[] = [];
	events.addEventListener(tree.root, "keydown", (event) => {
		trace.push("down");
		if (block) event.preventDefault();
	});
	events.addEventListener(tree.root, "scroll", (event) => {
		trace.push(
			`scroll:${event.bubbles}:${event.cancelable}:${documentGeometry(tree).getBoundingClientRect(id("main")).y}`,
		);
		event.preventDefault();
	});
	events.addEventListener(tree.root, "keyup", () => trace.push("up"));
	keyboard.press("ArrowDown");
	expect(scroll.get().y).toBe(0);
	block = false;
	keyboard.press("ArrowDown");
	expect(trace).toEqual(["down", "up", "down", "scroll:true:false:-40", "up"]);
});

it("repeats held navigation keys but does not scroll again on release", () => {
	const { tree, keyboard, scroll, events } = fixture();
	const repeat: boolean[] = [];
	events.addEventListener(tree.root, "keydown", (event) =>
		repeat.push((event as unknown as { repeat: boolean }).repeat),
	);
	keyboard.down("ArrowDown");
	keyboard.down("ArrowDown");
	keyboard.up("ArrowDown");
	expect(scroll.get().y).toBe(80);
	expect(repeat).toEqual([false, true]);
});

it.each([
	"Control+End",
	"Meta+ArrowDown",
	"Alt+PageDown",
	"Shift+ArrowDown",
	"Shift+Home",
])("leaves unsupported platform chord %s event-only", (key) => {
	const { keyboard, scroll } = fixture();
	keyboard.press(key);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("scrolls focused links without activation or attempting caret editing", () => {
	const { tree, keyboard, scroll, events, focus, actions, id } = fixture(
		'<a id="link" href="/next">Next</a>',
	);
	focus("#link");
	let clicks = 0;
	events.addEventListener(tree.root, "click", () => clicks++);
	keyboard.press("Space");
	keyboard.press("ArrowRight");
	keyboard.press("Home");
	expect(scroll.get()).toEqual({ x: 40, y: 0 });
	expect(actions.focus.active()).toBe(id("#link"));
	expect(clicks).toBe(0);
});

it("preserves button Space activation on release while allowing page navigation keys", () => {
	const { keyboard, scroll, events, id, focus } = fixture(
		'<button id="button">Go</button>',
	);
	focus("#button");
	let clicks = 0;
	events.addEventListener(id("#button"), "click", () => clicks++);
	keyboard.down("Space");
	expect(scroll.get().y).toBe(0);
	expect(clicks).toBe(0);
	keyboard.up("Space");
	expect(clicks).toBe(1);
	keyboard.press("PageDown");
	expect(scroll.get().y).toBe(70);
});

it("preserves checkbox and select defaults instead of scrolling their page", () => {
	const { tree, keyboard, scroll, id, focus } = fixture(
		'<input id="box" type="checkbox"><select id="select"><option>A</option><option>B</option></select>',
	);
	focus("#box");
	keyboard.press("Space");
	expect(controlChecked(tree, id("#box"))).toBe(true);
	focus("#select");
	keyboard.press("ArrowDown");
	expect(controlValue(tree, id("#select"))).toBe("B");
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it.each(["input", "textarea"])(
	"preserves %s editing and does not substitute root scrolling for control scrolling",
	(tag) => {
		const { tree, keyboard, scroll, id, focus } = fixture(
			`<${tag} id="edit"></${tag}>`,
		);
		focus("#edit");
		keyboard.type("ab");
		keyboard.press("Home");
		keyboard.press("Space");
		keyboard.press("PageDown");
		expect(controlValue(tree, id("#edit"))).toBe(" ab");
		expect(scroll.get()).toEqual({ x: 0, y: 0 });
	},
);

it("does not scroll after a key listener changes focus", () => {
	const { tree, keyboard, scroll, focus, events } =
		fixture('<input id="edit">');
	events.addEventListener(tree.root, "keydown", () => focus("#edit"));
	keyboard.press("PageDown");
	expect(scroll.get().y).toBe(0);
});

it.each(["true", "plaintext-only", ""])(
	"protects inherited contenteditable=%s subtrees",
	(value) => {
		const { keyboard, scroll, focus } = fixture(
			`<div contenteditable="${value}"><span id="edit" tabindex="0">Text</span></div>`,
		);
		focus("#edit");
		keyboard.press("PageDown");
		expect(scroll.get().y).toBe(0);
	},
);

it("allows an explicitly noneditable island to receive page scrolling", () => {
	const { keyboard, scroll, focus } = fixture(
		'<div contenteditable="true"><span id="edit" tabindex="0" contenteditable="false">Text</span></div>',
	);
	focus("#edit");
	keyboard.press("PageDown");
	expect(scroll.get().y).toBe(70);
});

it("keeps asynchronous dispatch on the same default-action path", async () => {
	const { keyboard, scroll } = fixture();
	expect(await keyboard.pressAsync("PageDown")).toMatchObject({
		scroll: { x: 0, y: 70 },
	});
	expect(scroll.get().y).toBe(70);
});

it("inherits editability through an invalid contenteditable value", () => {
	const { keyboard, scroll, focus } = fixture(
		'<div contenteditable="true"><span id="edit" tabindex="0" contenteditable="invalid">Text</span></div>',
	);
	focus("#edit");
	keyboard.press("PageDown");
	expect(scroll.get().y).toBe(0);
});

it("does not apply Space scrolling after keypress moves focus to an editor", () => {
	const { tree, keyboard, scroll, events, focus } =
		fixture('<input id="edit">');
	events.addEventListener(tree.root, "keypress", () => focus("#edit"));
	keyboard.press("Space");
	expect(scroll.get().y).toBe(0);
});

it("uses listener-updated dimensions for the native default rather than stale bounds", () => {
	const { tree, keyboard, scroll, events, id } = fixture();
	events.addEventListener(tree.root, "keydown", () => {
		tree.setAttribute(id("main"), "style", "height:600px");
	});
	keyboard.press("End");
	expect(scroll.get().y).toBe(520);
});

it("reads editability after a key listener changes the focused subtree", () => {
	const { tree, keyboard, scroll, events, id, focus } = fixture(
		'<div id="editable" tabindex="0">Text</div>',
	);
	focus("#editable");
	events.addEventListener(tree.root, "keydown", () =>
		tree.setAttribute(id("#editable"), "contenteditable", "true"),
	);
	keyboard.press("PageDown");
	expect(scroll.get().y).toBe(0);
});

it("rejects key actions after document closure", () => {
	const { tree, keyboard } = fixture();
	tree.close();
	expect(() => keyboard.press("PageDown")).toThrow();
});
