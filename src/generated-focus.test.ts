import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { controlledEventListener } from "./events.js";
import { BrowserFocusEvent, focusTabIndex } from "./focus.js";
import {
	DocumentGeneratedControls,
	documentGeneratedControls,
} from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture(
	attributes = "",
	body = '<button id="inside">Inside</button>',
) {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0}details{width:120px;font-size:16px;line-height:16px}</style><button id="before">Before</button><details id="host" ${attributes}>${body}</details><button id="after">After</button>`,
		"https://fixture.invalid/generated-focus",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const queries = new DocumentQueries(tree);
	const id = (name: string) => {
		const result = queries.querySelector(`#${name}`);
		if (result === null) throw new Error("Missing fixture node");
		return result;
	};
	const host = id("host");
	const controls = documentGeneratedControls(tree);
	const target = controls.detailsSummary(host);
	if (!target) throw new Error("Missing generated target");
	const actions = documentInteractions(tree);
	const focus = actions.focus;
	const reference = () =>
		Reflect.apply(Reflect.get(focus, "activeReference"), focus, []) as
			| string
			| null;
	const generated = () =>
		Reflect.get(tree, "generatedFocusReference") as string | null;
	const open = () => Object.hasOwn(tree.get(host).attributes, "open");
	return {
		tree,
		host,
		target,
		controls,
		actions,
		focus,
		reference,
		generated,
		open,
		id,
	};
}
function createHostObject(definition: ScriptHostObjectDefinition): object {
	const result = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(result, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(result, name, { value: method });
	return Object.preventExtensions(result);
}

it.each([false, true])(
	"focuses a generated header without changing its DOM host, async=%s",
	async (async) => {
		const { tree, host, target, focus, reference } = fixture();
		const count = tree.nodeCount;
		const dom = new ScriptDom(tree, { createHostObject });
		const document = dom.document as {
			activeElement: object;
			getElementById(name: string): { tabIndex: number };
		};
		expect(
			async ? await focus.focusAsync(target.ref) : focus.focus(target.ref),
		).toBe(host);
		expect(reference()).toBe(target.ref);
		expect(focus.active()).toBe(host);
		expect(tree.activeElement).toBe(host);
		expect(document.activeElement).toBe(document.getElementById("host"));
		expect(document.getElementById("host").tabIndex).toBe(-1);
		expect(focusTabIndex(tree, host)).toBeNull();
		expect(tree.nodeCount).toBe(count);
		expect(() => tree.resolve(target.ref)).toThrow();
		expect(() => focus.focus(tree.reference(host))).toThrow(/focus/);
		expect(reference()).toBe(target.ref);
	},
);

it.each([false, true])(
	"tabs through the generated header and only visible body controls, open=%s",
	(open) => {
		const { tree, target, focus, reference, id } = fixture(open ? "open" : "");
		const expected = [
			tree.reference(id("before")),
			target.ref,
			...(open ? [tree.reference(id("inside"))] : []),
			tree.reference(id("after")),
		];
		for (const next of [...expected, expected[0]]) {
			focus.move();
			expect(reference()).toBe(next);
		}
		for (const next of [...expected].reverse()) {
			focus.move(true);
			expect(reference()).toBe(next);
		}
	},
);

it("tabs through nested generated headers in document order", () => {
	const { tree, target, focus, reference, id, controls } = fixture(
		"open",
		'<details id="nested"><button>Hidden</button></details>',
	);
	const nested = controls.detailsSummary(id("nested"));
	focus.focus(target.ref);
	focus.move();
	expect(reference()).toBe(nested?.ref);
	focus.move();
	expect(reference()).toBe(tree.reference(id("after")));
});

it("keeps explicit host and generated stops distinct without host-to-host focus events", () => {
	const { tree, host, target, focus, reference, actions } =
		fixture('tabindex="0"');
	focus.focus(tree.reference(host));
	const calls: string[] = [];
	for (const type of ["focus", "focusin", "blur", "focusout"])
		actions.events.addEventListener(host, type, () => calls.push(type));
	focus.move();
	expect(reference()).toBe(target.ref);
	focus.move(true);
	expect(reference()).toBe(tree.reference(host));
	expect(calls).toEqual([]);
});

it("omits a negative-tabindex host's generated stop but permits direct focus", () => {
	const { tree, target, focus, reference, id } = fixture('tabindex="-1"');
	focus.focus(tree.reference(id("before")));
	focus.move();
	expect(reference()).toBe(tree.reference(id("after")));
	focus.focus(target.ref);
	expect(reference()).toBe(target.ref);
});

it("commits dirty input before host-retargeted generated focus events", () => {
	const { tree, host, target, focus, actions, id } = fixture(
		"open",
		'<input id="input">',
	);
	const input = id("input");
	actions.fill(tree.reference(input), "changed");
	const calls: unknown[] = [];
	for (const owner of [input, host])
		for (const type of ["change", "blur", "focusout", "focus", "focusin"])
			actions.events.addEventListener(owner, type, (event) => {
				if (event.target === owner)
					calls.push([
						type,
						owner,
						event instanceof BrowserFocusEvent ? event.relatedTarget : null,
					]);
			});
	focus.focus(target.ref);
	expect(calls).toEqual([
		["change", input, null],
		["blur", input, host],
		["focusout", input, host],
		["focus", host, input],
		["focusin", host, input],
	]);
});

it.each(["blur", "focus"])(
	"preserves reentrant redirection during %s",
	(type) => {
		const { tree, host, target, focus, actions, reference, id } = fixture();
		const before = id("before");
		focus.focus(tree.reference(before));
		const focused: (number | null)[] = [];
		actions.events.addEventListener(host, "focusin", (event) =>
			focused.push(event.target),
		);
		actions.events.addEventListener(type === "blur" ? before : host, type, () =>
			focus.focus(tree.reference(id("after"))),
		);
		focus.focus(target.ref);
		expect(reference()).toBe(tree.reference(id("after")));
		expect(focused).toEqual([]);
	},
);

it("does not dispatch stale focusin after same-host identity replacement", () => {
	const { tree, host, target, focus, actions, reference } =
		fixture('tabindex="0"');
	const calls: string[] = [];
	actions.events.addEventListener(host, "focus", () =>
		tree.setActiveElement(host),
	);
	actions.events.addEventListener(host, "focusin", () => calls.push("focusin"));
	focus.focus(target.ref);
	expect(reference()).toBe(tree.reference(host));
	expect(calls).toEqual([]);
});

it("rejects a generated target replaced during blur", () => {
	const { tree, host, target, focus, actions, id } = fixture();
	focus.focus(tree.reference(id("before")));
	actions.events.addEventListener(id("before"), "blur", () =>
		tree.append(host, tree.createElement("summary")),
	);
	expect(() => focus.focus(target.ref)).toThrow(/changed/);
	expect(focus.active()).toBeNull();
});

it.each([false, true])(
	"clears generated focus before authored-summary mutation delivery, open=%s",
	(open) => {
		const { tree, host, target, focus, generated, reference } = fixture(
			open ? "open" : "",
		);
		focus.focus(target.ref);
		const summary = tree.createElement("summary");
		const observed: unknown[] = [];
		tree.onMutation(() => observed.push([tree.activeElement, generated()]));
		tree.append(host, summary);
		expect(observed).toContainEqual([null, null]);
		expect(
			observed.every((entry) => JSON.stringify(entry) === "[null,null]"),
		).toBe(true);
		tree.remove(summary);
		expect(reference()).toBeNull();
	},
);

it("does not invalidate fallback focus for a non-direct summary", () => {
	const { tree, target, focus, reference, id } = fixture(
		"open",
		'<div id="wrapper"></div>',
	);
	focus.focus(target.ref);
	tree.append(id("wrapper"), tree.createElement("summary"));
	expect(reference()).toBe(target.ref);
});

it.each(["detach", "inert", "hidden", "style"])(
	"clears unavailable generated focus without resurrection: %s",
	(change) => {
		const { tree, host, target, focus, reference, generated } = fixture();
		const parent = tree.get(host).parent;
		if (parent === null) throw new Error("Missing fixture parent");
		focus.focus(target.ref);
		if (change === "detach") tree.remove(host);
		else
			tree.setAttribute(host, change, change === "style" ? "display:none" : "");
		expect(focus.active()).toBeNull();
		expect(generated()).toBeNull();
		if (change === "detach") tree.append(parent, host);
		else tree.removeAttribute(host, change);
		expect(reference()).toBeNull();
	},
);

it("clears inner generated focus when its enclosing disclosure closes", () => {
	const { tree, host, controls, focus, reference, id } = fixture(
		"open",
		'<details id="nested"></details>',
	);
	const nested = controls.detailsSummary(id("nested"));
	if (!nested) throw new Error("Missing nested header");
	focus.focus(nested.ref);
	tree.removeAttribute(host, "open");
	expect(reference()).toBeNull();
});

it("retains the header's focus when its own disclosure closes", () => {
	const { tree, host, target, focus, reference } = fixture("open");
	focus.focus(target.ref);
	tree.removeAttribute(host, "open");
	expect(reference()).toBe(target.ref);
});

it("clears canonical generated focus on registry close", () => {
	const { tree, target, focus, controls, actions, generated } = fixture();
	focus.focus(target.ref);
	actions.keyboard.down("Space");
	controls.close();
	expect(tree.activeElement).toBeNull();
	expect(generated()).toBeNull();
	expect(tree.keyboardActiveElement).toBeNull();
	expect(() => focus.focus(target.ref)).toThrow(/closed/);
});

it("does not let an independent registry clear canonical focus", () => {
	const { tree, host, target, focus, reference } = fixture();
	focus.focus(target.ref);
	const independent = new DocumentGeneratedControls(tree);
	independent.detailsSummary(host);
	independent.close();
	expect(reference()).toBe(target.ref);
});

it("rejects mismatched and foreign generated identities before mutating focus", () => {
	const { tree, host, target, focus, reference, id } = fixture();
	const foreign = fixture();
	focus.focus(target.ref);
	for (const [owner, ref] of [
		[id("after"), target.ref],
		[null, target.ref],
		[host, foreign.target.ref],
	]) {
		expect(() =>
			Reflect.apply(tree.setActiveElement, tree, [owner, ref]),
		).toThrow();
		expect(reference()).toBe(target.ref);
	}
});

it.each(["Enter", "Space"])(
	"activates focused generated headers with %s and host-retargeted events",
	(key) => {
		const { host, target, focus, actions, open, reference } = fixture();
		focus.focus(target.ref);
		const calls: unknown[] = [];
		for (const type of ["keydown", "keypress", "keyup", "click"])
			actions.events.addEventListener(host, type, (event) =>
				calls.push([type, event.target]),
			);
		const down = actions.keyboard.down(key);
		expect(open()).toBe(key === "Enter");
		const up = actions.keyboard.up(key);
		expect(open()).toBe(true);
		expect((key === "Enter" ? down : up).interaction?.reference).toBe(
			target.ref,
		);
		expect(reference()).toBe(target.ref);
		expect(calls).toEqual(
			(key === "Enter"
				? ["keydown", "keypress", "click", "keyup"]
				: ["keydown", "keypress", "keyup", "click"]
			).map((type) => [type, host]),
		);
	},
);

it.each([false, true])(
	"does not scroll a long page on generated Space activation, shift=%s",
	(shift) => {
		const { tree, target, focus, actions, open } = fixture();
		const spacer = tree.createElement("div", { style: "height:2000px" });
		tree.append(tree.root, spacer);
		focus.focus(target.ref);
		if (shift) actions.keyboard.down("Shift");
		const down = actions.keyboard.down("Space");
		expect(down.scroll).toBeUndefined();
		expect(open()).toBe(false);
		actions.keyboard.up("Space");
		expect(open()).toBe(true);
	},
);

it("activates only once on repeated held Space and never on unarmed keyup", () => {
	const { target, focus, actions, open } = fixture();
	focus.focus(target.ref);
	actions.keyboard.up("Space");
	expect(open()).toBe(false);
	actions.keyboard.down("Space");
	actions.keyboard.down("Space");
	expect(open()).toBe(false);
	actions.keyboard.up("Space");
	expect(open()).toBe(true);
	actions.keyboard.up("Space");
	expect(open()).toBe(true);
});

it.each(["keydown", "keypress", "keyup"])(
	"honors cancellation of generated Space %s",
	(type) => {
		const { host, target, focus, actions, open } = fixture();
		focus.focus(target.ref);
		actions.events.addEventListener(host, type, (event) =>
			event.preventDefault(),
		);
		actions.keyboard.down("Space");
		actions.keyboard.up("Space");
		expect(open()).toBe(false);
	},
);

it.each(["summary", "round-trip", "same-host", "inert", "hidden", "style"])(
	"cancels held generated Space after %s",
	(change) => {
		const { tree, host, target, focus, actions, open, id } =
			fixture('tabindex="0"');
		focus.focus(target.ref);
		actions.keyboard.down("Space");
		if (change === "summary") {
			const summary = tree.createElement("summary");
			tree.append(host, summary);
			tree.remove(summary);
		} else if (change === "round-trip")
			focus.focus(tree.reference(id("after")));
		else if (change === "same-host") focus.focus(tree.reference(host));
		else {
			tree.setAttribute(host, change, change === "style" ? "display:none" : "");
			tree.removeAttribute(host, change);
		}
		focus.focus(target.ref);
		actions.keyboard.up("Space");
		expect(open()).toBe(false);
	},
);

it("does not alias host focus to generated activation after keydown", () => {
	const { tree, host, target, focus, actions, open } = fixture('tabindex="0"');
	focus.focus(target.ref);
	const calls: string[] = [];
	actions.events.addEventListener(host, "keydown", () =>
		focus.focus(tree.reference(host)),
	);
	actions.events.addEventListener(host, "keypress", () =>
		calls.push("keypress"),
	);
	actions.keyboard.press("Enter");
	expect(open()).toBe(false);
	expect(calls).toEqual([]);
	actions.keyboard.press("Enter");
	expect(open()).toBe(false);
});

it("focuses generated headers through native direct activation", () => {
	const { target, actions, reference, open } = fixture();
	actions.click(target.ref);
	expect(reference()).toBe(target.ref);
	actions.keyboard.press("Enter");
	expect(open()).toBe(false);
});

it.each([false, true])(
	"uses generated pointer focus unless mousedown is canceled, canceled=%s",
	(canceled) => {
		const { tree, host, target, focus, actions, reference, id } = fixture();
		focus.focus(tree.reference(id("after")));
		if (canceled)
			actions.events.addEventListener(host, "mousedown", (event) =>
				event.preventDefault(),
			);
		const rectangle = documentGeometry(tree).getGeneratedClientRects(
			target.ref,
		)[0];
		actions.mouse.move(rectangle.x + 4, rectangle.y + 4);
		actions.mouse.down();
		expect(reference()).toBe(
			canceled ? tree.reference(id("after")) : target.ref,
		);
		actions.mouse.up();
	},
);

it.each(["keydown", "keypress"])(
	"honors cancellation of generated Enter %s",
	(type) => {
		const { host, target, focus, actions, open } = fixture();
		focus.focus(target.ref);
		actions.events.addEventListener(host, type, (event) =>
			event.preventDefault(),
		);
		actions.keyboard.press("Enter");
		expect(open()).toBe(false);
	},
);

it("uses the authored summary stop after fallback replacement", () => {
	const { tree, host, target, focus, reference, id } = fixture();
	focus.focus(target.ref);
	const summary = tree.createElement("summary");
	tree.append(host, summary);
	focus.focus(tree.reference(id("before")));
	focus.move();
	expect(reference()).toBe(tree.reference(summary));
});

it("does not focus a header replaced during mousedown", () => {
	const { tree, host, target, actions, reference } = fixture();
	const rectangle = documentGeometry(tree).getGeneratedClientRects(
		target.ref,
	)[0];
	actions.events.addEventListener(host, "mousedown", () =>
		tree.append(host, tree.createElement("summary")),
	);
	actions.mouse.move(rectangle.x + 4, rectangle.y + 4);
	expect(() => actions.mouse.down()).not.toThrow();
	expect(reference()).toBeNull();
	actions.mouse.up();
});

it("revokes generated focus when its document closes", () => {
	const { tree, target, focus, actions } = fixture();
	focus.focus(target.ref);
	actions.keyboard.down("Space");
	tree.close();
	expect(() => focus.active()).toThrow(/closed/);
	expect(() => actions.keyboard.up("Space")).toThrow(/closed/);
});

it("awaits controlled focus listeners before accepting generated focus", async () => {
	const { tree, host, target, focus, actions, reference, id } = fixture();
	actions.events.addEventListener(
		host,
		"focus",
		controlledEventListener(async () => {
			await Promise.resolve();
			await focus.focusAsync(tree.reference(id("after")));
		}),
	);
	await focus.focusAsync(target.ref);
	expect(reference()).toBe(tree.reference(id("after")));
});

it("does not activate generated Enter after an awaited identity change", async () => {
	const { tree, host, target, focus, actions, open, reference } =
		fixture('tabindex="0"');
	focus.focus(target.ref);
	actions.events.addEventListener(
		host,
		"keydown",
		controlledEventListener(async () => {
			await Promise.resolve();
			await focus.focusAsync(tree.reference(host));
		}),
	);
	await actions.keyboard.pressAsync("Enter");
	expect(open()).toBe(false);
	expect(reference()).toBe(tree.reference(host));
});
