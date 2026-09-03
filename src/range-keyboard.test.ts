import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { controlValidity } from "./control-validity.js";
import { controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { BrowserEvent, controlledEventListener } from "./events.js";
import { DocumentInteractions } from "./interactions.js";
import { rangeKeyboardValue } from "./range-keyboard.js";
import { BrowserSession } from "./session.js";

const documents: DocumentTree[] = [];
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(attributes: Record<string, string> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const id = tree.createElement("input", { type: "range", ...attributes });
	tree.append(tree.root, id);
	const actions = new DocumentInteractions(tree);
	actions.focus.focus(tree.reference(id));
	return { tree, id, actions, value: () => controlValue(tree, id) };
}

it.each(["ArrowRight", "ArrowUp"])("increments a range with %s", (key) => {
	const { actions, value } = fixture();
	actions.keyboard.press(key);
	expect(value()).toBe("51");
});

it("moves to the first and last allowed slider values", () => {
	const { actions, value } = fixture({ min: "1", max: "10", step: "2" });
	actions.keyboard.press("End");
	expect(value()).toBe("9");
	actions.keyboard.press("Home");
	expect(value()).toBe("1");
});

it.each<[string, string]>([
	["ArrowRight", "51"],
	["ArrowUp", "51"],
	["ArrowLeft", "49"],
	["ArrowDown", "49"],
	["Home", "0"],
	["End", "100"],
	["PageUp", "60"],
	["PageDown", "40"],
])("handles %s with the default range", (key, expected) => {
	const { actions, value } = fixture();
	actions.keyboard.press(key);
	expect(value()).toBe(expected);
});

it.each<[string, string]>([
	["ArrowRight", "0.4"],
	["ArrowUp", "0.4"],
	["ArrowLeft", "0.2"],
	["ArrowDown", "0.2"],
	["Home", "0.1"],
	["End", "1"],
	["PageUp", "1"],
	["PageDown", "0.1"],
])("handles fractional stepping with %s", (key, expected) => {
	const { actions, tree, id, value } = fixture({
		min: "0.1",
		max: "1",
		step: "0.1",
	});
	tree.setControl(id, { value: "0.3" });
	actions.keyboard.press(key);
	expect(value()).toBe(expected);
	expect(controlValidity(tree, id).valid).toBe(true);
});

it("keeps repeated decimal adjustments aligned", () => {
	const { actions, tree, id, value } = fixture({
		min: "0",
		max: "10",
		step: "0.1",
	});
	tree.setControl(id, { value: "0" });
	for (let count = 1; count <= 20; count++) {
		actions.keyboard.press("ArrowRight");
		expect(value()).toBe(String(count / 10));
		expect(controlValidity(tree, id).stepMismatch).toBe(false);
	}
});

it("uses the value attribute's step base when min is absent", () => {
	const { actions, tree, id, value } = fixture({ value: "0.5", step: "1" });
	tree.setControl(id, { value: "5.5" });
	actions.keyboard.press("ArrowRight");
	expect(value()).toBe("6.5");
	actions.keyboard.press("Home");
	expect(value()).toBe("0.5");
	actions.keyboard.press("End");
	expect(value()).toBe("99.5");
});

it.each<[string, string]>([
	["ArrowRight", "0.51"],
	["ArrowUp", "0.51"],
	["ArrowLeft", "0.49"],
	["ArrowDown", "0.49"],
	["Home", "0"],
	["End", "1"],
	["PageUp", "0.6"],
	["PageDown", "0.4"],
])("uses the documented any-step fraction for %s", (key, expected) => {
	expect(
		rangeKeyboardValue("0.5", { min: "0", max: "1", step: "any" }, key),
	).toBe(expected);
});

it("moves any-step values relative to the current value, not a snapped lattice", () => {
	expect(
		rangeKeyboardValue(
			"0.005",
			{ min: "0", max: "1", step: "any" },
			"ArrowRight",
		),
	).toBe("0.015");
	expect(
		rangeKeyboardValue(
			"0.005",
			{ min: "0", max: "1", step: "any" },
			"ArrowLeft",
		),
	).toBe("0");
});

it("bounds extreme span and step arithmetic before number conversion", () => {
	expect(
		rangeKeyboardValue(
			"0",
			{ min: "-1e308", max: "1e308", step: "any" },
			"ArrowRight",
		),
	).toBe("2e+306");
	expect(
		rangeKeyboardValue(
			"1e308",
			{ min: "0", max: "1.7e308", step: "1e308" },
			"PageUp",
		),
	).toBe("1e308");
	expect(
		rangeKeyboardValue(
			"0",
			{ min: "0", max: "1", step: "5e-324" },
			"ArrowRight",
		),
	).toBe("5e-324");
	expect(
		rangeKeyboardValue(
			"0",
			{ min: "0", max: "5e-324", step: "any" },
			"ArrowRight",
		),
	).toBe("0");
	expect(
		rangeKeyboardValue("0", { min: "0", max: "5e-324", step: "any" }, "End"),
	).toBe("5e-324");
});

it.each<Record<string, string>>([
	{ min: "10", max: "0" },
	{ min: "1", max: "1" },
	{ value: "0.5", max: "0.4", step: "1" },
])("does not invent an allowed adjustment for %j", (attributes) => {
	const { actions, id, value, tree } = fixture(attributes);
	const before = value();
	const seen: string[] = [];
	actions.events.addEventListener(id, "input", () => seen.push("input"));
	for (const key of [
		"ArrowRight",
		"ArrowLeft",
		"Home",
		"End",
		"PageUp",
		"PageDown",
	])
		actions.keyboard.press(key);
	expect(value()).toBe(before);
	expect(tree.wasUserEditedValue(id)).toBe(false);
	expect(seen).toEqual([]);
});

it("does not emit input/change or dirty a range at its boundary", () => {
	const { actions, tree, id, value } = fixture({ value: "100" });
	const seen: string[] = [];
	for (const type of ["input", "change"])
		actions.events.addEventListener(id, type, () => seen.push(type));
	actions.keyboard.press("ArrowRight");
	expect(value()).toBe("100");
	expect(tree.wasUserEditedValue(id)).toBe(false);
	expect(seen).toEqual([]);
});

it("dispatches keydown, input, change and keyup with committed values", () => {
	const { actions, tree, id, value } = fixture();
	const seen: unknown[] = [];
	for (const type of [
		"keydown",
		"keypress",
		"beforeinput",
		"input",
		"change",
		"keyup",
	])
		actions.events.addEventListener(id, type, (event) => {
			if (type === "input" || type === "change")
				expect(event.constructor).toBe(BrowserEvent);
			seen.push([type, value(), event.cancelable, event.composed]);
		});
	actions.keyboard.press("ArrowRight");
	expect(seen).toEqual([
		["keydown", "50", true, true],
		["input", "51", false, true],
		["change", "51", false, false],
		["keyup", "51", true, true],
	]);
	expect(tree.wasUserEditedValue(id)).toBe(true);
	actions.focus.focus(null);
	expect(seen).toHaveLength(4);
});

it("honors keydown cancellation without writing or committing", () => {
	const { actions, id, value } = fixture();
	const seen: string[] = [];
	actions.events.addEventListener(id, "keydown", (event) =>
		event.preventDefault(),
	);
	for (const type of ["input", "change", "keyup"])
		actions.events.addEventListener(id, type, () => seen.push(type));
	expect(actions.keyboard.press("ArrowRight").canceled).toBe(true);
	expect(value()).toBe("50");
	expect(seen).toEqual(["keyup"]);
});

it("uses current attributes and values after keydown listeners", () => {
	const { actions, tree, id, value } = fixture();
	actions.events.addEventListener(id, "keydown", () => {
		tree.setAttribute(id, "step", "10");
		tree.setControl(id, { value: "20" });
	});
	actions.keyboard.press("ArrowRight");
	expect(value()).toBe("30");
});

it.each(["disabled", "hidden", "inert"])(
	"does not edit a range made %s during keydown",
	(attribute) => {
		const { actions, tree, id, value } = fixture();
		actions.events.addEventListener(id, "keydown", () =>
			tree.setAttribute(id, attribute, ""),
		);
		actions.keyboard.press("ArrowRight");
		expect(value()).toBe("50");
		expect(tree.wasUserEditedValue(id)).toBe(false);
	},
);

it("ignores inapplicable readonly and required flags", () => {
	const { actions, value } = fixture({ readonly: "", required: "" });
	actions.keyboard.press("ArrowRight");
	expect(value()).toBe("51");
});

it("does not edit after keydown redirects focus", () => {
	const { actions, tree, id, value } = fixture();
	const other = tree.createElement("input");
	tree.append(tree.root, other);
	actions.events.addEventListener(id, "keydown", () =>
		actions.focus.focus(tree.reference(other)),
	);
	actions.keyboard.press("ArrowRight");
	expect(value()).toBe("50");
});

it("preserves input-listener rewrites and commits them without a blur duplicate", () => {
	const { actions, tree, id, value } = fixture();
	const seen: string[] = [];
	actions.events.addEventListener(id, "input", () =>
		tree.setControl(id, { value: "80" }),
	);
	actions.events.addEventListener(id, "change", () => seen.push(value()));
	actions.keyboard.press("ArrowRight");
	actions.focus.focus(null);
	expect(seen).toEqual(["80"]);
	expect(tree.wasUserEditedValue(id)).toBe(false);
});

it.each(["Control+ArrowRight", "Meta+ArrowRight", "Alt+ArrowRight"])(
	"does not hijack %s",
	(chord) => {
		const { actions, value } = fixture();
		actions.keyboard.press(chord);
		expect(value()).toBe("50");
	},
);

it("keeps printable typing separate from slider keys", () => {
	const { actions, value } = fixture();
	expect(() => actions.keyboard.type("5")).toThrow("not implemented");
	actions.keyboard.press("a");
	expect(value()).toBe("50");
});

it("waits for controlled keydown callbacks before adjusting", async () => {
	const { actions, tree, id, value } = fixture();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	actions.events.addEventListener(
		id,
		"keydown",
		controlledEventListener(async () => {
			await gate;
			tree.setAttribute(id, "step", "10");
		}),
	);
	const pending = actions.keyboard.pressAsync("ArrowRight");
	expect(value()).toBe("50");
	release();
	await pending;
	expect(value()).toBe("60");
});

it("rejects a step write atomically when retained text is at quota", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 64 });
	documents.push(tree);
	const id = tree.createElement("input", { type: "range" });
	tree.append(tree.root, id);
	tree.setControl(id, { value: "9" });
	const used = (tree as unknown as { textCodeUnits: number }).textCodeUnits;
	tree.setCustomValidity(id, "x".repeat(64 - used));
	const actions = new DocumentInteractions(tree);
	actions.focus.focus(tree.reference(id));
	const seen: string[] = [];
	actions.events.addEventListener(id, "input", () => seen.push("input"));
	expect(() => actions.keyboard.press("ArrowRight")).toThrow("text limit");
	expect(controlValue(tree, id)).toBe("9");
	expect(tree.wasUserEditedValue(id)).toBe(false);
	expect(seen).toEqual([]);
});

