import { afterEach, expect, it, vi } from "vitest";
import { controlValue } from "./controls.js";
import { DocumentResources } from "./document-resources.js";
import { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { BrowserInputEvent } from "./input-events.js";
import { documentInteractions } from "./interactions.js";
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
	source = '<div id="editor" contenteditable><p id="left">ab</p><p id="right">cd</p></div>',
) {
	const tree = parseHtmlDocument(
		`${source}<button id="other">Other</button>`,
		"https://fixture.invalid/block-merge",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#editor") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(id()));
	const owner = domRangeOwner(tree);
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	return {
		tree,
		id,
		actions,
		keyboard: actions.keyboard,
		events: actions.events,
		owner,
		selection: owner.selection,
		document: dom.document as Document,
		text: (selector: string) => tree.get(id(selector)).children[0],
		html: () => serializeHtml(tree, id()),
		boundary: (key: string) =>
			owner.selection.collapse(
				id(key === "Backspace" ? "#right" : "#left"),
				key === "Backspace" ? 0 : tree.get(id("#left")).children.length,
			),
	};
}

it.each(["Backspace", "Delete"])(
	"merges paragraphs with %s and places the same live Range at the join",
	(key) => {
		const { keyboard, selection, text, boundary, tree, id, html, document } =
			fixture();
		const originalText = text("#left");
		const suffix = text("#right");
		const right = document.getElementById("right") as Element;
		const rightText = right.firstChild;
		boundary(key);
		const range = selection.getRangeAt(0);
		const pageRange = document.getSelection()?.getRangeAt(0);
		keyboard.press(key);
		expect(html()).toBe('<p id="left">abcd</p>');
		expect(selection.getRangeAt(0)).toBe(range);
		expect(document.getSelection()?.getRangeAt(0)).toBe(pageRange);
		expect(selection.focus).toEqual({ node: originalText, offset: 2 });
		expect(tree.get(id("#left")).children).toEqual([originalText, suffix]);
		expect(right.parentNode).toBe(null);
		expect(right.childNodes.length).toBe(0);
		expect(rightText?.parentNode).toBe(document.getElementById("left"));
		keyboard.type("!");
		expect(html()).toBe('<p id="left">ab!cd</p>');
	},
);

it.each([
	["p", "p"],
	["div", "div"],
	["p", "div"],
	["div", "p"],
])("keeps the left %s when merging a right %s", (leftTag, rightTag) => {
	const { keyboard, boundary, html } = fixture(
		`<div id="editor" contenteditable><${leftTag} id="left" class="first">ab</${leftTag}><${rightTag} id="right" class="second">cd</${rightTag}></div>`,
	);
	boundary("Backspace");
	keyboard.press("Backspace");
	expect(html()).toBe(`<${leftTag} id="left" class="first">abcd</${leftTag}>`);
});

it.each(["Backspace", "Delete"])(
	"preserves styled inline nodes and unaffected siblings during %s",
	(key) => {
		const { keyboard, boundary, html, tree, id, selection } = fixture(
			'<div id="editor" contenteditable><p id="left"><b id="bold" style="color:red">ab</b></p><p id="right"><i id="italic" style="color:blue">cd</i></p><p id="last" contenteditable="false">keep</p></div>',
		);
		const bold = id("#bold");
		const italic = id("#italic");
		const tail = tree.get(id("#last"));
		boundary(key);
		keyboard.press(key);
		expect(tree.get(id("#left")).children).toEqual([bold, italic]);
		expect(tree.get(id("#last"))).toBe(tail);
		expect(selection.focus).toEqual({
			node: tree.get(bold).children[0],
			offset: 2,
		});
		keyboard.type("!");
		expect(html()).toBe(
			'<p id="left"><b id="bold" style="color:red">ab!</b><i id="italic" style="color:blue">cd</i></p><p id="last" contenteditable="false">keep</p>',
		);
	},
);

it.each(["Backspace", "Delete"])(
	"inverts a native paragraph split using %s without flattening wrappers",
	(key) => {
		const { keyboard, selection, text, tree, id, html } = fixture(
			'<div id="editor" contenteditable><b id="bold">abcd</b><i id="keep">tail</i></div>',
		);
		const keep = id("#keep");
		selection.collapse(text("#bold"), 2);
		keyboard.press("Enter");
		const blocks = tree.get(id()).children;
		if (key === "Delete")
			selection.collapse(blocks[0], tree.get(blocks[0]).children.length);
		keyboard.press(key);
		expect(html()).toBe(
			'<div><b id="bold">ab</b><b>cd</b><i id="keep">tail</i></div>',
		);
		expect(tree.get(keep).parent).toBe(blocks[0]);
		keyboard.type("!");
		expect(tree.textContent(id())).toBe("ab!cdtail");
	},
);

it.each([
	["", "cd", "cd"],
	["ab", "", "ab"],
	["", "", ""],
	["<br>", "cd", "cd"],
	["ab", "<br>", "ab"],
	["<br>", "<br>", ""],
	["<b><br></b>", "<i><br></i>", "<b></b><i></i>"],
])(
	"merges empty/placeholder content %j and %j without inventing a newline",
	(left, right, expected) => {
		for (const key of ["Backspace", "Delete"]) {
			const { keyboard, boundary, html, tree, id, selection } = fixture(
				`<div id="editor" contenteditable><p id="left">${left}</p><p id="right">${right}</p></div>`,
			);
			boundary(key);
			keyboard.press(key);
			expect(html()).toBe(`<p id="left">${expected}</p>`);
			expect(selection.isCollapsed).toBe(true);
			keyboard.type("!");
			expect(tree.textContent(id())).toBe(
				left.includes("ab") ? "ab!" : right === "cd" ? "!cd" : "!",
			);
		}
	},
);

it.each([
	["ab<br>", "cd", "ab<br>cd"],
	["ab", "<br>cd", "ab<br>cd"],
	["<br><br>", "cd", "<br><br>cd"],
	['<br id="real">', "cd", '<br id="real">cd'],
	[" \n<br>", "cd", " \n<br>cd"],
])(
	"preserves real breaks and whitespace in %j plus %j",
	(left, right, expected) => {
		const { keyboard, boundary, html } = fixture(
			`<div id="editor" contenteditable><p id="left">${left}</p><p id="right">${right}</p></div>`,
		);
		boundary("Delete");
		keyboard.press("Delete");
		expect(html()).toBe(`<p id="left">${expected}</p>`);
	},
);

it("handles a text boundary with leading/trailing empty inline nodes", () => {
	const { keyboard, selection, text, html, tree, id } = fixture(
		'<div id="editor" contenteditable><p id="left">ab<span id="empty"></span></p><p id="right"><b></b><i id="text">cd</i></p></div>',
	);
	selection.collapse(text("#text"), 0);
	keyboard.press("Backspace");
	expect(selection.focus).toEqual({ node: id("#empty"), offset: 0 });
	keyboard.type("!");
	expect(html()).toBe(
		'<p id="left">ab<span id="empty">!</span><b></b><i id="text">cd</i></p>',
	);
	expect(tree.textContent(id())).toBe("ab!cd");
});

it.each(["Backspace", "Delete"])(
	"leaves ordinary in-block Unicode deletion unchanged for %s",
	(key) => {
		const { keyboard, selection, text, html } = fixture(
			'<div id="editor" contenteditable><p id="left">a😀b</p><p id="right">cd</p></div>',
		);
		selection.collapse(text("#left"), key === "Backspace" ? 3 : 1);
		keyboard.press(key);
		expect(html()).toBe('<p id="left">ab</p><p id="right">cd</p>');
	},
);

it.each(["Backspace", "Delete"])(
	"does not invoke the merge default for a noncollapsed %s selection",
	(key) => {
		const { keyboard, selection, text, html } = fixture();
		selection.setBaseAndExtent(text("#left"), 1, text("#left"), 2);
		keyboard.press(key);
		expect(html()).toBe('<p id="left">a</p><p id="right">cd</p>');
	},
);

it.each(["Backspace", "Delete"])(
	"does nothing at the outer host edge for %s",
	(key) => {
		const { keyboard, selection, id, tree, events, html } = fixture();
		const block = id(key === "Backspace" ? "#left" : "#right");
		selection.collapse(
			block,
			key === "Backspace" ? 0 : tree.get(block).children.length,
		);
		const beforeinput = vi.fn();
		events.addEventListener(id(), "beforeinput", beforeinput);
		expect(keyboard.press(key).canceled).toBe(false);
		expect(beforeinput).not.toHaveBeenCalled();
		expect(html()).toBe('<p id="left">ab</p><p id="right">cd</p>');
	},
);

it.each(["Backspace", "Delete"])(
	"dispatches %s merge events around the mutation with null data and no control change",
	(key) => {
		const { keyboard, boundary, events, id, html, selection, text } = fixture();
		boundary(key);
		const seen: unknown[] = [];
		for (const type of [
			"keydown",
			"keypress",
			"beforeinput",
			"input",
			"keyup",
			"change",
		])
			events.addEventListener(id(), type, (event) => {
				seen.push([
					event.type,
					event instanceof BrowserInputEvent ? event.inputType : null,
					html(),
				]);
				if (event instanceof BrowserInputEvent) {
					expect([
						event.data,
						event.bubbles,
						event.composed,
						event.target,
						event.isComposing,
					]).toEqual([null, true, true, id(), false]);
					expect(event.cancelable).toBe(event.type === "beforeinput");
					if (event.type === "input") {
						expect(selection.focus).toEqual({ node: text("#left"), offset: 2 });
						event.preventDefault();
					}
				}
			});
		expect(keyboard.press(key).canceled).toBe(false);
		const inputType =
			key === "Backspace" ? "deleteContentBackward" : "deleteContentForward";
		expect(seen).toEqual([
			["keydown", null, '<p id="left">ab</p><p id="right">cd</p>'],
			["beforeinput", inputType, '<p id="left">ab</p><p id="right">cd</p>'],
			["input", inputType, '<p id="left">abcd</p>'],
			["keyup", null, '<p id="left">abcd</p>'],
		]);
	},
);

it.each(["keydown", "beforeinput"])(
	"honors %s cancellation without moving nodes or changing the caret",
	(phase) => {
		for (const key of ["Backspace", "Delete"]) {
			const { keyboard, boundary, events, id, tree, selection, html } =
				fixture();
			boundary(key);
			const point = selection.focus;
			const left = tree.get(id("#left"));
			const right = tree.get(id("#right"));
			const input = vi.fn();
			events.addEventListener(id(), "input", input);
			events.addEventListener(id(), phase, (event) => event.preventDefault());
			expect(keyboard.press(key).canceled).toBe(true);
			expect(tree.get(left.id)).toBe(left);
			expect(tree.get(right.id)).toBe(right);
			expect(selection.focus).toEqual(point);
			expect(html()).toBe('<p id="left">ab</p><p id="right">cd</p>');
			expect(input).not.toHaveBeenCalled();
		}
	},
);

it.each([
	"left-text",
	"right-text",
	"selection",
	"range",
	"focus",
	"roundtrip",
	"remove",
	"inert",
])("rejects a stale merge after beforeinput %s changes", (change) => {
	const {
		keyboard,
		boundary,
		events,
		id,
		text,
		tree,
		selection,
		owner,
		actions,
		html,
	} = fixture();
	boundary("Backspace");
	let listenerHtml = "";
	events.addEventListener(id(), "beforeinput", () => {
		if (change === "left-text") tree.setData(text("#left"), "left");
		if (change === "right-text") tree.setData(text("#right"), "right");
		if (change === "selection") selection.collapse(text("#right"), 1);
		if (change === "range") {
			const replacement = owner.createRange();
			replacement.setStart(id("#right"), 0);
			replacement.collapse(true);
			selection.removeAllRanges();
			selection.addRange(replacement);
		}
		if (change === "focus" || change === "roundtrip")
			actions.focus.focus(tree.reference(id("#other")));
		if (change === "roundtrip") actions.focus.focus(tree.reference(id()));
		if (change === "remove") tree.remove(id("#left"));
		if (change === "inert") tree.setAttribute(id("#left"), "inert", "");
		listenerHtml = html();
	});
	const input = vi.fn();
	events.addEventListener(id(), "input", input);
	expect(() => keyboard.press("Backspace")).toThrow();
	expect(html()).toBe(listenerHtml);
	expect(input).not.toHaveBeenCalled();
});

it("uses keydown reselection and retains canceled beforeinput listener changes", () => {
	const { keyboard, boundary, events, selection, text, id, html } = fixture();
	boundary("Backspace");
	events.addEventListener(
		id(),
		"keydown",
		() => selection.collapse(text("#right"), 1),
		{ once: true },
	);
	keyboard.press("Backspace");
	expect(html()).toBe('<p id="left">ab</p><p id="right">d</p>');
	boundary("Backspace");
	events.addEventListener(
		id(),
		"beforeinput",
		(event) => {
			selection.collapse(text("#left"), 1);
			event.preventDefault();
		},
		{ once: true },
	);
	expect(keyboard.press("Backspace").canceled).toBe(true);
	expect(selection.focus).toEqual({ node: text("#left"), offset: 1 });
	expect(html()).toBe('<p id="left">ab</p><p id="right">d</p>');
});

it("retains a nested listener edit and rejects the stale outer merge", () => {
	const { keyboard, boundary, events, id, html } = fixture();
	boundary("Backspace");
	events.addEventListener(id(), "beforeinput", () => keyboard.type("!"), {
		once: true,
	});
	expect(() => keyboard.press("Backspace")).toThrow(
		"changed during beforeinput",
	);
	expect(html()).toBe('<p id="left">ab</p><p id="right">!cd</p>');
});

it.each(["keydown", "beforeinput", "input", "keyup"])(
	"aborts during %s without a late merge or stuck key",
	async (phase) => {
		const { keyboard, boundary, events, id, html } = fixture();
		boundary("Backspace");
		keyboard.down("ShiftLeft");
		const controller = new AbortController();
		events.addEventListener(id(), phase, () => controller.abort(), {
			once: true,
		});
		await expect(
			keyboard.pressAsync("Backspace", controller.signal),
		).rejects.toMatchObject({ code: "aborted" });
		expect(html()).toBe(
			["input", "keyup"].includes(phase)
				? '<p id="left">abcd</p>'
				: '<p id="left">ab</p><p id="right">cd</p>',
		);
		expect(keyboard.modifiers().shift).toBe(true);
		keyboard.up("ShiftLeft");
		expect(events.metrics().activeDispatches).toBe(0);
		keyboard.type("!");
	},
);

it("aborts a pending beforeinput without moving either block", async () => {
	const { keyboard, boundary, events, id, html } = fixture();
	boundary("Delete");
	let enter!: () => void;
	let release!: () => void;
	const entered = new Promise<void>((resolve) => {
		enter = resolve;
	});
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	events.addEventListener(
		id(),
		"beforeinput",
		controlledEventListener(() => {
			enter();
			return pending;
		}),
		{ once: true },
	);
	const controller = new AbortController();
	const result = keyboard.pressAsync("Delete", controller.signal);
	const observed = expect(result).rejects.toMatchObject({ code: "aborted" });
	await entered;
	controller.abort();
	await observed;
	release();
	await Promise.resolve();
	expect(html()).toBe('<p id="left">ab</p><p id="right">cd</p>');
	expect(events.metrics().activeDispatches).toBe(0);
});

it.each(["beforeinput", "input"])(
	"stops on document closure during %s",
	async (phase) => {
		const { keyboard, boundary, events, tree, id } = fixture();
		boundary("Backspace");
		events.addEventListener(id(), phase, () => tree.close(), { once: true });
		await expect(keyboard.pressAsync("Backspace")).rejects.toMatchObject({
			code: "closed",
		});
	},
);

it("rejects pre-aborted merge without changing the selection", async () => {
	const { keyboard, boundary, selection, html } = fixture();
	boundary("Delete");
	const point = selection.focus;
	await expect(
		keyboard.pressAsync("Delete", AbortSignal.abort()),
	).rejects.toMatchObject({ code: "aborted" });
	expect(selection.focus).toEqual(point);
	expect(html()).toBe('<p id="left">ab</p><p id="right">cd</p>');
});

it.each([
	'contenteditable="false"',
	'contenteditable="true"',
	'contenteditable="plaintext-only"',
	"inert",
	"hidden",
	'style="display:none"',
	'style="visibility:hidden"',
])(
	"refuses a protected adjacent block with %s before beforeinput",
	(attributes) => {
		const { keyboard, boundary, events, id, html, tree } = fixture(
			`<div id="editor" contenteditable><p id="left" ${attributes}>ab</p><p id="right">cd</p></div>`,
		);
		boundary("Backspace");
		const before = html();
		const usage = tree.resourceUsage();
		const input = vi.fn();
		events.addEventListener(id(), "beforeinput", input);
		expect(() => keyboard.press("Backspace")).toThrow();
		expect(html()).toBe(before);
		expect(tree.resourceUsage()).toEqual(usage);
		expect(input).not.toHaveBeenCalled();
	},
);

it.each([
	'<span contenteditable="false">protected</span>',
	"<span inert>protected</span>",
	"<span hidden>protected</span>",
	'<input value="protected">',
	'<img alt="protected">',
	"<ul><li>list</li></ul>",
	"<div>nested</div>",
	"<table><tbody><tr><td>cell</td></tr></tbody></table>",
	'<span contenteditable="true">island</span>',
	"<!-- comment -->",
])("does not move unsupported descendants: %s", (content) => {
	for (const key of ["Backspace", "Delete"]) {
		const { keyboard, boundary, html } = fixture(
			`<div id="editor" contenteditable><div id="left">ab</div><div id="right">${content}</div></div>`,
		);
		boundary(key);
		const before = html();
		expect(() => keyboard.press(key)).toThrow();
		expect(html()).toBe(before);
	}
});

it.each([" \n", "<!-- gap -->", "<br>", "<hr>"])(
	"does not skip intervening root content %j",
	(gap) => {
		const { keyboard, boundary, html } = fixture(
			`<div id="editor" contenteditable><p id="left">ab</p>${gap}<p id="right">cd</p></div>`,
		);
		boundary("Backspace");
		const before = html();
		expect(() => keyboard.press("Backspace")).toThrow();
		expect(html()).toBe(before);
	},
);

it("rejects paragraphs nested below an extra non-host block", () => {
	const { keyboard, boundary, html } = fixture(
		'<div id="editor" contenteditable><div><p id="left">ab</p><p id="right">cd</p></div></div>',
	);
	boundary("Backspace");
	expect(() => keyboard.press("Backspace")).toThrow("Paragraph merging");
	expect(html()).toBe('<div><p id="left">ab</p><p id="right">cd</p></div>');
});

it("merges within an independent host inside a false island", () => {
	const { keyboard, boundary, html, tree, id } = fixture(
		'<div contenteditable><div contenteditable="false"><div id="editor" contenteditable><p id="left">ab</p><p id="right">cd</p></div><span id="outside">keep</span></div></div>',
	);
	const outside = tree.get(id("#outside"));
	boundary("Delete");
	keyboard.press("Delete");
	expect(html()).toBe('<p id="left">abcd</p>');
	expect(tree.get(outside.id)).toBe(outside);
});

it("does not remove a block containing the currently focused descendant", () => {
	const { keyboard, boundary, actions, tree, id, html } = fixture(
		'<div id="editor" contenteditable><p id="left">ab</p><p id="right" tabindex="0">cd</p></div>',
	);
	actions.focus.focus(tree.reference(id("#right")));
	boundary("Backspace");
	expect(() => keyboard.press("Backspace")).toThrow("Paragraph merging");
	expect(html()).toBe('<p id="left">ab</p><p id="right" tabindex="0">cd</p>');
	expect(actions.focus.active()).toBe(id("#right"));
});

it("merges at full node/text budget without allocations and retains detached-block accounting", () => {
	const resources = new DocumentResources({
		maxNodes: 6,
		maxTextCodeUnits: 100,
	});
	const tree = new DocumentTree(
		"https://fixture.invalid/budget",
		{ maxNodes: 6, maxTextCodeUnits: 24 },
		resources,
	);
	trees.push(tree);
	const editor = tree.createElement("div", { contenteditable: "" });
	tree.append(tree.root, editor);
	const left = tree.createElement("p");
	const right = tree.createElement("p");
	tree.append(editor, left);
	tree.append(editor, right);
	const first = tree.createText("ab");
	const second = tree.createText("cd");
	tree.append(left, first);
	tree.append(right, second);
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
	const selection = domRangeOwner(tree).selection;
	selection.collapse(second, 0);
	const usage = tree.resourceUsage();
	actions.keyboard.press("Backspace");
	expect(tree.get(left).children).toEqual([first, second]);
	expect(tree.get(right).parent).toBe(null);
	expect(tree.resourceUsage()).toEqual(usage);
	expect(selection.focus).toEqual({ node: first, offset: 2 });
});

it("retains plaintext LF and native textarea deletion", () => {
	for (const source of [
		'<div id="editor" contenteditable="plaintext-only">ab\ncd</div>',
		'<textarea id="editor">ab\ncd</textarea>',
	]) {
		const { keyboard, selection, text, tree, id } = fixture(source);
		if (source.startsWith("<div")) selection.collapse(text("#editor"), 3);
		else {
			keyboard.press("Control+a");
			keyboard.press("ArrowLeft");
			keyboard.press("ArrowRight");
			keyboard.press("ArrowRight");
			keyboard.press("ArrowRight");
		}
		keyboard.press("Backspace");
		expect(
			source.startsWith("<div")
				? tree.textContent(id())
				: controlValue(tree, id()),
		).toBe("abcd");
	}
});

it.each(["Backspace", "Delete"])(
	"deletes only the edge character inside a block for %s",
	(key) => {
		const { keyboard, selection, text, html } = fixture();
		selection.collapse(text(key === "Backspace" ? "#right" : "#left"), 1);
		keyboard.press(key);
		expect(html()).toBe(
			key === "Backspace"
				? '<p id="left">ab</p><p id="right">d</p>'
				: '<p id="left">a</p><p id="right">cd</p>',
		);
	},
);

it("revalidates adjacent visibility after an external stylesheet mutation", () => {
	const { keyboard, boundary, events, tree, id, text, html } = fixture(
		'<style id="sheet">p { color: red; }</style><div id="editor" contenteditable><p id="left">ab</p><p id="right">cd</p></div>',
	);
	boundary("Backspace");
	events.addEventListener(
		id(),
		"beforeinput",
		() => tree.setData(text("#sheet"), "#left { display: none; }"),
		{ once: true },
	);
	expect(() => keyboard.press("Backspace")).toThrow();
	expect(html()).toBe('<p id="left">ab</p><p id="right">cd</p>');
});

it("uses a page-selected caret while other live ranges follow native node moves", () => {
	const { keyboard, document, owner, tree, id, text, selection } = fixture();
	const leftText = text("#left");
	const rightText = text("#right");
	const leftObserver = owner.createRange();
	leftObserver.setStart(leftText, 1);
	leftObserver.collapse(true);
	const rightObserver = owner.createRange();
	rightObserver.setStart(rightText, 1);
	rightObserver.collapse(true);
	const selected = document.createRange();
	selected.setStart(document.getElementById("right")?.firstChild as Node, 0);
	selected.collapse(true);
	document.getSelection()?.addRange(selected);
	keyboard.press("Backspace");
	expect(document.getSelection()?.getRangeAt(0)).toBe(selected);
	expect(leftObserver.start).toEqual({ node: leftText, offset: 1 });
	expect(rightObserver.start).toEqual({ node: id(), offset: 1 });
	expect(tree.get(rightText).parent).toBe(id("#left"));
	expect(selection.focus).toEqual({ node: leftText, offset: 2 });
});

it("merges inside a nested explicit scope but never crosses its edge", () => {
	const { keyboard, boundary, selection, tree, id, html, events } = fixture(
		'<div id="editor" contenteditable><p id="outside">keep</p><div id="inner" contenteditable="true"><p id="left">ab</p><p id="right">cd</p></div></div>',
	);
	const outside = tree.get(id("#outside"));
	boundary("Backspace");
	keyboard.press("Backspace");
	expect(html()).toBe(
		'<p id="outside">keep</p><div id="inner" contenteditable="true"><p id="left">abcd</p></div>',
	);
	selection.collapse(id("#left"), 0);
	const beforeinput = vi.fn();
	events.addEventListener(id(), "beforeinput", beforeinput);
	keyboard.press("Backspace");
	expect(tree.get(outside.id)).toBe(outside);
	expect(beforeinput).not.toHaveBeenCalled();
});

it("rejects script-created paragraph merging in a plaintext-only scope", () => {
	const { keyboard, boundary, html } = fixture(
		'<div id="editor" contenteditable="plaintext-only"><p id="left">ab</p><p id="right">cd</p></div>',
	);
	boundary("Backspace");
	expect(() => keyboard.press("Backspace")).toThrow("Paragraph merging");
	expect(html()).toBe('<p id="left">ab</p><p id="right">cd</p>');
});

it("does not infer a merge from a caret between root-level paragraphs", () => {
	const { keyboard, selection, id, html } = fixture();
	selection.collapse(id(), 1);
	expect(() => keyboard.press("Backspace")).toThrow();
	expect(html()).toBe('<p id="left">ab</p><p id="right">cd</p>');
});

it("rejects an oversized editing scan before removing either block", () => {
	const tree = new DocumentTree("https://fixture.invalid/merge-scan");
	trees.push(tree);
	const editor = tree.createElement("div", { contenteditable: "" });
	tree.append(tree.root, editor);
	const left = tree.createElement("p");
	const right = tree.createElement("p");
	tree.append(editor, left);
	tree.append(editor, right);
	for (let index = 0; index < 4094; index++)
		tree.append(left, tree.createText(""));
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
	domRangeOwner(tree).selection.collapse(right, 0);
	expect(() => actions.keyboard.press("Backspace")).toThrow("node limit");
	expect(tree.get(editor).children).toEqual([left, right]);
});
