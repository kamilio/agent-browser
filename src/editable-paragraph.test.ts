import { afterEach, expect, it, vi } from "vitest";
import { controlValue } from "./controls.js";
import { DocumentResources } from "./document-resources.js";
import { type DocumentLimits, DocumentTree } from "./document.js";
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

function fixture(source = '<div id="editor" contenteditable>abcd</div>') {
	const tree = parseHtmlDocument(
		`${source}<button id="other">Other</button>`,
		"https://fixture.invalid/editable-paragraph",
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
		selection: owner.selection,
		owner,
		document: dom.document as Document,
		text: (selector = "#editor") => tree.get(id(selector)).children[0],
		html: () => serializeHtml(tree, id()),
	};
}

it.each(["Enter", "Shift+Enter"])(
	"inserts a plaintext LF for %s with live selection and null event data",
	(key) => {
		const { keyboard, selection, text, html, events, id } = fixture(
			'<div id="editor" contenteditable="plaintext-only">a😀z</div>',
		);
		selection.setBaseAndExtent(text(), 3, text(), 1);
		const range = selection.getRangeAt(0);
		const seen: unknown[] = [];
		for (const type of ["beforeinput", "input"])
			events.addEventListener(id(), type, (event) => {
				if (event instanceof BrowserInputEvent)
					seen.push([
						event.type,
						event.inputType,
						event.data,
						event.cancelable,
						event.bubbles,
						event.composed,
						event.target,
						event.isComposing,
					]);
			});
		keyboard.press(key);
		expect(html()).toBe("a\nz");
		expect(selection.getRangeAt(0)).toBe(range);
		expect(selection.focus).toEqual({ node: text(), offset: 2 });
		expect(seen).toEqual([
			["beforeinput", "insertLineBreak", null, true, true, true, id(), false],
			["input", "insertLineBreak", null, false, true, true, id(), false],
		]);
		keyboard.type("!");
		expect(html()).toBe("a\n!z");
	},
);

it("inserts plaintext into an empty host and respects an inherited plaintext scope", () => {
	const { keyboard, selection, id, tree, html } = fixture(
		'<div id="editor" contenteditable="plaintext-only"><span id="child"></span></div>',
	);
	selection.collapse(id("#child"), 0);
	keyboard.press("Enter");
	keyboard.type("x");
	expect(html()).toBe('<span id="child">\nx</span>');
	expect(tree.get(id()).children).toEqual([id("#child")]);
});

it.each([
	[0, "<div></div><div>abcd</div>"],
	[2, "<div>ab</div><div>cd</div>"],
	[4, "<div>abcd</div><div></div>"],
])(
	"splits a root div at text offset %i without leaving its host",
	(offset, expected) => {
		const { keyboard, selection, text, html, id, tree } = fixture();
		const original = text();
		selection.collapse(original, offset as number);
		const range = selection.getRangeAt(0);
		keyboard.press("Enter");
		expect(html()).toBe(expected);
		expect(selection.getRangeAt(0)).toBe(range);
		expect(tree.get(id()).parent).not.toBe(null);
		expect(tree.get(original).data).toBe(
			offset === 0 ? "abcd" : "abcd".slice(0, offset as number),
		);
		keyboard.type("!");
		expect(tree.textContent(id())).toBe(
			`${"abcd".slice(0, offset as number)}!${"abcd".slice(offset as number)}`,
		);
	},
);

it("creates repeatable empty paragraphs without inventing placeholder breaks", () => {
	const { keyboard, html, selection, tree, id } = fixture(
		'<div id="editor" contenteditable></div>',
	);
	keyboard.press("Enter");
	expect(html()).toBe("<div></div><div></div>");
	keyboard.press("Enter");
	expect(html()).toBe("<div></div><div></div><div></div>");
	expect(selection.focus).toEqual({
		node: tree.get(id()).children[2],
		offset: 0,
	});
	keyboard.type("last");
	expect(html()).toBe("<div></div><div></div><div>last</div>");
});

