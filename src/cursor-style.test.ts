import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import { directDeclaration } from "./css-declarations.js";
import {
	interactionStyleCapabilities,
	parseInteractionValue,
} from "./css-interaction.js";
import { parseCssDeclarations } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { GeneratedContentStyle } from "./generated-content-style.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { generatedControlStyle } from "./generated-style.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import { documentInteractions } from "./interactions.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const keywords = [
	"auto",
	"default",
	"none",
	"context-menu",
	"help",
	"pointer",
	"progress",
	"wait",
	"cell",
	"crosshair",
	"text",
	"vertical-text",
	"alias",
	"copy",
	"move",
	"no-drop",
	"not-allowed",
	"grab",
	"grabbing",
	"e-resize",
	"n-resize",
	"ne-resize",
	"nw-resize",
	"s-resize",
	"se-resize",
	"sw-resize",
	"w-resize",
	"ew-resize",
	"ns-resize",
	"nesw-resize",
	"nwse-resize",
	"col-resize",
	"row-resize",
	"all-scroll",
	"zoom-in",
	"zoom-out",
] as const;
const globals = ["initial", "inherit", "unset", "revert"] as const;
const parseInteraction = parseInteractionValue as (
	source: string,
	property?: "pointer-events" | "cursor",
) => string | undefined;
type CursorStyles = DocumentStyles & { cursor(id: number): string };
type CursorMetadata = { readonly cursor?: string };
interface CursorDeclaration {
	cursor: string;
	length: number;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
	item(index: number): string;
}
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(target, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		if (definition.indexed)
			Object.defineProperty(target, "length", {
				get: definition.indexed.length,
			});
		return target;
	},
};
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});

function fixture(
	css = "",
	content = '<div id="parent"><span id="target">Text</span></div><div id="other"></div>',
) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}body{margin:0}main{width:100px}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/cursor-style",
	);
	documents.push(document);
	const styles = documentStyles(document) as CursorStyles;
	styles.setViewport(120, 100);
	const queries = new DocumentQueries(document);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { document, styles, id };
}

function cursor(styles: CursorStyles, id: number): string {
	expect(typeof styles.cursor).toBe("function");
	return styles.cursor(id);
}

function declarations(source: string) {
	return parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 4 },
		() => {},
	);
}

function generated(
	styles: DocumentStyles,
	id: number,
	name: "before" | "after",
) {
	const result = styles.generatedContent(id, name) as
		| (GeneratedContentStyle & CursorMetadata)
		| undefined;
	expect(result).toBeDefined();
	if (!result) throw new Error(`Missing ::${name}`);
	return result;
}

it.each([...keywords, ...globals])(
	"normalizes cursor %s consistently in parser and CSSOM",
	(value) => {
		const source = ` ${value.toUpperCase()} `;
		expect(parseInteraction(source, "cursor")).toBe(value);
		expect(directDeclaration("cursor", source, true)).toEqual([
			{ name: "cursor", value, important: true },
		]);
		expect(declarations(`CURSOR:${source}!important`)).toEqual([
			{ property: "cursor", value, important: true },
		]);
	},
);

it("keeps the default and explicit pointer-events grammar unchanged", () => {
	for (const value of [...keywords, ...globals]) {
		const accepted = ["auto", "none", ...globals].includes(value);
		expect(parseInteraction(value)).toBe(accepted ? value : undefined);
		expect(parseInteraction(value, "pointer-events")).toBe(
			accepted ? value : undefined,
		);
		expect(directDeclaration("pointer-events", value, false)).toEqual(
			accepted ? [{ name: "pointer-events", value, important: false }] : [],
		);
		expect(declarations(`pointer-events:${value}`)).toEqual(
			accepted ? [{ property: "pointer-events", value, important: false }] : [],
		);
	}
});

it.each([
	"",
	"unknown",
	"0",
	"pointer wait",
	"auto, pointer",
	"pointer 1 2",
	"initial pointer",
	"url(cursor.cur)",
	'url("cursor.cur"), pointer',
	'url("cursor.cur") 1 2, pointer',
	"url(cursor.cur), url(other.cur), wait",
	"image-set(url(cursor.png) 1x), auto",
])(
	"rejects unsupported cursor syntax without resource loading: %s",
	(value) => {
		expect(parseInteraction(value, "cursor")).toBeUndefined();
		expect(directDeclaration("cursor", value, false)).toEqual([]);
		expect(declarations(`cursor:${value}`)).toEqual([]);
	},
);

it("defaults to auto and inherits through boxless ancestors and text nodes", () => {
	const { document, styles, id } = fixture("#parent{display:contents}");
	const target = id("#target");
	const text = document.createText("child");
	document.append(target, text);
	for (const node of [id("html"), id("#parent"), target, text])
		expect(cursor(styles, node)).toBe("auto");
	document.setAttribute(id("#host"), "style", "cursor:help");
	for (const node of [id("#parent"), target, text])
		expect(cursor(styles, node)).toBe("help");
	expect(resolvedStyleValue(document, target, "cursor")).toBe("help");
});

