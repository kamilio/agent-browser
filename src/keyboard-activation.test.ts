import { afterEach, expect, it } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { rasterizeDocument } from "./document-raster.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { BrowserSession } from "./session.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(
	content = '<button id="target">Go</button><button id="other">Other</button>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}#target,#other{display:block;width:40px;height:20px;background:blue}#target:active{background:red}${css}</style><main id="parent">${content}</main>`,
		"https://fixture.invalid/keyboard-active",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const actions = documentInteractions(tree);
	const keyboard = actions.keyboard;
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	};
	const target = id("#target");
	actions.focus.focus(tree.reference(target));
	const calls: { type: string; active: boolean; repeat: unknown }[] = [];
	for (const type of ["keydown", "keypress", "keyup", "click"])
		actions.events.addEventListener(target, type, (event) =>
			calls.push({
				type,
				active: queries.matches(target, ":active"),
				repeat: Reflect.get(event, "repeat"),
			}),
		);
	return { tree, actions, keyboard, queries, id, target, calls };
}
function gate() {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release: () => release() };
}

it("arms Space after uncanceled key events and clears it before keyup/click", () => {
	const { tree, keyboard, queries, target, calls, id } = fixture();
	keyboard.down("Space");
	expect(tree.keyboardActiveElement).toBe(target);
	expect(queries.matches(id("#parent"), ":active")).toBe(true);
	expect(calls.map(({ type, active }) => [type, active])).toEqual([
		["keydown", false],
		["keypress", false],
	]);
	const image = rasterizeDocument(tree).image;
	const offset = (18 * image.width + 2) * 4;
	expect([...image.pixels.slice(offset, offset + 4)]).toEqual([255, 0, 0, 255]);
	keyboard.up("Space");
	expect(tree.keyboardActiveElement).toBeNull();
	expect(calls.slice(-2).map(({ type, active }) => [type, active])).toEqual([
		["keyup", false],
		["click", false],
	]);
});

it.each(["button", "submit", "reset", "checkbox", "radio", "image"])(
	"supports native input %s Space activation",
	(type) => {
		const { tree, keyboard, target, calls } = fixture(
			`<input id="target" type="${type}">`,
		);
		keyboard.down("Space");
		expect(tree.keyboardActiveElement).toBe(target);
		keyboard.up("Space");
		expect(tree.keyboardActiveElement).toBeNull();
		expect(calls.filter((call) => call.type === "click")).toHaveLength(1);
	},
);

it.each([
	'<button id="target">Go</button>',
	'<a id="target" href="/next">Next</a>',
	'<input id="target" type="button">',
	'<input id="target" type="submit">',
	'<input id="target" type="reset">',
	'<input id="target" type="image">',
])("keeps Enter active only during direct activation: %s", (content) => {
	const { tree, keyboard, calls } = fixture(content);
	keyboard.down("Enter");
	expect(
		calls.filter((call) => call.type === "click").map((call) => call.active),
	).toEqual([true]);
	expect(tree.keyboardActiveElement).toBeNull();
	keyboard.up("Enter");
});

it.each(["keydown", "keypress"])(
	"canceled initial Space %s does not arm",
	(type) => {
		const { tree, keyboard, actions, target, calls } = fixture();
		actions.events.addEventListener(target, type, (event) =>
			event.preventDefault(),
		);
		keyboard.down("Space");
		expect(tree.keyboardActiveElement).toBeNull();
		keyboard.up("Space");
		expect(calls.some((call) => call.type === "click")).toBe(false);
	},
);

it("canceled Space keyup clears state without activating", () => {
	const { tree, keyboard, actions, target, calls } = fixture();
	actions.events.addEventListener(target, "keyup", (event) =>
		event.preventDefault(),
	);
	keyboard.down("Space");
	keyboard.up("Space");
	expect(tree.keyboardActiveElement).toBeNull();
	expect(calls.some((call) => call.type === "click")).toBe(false);
});

it("canceled Enter activation still clears its temporary state", () => {
	const { tree, keyboard, actions, target, calls } = fixture();
	actions.events.addEventListener(target, "click", (event) =>
		event.preventDefault(),
	);
	keyboard.press("Enter");
	expect(calls.find((call) => call.type === "click")?.active).toBe(true);
	expect(tree.keyboardActiveElement).toBeNull();
});

it("focus away and back cancels a held Space intent", () => {
	const { tree, keyboard, actions, target, id, calls } = fixture();
	keyboard.down("Space");
	actions.focus.focus(tree.reference(id("#other")));
	actions.focus.focus(tree.reference(target));
	expect(tree.keyboardActiveElement).toBeNull();
	keyboard.up("Space");
	expect(calls.some((call) => call.type === "click")).toBe(false);
});