it("splits a direct paragraph with formatting, preserving unaffected nodes and unique ids", () => {
	const { document, keyboard, id, tree, html, selection } = fixture(
		'<div id="editor" contenteditable><p id="first" class="note"><b id="bold" data-x="yes">hello</b><i id="tail">world</i></p><p id="last" contenteditable="false">keep</p></div>',
	);
	const paragraph = document.getElementById("first") as Element;
	const bold = document.getElementById("bold") as Element;
	const originalText = bold.firstChild as Text;
	const tail = document.getElementById("tail") as Element;
	const last = tree.get(id("#last"));
	const range = document.createRange();
	range.setStart(originalText, 2);
	range.collapse(true);
	document.getSelection()?.addRange(range);
	keyboard.press("Enter");
	expect(document.getSelection()?.getRangeAt(0)).toBe(range);
	expect(originalText.data).toBe("he");
	expect(bold.parentNode).toBe(paragraph);
	expect(tail.parentNode).toBe(paragraph.nextSibling);
	expect(tree.get(id("#last"))).toBe(last);
	expect(html()).toBe(
		'<p id="first" class="note"><b id="bold" data-x="yes">he</b></p><p class="note"><b data-x="yes">llo</b><i id="tail">world</i></p><p id="last" contenteditable="false">keep</p>',
	);
	expect(selection.focusOffset).toBe(0);
	keyboard.type("X");
	expect(tree.textContent(id())).toBe("heXlloworldkeep");
});

it("replaces a cross-text selection then splits without flattening surviving formatting", () => {
	const { keyboard, selection, text, tree, html, id } = fixture(
		'<div id="editor" contenteditable><p><b id="bold">hello</b><u id="removed">selected</u><i id="tail">world</i></p><p id="last">keep</p></div>',
	);
	const removed = tree.get(id("#removed"));
	selection.setBaseAndExtent(text("#tail"), 3, text("#bold"), 2);
	keyboard.press("Enter");
	expect(html()).toBe(
		'<p><b id="bold">he</b></p><p><b></b><i id="tail">ld</i></p><p id="last">keep</p>',
	);
	expect(tree.get(removed.id).parent).toBe(null);
	expect(tree.textContent(removed.id)).toBe("selected");
	keyboard.type("!");
	expect(html()).toBe(
		'<p><b id="bold">he</b></p><p><b>!</b><i id="tail">ld</i></p><p id="last">keep</p>',
	);
});

it("replaces a container-selected rich node and retains the detached subtree", () => {
	const { keyboard, selection, owner, tree, id, html } = fixture(
		'<div id="editor" contenteditable><b id="old">old</b><i id="keep">keep</i></div>',
	);
	const old = tree.get(id("#old"));
	const range = owner.createRange();
	range.selectNode(old.id);
	selection.addRange(range);
	keyboard.press("Enter");
	expect(html()).toBe('<div></div><div><i id="keep">keep</i></div>');
	expect(tree.get(old.id).parent).toBe(null);
	expect(tree.textContent(old.id)).toBe("old");
	keyboard.type("new");
	expect(html()).toBe('<div></div><div>new<i id="keep">keep</i></div>');
});

it.each([
	[0, "<br>abcd"],
	[2, "ab<br>cd"],
	[4, "abcd<br>"],
])("inserts Shift+Enter as a br at offset %i", (offset, expected) => {
	const { keyboard, selection, text, html, tree, id } = fixture();
	selection.collapse(text(), offset as number);
	keyboard.press("Shift+Enter");
	expect(html()).toBe(expected);
	keyboard.type("!");
	expect(tree.textContent(id())).toBe(
		`${"abcd".slice(0, offset as number)}!${"abcd".slice(offset as number)}`,
	);
});

it("inserts a line break across inline text without splitting the paragraph", () => {
	const { keyboard, selection, text, html, tree, id } = fixture(
		'<div id="editor" contenteditable><p id="paragraph"><b id="bold">hello</b><i id="tail">world</i></p></div>',
	);
	selection.setBaseAndExtent(text("#bold"), 2, text("#tail"), 3);
	keyboard.press("Shift+Enter");
	expect(html()).toBe(
		'<p id="paragraph"><b id="bold">he<br></b><i id="tail">ld</i></p>',
	);
	expect(tree.get(id()).children).toEqual([id("#paragraph")]);
	keyboard.type("!");
	expect(html()).toBe(
		'<p id="paragraph"><b id="bold">he<br>!</b><i id="tail">ld</i></p>',
	);
});