it.each([
	["auto", "auto"],
	["default", "default"],
	["none", "none"],
	["initial", "auto"],
	["inherit", "help"],
	["unset", "help"],
	["revert", "help"],
])("computes inherited cursor reset %s as %s", (value, expected) => {
	const { document, styles, id } = fixture(
		`main{cursor:help}#target{cursor:${value}}`,
	);
	expect(cursor(styles, id("#target"))).toBe(expected);
	expect(resolvedStyleValue(document, id("#target"), "cursor")).toBe(expected);
});

it.each(globals)("includes cursor in all:%s", (value) => {
	const { styles, id } = fixture(
		`main{cursor:help}#target{cursor:wait;all:${value}}`,
	);
	expect(cursor(styles, id("#target"))).toBe(
		value === "initial" ? "auto" : "help",
	);
});

it("honors specificity, source order, importance and invalid declaration recovery", () => {
	const { document, styles, id } = fixture(
		"#target{cursor:pointer}#target{cursor:copy;cursor:unknown}span{cursor:wait}",
	);
	const target = id("#target");
	expect(cursor(styles, target)).toBe("copy");
	document.setAttribute(target, "style", "cursor:grab");
	expect(cursor(styles, target)).toBe("grab");
	document.setTextContent(id("style"), "#target{cursor:wait!important}");
	expect(cursor(styles, target)).toBe("wait");
	document.setAttribute(
		target,
		"style",
		"cursor:zoom-in!important;cursor:none",
	);
	expect(cursor(styles, target)).toBe("zoom-in");
});

it("resolves variables, fallback and invalid-at-computed-value inheritance live", () => {
	const { document, styles, id } = fixture(
		"main{cursor:help}#target{cursor:none;cursor:var(--choice, crosshair)}",
	);
	const target = id("#target");
	expect(cursor(styles, target)).toBe("crosshair");
	for (const [source, expected] of [
		["--choice:GRAB", "grab"],
		["--choice:unknown", "help"],
		["--choice:initial", "crosshair"],
		["--choice:var(--choice)", "crosshair"],
	]) {
		document.setAttribute(id("#parent"), "style", source);
		expect(cursor(styles, target)).toBe(expected);
	}
});

it("invalidates cursor inheritance after class changes, reparenting and removal", () => {
	const { document, styles, id } = fixture(
		"#parent{cursor:pointer}#other{cursor:wait}.changed{cursor:copy}",
	);
	const target = id("#target");
	const reference = document.reference(target);
	expect(cursor(styles, target)).toBe("pointer");
	document.setAttribute(target, "class", "changed");
	expect(cursor(styles, target)).toBe("copy");
	document.removeAttribute(target, "class");
	document.append(id("#other"), target);
	expect(cursor(styles, target)).toBe("wait");
	document.remove(target);
	expect(resolvedStyleValue(document, target, "cursor")).toBe("");
	expect(() => cursor(styles, target)).toThrow(
		expect.objectContaining({ code: "not-found" }),
	);
	document.append(id("#parent"), target);
	expect(cursor(styles, target)).toBe("pointer");
	expect(document.reference(target)).toBe(reference);
});

it("exposes a live read-only computed cursor and mutable inline CSSOM cursor", () => {
	const { document, id } = fixture("main{cursor:help}");
	const target = id("#target");
	const computed = new ComputedStyles(document, factory).get(
		target,
	) as CursorDeclaration;
	const inline = new InlineStyles(document, factory).get(
		target,
	) as CursorDeclaration;
	expect(computedStyleProperties).toContain("cursor");
	expect(computed.cursor).toBe("help");
	expect(computed.getPropertyValue("CURSOR")).toBe("help");
	expect(
		Array.from({ length: computed.length }, (_value, index) =>
			computed.item(index),
		),
	).toContain("cursor");
	inline.setProperty("cursor", " POINTER ", "important");
	expect(inline.cursor).toBe("pointer");
	expect(inline.getPropertyPriority("cursor")).toBe("important");
	expect(computed.cursor).toBe("pointer");
	inline.cursor = 'url("cursor.cur"), wait';
	expect(inline.cursor).toBe("pointer");
	expect(computed.cursor).toBe("pointer");
	inline.cursor = "none";
	expect(computed.cursor).toBe("none");
	expect(inline.removeProperty("cursor")).toBe("none");
	expect(computed.cursor).toBe("help");
	expect(() => computed.setProperty("cursor", "wait")).toThrow();
	expect(() => {
		computed.cursor = "wait";
	}).toThrow();
	expect(documentGeometry(document).metrics().builds).toBe(0);
});