it.each(["keydown", "keyup"])(
	"a focus round-trip inside %s cannot revive Space intent",
	(type) => {
		const { tree, keyboard, actions, target, id, calls } = fixture();
		actions.events.addEventListener(target, type, () => {
			tree.setActiveElement(id("#other"));
			tree.setActiveElement(target);
		});
		keyboard.down("Space");
		keyboard.up("Space");
		expect(tree.keyboardActiveElement).toBeNull();
		expect(calls.some((call) => call.type === "click")).toBe(false);
	},
);

it("repeat Space keeps existing active state even if the repeat is canceled", () => {
	const { tree, keyboard, actions, target, calls } = fixture();
	keyboard.down("Space");
	const revision = tree.revision;
	actions.events.addEventListener(target, "keydown", (event) => {
		if (Reflect.get(event, "repeat")) event.preventDefault();
	});
	keyboard.down("Space");
	expect(tree.keyboardActiveElement).toBe(target);
	expect(tree.revision).toBe(revision);
	keyboard.up("Space");
	expect(calls.filter((call) => call.type === "click")).toHaveLength(1);
});

it("restores held Space after an independent Enter activation", () => {
	const { tree, keyboard, target, calls } = fixture();
	keyboard.down("Space");
	keyboard.press("Enter");
	expect(tree.keyboardActiveElement).toBe(target);
	keyboard.up("Space");
	expect(
		calls.filter((call) => call.type === "click").map((call) => call.active),
	).toEqual([true, false]);
});

it.each(["disabled", "hidden", "inert", "style"])(
	"invalidates held activation when %s makes its focus unusable",
	(attribute) => {
		const { tree, keyboard, target, calls } = fixture();
		keyboard.down("Space");
		tree.setAttribute(
			target,
			attribute,
			attribute === "style" ? "display:none" : "",
		);
		expect(tree.keyboardActiveElement).toBeNull();
		tree.removeAttribute(target, attribute);
		tree.setActiveElement(target);
		keyboard.up("Space");
		expect(calls.some((call) => call.type === "click")).toBe(false);
	},
);

it("does not resurrect a removed Space target on reinsertion", () => {
	const { tree, keyboard, target, id, calls } = fixture();
	keyboard.down("Space");
	tree.remove(target);
	tree.append(id("#parent"), target);
	tree.setActiveElement(target);
	keyboard.up("Space");
	expect(tree.keyboardActiveElement).toBeNull();
	expect(calls.some((call) => call.type === "click")).toBe(false);
});

it("matches simultaneous mouse and keyboard origins without clearing the other owner", () => {
	const { tree, keyboard, actions, target, queries, id } = fixture();
	const other = id("#other");
	actions.events.addEventListener(other, "mousedown", (event) =>
		event.preventDefault(),
	);
	keyboard.down("Space");
	actions.mouse.move(10, 30);
	actions.mouse.down();
	expect(queries.matches(target, ":active")).toBe(true);
	expect(queries.matches(other, ":active")).toBe(true);
	keyboard.up("Space");
	expect(tree.keyboardActiveElement).toBeNull();
	expect(queries.matches(other, ":active")).toBe(true);
	actions.mouse.up();
	expect(queries.querySelectorAll(":active")).toEqual([]);
});

it("keyboard closure clears its state without clearing a mouse hold", () => {
	const { tree, keyboard, actions, id } = fixture();
	const other = id("#other");
	actions.events.addEventListener(other, "mousedown", (event) =>
		event.preventDefault(),
	);
	keyboard.down("Space");
	actions.mouse.move(10, 30);
	actions.mouse.down();
	keyboard.close();
	expect(tree.keyboardActiveElement).toBeNull();
	expect(tree.pointerActiveElement).toBe(other);
	expect(() => keyboard.down("Space")).toThrow("keyboard is closed");
	actions.mouse.up();
});

it("interaction and document closure clean activation ownership", () => {
	const { tree, keyboard, actions } = fixture();
	keyboard.down("Space");
	actions.close();
	expect(tree.keyboardActiveElement).toBeNull();
	tree.close();
	expect(tree.keyboardActiveElement).toBeNull();
});

it("does not treat custom roles or generic programmatic clicks as formal activation", () => {
	const { tree, keyboard, actions, target } = fixture(
		'<div id="target" role="button" tabindex="0">Custom</div>',
	);
	keyboard.press("Enter");
	expect(tree.keyboardActiveElement).toBeNull();
	actions.programmaticClick(target);
	expect(tree.keyboardActiveElement).toBeNull();
});

