import { afterEach, expect, it } from "vitest";
import { documentScroll, viewportScrollLimits } from "./document-scroll.js";
import type { DocumentLimits, DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(limits: Partial<DocumentLimits> = {}) {
	const tree = parseHtmlDocument(
		"<style>html,body{margin:0;padding:0}#extent{width:160px;height:180px}input{width:50px;height:20px}</style><main id=extent><input id=field></main>",
		"https://fixture.invalid/scroll-extent",
		{ limits },
	);
	trees.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(100, 80);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	};
	return {
		tree,
		styles,
		id,
		extent: id("#extent"),
		field: id("#field"),
		scroll: documentScroll(tree),
	};
}

it("requires a first full extent scan even after only paint notifications", () => {
	const test = fixture();
	for (let repeat = 0; repeat < 3; repeat++)
		test.tree.invalidatePresentation("paint");
	expect(test.scroll.metrics().builds).toBe(0);
	expect(test.scroll.bounds()).toEqual({ x: 60, y: 100 });
	expect(test.scroll.metrics()).toMatchObject({
		builds: 1,
		revision: test.tree.revision,
	});
});

it("advances validated revision without replacing bounds or scan diagnostics", () => {
	const test = fixture();
	const before = test.scroll.bounds();
	const metrics = test.scroll.metrics();
	for (let repeat = 0; repeat < 4; repeat++)
		test.tree.invalidatePresentation("paint");
	expect(test.scroll.metrics().revision).toBe(metrics.revision);
	expect(test.scroll.bounds()).toBe(before);
	expect(Object.isFrozen(before)).toBe(true);
	expect(test.scroll.metrics()).toMatchObject({
		builds: metrics.builds,
		work: metrics.work,
		revision: test.tree.revision,
	});
});

it.each([undefined, "style"] as const)(
	"keeps generic presentation mode %s conservative",
	(mode) => {
		const test = fixture();
		const before = test.scroll.bounds();
		const builds = test.scroll.metrics().builds;
		test.tree.invalidatePresentation(mode);
		expect(test.scroll.bounds()).toEqual(before);
		expect(test.scroll.bounds()).not.toBe(before);
		expect(test.scroll.metrics().builds).toBe(builds + 1);
	},
);

it.each(["paint-first", "attribute-first"])(
	"rescans a mixed real dimension journal in %s order",
	(order) => {
		const test = fixture();
		test.scroll.bounds();
		const builds = test.scroll.metrics().builds;
		const paint = () => test.tree.invalidatePresentation("paint");
		const attribute = () =>
			test.tree.setAttribute(test.extent, "style", "width:140px;height:120px");
		if (order === "paint-first") {
			paint();
			attribute();
		} else {
			attribute();
			paint();
		}
		expect(test.scroll.bounds()).toEqual({ x: 40, y: 40 });
		expect(test.scroll.metrics().builds).toBe(builds + 1);
	},
);

it.each(["paint-first", "control-first"])(
	"does not borrow the CSS control-value shortcut for %s journals",
	(order) => {
		const test = fixture();
		const before = test.scroll.bounds();
		const builds = test.scroll.metrics().builds;
		const cssBuilds = test.styles.metrics().cascadeBuilds;
		const paint = () => test.tree.invalidatePresentation("paint");
		const control = () => test.tree.setControl(test.field, { value: "typed" });
		if (order === "paint-first") {
			paint();
			control();
		} else {
			control();
			paint();
		}
		expect(test.scroll.bounds()).toEqual(before);
		expect(test.scroll.bounds()).not.toBe(before);
		expect(test.scroll.metrics().builds).toBe(builds + 1);
		expect(test.styles.metrics().cascadeBuilds).toBe(cssBuilds);
	},
);

it.each([false, true])(
	"rescans an overflowed paint journal with lost dimensions=%s",
	(changeDimensions) => {
		const test = fixture({ maxChanges: 2 });
		const before = test.scroll.bounds();
		const revision = test.tree.revision;
		const builds = test.scroll.metrics().builds;
		if (changeDimensions)
			test.tree.setAttribute(test.extent, "style", "width:140px;height:120px");
		for (let repeat = 0; repeat < 3; repeat++)
			test.tree.invalidatePresentation("paint");
		expect(test.tree.changesSince(revision).reset).toBe(true);
		expect(test.scroll.bounds()).toEqual(
			changeDimensions ? { x: 40, y: 40 } : before,
		);
		expect(test.scroll.bounds()).not.toBe(before);
		expect(test.scroll.metrics().builds).toBe(builds + 1);
		test.tree.invalidatePresentation("paint");
		test.scroll.get();
		expect(test.scroll.metrics().builds).toBe(builds + 1);
	},
);