it("leaves an unselected false island untouched during a line break", () => {
	const { keyboard, selection, text, tree, id, html } = fixture(
		'<div id="editor" contenteditable><span id="text">abcd</span><span id="island" contenteditable="false">keep</span></div>',
	);
	const island = tree.get(id("#island"));
	selection.collapse(text("#text"), 2);
	keyboard.press("Shift+Enter");
	expect(tree.get(island.id)).toBe(island);
	expect(html()).toBe(
		'<span id="text">ab<br>cd</span><span id="island" contenteditable="false">keep</span>',
	);
});

it.each(["Enter", "Shift+Enter"])(
	"keeps independent hosts inside false islands bounded for %s",
	(key) => {
		const { keyboard, selection, text, html, tree, id } = fixture(
			'<div contenteditable><div contenteditable="false"><div id="editor" contenteditable>abcd</div><span id="keep">keep</span></div></div>',
		);
		const keep = tree.get(id("#keep"));
		selection.collapse(text(), 2);
		keyboard.press(key);
		expect(html()).toBe(
			key === "Enter" ? "<div>ab</div><div>cd</div>" : "ab<br>cd",
		);
		expect(tree.get(keep.id)).toBe(keep);
	},
);

it("uses a nested plaintext scope without converting the outer rich host", () => {
	const { keyboard, selection, text, html } = fixture(
		'<div id="editor" contenteditable><span id="plain" contenteditable="plaintext-only">abcd</span><b>keep</b></div>',
	);
	selection.collapse(text("#plain"), 2);
	keyboard.press("Enter");
	expect(html()).toBe(
		'<span id="plain" contenteditable="plaintext-only">ab\ncd</span><b>keep</b>',
	);
});

it.each([
	'<ul><li id="point">abcd</li></ul>',
	'<table><tbody><tr><td id="point">abcd</td></tr></tbody></table>',
	'<div><p id="point">abcd</p></div>',
	'<span id="point">abcd</span><span contenteditable="false">keep</span>',
	'<span id="point">abcd</span><span contenteditable="plaintext-only">keep</span>',
	'<span id="point">abcd</span><img src="fixture.invalid">',
	'<span id="point">abcd</span><span hidden>keep</span>',
])(
	"rejects unsupported paragraph structure before events or mutation: %s",
	(content) => {
		const { keyboard, selection, text, html, events, id, tree } = fixture(
			`<div id="editor" contenteditable>${content}</div>`,
		);
		selection.collapse(text("#point"), 2);
		const before = html();
		const usage = tree.resourceUsage();
		const input = vi.fn();
		events.addEventListener(id(), "beforeinput", input);
		expect(() => keyboard.press("Enter")).toThrow();
		expect(html()).toBe(before);
		expect(tree.resourceUsage()).toEqual(usage);
		expect(input).not.toHaveBeenCalled();
	},
);

it.each(["Enter", "Shift+Enter"])(
	"rejects cross-block replacement and protected selections for %s",
	(key) => {
		const { keyboard, selection, text, html } = fixture(
			'<div id="editor" contenteditable><p id="first">abcd</p><p id="last">efgh</p></div>',
		);
		selection.setBaseAndExtent(text("#first"), 2, text("#last"), 2);
		const before = html();
		expect(() => keyboard.press(key)).toThrow();
		expect(html()).toBe(before);
	},
);

it.each(["keydown", "keypress", "beforeinput"])(
	"honors %s cancellation without allocating rich nodes",
	(phase) => {
		const { keyboard, selection, text, events, id, tree, html } = fixture();
		selection.setBaseAndExtent(text(), 1, text(), 3);
		const usage = tree.resourceUsage();
		const input = vi.fn();
		events.addEventListener(id(), "input", input);
		events.addEventListener(id(), phase, (event) => event.preventDefault());
		expect(keyboard.press("Enter").canceled).toBe(true);
		expect(html()).toBe("abcd");
		expect(selection.toString()).toBe("bc");
		expect(tree.resourceUsage()).toEqual(usage);
		expect(input).not.toHaveBeenCalled();
	},
);

