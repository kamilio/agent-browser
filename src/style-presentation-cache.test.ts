import { afterEach, expect, it } from "vitest";
import { describeControl, rasterizeControl } from "./control-rendering.js";
import { controlChecked, controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentLimits, DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import { DocumentQueries } from "./selectors.js";
import { type DocumentStyles, documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	markup = '<input id="field" value="ABCD" size="8">',
	css = "",
	limits: Partial<DocumentLimits> = {},
) {
	const tree = parseHtmlDocument(
		`<style id="sheet">html,body{margin:0;padding:0}input,textarea{display:block;font-size:8px;color:red;width:120px}textarea{height:80px}${css}</style>${markup}`,
		"https://fixture.invalid/style-presentation",
		{ limits },
	);
	trees.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(240, 180);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#field") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const field = id();
	const actions = documentInteractions(tree);
	return {
		tree,
		styles,
		queries,
		id,
		field,
		actions,
		focus: () => actions.focus.focus(tree.reference(field)),
		selection: () => readNativeControlSelection(tree, field),
		value: () => controlValue(tree, field),
	};
}

function builds(styles: DocumentStyles): number {
	return (
		styles.metrics() as ReturnType<DocumentStyles["metrics"]> & {
			cascadeBuilds: number;
		}
	).cascadeBuilds;
}

function cache(styles: DocumentStyles, field: number) {
	return {
		get: styles.get(field),
		text: styles.text(field),
		box: styles.box(field),
		paint: styles.paint(field),
	};
}

function sameCache(
	styles: DocumentStyles,
	field: number,
	before: ReturnType<typeof cache>,
) {
	const after = cache(styles, field);
	for (const name of ["get", "text", "box", "paint"] as const)
		expect(after[name]).toBe(before[name]);
}

function pixels(tree: DocumentTree, field: number) {
	const styles = documentStyles(tree);
	const control = describeControl(
		tree,
		field,
		Number.parseFloat(styles.text(field)["font-size"]),
	);
	if (!control) throw new Error("Missing native control descriptor");
	let work = 0;
	return rasterizeControl(
		control,
		control.width,
		control.height,
		styles.paint(field),
		(units) => {
			work += units;
			if (work > 100_000)
				throw new Error("Bounded control raster work exceeded");
		},
	).pixels;
}

it("counts one completed initial cascade and does not rebuild for repeated cache reads", () => {
	const { styles, field } = fixture();
	const before = cache(styles, field);
	expect(builds(styles)).toBe(1);
	for (let repeat = 0; repeat < 4; repeat++) sameCache(styles, field, before);
	expect(builds(styles)).toBe(1);
});

it("preserves all four CSS caches during repeated real typing while values, geometry and pixels refresh", () => {
	const test = fixture('<input id="field" size="8">');
	test.focus();
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	const geometry = documentGeometry(test.tree);
	geometry.getBoundingClientRect(test.field);
	const geometryBuilds = geometry.metrics().builds;
	let previousPixels = pixels(test.tree, test.field);
	let expected = "";
	for (const character of "typed") {
		test.actions.keyboard.type(character);
		expected += character;
		expect(test.value()).toBe(expected);
		expect(test.selection()).toMatchObject({
			anchor: expected.length,
			focus: expected.length,
			valueLength: expected.length,
		});
		geometry.getBoundingClientRect(test.field);
		expect(geometry.metrics().revision).toBe(test.tree.revision);
		const nextPixels = pixels(test.tree, test.field);
		expect(nextPixels).not.toEqual(previousPixels);
		previousPixels = nextPixels;
		sameCache(test.styles, test.field, before);
		expect(builds(test.styles)).toBe(count);
	}
	expect(geometry.metrics().builds).toBeGreaterThan(geometryBuilds);
});

it("preserves cached CSS through horizontal selection and paints a fresh selected control", () => {
	const test = fixture();
	test.focus();
	test.actions.keyboard.collapseEnd(test.field);
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	const originalPixels = pixels(test.tree, test.field);
	test.actions.keyboard.press("Shift+ArrowLeft");
	expect(test.selection()).toMatchObject({ anchor: 4, focus: 3 });
	expect(pixels(test.tree, test.field)).not.toEqual(originalPixels);
	test.actions.keyboard.press("Control+A");
	expect(test.selection()).toMatchObject({ anchor: 0, focus: 4 });
	test.actions.keyboard.press("ArrowLeft");
	expect(test.selection()).toMatchObject({ anchor: 0, focus: 0 });
	expect(test.value()).toBe("ABCD");
	sameCache(test.styles, test.field, before);
	expect(builds(test.styles)).toBe(count);
});

it("skips only the caret phase of actual primary mousedown, not pointer-state changes", () => {
	const test = fixture();
	test.focus();
	test.actions.keyboard.collapseEnd(test.field);
	test.actions.mouse.move(12, 8);
	let before: ReturnType<typeof cache> | undefined;
	let count = -1;
	test.actions.events.addEventListener(test.field, "mousedown", () => {
		before = cache(test.styles, test.field);
		count = builds(test.styles);
	});
	test.actions.mouse.down();
	expect(test.selection()).toMatchObject({ anchor: 1, focus: 1 });
	expect(before).toBeDefined();
	if (!before) throw new Error("Missing actual mousedown cache capture");
	sameCache(test.styles, test.field, before);
	expect(builds(test.styles)).toBe(count);
	test.actions.mouse.up();
	expect(test.styles.get(test.field)).not.toBe(before.get);
	expect(builds(test.styles)).toBeGreaterThan(count);
	expect(test.value()).toBe("ABCD");
});

it("keeps native textarea vertical movement and preferred column fresh without cascading again", () => {
	const test = fixture(
		'<textarea id="field" cols="20" rows="5">ABCDE\nX\n12345</textarea>',
	);
	test.focus();
	test.actions.keyboard.collapseEnd(test.field);
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	for (const [key, offset] of [
		["ArrowUp", 7],
		["ArrowUp", 5],
		["ArrowDown", 7],
		["ArrowDown", 13],
	] as const) {
		test.actions.keyboard.press(key);
		expect(test.selection()).toMatchObject({ anchor: offset, focus: offset });
		sameCache(test.styles, test.field, before);
		expect(builds(test.styles)).toBe(count);
	}
	test.actions.keyboard.press("Shift+ArrowUp");
	expect(test.selection()).toMatchObject({ anchor: 13, focus: 7 });
	test.actions.keyboard.type("!");
	expect(test.value()).toBe("ABCDE\nX!");
	sameCache(test.styles, test.field, before);
	expect(builds(test.styles)).toBe(count);
});

it("keeps readonly selection and repeated no-op caret placement cache-stable", () => {
	const test = fixture('<input id="field" value="ABCD" readonly>');
	test.focus();
	test.actions.keyboard.collapseEnd(test.field);
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	const revision = test.tree.revision;
	for (let repeat = 0; repeat < 3; repeat++)
		test.actions.keyboard.collapseEnd(test.field);
	expect(test.tree.revision).toBe(revision);
	test.actions.keyboard.press("Shift+ArrowLeft");
	expect(test.selection()).toMatchObject({ anchor: 4, focus: 3 });
	expect(() => test.actions.keyboard.type("X")).toThrow("readonly");
	expect(test.value()).toBe("ABCD");
	sameCache(test.styles, test.field, before);
	expect(builds(test.styles)).toBe(count);
});

it("keeps password metadata numeric/masked while typing and surrogate selection preserve CSS caches", () => {
	const test = fixture('<input id="field" type="password" size="8">');
	test.focus();
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	test.actions.keyboard.type("a🙂b");
	test.actions.keyboard.press("ArrowLeft");
	test.actions.keyboard.press("Shift+ArrowLeft");
	expect(test.selection()).toEqual({
		anchor: 3,
		focus: 1,
		start: 1,
		end: 3,
		valueLength: 4,
	});
	const descriptor = describeControl(test.tree, test.field, 8);
	expect(descriptor?.text).toBe("****");
	expect(
		JSON.stringify({
			descriptor,
			selection: test.selection(),
			css: cache(test.styles, test.field),
			metrics: test.styles.metrics(),
		}),
	).not.toContain("a🙂b");
	sameCache(test.styles, test.field, before);
	expect(builds(test.styles)).toBe(count);
});

it("rebuilds for placeholder value transitions but skips pure selection even with that dependency", () => {
	const test = fixture(
		'<input id="field" placeholder="hint">',
		"#field:placeholder-shown{color:blue;width:90px}",
	);
	test.focus();
	for (let cycle = 0; cycle < 3; cycle++) {
		expect(test.styles.paint(test.field).color).toEqual([0, 0, 255, 255]);
		const emptyCount = builds(test.styles);
		test.actions.keyboard.type("x");
		expect(test.styles.paint(test.field).color).toEqual([255, 0, 0, 255]);
		expect(test.styles.box(test.field).width).toBe("120px");
		expect(builds(test.styles)).toBeGreaterThan(emptyCount);
		const filled = cache(test.styles, test.field);
		const filledCount = builds(test.styles);
		test.actions.keyboard.press("Home");
		test.actions.keyboard.press("Control+A");
		sameCache(test.styles, test.field, filled);
		expect(builds(test.styles)).toBe(filledCount);
		test.actions.keyboard.press("Delete");
		expect(test.value()).toBe("");
		expect(test.styles.box(test.field).width).toBe("90px");
		expect(builds(test.styles)).toBeGreaterThan(filledCount);
	}
});

it("does not forget a control-value selector after more than 32 later selector compilations", () => {
	const later = Array.from(
		{ length: 40 },
		(_value, index) => `.missing${index}{color:green}`,
	).join("");
	const test = fixture(
		'<input id="field" placeholder="hint">',
		`#field:placeholder-shown{color:blue}${later}`,
	);
	expect(test.styles.paint(test.field).color).toEqual([0, 0, 255, 255]);
	const count = builds(test.styles);
	test.tree.setControl(test.field, { value: "filled" });
	expect(test.styles.paint(test.field).color).toEqual([255, 0, 0, 255]);
	expect(builds(test.styles)).toBe(count + 1);
	test.tree.setControl(test.field, { value: "" });
	expect(test.styles.paint(test.field).color).toEqual([0, 0, 255, 255]);
	expect(builds(test.styles)).toBe(count + 2);
});

it.each(["paint-first", "attribute-first"])(
	"rebuilds all caches for a mixed journal in %s order",
	(order) => {
		const test = fixture(
			undefined,
			"#field.changed{font-size:10px;width:90px;color:blue}",
		);
		test.focus();
		test.actions.keyboard.placeControlCaret(test.field, 0);
		const before = cache(test.styles, test.field);
		const count = builds(test.styles);
		const paint = () => test.actions.keyboard.collapseEnd(test.field);
		const attribute = () =>
			test.tree.setAttribute(test.field, "class", "changed");
		if (order === "paint-first") {
			paint();
			attribute();
		} else {
			attribute();
			paint();
		}
		const after = cache(test.styles, test.field);
		expect(after.get).not.toBe(before.get);
		expect(after.text["font-size"]).toBe("10px");
		expect(after.box.width).toBe("90px");
		expect(after.paint.color).toEqual([0, 0, 255, 255]);
		expect(builds(test.styles)).toBe(count + 1);
	},
);

it("retains default conservative invalidation for ordinary presentation callers", () => {
	const test = fixture();
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	test.tree.invalidatePresentation();
	expect(test.styles.get(test.field)).not.toBe(before.get);
	expect(builds(test.styles)).toBe(count + 1);
});

it("refreshes inline attributes and embedded stylesheet text instead of treating them as paint", () => {
	const test = fixture();
	const initial = cache(test.styles, test.field);
	const count = builds(test.styles);
	test.tree.setAttribute(test.field, "style", "width:70px;color:blue");
	expect(test.styles.get(test.field)).not.toBe(initial.get);
	expect(test.styles.box(test.field).width).toBe("70px");
	expect(test.styles.paint(test.field).color).toEqual([0, 0, 255, 255]);
	expect(builds(test.styles)).toBe(count + 1);
	test.tree.setData(
		test.tree.get(test.id("#sheet")).children[0],
		"#field{width:95px!important;color:green!important}",
	);
	expect(test.styles.box(test.field).width).toBe("95px");
	expect(test.styles.paint(test.field).color).toEqual([0, 128, 0, 255]);
	expect(builds(test.styles)).toBe(count + 2);
});

it("refreshes actual external sheet and viewport/media state", () => {
	const test = fixture(
		'<link id="external" rel="stylesheet" href="/sheet.css"><input id="field">',
	);
	const initial = cache(test.styles, test.field);
	const count = builds(test.styles);
	test.styles.setExternalSheet(
		test.id("#external"),
		"https://fixture.invalid/sheet.css",
		"#field{width:80px}@media(max-width:150px){#field{width:60px}}",
	);
	expect(test.styles.get(test.field)).not.toBe(initial.get);
	expect(test.styles.box(test.field).width).toBe("80px");
	expect(builds(test.styles)).toBe(count + 1);
	test.styles.setViewport(120, 180);
	expect(test.styles.box(test.field).width).toBe("60px");
	expect(builds(test.styles)).toBe(count + 2);
	test.tree.setAttribute(test.id("#external"), "disabled", "");
	expect(test.styles.box(test.field).width).toBe("120px");
	expect(builds(test.styles)).toBe(count + 3);
});

it.each(["checkbox", "radio"])(
	"does not skip checked state changes on %s controls",
	(type) => {
		const test = fixture(
			`<input id="field" type="${type}">`,
			"#field:checked{color:blue}",
		);
		expect(test.styles.paint(test.field).color).toEqual([255, 0, 0, 255]);
		const count = builds(test.styles);
		test.tree.setControl(test.field, { checked: true });
		expect(controlChecked(test.tree, test.field)).toBe(true);
		expect(test.styles.paint(test.field).color).toEqual([0, 0, 255, 255]);
		expect(builds(test.styles)).toBe(count + 1);
		test.tree.setControl(test.field, { checked: false });
		expect(test.styles.paint(test.field).color).toEqual([255, 0, 0, 255]);
		expect(builds(test.styles)).toBe(count + 2);
	},
);

it.each(["hover", "target"])("does not skip relevant %s state", (state) => {
	const test = fixture(undefined, `#field:${state}{color:blue}`);
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	if (state === "hover") test.tree.setPointerState(test.field, null);
	else test.tree.setTargetElement(test.field);
	expect(test.styles.get(test.field)).not.toBe(before.get);
	expect(test.styles.paint(test.field).color).toEqual([0, 0, 255, 255]);
	expect(builds(test.styles)).toBe(count + 1);
});

it("does not skip focus-visible or focus target transitions", () => {
	const test = fixture(
		'<input id="field"><input id="other">',
		"#field:focus{width:90px}#field:focus-visible{color:blue}",
	);
	test.focus();
	expect(test.styles.paint(test.field).color).toEqual([0, 0, 255, 255]);
	expect(test.styles.box(test.field).width).toBe("90px");
	const focusedCount = builds(test.styles);
	test.tree.setFocusVisible(false);
	expect(test.styles.paint(test.field).color).toEqual([255, 0, 0, 255]);
	expect(builds(test.styles)).toBe(focusedCount + 1);
	test.actions.focus.focus(test.tree.reference(test.id("#other")));
	expect(test.styles.box(test.field).width).toBe("120px");
	expect(builds(test.styles)).toBeGreaterThan(focusedCount + 1);
});

it("conservatively rebuilds after a bounded journal reset even when retained records appear harmless", () => {
	const test = fixture(undefined, "", { maxChanges: 2 });
	test.focus();
	test.actions.keyboard.collapseEnd(test.field);
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	const revision = test.tree.revision;
	for (let index = 0; index < 6; index++) {
		test.tree.setControl(test.field, { value: String(index) });
		test.actions.keyboard.collapseEnd(test.field);
	}
	expect(test.tree.changesSince(revision).reset).toBe(true);
	expect(test.styles.get(test.field)).not.toBe(before.get);
	expect(builds(test.styles)).toBe(count + 1);
	expect(test.value()).toBe("5");
	expect(test.selection()).toMatchObject({ focus: 1, valueLength: 1 });
});

it.each(["attribute", "control"])(
	"does not let a paint notification mask a reentrant %s mutation",
	(kind) => {
		const test = fixture(
			'<input id="field" value="ABCD" placeholder="hint">',
			"#field:placeholder-shown,#field.changed{color:blue;width:90px}",
		);
		test.focus();
		test.actions.keyboard.placeControlCaret(test.field, 0);
		const before = cache(test.styles, test.field);
		const count = builds(test.styles);
		let observed: ReturnType<typeof cache> | undefined;
		const stop = test.tree.onChange((change) => {
			if (change.kind !== "style") return;
			stop();
			if (kind === "attribute")
				test.tree.setAttribute(test.field, "class", "changed");
			else test.tree.setControl(test.field, { value: "" });
			observed = cache(test.styles, test.field);
		});
		expect(() => test.actions.keyboard.collapseEnd(test.field)).toThrow(
			"changed",
		);
		expect(observed?.get).not.toBe(before.get);
		expect(observed?.paint.color).toEqual([0, 0, 255, 255]);
		expect(observed?.box.width).toBe("90px");
		expect(test.styles.get(test.field)).toBe(observed?.get);
		expect(builds(test.styles)).toBe(count + 1);
		if (kind === "control") expect(test.value()).toBe("");
	},
);

it("keeps CSS caches on owner close while invalidating visuals, then rebuilds on removal and revokes on close", () => {
	const test = fixture();
	test.focus();
	test.actions.keyboard.placeControlCaret(test.field, 0);
	const before = cache(test.styles, test.field);
	const count = builds(test.styles);
	const priorPixels = pixels(test.tree, test.field);
	test.actions.keyboard.close();
	expect(test.selection()).toBeUndefined();
	expect(pixels(test.tree, test.field)).not.toEqual(priorPixels);
	sameCache(test.styles, test.field, before);
	expect(builds(test.styles)).toBe(count);
	test.tree.remove(test.field);
	expect(() => test.styles.get(test.field)).toThrow("not connected");
	expect(builds(test.styles)).toBe(count + 1);
	test.tree.close();
	expect(() => test.styles.metrics()).toThrow("closed");
});
