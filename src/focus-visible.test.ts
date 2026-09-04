import { afterEach, expect, it, vi } from "vitest";
import { cssSupportsCondition } from "./css-parser.js";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { BrowserEvent } from "./events.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { BrowserKeyboardEvent } from "./keyboard.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture(
	content = '<button id="first">First</button><button id="second">Second</button><input id="field">',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}button,input,textarea,details{display:block;margin:10px;width:70px;height:20px}button:focus-visible{outline:2px solid blue}${css}</style><main>${content}</main>`,
		"https://fixture.invalid/focus-visible",
	);
	trees.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(160, 140);
	const actions = documentInteractions(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const ref = (selector: string) => tree.reference(id(selector));
	const indicated = () => queries.querySelectorAll(":focus-visible");
	const pointer = (selector: string) => {
		const bounds = documentGeometry(tree).getBoundingClientRect(id(selector));
		actions.mouse.move(
			bounds.x + bounds.width / 2,
			bounds.y + bounds.height / 2,
		);
		actions.mouse.down();
		actions.mouse.up();
	};
	return { tree, styles, actions, queries, id, ref, indicated, pointer };
}

it("supports focus-visible selectors without making unfocused elements match", () => {
	const { queries, indicated } = fixture();
	expect(cssSupportsCondition("selector(:focus-visible)")).toBe(true);
	expect(indicated()).toEqual([]);
	expect(
		queries.querySelectorAll(":is(button:focus-visible, input:focus-visible)"),
	).toEqual([]);
});

it.each([false, true])(
	"indicates native forward/reverse Tab focus, reverse=%s",
	(reverse) => {
		const { actions, id, indicated } = fixture();
		actions.keyboard.press(reverse ? "Shift+Tab" : "Tab");
		expect(indicated()).toEqual([id(reverse ? "#field" : "#first")]);
	},
);

it.each([false, true])(
	"distinguishes pointer focus from focus indication, coordinates=%s",
	(coordinates) => {
		const { actions, queries, id, ref, indicated, pointer } = fixture();
		if (coordinates) pointer("#first");
		else actions.click(ref("#first"));
		expect(queries.querySelector(":focus")).toBe(id("#first"));
		expect(queries.querySelector("main:focus-within")).toBe(id("main"));
		expect(indicated()).toEqual([]);
	},
);

it.each([
	"text",
	"search",
	"url",
	"tel",
	"email",
	"password",
	"number",
	"date",
	"month",
	"week",
	"time",
	"datetime-local",
	"unknown",
])("indicates pointer-focused keyboard input type %s", (type) => {
	const { actions, ref, id, indicated } = fixture(
		`<input id="field" type="${type}">`,
	);
	actions.click(ref("#field"));
	expect(indicated()).toEqual([id("#field")]);
});

it.each([
	"button",
	"checkbox",
	"radio",
	"range",
	"color",
	"file",
	"submit",
	"reset",
])(
	"does not infer keyboard-input indication for pointer-focused %s",
	(type) => {
		const { actions, ref, indicated } = fixture(
			`<input id="field" type="${type}">`,
		);
		actions.click(ref("#field"));
		expect(indicated()).toEqual([]);
	},
);

it.each([false, true])(
	"handles pointer-focused textarea readonly=%s",
	(readonly) => {
		const { actions, ref, id, indicated } = fixture(
			`<textarea id="field" ${readonly ? "readonly" : ""}></textarea>`,
		);
		actions.click(ref("#field"));
		expect(indicated()).toEqual(readonly ? [] : [id("#field")]);
	},
);

it("updates keyboard-input indication when readonly or type changes", () => {
	const { actions, tree, ref, id, indicated } = fixture();
	actions.click(ref("#field"));
	expect(indicated()).toEqual([id("#field")]);
	tree.setAttribute(id("#field"), "readonly", "");
	expect(indicated()).toEqual([]);
	tree.removeAttribute(id("#field"), "readonly");
	expect(indicated()).toEqual([id("#field")]);
	tree.setAttribute(id("#field"), "type", "button");
	expect(indicated()).toEqual([]);
});

it.each(["", "true", "plaintext-only", "invalid"])(
	"inherits editable focus indication through contenteditable=%s",
	(value) => {
		const { actions, ref, id, indicated } = fixture(
			`<div contenteditable="true"><span id="first" tabindex="0" contenteditable="${value}">Edit</span></div>`,
		);
		actions.click(ref("#first"));
		expect(indicated()).toEqual([id("#first")]);
	},
);

it("honors a false contenteditable boundary", () => {
	const { actions, ref, indicated } = fixture(
		'<div contenteditable="true"><span id="first" tabindex="0" contenteditable="false">Not editing</span></div>',
	);
	actions.click(ref("#first"));
	expect(indicated()).toEqual([]);
});

it("indicates focus on non-shortcut keydown even when focus does not move", () => {
	const { actions, id, ref, indicated } = fixture();
	actions.click(ref("#first"));
	expect(indicated()).toEqual([]);
	actions.keyboard.press("ArrowRight");
	expect(indicated()).toEqual([id("#first")]);
});

it.each(["Control+a", "Meta+a", "Alt+a"])(
	"does not switch modality for shortcut %s",
	(key) => {
		const { actions, ref, indicated } = fixture();
		actions.click(ref("#first"));
		actions.keyboard.press(key);
		expect(indicated()).toEqual([]);
	},
);

it("publishes keyboard indication before canceled keydown listeners", () => {
	const { actions, ref, indicated, id } = fixture();
	actions.click(ref("#first"));
	const results: (readonly number[])[] = [];
	actions.events.addEventListener(id("#first"), "keydown", (event) => {
		results.push(indicated());
		event.preventDefault();
	});
	expect(actions.keyboard.press("Tab").canceled).toBe(true);
	expect(results).toEqual([[id("#first")]]);
	expect(indicated()).toEqual([id("#first")]);
});

it("publishes pointer indication before canceled mousedown without moving focus", () => {
	const { actions, ref, indicated, id, pointer } = fixture();
	actions.focus.focus(ref("#first"));
	const results: (readonly number[])[] = [];
	actions.events.addEventListener(id("#second"), "mousedown", (event) => {
		results.push(indicated());
		event.preventDefault();
	});
	pointer("#second");
	expect(actions.focus.active()).toBe(id("#first"));
	expect(results).toEqual([[]]);
	expect(indicated()).toEqual([]);
});

it("does not change modality for pointer movement or wheel scrolling", () => {
	const { actions, id, ref, indicated } = fixture();
	actions.focus.focus(ref("#first"));
	actions.mouse.move(150, 130);
	actions.mouse.wheel(0, 1);
	expect(indicated()).toEqual([id("#first")]);
});

it.each([false, true])(
	"inherits indicated state across script focus transfers, indicated=%s",
	(keyboard) => {
		const { actions, id, ref, indicated } = fixture();
		if (keyboard) actions.focus.focus(ref("#first"));
		else actions.click(ref("#first"));
		actions.focus.focus(ref("#second"));
		expect(indicated()).toEqual(keyboard ? [id("#second")] : []);
	},
);

it("inherits indication from a pointer-focused text input during script transfer", () => {
	const { actions, id, ref, indicated } = fixture();
	actions.click(ref("#field"));
	actions.focus.focus(ref("#second"));
	expect(indicated()).toEqual([id("#second")]);
});

it("does not inherit a text field's indication during a pointer focus transfer", () => {
	const { actions, ref, indicated, pointer } = fixture();
	actions.click(ref("#field"));
	pointer("#second");
	expect(indicated()).toEqual([]);
});

it("keeps synthetic keyboard and mouse dispatch separate from native input modality", () => {
	const { actions, id, ref, indicated } = fixture();
	actions.click(ref("#first"));
	actions.events.dispatchEvent(
		id("#first"),
		new BrowserKeyboardEvent("keydown", {
			key: "Tab",
			code: "Tab",
			control: false,
			meta: false,
			shift: false,
		}),
	);
	expect(indicated()).toEqual([]);
	actions.focus.move();
	const before = indicated();
	actions.events.dispatchEvent(
		id("#second"),
		new BrowserEvent("mousedown", { bubbles: true }),
	);
	expect(indicated()).toEqual(before);
});

it("keeps programmatic clicks from moving focus or changing its indication", () => {
	const { actions, id, ref, indicated } = fixture();
	actions.focus.focus(ref("#first"));
	actions.programmaticClick(id("#second"));
	expect(indicated()).toEqual([id("#first")]);
});

it("rejects invalid input before changing indication", () => {
	const { actions, id, ref, indicated } = fixture();
	actions.focus.focus(ref("#first"));
	expect(() => actions.keyboard.press("Control+")).toThrow();
	expect(() =>
		Reflect.apply(actions.mouse.down, actions.mouse, ["invalid"]),
	).toThrow();
	expect(indicated()).toEqual([id("#first")]);
});

it("refreshes cached relational selectors without rebuilding structural indexes", () => {
	const { actions, queries, id, ref, indicated } = fixture();
	actions.click(ref("#first"));
	expect(queries.querySelector("main:has(:focus-visible)")).toBeNull();
	const before = queries.metrics();
	actions.keyboard.down("ArrowRight");
	expect(indicated()).toEqual([id("#first")]);
	expect(queries.querySelector("main:has(:focus-visible)")).toBe(id("main"));
	expect(queries.metrics().structuralBuilds).toBe(before.structuralBuilds);
	expect(queries.metrics().stateRefreshes).toBeGreaterThan(
		before.stateRefreshes,
	);
	actions.keyboard.up("ArrowRight");
});

it("does not cancel armed Space activation when only indication changes", () => {
	const { actions, tree, id, ref, indicated } = fixture();
	actions.click(ref("#first"));
	let clicks = 0;
	actions.events.addEventListener(id("#first"), "click", () => clicks++);
	actions.keyboard.down("Space");
	expect(indicated()).toEqual([id("#first")]);
	tree.recordInputModality("pointer");
	expect(indicated()).toEqual([]);
	actions.keyboard.up("Space");
	expect(clicks).toBe(1);
});

it("applies authored focus-visible outlines and invalidates prepared captures without changing geometry", () => {
	const { actions, tree, ref, id, indicated, styles } = fixture();
	actions.click(ref("#first"));
	expect(indicated()).toEqual([]);
	const before = rasterizeDocument(tree);
	const prepared = prepareDocumentRaster(tree);
	const bounds = documentGeometry(tree).getBoundingClientRect(id("#first"));
	actions.keyboard.press("ArrowRight");
	expect(styles.outline(id("#first"))["outline-style"]).toBe("solid");
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before.image.pixels);
	expect(documentGeometry(tree).getBoundingClientRect(id("#first"))).toEqual(
		bounds,
	);
	expect(() => prepared.rasterize()).toThrow(/stale/);
});

it("exposes host focus-visible state for generated headers and gates their native ring", () => {
	vi.useFakeTimers();
	const { tree, actions, id, indicated } = fixture(
		'<details id="first">Body</details>',
	);
	const target = documentGeneratedControls(tree).detailsSummary(id("#first"));
	if (!target) throw new Error("Missing generated header");
	actions.click(target.ref);
	expect(indicated()).toEqual([]);
	const pointer = rasterizeDocument(tree, { element: target.ref });
	actions.keyboard.press("ArrowRight");
	expect(indicated()).toEqual([id("#first")]);
	expect(actions.focus.activeReference()).toBe(target.ref);
	expect(
		rasterizeDocument(tree, { element: target.ref }).image.pixels,
	).not.toEqual(pointer.image.pixels);
});

it("does not confuse an editable generated host with a text-entry header", () => {
	vi.useFakeTimers();
	const { tree, actions, id, indicated } = fixture(
		'<details id="first" contenteditable="true">Body</details>',
	);
	const target = documentGeneratedControls(tree).detailsSummary(id("#first"));
	if (!target) throw new Error("Missing generated header");
	actions.click(target.ref);
	expect(indicated()).toEqual([]);
});

it.each(["hidden", "inert", "disabled"])(
	"drops indicated focus eligibility when %s is added",
	(attribute) => {
		const { actions, tree, id, ref, indicated } = fixture();
		actions.focus.focus(ref("#first"));
		expect(indicated()).toEqual([id("#first")]);
		tree.setAttribute(id("#first"), attribute, "");
		expect(indicated()).toEqual([]);
	},
);

it("does not restore focus indication by reattaching a detached focused node", () => {
	const { actions, tree, id, ref, indicated } = fixture();
	const target = id("#first");
	const parent = id("main");
	actions.focus.focus(ref("#first"));
	expect(indicated()).toEqual([target]);
	tree.remove(target);
	tree.append(parent, target);
	expect(indicated()).toEqual([]);
});

it("keeps input modality local to each document and rejects updates after close", () => {
	const first = fixture();
	const second = fixture();
	first.actions.click(first.ref("#first"));
	second.actions.focus.focus(second.ref("#first"));
	expect(first.indicated()).toEqual([]);
	expect(second.indicated()).toEqual([second.id("#first")]);
	first.tree.close();
	expect(() => first.tree.recordInputModality("keyboard")).toThrow(/closed/);
});

it("preserves indicated script focus through asynchronous focus transitions", async () => {
	const { actions, id, ref, indicated } = fixture();
	await actions.focus.focusAsync(ref("#first"));
	await actions.focus.focusAsync(ref("#second"));
	expect(indicated()).toEqual([id("#second")]);
});

it.each([false, true])(
	"preserves indication through reentrant focus listeners, pointer=%s",
	(pointer) => {
		const { actions, ref, id, indicated } = fixture();
		const seen: (readonly number[])[] = [];
		actions.events.addEventListener(id("#first"), "focus", () => {
			seen.push(indicated());
			actions.focus.focus(ref("#second"));
		});
		if (pointer) actions.click(ref("#first"));
		else actions.focus.focus(ref("#first"));
		expect(actions.focus.active()).toBe(id("#second"));
		expect(seen).toEqual([pointer ? [] : [id("#first")]]);
		expect(indicated()).toEqual(pointer ? [] : [id("#second")]);
	},
);

it("carries keyboard indication through a listener-driven focus transfer", () => {
	const { actions, ref, id, indicated } = fixture();
	actions.click(ref("#first"));
	actions.events.addEventListener(id("#first"), "keydown", (event) => {
		event.preventDefault();
		actions.focus.focus(ref("#second"));
	});
	actions.keyboard.press("Tab");
	expect(indicated()).toEqual([id("#second")]);
});

it("retargets a pointer press when focus-visible styling moves the old hit box", () => {
	const { actions, tree, ref, id, indicated } = fixture(
		undefined,
		"#first:focus-visible{margin-left:80px}",
	);
	actions.focus.focus(ref("#first"));
	expect(indicated()).toEqual([id("#first")]);
	const bounds = documentGeometry(tree).getBoundingClientRect(id("#first"));
	let presses = 0;
	actions.events.addEventListener(id("#first"), "mousedown", () => presses++);
	actions.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	const result = actions.mouse.down();
	actions.mouse.up();
	expect(result.reference).not.toBe(ref("#first"));
	expect(presses).toBe(0);
	expect(indicated()).toEqual([]);
});

it("rechecks focus visibility before choosing a keyboard event target", () => {
	const { actions, ref, id, indicated } = fixture(
		undefined,
		"#first:focus-visible{display:none}",
	);
	actions.click(ref("#first"));
	expect(indicated()).toEqual([]);
	let downs = 0;
	actions.events.addEventListener(id("#first"), "keydown", () => downs++);
	actions.keyboard.press("ArrowRight");
	expect(actions.focus.active()).toBeNull();
	expect(downs).toBe(0);
	expect(indicated()).toEqual([]);
});

it("records indication-only changes without focus transitions or redundant revisions", () => {
	const { actions, tree, ref, id, indicated } = fixture();
	actions.focus.focus(ref("#first"));
	expect(indicated()).toEqual([id("#first")]);
	const revision = tree.revision;
	tree.recordInputModality("keyboard");
	expect(tree.revision).toBe(revision);
	tree.recordInputModality("pointer");
	expect(
		tree.changesSince(revision).changes.map((change) => change.kind),
	).toEqual(["focus-indication"]);
	const pointerRevision = tree.revision;
	tree.recordInputModality("pointer");
	expect(tree.revision).toBe(pointerRevision);
	expect(actions.focus.active()).toBe(id("#first"));
	expect(indicated()).toEqual([]);
});

it("rejects malformed native indication arguments without changing state", () => {
	const { actions, tree, ref, id, indicated } = fixture();
	actions.focus.focus(ref("#first"));
	const revision = tree.revision;
	expect(() =>
		Reflect.apply(tree.setActiveElement, tree, [id("#second"), null, "yes"]),
	).toThrow();
	expect(() =>
		Reflect.apply(tree.recordInputModality, tree, ["touch"]),
	).toThrow();
	expect(tree.revision).toBe(revision);
	expect(indicated()).toEqual([id("#first")]);
});

it("updates the native indication hint without changing an existing focus identity", () => {
	const { actions, tree, ref, id, indicated } = fixture();
	actions.focus.focus(ref("#first"));
	const revision = tree.revision;
	tree.setActiveElement(id("#first"), null, false);
	expect(indicated()).toEqual([]);
	tree.setActiveElement(id("#first"), null, true);
	expect(indicated()).toEqual([id("#first")]);
	expect(
		tree.changesSince(revision).changes.map((change) => change.kind),
	).toEqual(["focus-indication", "focus-indication"]);
});

it("remembers pointer modality before any element has received focus", () => {
	const { actions, id, ref, indicated } = fixture();
	actions.mouse.move(1000, 1000);
	actions.mouse.down();
	actions.mouse.up();
	actions.focus.focus(ref("#first"));
	expect(indicated()).toEqual([]);
	actions.keyboard.press("ArrowRight");
	expect(indicated()).toEqual([id("#first")]);
});

it.each([false, true])(
	"inherits indication through reentrant blur-driven focus, async=%s",
	async (asynchronous) => {
		const { actions, id, ref, indicated } = fixture();
		actions.click(ref("#field"));
		expect(indicated()).toEqual([id("#field")]);
		actions.events.addEventListener(id("#field"), "blur", () => {
			actions.focus.focus(ref("#first"));
		});
		if (asynchronous) await actions.focus.focusAsync(ref("#second"));
		else actions.focus.focus(ref("#second"));
		expect(actions.focus.active()).toBe(id("#first"));
		expect(indicated()).toEqual([id("#first")]);
		actions.focus.focus(null);
		actions.focus.focus(ref("#second"));
		expect(indicated()).toEqual([]);
	},
);