it.each([
	["", "help"],
	["cursor:inherit", "help"],
	["cursor:unset", "help"],
	["cursor:revert", "help"],
	["cursor:none", "none"],
	["cursor:not-allowed", "not-allowed"],
	["cursor:auto", undefined],
	["cursor:initial", undefined],
	["all:initial", undefined],
	["all:unset", "help"],
])(
	"computes optional generated pseudo cursor metadata for %s",
	(declaration, expected) => {
		const { styles, id } = fixture(
			`main{cursor:help}#target::before{${declaration};content:"B"}#target::after{content:"A"}`,
		);
		const before = generated(styles, id("#target"), "before");
		expect(before.cursor).toBe(expected);
		expect(Object.hasOwn(before, "cursor")).toBe(expected !== undefined);
		expect(Object.isFrozen(before)).toBe(true);
		expect(generated(styles, id("#target"), "after").cursor).toBe("help");
		expect(cursor(styles, id("#target"))).toBe("help");
	},
);

it("recascades generated cursor variables and omits default metadata", () => {
	const { document, styles, id } = fixture(
		'#target::before{content:"B";cursor:var(--choice, inherit)}#target::after{content:"A"}',
	);
	const target = id("#target");
	expect(Object.hasOwn(generated(styles, target, "before"), "cursor")).toBe(
		false,
	);
	document.setAttribute(target, "style", "cursor:wait;--choice:copy");
	expect(generated(styles, target, "before").cursor).toBe("copy");
	expect(generated(styles, target, "after").cursor).toBe("wait");
	document.setAttribute(target, "style", "cursor:help;--choice:invalid");
	expect(generated(styles, target, "before").cursor).toBe("help");
	document.removeAttribute(target, "style");
	for (const name of ["before", "after"] as const)
		expect(Object.hasOwn(generated(styles, target, name), "cursor")).toBe(
			false,
		);
});

it("inherits cursor on native controls and optional generated summary metadata", () => {
	const { document, styles, id } = fixture(
		"main{cursor:wait}",
		'<input id="field"><button id="button">Go</button><select id="select"><option>A</option></select><textarea id="area">Text</textarea><details id="details">Body</details>',
	);
	for (const selector of ["#field", "#button", "#select", "#area", "#details"])
		expect(cursor(styles, id(selector))).toBe("wait");
	const target = documentGeneratedControls(document).detailsSummary(
		id("#details"),
	);
	expect(target).toBeDefined();
	if (!target) throw new Error("Missing generated summary");
	const read = () =>
		generatedControlStyle(document, target.ref) as CursorMetadata;
	expect(read().cursor).toBe("wait");
	document.setAttribute(id("#details"), "style", "cursor:none");
	expect(read().cursor).toBe("none");
	document.setAttribute(id("#details"), "style", "cursor:initial");
	expect(Object.hasOwn(read(), "cursor")).toBe(false);
	document.setTextContent(id("style"), "");
	document.removeAttribute(id("#details"), "style");
	expect(Object.hasOwn(read(), "cursor")).toBe(false);
});

it.each(["none", "not-allowed", "wait"])(
	"keeps geometry, raster, hit targets, clicks and focus unchanged for cursor:%s",
	(value) => {
		const { document, styles, id } = fixture(
			"button{display:block;width:40px;height:20px;padding:0;border:0}",
			'<button id="target">Go</button><button id="next">Next</button>',
		);
		const target = id("#target");
		const geometry = documentGeometry(document);
		const bounds = geometry.getBoundingClientRect(target);
		const image = rasterizeDocument(document).image;
		const height = layoutDocument(document).flowHeight;
		const hits = documentHitTesting(document);
		const point = {
			x: bounds.x + bounds.width / 2,
			y: bounds.y + bounds.height / 2,
		};
		const hitTargets = hits.elementsFromPoint(point.x, point.y);
		expect(hits.elementFromPoint(point.x, point.y)).toBe(target);
		document.setAttribute(target, "style", `cursor:${value}`);
		expect(cursor(styles, target)).toBe(value);
		expect(geometry.getBoundingClientRect(target)).toEqual(bounds);
		expect(layoutDocument(document).flowHeight).toBe(height);
		expect(rasterizeDocument(document).image).toEqual(image);
		expect(hits.elementsFromPoint(point.x, point.y)).toEqual(hitTargets);
		const actions = documentInteractions(document);
		let clicks = 0;
		actions.events.addEventListener(target, "click", () => {
			clicks += 1;
		});
		actions.mouse.move(point.x, point.y);
		actions.mouse.down();
		actions.mouse.up();
		expect(clicks).toBe(1);
		actions.click(document.reference(target));
		expect(clicks).toBe(2);
		actions.focus.focus(document.reference(target));
		expect(actions.focus.active()).toBe(target);
		actions.keyboard.press("Tab");
		expect(actions.focus.active()).toBe(id("#next"));
	},
);