it("reports paragraph events around the mutation and exposes the new caret before input", () => {
	const { keyboard, selection, text, events, id, html } = fixture();
	selection.collapse(text(), 2);
	const seen: unknown[] = [];
	for (const type of ["keydown", "keypress", "beforeinput", "input", "keyup"])
		events.addEventListener(id(), type, (event) => {
			seen.push([
				event.type,
				event instanceof BrowserInputEvent ? event.inputType : null,
				event instanceof BrowserInputEvent ? event.data : null,
				html(),
			]);
			if (event.type === "input") {
				expect(selection.focusOffset).toBe(0);
				expect(event.cancelable).toBe(false);
				event.preventDefault();
			}
		});
	expect(keyboard.press("Enter").canceled).toBe(false);
	expect(seen).toEqual([
		["keydown", null, null, "abcd"],
		["keypress", null, null, "abcd"],
		["beforeinput", "insertParagraph", null, "abcd"],
		["input", "insertParagraph", null, "<div>ab</div><div>cd</div>"],
		["keyup", null, null, "<div>ab</div><div>cd</div>"],
	]);
});

it.each(["text", "selection", "focus", "roundtrip", "scope", "parent"])(
	"rejects stale plans after beforeinput %s changes",
	(change) => {
		const { keyboard, selection, text, events, id, actions, tree, html } =
			fixture();
		selection.collapse(text(), 2);
		events.addEventListener(id(), "beforeinput", () => {
			if (change === "text") tree.setData(text(), "listener");
			if (change === "selection") selection.collapse(text(), 1);
			if (change === "focus" || change === "roundtrip")
				actions.focus.focus(tree.reference(id("#other")));
			if (change === "roundtrip") actions.focus.focus(tree.reference(id()));
			if (change === "scope")
				tree.setAttribute(id(), "contenteditable", "plaintext-only");
			if (change === "parent")
				tree.setAttribute(
					tree.get(id()).parent as number,
					"data-change",
					"yes",
				);
		});
		const input = vi.fn();
		events.addEventListener(id(), "input", input);
		expect(() => keyboard.press("Enter")).toThrow();
		expect(html()).toBe(change === "text" ? "listener" : "abcd");
		expect(input).not.toHaveBeenCalled();
	},
);

it("uses keydown reselection but retains beforeinput listener changes when canceled", () => {
	const { keyboard, selection, text, events, id, html } = fixture();
	selection.collapse(text(), 0);
	events.addEventListener(
		id(),
		"keydown",
		() => selection.collapse(text(), 2),
		{ once: true },
	);
	keyboard.press("Enter");
	expect(html()).toBe("<div>ab</div><div>cd</div>");
	events.addEventListener(
		id(),
		"beforeinput",
		(event) => {
			selection.collapse(id(), 0);
			event.preventDefault();
		},
		{ once: true },
	);
	expect(keyboard.press("Enter").canceled).toBe(true);
	expect(selection.focus).toEqual({ node: id(), offset: 0 });
});

it.each(["keydown", "keypress", "beforeinput", "input", "keyup"])(
	"aborts paragraph entry during %s with correct mutation ownership",
	async (phase) => {
		const { keyboard, selection, text, events, id, html } = fixture();
		selection.collapse(text(), 2);
		const controller = new AbortController();
		events.addEventListener(id(), phase, () => controller.abort(), {
			once: true,
		});
		await expect(
			keyboard.pressAsync("Enter", controller.signal),
		).rejects.toMatchObject({ code: "aborted" });
		expect(html()).toBe(
			["input", "keyup"].includes(phase)
				? "<div>ab</div><div>cd</div>"
				: "abcd",
		);
		expect(events.metrics().activeDispatches).toBe(0);
	},
);