it("typing including literal Space edits without creating formal activation", () => {
	const { tree, keyboard, target, calls } = fixture('<input id="target">');
	keyboard.type("a b");
	expect(controlValue(tree, target)).toBe("a b");
	expect(tree.keyboardActiveElement).toBeNull();
	expect(calls.some((call) => call.active)).toBe(false);
});

it("clears an aborted Enter press and only the chord's own modifiers", async () => {
	const { tree, keyboard, actions, target, calls } = fixture();
	const entered = gate();
	const waiting = gate();
	const controller = new AbortController();
	keyboard.down("ShiftLeft");
	actions.events.addEventListener(
		target,
		"click",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = keyboard.pressAsync("ShiftRight+Enter", controller.signal);
	await entered.pending;
	expect(tree.keyboardActiveElement).toBe(target);
	controller.abort();
	try {
		await expect(pending).rejects.toMatchObject({ code: "aborted" });
	} finally {
		waiting.release();
	}
	expect(tree.keyboardActiveElement).toBeNull();
	expect(keyboard.modifiers().shift).toBe(true);
	expect(calls.some((call) => call.type === "keyup")).toBe(false);
	keyboard.up("ShiftLeft");
	expect(keyboard.modifiers().shift).toBe(false);
});

it("pre-aborted native actions do not release somebody else's held Space", async () => {
	const { tree, keyboard, target, calls } = fixture();
	keyboard.down("Space");
	const count = calls.length;
	const controller = new AbortController();
	controller.abort();
	for (const method of ["downAsync", "upAsync", "pressAsync"] as const)
		await expect(
			keyboard[method]("Space", controller.signal),
		).rejects.toMatchObject({ code: "aborted" });
	expect(tree.keyboardActiveElement).toBe(target);
	expect(calls).toHaveLength(count);
	keyboard.up("Space");
});

it("canceled Space press does not toggle a checkbox or retain formal state", async () => {
	const { tree, keyboard, actions, target } = fixture(
		'<input id="target" type="checkbox">',
	);
	const entered = gate();
	const waiting = gate();
	const controller = new AbortController();
	actions.events.addEventListener(
		target,
		"keyup",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = keyboard.pressAsync("Space", controller.signal);
	await entered.pending;
	controller.abort();
	try {
		await expect(pending).rejects.toMatchObject({ code: "aborted" });
	} finally {
		waiting.release();
	}
	expect(tree.keyboardActiveElement).toBeNull();
	expect(controlChecked(tree, target)).toBe(false);
});

it.each(["focus", "click"])(
	"session cancellation interrupts pending %s before later key defaults",
	async (type) => {
		let requests = 0;
		const session = new BrowserSession({
			createTransport: () => ({
				async request(request) {
					requests++;
					return {
						url: request.url,
						status: 200,
						headers: {},
						body: new Uint8Array(),
						redirects: [],
						encodedBytes: 0,
						elapsedMs: 0,
					};
				},
				metrics: () => ({
					requests,
					active: 0,
					redirects: 0,
					encodedBytes: 0,
					decodedBytes: 0,
					closed: false,
				}),
				close() {},
			}),
			loadDocument: (response) =>
				parseHtmlDocument(
					'<button id="target" type="button">Go</button>',
					response.url,
				),
		});
		const entered = gate();
		const waiting = gate();
		const controller = new AbortController();
		try {
			const tab = session.createTab();
			await session.navigate(
				tab.id,
				"https://fixture.invalid/session-keyboard-active",
			);
			const page = session.page(tab.id);
			const target = page.queries.querySelector("#target") as number;
			const reference = page.document.reference(target);
			const calls: string[] = [];
			page.interactions.events.addEventListener(target, "keydown", () =>
				calls.push("keydown"),
			);
			page.interactions.events.addEventListener(
				target,
				type,
				controlledEventListener(async () => {
					entered.release();
					await waiting.pending;
				}),
			);
			const pending = session.press(tab.id, "Enter", {
				target: reference,
				signal: controller.signal,
			});
			await entered.pending;
			controller.abort();
			await expect(pending).rejects.toMatchObject({ code: "aborted" });
			expect(page.document.keyboardActiveElement).toBeNull();
			expect(calls).toEqual(type === "focus" ? [] : ["keydown"]);
			expect(requests).toBe(1);
		} finally {
			waiting.release();
			session.close();
		}
	},
);
