import { afterEach, expect, it, vi } from "vitest";
import { controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserInputEvent } from "./input-events.js";
import { documentInteractions } from "./interactions.js";
import { BrowserKeyboardEvent } from "./keyboard.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function hostObject(definition: ScriptHostObjectDefinition): object {
	const object = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(object, name, {
			get: property.get,
			set: property.set,
		});
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(object, name, { value: method });
	return object;
}

function fixture(
	source = '<div id="editor" contenteditable><b id="bold">hello</b><i id="italic">world</i></div>',
) {
	const tree = parseHtmlDocument(
		`${source}<button id="other">Other</button>`,
		"https://fixture.invalid/editable-keyboard",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const ref = (selector = "#editor") => tree.reference(id(selector));
	const actions = documentInteractions(tree);
	actions.focus.focus(ref());
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	const document = dom.document as Document;
	const owner = domRangeOwner(tree);
	const selection = owner.selection;
	const text = (selector: string) => tree.get(id(selector)).children[0];
	const value = () => tree.textContent(id("#editor"));
	return {
		tree,
		id,
		ref,
		actions,
		keyboard: actions.keyboard,
		events: actions.events,
		dom,
		document,
		owner,
		selection,
		text,
		value,
	};
}

it("puts the shared caret at fill completion before input and appends typed text", () => {
	const { actions, keyboard, ref, value, selection, events, id, tree } =
		fixture();
	const seen: unknown[] = [];
	events.addEventListener(id("#editor"), "input", () =>
		seen.push([value(), selection.focus]),
	);
	actions.fill(ref(), "new");
	const node = tree.get(id("#editor")).children[0];
	expect(selection.focus).toEqual({ node, offset: 3 });
	keyboard.type(" 😀+");
	expect(value()).toBe("new 😀+");
	expect(selection.focus).toEqual({ node, offset: 7 });
	expect(seen[0]).toEqual(["new", { node, offset: 3 }]);
	expect(tree.get(id("#editor")).children).toEqual([node]);
});

it("fills and types into an inherited target without changing surrounding rich content", () => {
	const { actions, keyboard, ref, id, tree, value, selection, text } =
		fixture();
	const sibling = tree.get(id("#italic"));
	actions.fill(ref("#bold"), "A");
	keyboard.type("B");
	expect(value()).toBe("ABworld");
	expect(tree.get(id("#italic"))).toBe(sibling);
	expect(selection.focus).toEqual({ node: text("#bold"), offset: 2 });
});

it("edits a page-selected range across native text nodes and preserves partial wrappers", () => {
	const { document, keyboard, value, id, tree, selection, text } = fixture();
	const bold = document.getElementById("bold") as Element;
	const italic = document.getElementById("italic") as Element;
	const range = document.createRange();
	range.setStart(bold.firstChild as Text, 2);
	range.setEnd(italic.firstChild as Text, 3);
	document.getSelection()?.addRange(range);
	keyboard.type("Q");
	expect(value()).toBe("heQld");
	expect(document.getElementById("bold")).toBe(bold);
	expect(document.getElementById("italic")).toBe(italic);
	expect(tree.get(id("#editor")).children).toEqual([
		id("#bold"),
		id("#italic"),
	]);
	expect(selection.focus).toEqual({ node: text("#bold"), offset: 3 });
	expect(range.collapsed).toBe(true);
	expect(document.getSelection()?.getRangeAt(0)).toBe(range);
});

it("inserts at empty and explicit container boundaries without replacing neighboring nodes", () => {
	const empty = fixture('<div id="editor" contenteditable></div>');
	empty.keyboard.type("abc");
	expect(empty.value()).toBe("abc");
	expect(empty.tree.get(empty.id("#editor")).children).toHaveLength(1);
	const rich = fixture();
	const original = [...rich.tree.get(rich.id("#editor")).children];
	rich.selection.collapse(rich.id("#editor"), 1);
	rich.keyboard.type("!");
	expect(rich.value()).toBe("hello!world");
	expect(rich.tree.get(rich.id("#editor")).children[0]).toBe(original[0]);
	expect(rich.tree.get(rich.id("#editor")).children[2]).toBe(original[1]);
});

it.each(["Backspace", "Delete"])(
	"deletes across adjacent rich text nodes with %s",
	(key) => {
		const { keyboard, selection, text, value, tree, id } = fixture();
		selection.collapse(
			text(key === "Backspace" ? "#italic" : "#bold"),
			key === "Backspace" ? 0 : 5,
		);
		keyboard.press(key);
		expect(value()).toBe(key === "Backspace" ? "hellworld" : "helloorld");
		expect(tree.get(id("#editor")).children).toEqual([
			id("#bold"),
			id("#italic"),
		]);
	},
);

it.each(["Backspace", "Delete"])(
	"deletes a backwards DOM selection with %s",
	(key) => {
		const { keyboard, selection, text, value } = fixture();
		selection.setBaseAndExtent(text("#italic"), 3, text("#bold"), 2);
		keyboard.press(key);
		expect(value()).toBe("held");
		expect(selection.isCollapsed).toBe(true);
		expect(selection.focus).toEqual({ node: text("#bold"), offset: 2 });
	},
);

it("uses Unicode scalar stepping for text insertion, deletion and shift selection", () => {
	const { actions, keyboard, selection, ref, value } = fixture();
	actions.fill(ref(), "a😀b");
	keyboard.press("ArrowLeft");
	expect(selection.focusOffset).toBe(3);
	keyboard.press("Shift+ArrowLeft");
	expect(selection.toString()).toBe("😀");
	expect(selection.anchorOffset).toBe(3);
	expect(selection.focusOffset).toBe(1);
	keyboard.press("Delete");
	expect(value()).toBe("ab");
	keyboard.press("Home");
	keyboard.press("Delete");
	expect(value()).toBe("b");
	keyboard.press("End");
	keyboard.press("Backspace");
	expect(value()).toBe("");
});

it("extends across text nodes and collapses nonempty selections without an extra step", () => {
	const { keyboard, selection, text, events, id } = fixture();
	const input = vi.fn();
	events.addEventListener(id("#editor"), "beforeinput", input);
	selection.collapse(text("#bold"), 4);
	keyboard.press("Shift+ArrowRight");
	keyboard.press("Shift+ArrowRight");
	expect(selection.toString()).toBe("ow");
	expect(selection.anchor).toEqual({ node: text("#bold"), offset: 4 });
	keyboard.press("ArrowLeft");
	expect(selection.focus).toEqual({ node: text("#bold"), offset: 4 });
	keyboard.press("Shift+End");
	expect(selection.toString()).toBe("oworld");
	expect(input).not.toHaveBeenCalled();
});

it("uses hard newlines and HTML block boundaries for Home/End without geometry", () => {
	const { keyboard, selection, text } = fixture(
		'<div id="editor" contenteditable><p id="line">\none\ntwo</p><p id="last">last</p></div>',
	);
	selection.collapse(text("#line"), 0);
	keyboard.press("Home");
	expect(selection.focusOffset).toBe(0);
	selection.collapse(text("#line"), 6);
	keyboard.press("Home");
	expect(selection.focusOffset).toBe(5);
	keyboard.press("End");
	expect(selection.focusNode).toBe(text("#line"));
	expect(selection.focusOffset).toBe(8);
	selection.collapse(text("#last"), 2);
	keyboard.press("Home");
	expect(selection.focus).toEqual({ node: text("#last"), offset: 0 });
});

it("removes an explicit line break but rejects implicit paragraph merging", () => {
	const line = fixture(
		'<div id="editor" contenteditable><span id="left">a</span><br><span id="right">b</span></div>',
	);
	line.selection.collapse(line.text("#right"), 0);
	line.keyboard.press("Backspace");
	expect(line.tree.get(line.id("#editor")).children).toHaveLength(2);
	expect(line.value()).toBe("ab");
	const blocks = fixture(
		'<div id="editor" contenteditable><p id="left">a</p><p id="right">b</p></div>',
	);
	blocks.selection.collapse(blocks.text("#right"), 0);
	expect(() => blocks.keyboard.press("Backspace")).toThrow("paragraph merging");
	expect(blocks.value()).toBe("ab");
});

it.each([
	'<span contenteditable="false">protected</span>',
	'<input value="protected">',
	"<span inert>protected</span>",
	"<span hidden>protected</span>",
	'<span style="display:none">protected</span>',
	"<template>protected</template>",
	'<img alt="protected">',
])("rejects selected edits over protected content: %s", (protectedHtml) => {
	const { keyboard, selection, id, tree, value, events } = fixture(
		`<div id="editor" contenteditable><b>A</b>${protectedHtml}<i>B</i></div>`,
	);
	selection.selectAllChildren(id("#editor"));
	const original = [...tree.walk(id("#editor"))].map(({ node }) => node);
	const previous = value();
	const beforeinput = vi.fn();
	events.addEventListener(id("#editor"), "beforeinput", beforeinput);
	expect(() => keyboard.type("unsafe")).toThrow("protected");
	expect(value()).toBe(previous);
	for (const node of original) expect(tree.get(node.id)).toBe(node);
	expect(beforeinput).not.toHaveBeenCalled();
});

it("rejects deletion across a noneditable island while allowing insertion beside it", () => {
	const { keyboard, selection, id, tree, value } = fixture(
		'<div id="editor" contenteditable>a<span id="island" contenteditable="false">LOCK</span>b</div>',
	);
	selection.collapse(id("#editor"), 2);
	expect(() => keyboard.press("Backspace")).toThrow("protected");
	keyboard.type("!");
	expect(value()).toBe("aLOCK!b");
	expect(tree.textContent(id("#island"))).toBe("LOCK");
});

it("rejects foreign-host and protected-descendant selections instead of relocating them", () => {
	const { keyboard, selection, text, value } = fixture(
		'<div id="editor" contenteditable><span id="locked" contenteditable="false">LOCK</span></div><div contenteditable id="elsewhere">other</div>',
	);
	selection.collapse(text("#locked"), 1);
	expect(() => keyboard.type("x")).toThrow("protected");
	selection.collapse(text("#elsewhere"), 1);
	expect(() => keyboard.type("x")).toThrow("outside");
	expect(value()).toBe("LOCK");
});

it("rejects a page boundary inside a surrogate pair without changing the text", () => {
	const { actions, keyboard, selection, ref, value } = fixture();
	actions.fill(ref(), "😀");
	selection.collapse(selection.focusNode, 1);
	expect(() => keyboard.type("x")).toThrow("Unicode scalar");
	expect(value()).toBe("😀");
});

it.each(["keydown", "keypress", "beforeinput"])(
	"cancels at %s and releases the key without editing",
	(phase) => {
		const { actions, keyboard, events, ref, id, value, selection } = fixture();
		actions.fill(ref(), "old");
		const anchor = selection.anchor;
		const seen: string[] = [];
		for (const type of ["keydown", "keypress", "beforeinput", "input", "keyup"])
			events.addEventListener(id("#editor"), type, (event) => {
				seen.push(type);
				if (type === phase) event.preventDefault();
			});
		expect(keyboard.type("x").canceled).toBe(true);
		expect(value()).toBe("old");
		expect(selection.anchor).toEqual(anchor);
		expect(seen.at(-1)).toBe("keyup");
		expect(seen).not.toContain("input");
	},
);

it("dispatches input at the editing host with no control change or validity state", () => {
	const { keyboard, events, id, text, selection, tree, actions } = fixture();
	selection.collapse(text("#bold"), 2);
	const seen: unknown[] = [];
	for (const type of ["beforeinput", "input", "change"])
		events.addEventListener(tree.root, type, (event) => {
			if (event instanceof BrowserInputEvent)
				seen.push([
					type,
					event.target,
					event.data,
					event.inputType,
					event.cancelable,
					event.isComposing,
					selection.focusOffset,
				]);
			else seen.push([type]);
		});
	keyboard.type("x");
	keyboard.press("Backspace");
	actions.focus.focus(null);
	expect(seen).toEqual([
		["beforeinput", id("#editor"), "x", "insertText", true, false, 2],
		["input", id("#editor"), "x", "insertText", false, false, 3],
		[
			"beforeinput",
			id("#editor"),
			null,
			"deleteContentBackward",
			true,
			false,
			3,
		],
		["input", id("#editor"), null, "deleteContentBackward", false, false, 2],
	]);
	expect(tree.get(id("#editor")).control).toEqual({});
	expect(tree.wasUserEditedValue(id("#editor"))).toBe(false);
});

it.each([
	"text",
	"remove",
	"inert",
	"hidden",
	"readonly",
	"selection",
	"focus",
	"roundtrip",
])("revalidates %s changes made during beforeinput", (change) => {
	const { keyboard, events, id, text, selection, tree, actions, ref, value } =
		fixture();
	selection.collapse(text("#bold"), 2);
	const input = vi.fn();
	events.addEventListener(id("#editor"), "input", input);
	events.addEventListener(id("#editor"), "beforeinput", () => {
		if (change === "text") tree.setData(text("#bold"), "listener");
		if (change === "remove") tree.remove(id("#italic"));
		if (change === "inert" || change === "hidden")
			tree.setAttribute(id("#editor"), change, "");
		if (change === "readonly")
			tree.setAttribute(id("#editor"), "contenteditable", "false");
		if (change === "selection") selection.collapse(text("#italic"), 1);
		if (change === "focus" || change === "roundtrip")
			actions.focus.focus(ref("#other"));
		if (change === "roundtrip") actions.focus.focus(ref());
	});
	expect(() => keyboard.type("X")).toThrow();
	expect(value()).not.toContain("X");
	expect(input).not.toHaveBeenCalled();
});

it("honors page selection changes in keydown and subsequent input handlers", () => {
	const { keyboard, events, id, text, selection, value } = fixture();
	selection.collapse(text("#bold"), 5);
	events.addEventListener(
		id("#editor"),
		"keydown",
		() => selection.collapse(text("#bold"), 0),
		{ once: true },
	);
	events.addEventListener(
		id("#editor"),
		"input",
		() => selection.collapse(text("#italic"), 0),
		{ once: true },
	);
	keyboard.type("AB");
	expect(value()).toBe("AhelloBworld");
});

it("types multiple characters after clearing an explicit focus-indication override", () => {
	const { actions, keyboard, tree, id, value } = fixture();
	actions.focus.focusElement(id("#editor"), {
		preventScroll: true,
		focusVisible: false,
	});
	expect(tree.focusIndicated).toBe(false);
	expect(keyboard.type("AB").characters).toBe(2);
	expect(value()).toBe("helloworldAB");
	expect(tree.focusIndicated).toBe(true);
});

it.each(["input", "keyup"])(
	"stops remaining characters after a %s focus round trip without rolling back the first edit",
	(phase) => {
		const { keyboard, events, id, actions, ref, value } = fixture();
		events.addEventListener(
			id("#editor"),
			phase,
			() => {
				actions.focus.focus(ref("#other"));
				actions.focus.focus(ref());
			},
			{ once: true },
		);
		expect(() => keyboard.type("AB")).toThrow("Focus changed");
		expect(value()).toBe("helloworldA");
		expect(keyboard.modifiers()).toMatchObject({
			shift: false,
			control: false,
			alt: false,
			meta: false,
		});
		expect(events.metrics().activeDispatches).toBe(0);
	},
);

it("rejects focus round trips during keydown and does not scroll or insert", () => {
	const { keyboard, events, id, actions, ref, value } = fixture();
	events.addEventListener(
		id("#editor"),
		"keydown",
		() => {
			actions.focus.focus(ref("#other"));
			actions.focus.focus(ref());
		},
		{ once: true },
	);
	expect(() => keyboard.type("x")).toThrow("Focus changed");
	expect(value()).toBe("helloworld");
});

it.each(["keydown", "keypress", "beforeinput", "input", "keyup"])(
	"aborts async typing during %s without late writes or stuck modifiers",
	async (phase) => {
		const { keyboard, events, id, actions, ref, value } = fixture();
		actions.fill(ref(), "");
		keyboard.down("ShiftLeft");
		const controller = new AbortController();
		events.addEventListener(id("#editor"), phase, () => controller.abort(), {
			once: true,
		});
		await expect(
			keyboard.typeAsync("ab", controller.signal),
		).rejects.toMatchObject({ code: "aborted" });
		expect(value()).toBe(["input", "keyup"].includes(phase) ? "a" : "");
		expect(keyboard.modifiers().shift).toBe(true);
		expect(events.metrics().activeDispatches).toBe(0);
		keyboard.up("ShiftLeft");
		const repeated: boolean[] = [];
		events.addEventListener(id("#editor"), "keydown", (event) => {
			if (event instanceof BrowserKeyboardEvent) repeated.push(event.repeat);
		});
		keyboard.press("b");
		expect(repeated).toEqual([false]);
	},
);

it("aborts a pending asynchronous beforeinput listener without a later default", async () => {
	const { keyboard, events, id, actions, ref, value } = fixture();
	actions.fill(ref(), "");
	let enter!: () => void;
	let release!: () => void;
	const entered = new Promise<void>((resolve) => {
		enter = resolve;
	});
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	events.addEventListener(
		id("#editor"),
		"beforeinput",
		controlledEventListener(() => {
			enter();
			return pending;
		}),
		{ once: true },
	);
	const controller = new AbortController();
	const result = keyboard.typeAsync("x", controller.signal);
	const observed = expect(result).rejects.toMatchObject({ code: "aborted" });
	await entered;
	controller.abort();
	await observed;
	expect(value()).toBe("");
	release();
	await Promise.resolve();
	expect(value()).toBe("");
	expect(events.metrics().activeDispatches).toBe(0);
});

it("rejects pre-aborted and closed-document actions", async () => {
	const { keyboard, tree, value } = fixture();
	await expect(
		keyboard.typeAsync("x", AbortSignal.abort()),
	).rejects.toMatchObject({ code: "aborted" });
	expect(value()).toBe("helloworld");
	tree.close();
	expect(() => keyboard.type("x")).toThrow("closed");
	await expect(keyboard.pressAsync("Backspace")).rejects.toMatchObject({
		code: "closed",
	});
});

it("retains native input and textarea caret, validity and change semantics", () => {
	const { actions, keyboard, ref, tree, id } = fixture(
		'<div id="editor" contenteditable></div><input id="input" maxlength="4" required><textarea id="area"></textarea>',
	);
	for (const selector of ["#input", "#area"]) {
		actions.fill(ref(selector), "ab");
		keyboard.press("ArrowLeft");
		keyboard.type("X");
		expect(controlValue(tree, id(selector))).toBe("aXb");
		keyboard.press("Control+a");
		keyboard.type("z");
		expect(controlValue(tree, id(selector))).toBe("z");
		expect(tree.wasUserEditedValue(id(selector))).toBe(true);
	}
});

it("supports select-all shortcuts but explicitly rejects paragraph insertion", () => {
	const { keyboard, selection, value } = fixture();
	keyboard.press("Control+a");
	expect(selection.toString()).toBe("helloworld");
	keyboard.type("replacement");
	expect(value()).toBe("replacement");
	expect(() => keyboard.press("Enter")).toThrow("paragraph insertion");
	expect(value()).toBe("replacement");
});

it("types the maximum character batch without allocating a range per character", () => {
	const { actions, keyboard, ref, value } = fixture(
		'<div id="editor" contenteditable></div>',
	);
	actions.fill(ref(), "");
	const text = "a".repeat(4096);
	expect(keyboard.type(text).characters).toBe(4096);
	expect(value()).toBe(text);
});

it("checks node budgets before deleting selected content", () => {
	const tree = new DocumentTree("https://fixture.invalid/budget", {
		maxNodes: 3,
	});
	trees.push(tree);
	const editor = tree.createElement("div", { contenteditable: "" });
	tree.append(tree.root, editor);
	const text = tree.createText("old");
	tree.append(editor, text);
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
	const selection = domRangeOwner(tree).selection;
	selection.selectAllChildren(editor);
	expect(() => actions.keyboard.type("x")).toThrow("node limit");
	expect(tree.textContent(editor)).toBe("old");
	expect(tree.get(editor).children).toEqual([text]);
	selection.collapse(text, 3);
	actions.keyboard.type("!");
	expect(tree.textContent(editor)).toBe("old!");
});

it("refuses navigation and edits over the bounded editor text scan", () => {
	const { actions, keyboard, ref, value } = fixture();
	actions.fill(ref(), "a".repeat(65_537));
	expect(() => keyboard.press("Home")).toThrow("navigation limit");
	expect(() => keyboard.type("x")).toThrow("navigation limit");
	expect(value()).toHaveLength(65_537);
});

it("preserves detached references to wholly replaced rich nodes", () => {
	const { document, keyboard, value } = fixture();
	const bold = document.getElementById("bold") as Element;
	const text = bold.firstChild as Text;
	const range = document.createRange();
	range.selectNode(bold);
	document.getSelection()?.addRange(range);
	keyboard.type("new");
	expect(value()).toBe("newworld");
	expect(bold.parentNode).toBe(null);
	expect(bold.firstChild).toBe(text);
	expect(text.data).toBe("hello");
	expect(text.ownerDocument).toBe(document);
});

it("supports editing after page splitText through the delivered shared Range owner", () => {
	const { document, keyboard, value } = fixture();
	const text = document.getElementById("bold")?.firstChild as Text;
	const range = document.createRange();
	range.setStart(text, 4);
	range.collapse(true);
	document.getSelection()?.addRange(range);
	const suffix = text.splitText(2);
	expect(range.startContainer).toBe(suffix);
	keyboard.type("!");
	expect(value()).toBe("hell!oworld");
});

it("ignores cancellation of noncancelable input without undoing committed text", () => {
	const { keyboard, events, id, actions, ref, value } = fixture();
	actions.fill(ref(), "");
	events.addEventListener(id("#editor"), "input", (event) =>
		event.preventDefault(),
	);
	expect(keyboard.type("x").canceled).toBe(false);
	expect(value()).toBe("x");
});

it("accepts safely established editability during keydown", () => {
	const { keyboard, events, id, tree, value } = fixture(
		'<div id="editor" tabindex="0">old</div>',
	);
	events.addEventListener(
		id("#editor"),
		"keydown",
		() => tree.setAttribute(id("#editor"), "contenteditable", "true"),
		{ once: true },
	);
	keyboard.press("x");
	expect(value()).toBe("oldx");
});

it.each(["beforeinput", "input"])(
	"stops after document closure in %s",
	async (phase) => {
		const { keyboard, events, tree, id, actions, ref } = fixture();
		actions.fill(ref(), "");
		events.addEventListener(id("#editor"), phase, () => tree.close(), {
			once: true,
		});
		await expect(keyboard.typeAsync("ab")).rejects.toMatchObject({
			code: "closed",
		});
		expect(events.metrics().closed).toBe(true);
	},
);

it("keeps a new page selection after beforeinput cancellation", () => {
	const { keyboard, events, id, text, selection, value } = fixture();
	selection.collapse(text("#bold"), 1);
	events.addEventListener(id("#editor"), "beforeinput", (event) => {
		selection.setBaseAndExtent(text("#italic"), 1, text("#italic"), 4);
		event.preventDefault();
	});
	expect(keyboard.type("x").canceled).toBe(true);
	expect(selection.toString()).toBe("orl");
	expect(value()).toBe("helloworld");
});

it("keeps existing editable fill support for a contenteditable button", () => {
	const { actions, ref, value, selection } = fixture(
		'<button id="editor" contenteditable>old</button>',
	);
	actions.fill(ref(), "new");
	expect(value()).toBe("new");
	expect(selection.focusOffset).toBe(3);
});

it("deletes at editor boundaries without spurious input events", () => {
	const { keyboard, events, selection, text, id, value } = fixture();
	const input = vi.fn();
	events.addEventListener(id("#editor"), "input", input);
	selection.collapse(text("#bold"), 0);
	keyboard.press("Backspace");
	selection.collapse(text("#italic"), 5);
	keyboard.press("Delete");
	expect(input).not.toHaveBeenCalled();
	expect(value()).toBe("helloworld");
});

it("rejects a stale detached page range instead of appending elsewhere", () => {
	const { keyboard, selection, owner, tree, value } = fixture();
	const range = owner.createRange();
	range.selectNodeContents(tree.root);
	selection.addRange(range);
	const detached = tree.createText("detached");
	range.selectNodeContents(detached);
	expect(() => keyboard.type("x")).toThrow("detached");
	expect(value()).toBe("helloworld");
});

it("rejects text-budget exhaustion before changing selected content", () => {
	const tree = new DocumentTree("https://fixture.invalid/text-budget", {
		maxTextCodeUnits: 40,
	});
	trees.push(tree);
	const editor = tree.createElement("div", { contenteditable: "" });
	tree.append(tree.root, editor);
	const available =
		tree.limits.maxTextCodeUnits - tree.resourceUsage().textCodeUnits;
	const text = tree.createText("a".repeat(available));
	tree.append(editor, text);
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
	const selection = domRangeOwner(tree).selection;
	selection.collapse(text, available);
	expect(() => actions.keyboard.type("x")).toThrow("text limit");
	expect(tree.textContent(editor)).toBe("a".repeat(available));
	selection.selectAllChildren(editor);
	expect(() => actions.keyboard.type("x")).toThrow("text limit");
	expect(tree.get(editor).children).toEqual([text]);
});

it("bounds subtree scanning before creating or modifying selection", () => {
	const { tree, id, keyboard, selection } = fixture(
		'<div id="editor" contenteditable></div>',
	);
	const editor = id("#editor");
	for (let index = 0; index < 4096; index++)
		tree.append(editor, tree.createElement("span"));
	expect(() => keyboard.type("x")).toThrow("subtree node limit");
	expect(selection.rangeCount).toBe(0);
	expect(tree.get(editor).children).toHaveLength(4096);
});

it.each(["text", "container"])(
	"credits only released partial text when replacing from a %s boundary at the text budget",
	(boundary) => {
		const tree = new DocumentTree(
			"https://fixture.invalid/replacement-budget",
			{
				maxTextCodeUnits: 40,
			},
		);
		trees.push(tree);
		const editor = tree.createElement("div", { contenteditable: "" });
		tree.append(tree.root, editor);
		const first = tree.createText("left");
		tree.append(editor, first);
		const available =
			tree.limits.maxTextCodeUnits - tree.resourceUsage().textCodeUnits;
		const last = tree.createText("z".repeat(available));
		tree.append(editor, last);
		const actions = documentInteractions(tree);
		actions.focus.focus(tree.reference(editor));
		const selection = domRangeOwner(tree).selection;
		selection.setBaseAndExtent(
			boundary === "text" ? first : editor,
			boundary === "text" ? 2 : 0,
			last,
			2,
		);
		actions.keyboard.type("X");
		expect(tree.textContent(editor)).toBe(
			(boundary === "text" ? "leX" : "X") + "z".repeat(available - 2),
		);
		expect(tree.resourceUsage().textCodeUnits).toBe(
			boundary === "text" ? 37 : 39,
		);
		if (boundary === "container") {
			expect(tree.get(first).parent).toBe(null);
			expect(tree.get(first).data).toBe("left");
		}
	},
);