it("matches a small integer-grid stepping oracle", () => {
	for (const minimum of [-5, 0, 5]) {
		for (const step of [1, 2, 3]) {
			const maximum = minimum + 10;
			const allowed: number[] = [];
			for (let value = minimum; value <= maximum; value += step)
				allowed.push(value);
			for (const [index, value] of allowed.entries()) {
				const attributes = {
					min: String(minimum),
					max: String(maximum),
					step: String(step),
				};
				expect(
					Number(rangeKeyboardValue(String(value), attributes, "ArrowRight")),
				).toBe(allowed[Math.min(index + 1, allowed.length - 1)]);
				expect(
					Number(rangeKeyboardValue(String(value), attributes, "ArrowLeft")),
				).toBe(allowed[Math.max(index - 1, 0)]);
			}
		}
	}
});

it("advertises and executes range-key commands through an injected host", async () => {
	let browser!: BrowserSession;
	const host = new BrowserCommandHost({
		createSession: () => {
			browser = new BrowserSession({
				loadDocument: (response) => new DocumentTree(response.url),
				createTransport: () => ({
					request: async (request) => ({
						url: request.url,
						status: 200,
						headers: {},
						body: new Uint8Array(),
						redirects: [],
						encodedBytes: 0,
						elapsedMs: 0,
					}),
					metrics: () => ({
						requests: 0,
						active: 0,
						closed: false,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
					}),
					close: () => {},
				}),
			});
			return browser;
		},
	});
	hosts.push(host);
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		rangeKeyboard: { partial: true, pageSteps: 10, anyStepFraction: 0.01 },
	});
	await host.execute(["open", "https://fixture.invalid/"]);
	const page = browser.page(browser.tabs()[0].id);
	const id = page.document.createElement("input", {
		type: "range",
		id: "slider",
	});
	page.document.append(page.document.root, id);
	await host.execute(["fill", "#slider", "50"]);
	await host.execute(["press", "ArrowRight"]);
	expect(controlValue(page.document, id)).toBe("51");
});