it("preserves newer dimensions and movement during reentrant automatic clamp", () => {
	const test = fixture();
	test.scroll.to(60, 100);
	test.scroll.get();
	const builds = test.scroll.metrics().builds;
	const stop = test.tree.onChange((change) => {
		if (!change.presentationOnly) return;
		stop();
		test.tree.setAttribute(test.extent, "style", "width:200px;height:250px");
		test.scroll.to(80, 140);
	});
	test.tree.setAttribute(test.extent, "style", "width:120px;height:100px");
	expect(test.scroll.get()).toEqual({ x: 80, y: 140 });
	expect(test.scroll.bounds()).toEqual({ x: 100, y: 170 });
	expect(test.scroll.metrics().builds).toBe(builds + 2);
	expect(test.scroll.metrics().revision).toBe(test.tree.revision);
});

it("supports reentrant reads without another extent scan for the same move", () => {
	const test = fixture();
	const before = test.scroll.bounds();
	const builds = test.scroll.metrics().builds;
	const stop = test.tree.onChange((change) => {
		if (!change.presentationOnly) return;
		stop();
		expect(test.scroll.get()).toEqual({ x: 60, y: 100 });
		expect(test.scroll.bounds()).toBe(before);
	});
	test.scroll.to(1000, 1000);
	expect(test.scroll.get()).toEqual({ x: 60, y: 100 });
	expect(test.scroll.metrics().builds).toBe(builds);
});

it("does not hide a failed resource-limited layout behind later paint records", () => {
	const test = fixture({ maxDepth: 600 });
	const before = test.scroll.bounds();
	const builds = test.scroll.metrics().builds;
	const outer = test.tree.createElement("div");
	test.tree.append(test.extent, outer);
	let parent = outer;
	for (let depth = 0; depth < 270; depth++) {
		const child = test.tree.createElement("div");
		test.tree.append(parent, child);
		parent = child;
	}
	expect(() => test.scroll.bounds()).toThrow("depth limit");
	expect(test.scroll.metrics().builds).toBe(builds);
	test.tree.invalidatePresentation("paint");
	expect(() => test.scroll.bounds()).toThrow("depth limit");
	expect(test.scroll.metrics().builds).toBe(builds);
	test.tree.remove(outer);
	expect(test.scroll.bounds()).toEqual(before);
	expect(test.scroll.metrics().builds).toBe(builds + 1);
	test.tree.invalidatePresentation("paint");
	test.scroll.get();
	expect(test.scroll.metrics().builds).toBe(builds + 1);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects %s before consuming pending paint state or an update",
	(coordinate) => {
		const test = fixture();
		test.scroll.bounds();
		const before = test.scroll.metrics();
		test.tree.invalidatePresentation("paint");
		expect(() => test.scroll.to(coordinate, 0)).toThrow();
		expect(test.scroll.metrics()).toEqual(before);
		test.scroll.get();
		expect(test.scroll.metrics().builds).toBe(before.builds);
	},
);

it("still consumes the existing update quota for unchanged movement", () => {
	const test = fixture();
	test.scroll.bounds();
	test.tree.invalidatePresentation("paint");
	for (let update = 0; update < viewportScrollLimits.maxUpdates; update++)
		expect(test.scroll.to(0, 0)).toBe(false);
	expect(test.scroll.metrics().updates).toBe(viewportScrollLimits.maxUpdates);
	expect(test.scroll.metrics().builds).toBe(1);
	expect(() => test.scroll.to(0, 0)).toThrow("update limit");
});

it.each(["owner", "document"])(
	"never serves cached bounds after closing the %s with pending paint",
	(owner) => {
		const test = fixture();
		test.scroll.bounds();
		test.tree.invalidatePresentation("paint");
		if (owner === "owner") test.scroll.close();
		else test.tree.close();
		expect(() => test.scroll.get()).toThrow("closed");
		expect(() => test.scroll.bounds()).toThrow("closed");
		expect(test.scroll.metrics().closed).toBe(true);
	},
);