it("keeps pointer-events suppression independent of cursor and keyboard focus", () => {
	const { document, styles, id } = fixture(
		"#target{width:40px;height:20px;pointer-events:none;cursor:wait}",
		'<button id="target">Go</button>',
	);
	const target = id("#target");
	const bounds = documentGeometry(document).getBoundingClientRect(target);
	const hits = documentHitTesting(document);
	const actions = documentInteractions(document);
	for (const value of ["auto", "none", "not-allowed", "wait"]) {
		document.setAttribute(target, "style", `cursor:${value}`);
		expect(cursor(styles, target)).toBe(value);
		expect(styles.pointerEvents(target)).toBe("none");
		expect(hits.elementsFromPoint(bounds.x + 2, bounds.y + 2)).not.toContain(
			target,
		);
		actions.focus.focus(document.reference(target));
		expect(actions.focus.active()).toBe(target);
	}
	document.setAttribute(target, "style", "cursor:none;pointer-events:auto");
	expect(hits.elementFromPoint(bounds.x + 2, bounds.y + 2)).toBe(target);
});

it.each(["disabled", "inert"])(
	"does not override the %s action guard",
	(guard) => {
		const { document, styles, id } = fixture(
			"",
			'<div id="parent"><button id="target">Go</button></div>',
		);
		const target = id("#target");
		document.setAttribute(
			guard === "inert" ? id("#parent") : target,
			guard,
			"",
		);
		const actions = documentInteractions(document);
		let clicks = 0;
		actions.events.addEventListener(target, "click", () => {
			clicks += 1;
		});
		for (const value of ["auto", "none", "not-allowed", "wait"]) {
			document.setAttribute(target, "style", `cursor:${value}`);
			expect(cursor(styles, target)).toBe(value);
			expect(() => actions.click(document.reference(target))).toThrow(
				expect.objectContaining({ code: "not-actionable" }),
			);
			expect(() => actions.focus.focus(document.reference(target))).toThrow(
				expect.objectContaining({ code: "not-actionable" }),
			);
		}
		expect(clicks).toBe(0);
	},
);

it.each([{ maxDeclarations: 1 }, { maxRules: 1 }, { maxWork: 2 }])(
	"keeps cursor style work bounded by %j",
	(limits) => {
		const { document, id } = fixture("main{cursor:help}#target{cursor:wait}");
		const limited = new DocumentStyles(document, limits) as CursorStyles;
		for (let attempt = 0; attempt < 2; attempt += 1)
			expect(() => cursor(limited, id("#target"))).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
	},
);

it("caches generated cursor metadata without bypassing work budgets", () => {
	const { document, styles, id } = fixture(
		'main{cursor:wait}#target::before{content:"B";cursor:inherit}',
	);
	const target = id("#target");
	const baseline = styles.metrics();
	const before = generated(styles, target, "before");
	expect(before.cursor).toBe("wait");
	const work = styles.metrics().generatedContentWork;
	expect(work).toBeGreaterThan(0);
	expect(generated(styles, target, "before")).toBe(before);
	expect(styles.metrics().generatedContentWork).toBe(work);
	const limited = new DocumentStyles(document, { maxWork: baseline.work + 1 });
	expect(() => limited.generatedContent(target, "before")).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const hits = new DocumentHitTesting(document, { maxWork: 2 });
	expect(() => hits.elementFromPoint(1, 1)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("closes retained cursor readers and generated metadata with their document", () => {
	const { document, styles, id } = fixture(
		'main{cursor:wait}#target::before{content:"B"}',
		'<details id="target">Body</details>',
	);
	const target = id("#target");
	const computedStyles = new ComputedStyles(document, factory);
	const computed = computedStyles.get(target) as CursorDeclaration;
	const summary = documentGeneratedControls(document).detailsSummary(target);
	expect(summary).toBeDefined();
	if (!summary) throw new Error("Missing generated summary");
	expect(computed.cursor).toBe("wait");
	expect(generated(styles, target, "before").cursor).toBe("wait");
	expect(
		(generatedControlStyle(document, summary.ref) as CursorMetadata).cursor,
	).toBe("wait");
	document.close();
	document.close();
	for (const read of [
		() => cursor(styles, target),
		() => computed.cursor,
		() => styles.generatedContent(target, "before"),
		() => generatedControlStyle(document, summary.ref),
	])
		expect(read).toThrow(expect.objectContaining({ code: "closed" }));
	expect(computedStyles.metrics().closed).toBe(true);
});

it("advertises keyword metadata without cursor images or physical cursor painting", () => {
	expect(interactionStyleCapabilities).toMatchObject({
		cursorImages: false,
		systemCursor: false,
		focusUnaffected: true,
	});
	expect(interactionStyleCapabilities.properties).toContain("cursor");
});