it("aborts a pending asynchronous beforeinput without inserting a break", async () => {
	const { keyboard, selection, text, events, id, html } = fixture();
	selection.collapse(text(), 2);
	const controller = new AbortController();
	let release: (() => void) | undefined;
	events.addEventListener(
		id(),
		"beforeinput",
		controlledEventListener(() => {
			controller.abort();
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		}),
	);
	await expect(
		keyboard.pressAsync("Enter", controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	release?.();
	expect(html()).toBe("abcd");
	expect(events.metrics().activeDispatches).toBe(0);
});

it.each(["beforeinput", "input"])(
	"stops on tree closure during paragraph %s",
	async (phase) => {
		const { keyboard, selection, text, events, id, tree } = fixture();
		selection.collapse(text(), 2);
		events.addEventListener(id(), phase, () => tree.close(), { once: true });
		await expect(keyboard.pressAsync("Enter")).rejects.toMatchObject({
			code: "closed",
		});
	},
);

function budgetFixture(limits: Partial<DocumentLimits>) {
	const tree = new DocumentTree(
		"https://fixture.invalid/paragraph-budget",
		limits,
	);
	trees.push(tree);
	const editor = tree.createElement("div", { contenteditable: "" });
	tree.append(tree.root, editor);
	const text = tree.createText("abcd");
	tree.append(editor, text);
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
	const selection = domRangeOwner(tree).selection;
	selection.setBaseAndExtent(text, 1, text, 3);
	return {
		tree,
		editor,
		text,
		keyboard: actions.keyboard,
		selection,
		events: actions.events,
	};
}

it.each([
	["node", { maxNodes: 4 }],
	["text", { maxTextCodeUnits: 26 }],
	["depth", { maxDepth: 2 }],
])("checks %s budget before selected content is deleted", (_name, limits) => {
	const { tree, editor, text, keyboard, selection } = budgetFixture(
		limits as Partial<DocumentLimits>,
	);
	const usage = tree.resourceUsage();
	expect(() => keyboard.press("Enter")).toThrow();
	expect(tree.get(editor).children).toEqual([text]);
	expect(tree.get(text).data).toBe("abcd");
	expect(selection.toString()).toBe("bc");
	expect(tree.resourceUsage()).toEqual(usage);
});

it("rechecks resource growth outside the host after beforeinput", () => {
	const { tree, editor, text, keyboard, events } = budgetFixture({
		maxNodes: 6,
	});
	events.addEventListener(
		editor,
		"beforeinput",
		() => {
			tree.createText("");
		},
		{ once: true },
	);
	expect(() => keyboard.press("Enter")).toThrow("node limit");
	expect(tree.get(editor).children).toEqual([text]);
	expect(tree.get(text).data).toBe("abcd");
});

it("allows a split at its exact native node and text budget", () => {
	const { tree, editor, keyboard, selection } = budgetFixture({
		maxNodes: 6,
		maxTextCodeUnits: 28,
	});
	keyboard.press("Enter");
	expect(serializeHtml(tree, editor)).toBe("<div>a</div><div>d</div>");
	expect(selection.focusOffset).toBe(0);
	expect(tree.resourceUsage().nodes).toBe(6);
	expect(tree.resourceUsage().textCodeUnits).toBe(26);
});

it.each(["Enter", "Shift+Enter"])(
	"preserves selected text when a shared node budget cannot afford %s",
	(key) => {
		const resources = new DocumentResources({
			maxNodes: key === "Enter" ? 5 : 4,
		});
		const tree = new DocumentTree(
			"https://fixture.invalid/shared",
			{},
			resources,
		);
		trees.push(tree);
		const editor = tree.createElement("div", { contenteditable: "" });
		tree.append(tree.root, editor);
		const text = tree.createText("abcd");
		tree.append(editor, text);
		const actions = documentInteractions(tree);
		actions.focus.focus(tree.reference(editor));
		const selection = domRangeOwner(tree).selection;
		selection.setBaseAndExtent(text, 1, text, 3);
		expect(() => actions.keyboard.press(key)).toThrow("node limit");
		expect(tree.get(editor).children).toEqual([text]);
		expect(tree.get(text).data).toBe("abcd");
		expect(selection.toString()).toBe("bc");
	},
);

it.each(["Enter", "Shift+Enter"])(
	"keeps independent live range endpoints coherent across a %s text split",
	(key) => {
		const { keyboard, selection, owner, text, tree, id } = fixture();
		const original = text();
		selection.setBaseAndExtent(original, 1, original, 3);
		const observer = owner.createRange();
		observer.setStart(original, 4);
		observer.collapse(true);
		keyboard.press(key);
		if (key === "Shift+Enter") {
			expect(tree.get(observer.start.node).data).toBe("d");
			expect(observer.start.offset).toBe(1);
		} else {
			expect(observer.start.node).toBe(id());
			expect(observer.collapsed).toBe(true);
		}
		expect(tree.get(selection.focusNode as number).data).toBe("d");
		expect(selection.focusOffset).toBe(0);
	},
);

it.each(["Enter", "Shift+Enter"])(
	"rejects a selected false island for %s without deleting it",
	(key) => {
		const { keyboard, selection, text, html, tree, id } = fixture(
			'<div id="editor" contenteditable><b id="first">ab</b><span id="island" contenteditable="false">keep</span><i id="last">cd</i></div>',
		);
		selection.setBaseAndExtent(text("#first"), 1, text("#last"), 1);
		const before = html();
		const island = tree.get(id("#island"));
		expect(() => keyboard.press(key)).toThrow("protected");
		expect(html()).toBe(before);
		expect(tree.get(island.id)).toBe(island);
	},
);

it.each(["Enter", "Shift+Enter"])(
	"rejects replacement across nested editability scopes for %s",
	(key) => {
		const { keyboard, selection, text, html } = fixture(
			'<div id="editor" contenteditable><span id="first" contenteditable="plaintext-only">ab</span><b id="last">cd</b></div>',
		);
		selection.setBaseAndExtent(text("#first"), 1, text("#last"), 1);
		const before = html();
		expect(() => keyboard.press(key)).toThrow("scope");
		expect(html()).toBe(before);
	},
);

it("splits a nested rich scope without moving its outer siblings", () => {
	const { keyboard, selection, text, html, tree, id } = fixture(
		'<div id="editor" contenteditable><div id="inner" contenteditable="true">abcd</div><b id="keep">keep</b></div>',
	);
	const keep = tree.get(id("#keep"));
	selection.collapse(text("#inner"), 2);
	keyboard.press("Enter");
	expect(html()).toBe(
		'<div id="inner" contenteditable="true"><div>ab</div><div>cd</div></div><b id="keep">keep</b>',
	);
	expect(tree.get(keep.id)).toBe(keep);
});

it.each(["p", "span"])(
	"keeps a %s root host bounded: Enter unsupported, Shift+Enter supported",
	(tag) => {
		const { keyboard, selection, text, html } = fixture(
			`<${tag} id="editor" contenteditable>abcd</${tag}>`,
		);
		selection.collapse(text(), 2);
		expect(() => keyboard.press("Enter")).toThrow("scope");
		expect(html()).toBe("abcd");
		keyboard.press("Shift+Enter");
		expect(html()).toBe("ab<br>cd");
	},
);

it("rejects surrogate-half endpoints before line or paragraph edits", () => {
	const { keyboard, selection, text, html } = fixture(
		'<div id="editor" contenteditable>a😀b</div>',
	);
	selection.collapse(text(), 2);
	for (const key of ["Enter", "Shift+Enter"])
		expect(() => keyboard.press(key)).toThrow("Unicode scalar");
	expect(html()).toBe("a😀b");
});

it("rejects another host's range instead of moving it into the focused editor", () => {
	const { keyboard, selection, text, html } = fixture(
		'<div id="editor" contenteditable>abcd</div><div id="foreign" contenteditable>else</div>',
	);
	selection.collapse(text("#foreign"), 2);
	expect(() => keyboard.press("Enter")).toThrow("outside editable");
	expect(html()).toBe("abcd");
	expect(selection.focus).toEqual({ node: text("#foreign"), offset: 2 });
});

it("retains a reentrant listener's committed edit but rejects the outer stale paragraph", () => {
	const { keyboard, selection, text, events, id, html } = fixture();
	selection.collapse(text(), 2);
	events.addEventListener(id(), "beforeinput", () => keyboard.type("!"), {
		once: true,
	});
	expect(() => keyboard.press("Enter")).toThrow("changed during beforeinput");
	expect(html()).toBe("ab!cd");
});

it("preserves held Shift while aborting a Shift+Enter operation", async () => {
	const { keyboard, selection, text, events, id, html } = fixture();
	selection.collapse(text(), 2);
	keyboard.down("ShiftLeft");
	const controller = new AbortController();
	events.addEventListener(id(), "beforeinput", () => controller.abort(), {
		once: true,
	});
	await expect(
		keyboard.pressAsync("Enter", controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	expect(keyboard.modifiers().shift).toBe(true);
	expect(html()).toBe("abcd");
	keyboard.press("Enter");
	expect(html()).toBe("ab<br>cd");
	keyboard.up("ShiftLeft");
});

it("rejects pre-aborted paragraph entry without selection initialization", async () => {
	const { keyboard, selection, html } = fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		keyboard.pressAsync("Enter", controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	expect(selection.rangeCount).toBe(0);
	expect(html()).toBe("abcd");
});

it("deletes an inserted line break using the existing shared selection", () => {
	const { keyboard, selection, text, html } = fixture();
	selection.collapse(text(), 4);
	keyboard.press("Shift+Enter");
	keyboard.press("Backspace");
	expect(html()).toBe("abcd");
	keyboard.type("!");
	expect(html()).toBe("abcd!");
});

it("does not claim implicit paragraph merging after Enter", () => {
	const { keyboard, selection, text, html } = fixture();
	selection.collapse(text(), 2);
	keyboard.press("Enter");
	expect(() => keyboard.press("Backspace")).toThrow("paragraph merging");
	expect(html()).toBe("<div>ab</div><div>cd</div>");
});

it("retains textarea Enter and native control selection behavior", () => {
	const { keyboard, tree, id, events, selection } = fixture(
		'<textarea id="editor">abcd</textarea>',
	);
	keyboard.press("End");
	keyboard.press("Shift+ArrowLeft");
	const types: string[] = [];
	events.addEventListener(id(), "input", (event) => {
		if (event instanceof BrowserInputEvent) types.push(event.inputType);
	});
	keyboard.press("Enter");
	keyboard.type("!");
	expect(controlValue(tree, id())).toBe("abc\n!");
	expect(types).toEqual(["insertLineBreak", "insertText"]);
	expect(selection.rangeCount).toBe(0);
});

it("leaves single-line native input Enter unchanged", () => {
	const { keyboard, tree, id, selection } = fixture(
		'<input id="editor" value="abcd">',
	);
	keyboard.press("Enter");
	expect(controlValue(tree, id())).toBe("abcd");
	expect(selection.rangeCount).toBe(0);
});

it("dispatches cancellable rich line-break events without control change semantics", () => {
	const { keyboard, selection, text, events, id, html } = fixture();
	selection.collapse(text(), 2);
	const seen: unknown[] = [];
	const change = vi.fn();
	events.addEventListener(id(), "change", change);
	for (const type of ["beforeinput", "input"])
		events.addEventListener(id(), type, (event) => {
			if (event instanceof BrowserInputEvent)
				seen.push([
					event.inputType,
					event.data,
					event.cancelable,
					event.target,
				]);
		});
	keyboard.press("Shift+Enter");
	expect(html()).toBe("ab<br>cd");
	expect(seen).toEqual([
		["insertLineBreak", null, true, id()],
		["insertLineBreak", null, false, id()],
	]);
	expect(change).not.toHaveBeenCalled();
});

it("fails at a root boundary between existing blocks without guessing a paragraph", () => {
	const { keyboard, selection, id, html } = fixture(
		'<div id="editor" contenteditable><p>one</p><p>two</p></div>',
	);
	selection.collapse(id(), 1);
	expect(() => keyboard.press("Enter")).toThrow("scope");
	expect(html()).toBe("<p>one</p><p>two</p>");
});
