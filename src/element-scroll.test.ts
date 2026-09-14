import { afterEach, expect, it } from "vitest";
import {
	DocumentElementScroll,
	documentElementScroll,
	elementScrollLimits,
} from "./element-scroll.js";
import { documentScroll } from "./document-scroll.js";
import { documentImages } from "./document-images.js";
import { documentElementSizes } from "./element-sizes.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";

const trees: DocumentTree[] = [];
function fixture(content: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}${css}</style>${content}`,
		"https://fixture.invalid/element-scroll",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(500, 400);
	const query = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = query.querySelector(selector);
		if (result === null) throw new Error(`Missing ${selector}`);
		return result;
	};
	const owner = documentElementScroll(tree);
	return {
		tree,
		id,
		owner,
		read: (selector = "#target") => owner.get(id(selector)),
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it.each([
	["simple", '<div style="width:60px;height:30px"></div>', 240, 90],
	["direct", '<div style="width:250px;height:150px"></div>', 290, 200],
	[
		"nested",
		'<div style="width:60px;height:30px"><div style="width:250px;height:150px"></div></div>',
		250,
		150,
	],
] as const)(
	"matches the %s visible-overflow reference dimensions",
	(_name, content, width, height) => {
		const { tree, read, id } = fixture(
			`<div id="target">${content}</div>`,
			"#target{border:1px solid black;width:200px;height:40px;padding-right:40px;padding-bottom:50px}",
		);
		expect(read()).toEqual({
			scrollTop: 0,
			scrollLeft: 0,
			scrollWidth: width,
			scrollHeight: height,
		});
		expect(documentElementSizes(tree).get(id("#target"))).toMatchObject({
			clientWidth: 240,
			clientHeight: 90,
		});
	},
);

it.each(["block", "flow-root"])(
	"excludes escaped collapsed margins in %s flow",
	(display) => {
		for (const padding of [0, 2])
			for (const border of [0, 3]) {
				const { tree, read, id } = fixture(
					'<div id="target"><div><div></div></div><div></div><div></div><div></div></div>',
					`#target{display:${display};padding:${padding}px;border:${border}px solid}#target div{height:20px;min-width:20px;margin:20px 10px}`,
				);
				const client = documentElementSizes(tree).get(id("#target"));
				expect(read()).toMatchObject({
					scrollWidth: client.clientWidth,
					scrollHeight: client.clientHeight,
				});
			}
	},
);

it("excludes the element's own margins and borders from its padding-box dimensions", () => {
	const { read } = fixture(
		'<div id="target"></div>',
		"#target{width:80px;height:30px;padding:3px 5px;border:4px solid;margin:40px}",
	);
	expect(read()).toMatchObject({ scrollWidth: 90, scrollHeight: 36 });
});

it("respects border-box sizing while retaining padding in the scroll dimensions", () => {
	const { read } = fixture(
		'<div id="target"></div>',
		"#target{box-sizing:border-box;width:80px;height:40px;padding:5px;border:3px solid}",
	);
	expect(read()).toMatchObject({ scrollWidth: 74, scrollHeight: 34 });
});

it.each(["inline", "block"])(
	"measures a decoded %s image without counting its border",
	async (display) => {
		const { tree, read } = fixture(
			`<img id="target" src="/image.png" style="display:${display};padding:5px;border:3px solid">`,
		);
		const images = documentImages(tree, {
			fetch: async (url) => {
				const body = encodePng(createRaster(64, 30, [0, 0, 255, 255]));
				return {
					url,
					status: 200,
					headers: { "content-type": ["image/png"] },
					body,
					encodedBytes: body.length,
					redirects: [],
					elapsedMs: 0,
				};
			},
		});
		await images.settle();
		expect(read()).toMatchObject({ scrollWidth: 74, scrollHeight: 40 });
	},
);

it("recomputes percentage dimensions after viewport resize", () => {
	const { tree, read } = fixture(
		'<div id="target" style="width:50%;height:20px"></div>',
	);
	expect(read().scrollWidth).toBe(250);
	documentStyles(tree).setViewport(600, 400);
	expect(read().scrollWidth).toBe(300);
});

it("does not count overflow beyond the negative padding origin in LTR flow", () => {
	const { read } = fixture(
		'<div id="target"><div style="width:100px;height:100px;margin-left:-50px;margin-top:-20px"></div></div>',
		"#target{width:80px;height:30px;border:1px solid}",
	);
	expect(read()).toMatchObject({ scrollWidth: 80, scrollHeight: 80 });
});

it("measures descendants but does not absorb a later overflowing sibling", () => {
	const { read } = fixture(
		'<div id="target"><div style="width:150px;height:100px"></div></div><div style="width:900px;height:600px"></div>',
		"#target{width:80px;height:30px}",
	);
	expect(read()).toMatchObject({ scrollWidth: 150, scrollHeight: 100 });
});

it("measures nowrap text through line layout and includes trailing padding", () => {
	const { read } = fixture(
		'<div id="target">abcdefghij</div>',
		"#target{width:10px;height:2px;padding:3px;font-size:8px;line-height:12px;white-space:nowrap}",
	);
	expect(read()).toMatchObject({ scrollWidth: 66, scrollHeight: 18 });
});

it("propagates overflow through display:contents without inventing a box for it", () => {
	const { read } = fixture(
		'<div id="target"><div id="contents" style="display:contents"><div style="width:150px;height:100px"></div></div></div>',
		"#target{width:80px;height:30px}",
	);
	expect(read()).toMatchObject({ scrollWidth: 150, scrollHeight: 100 });
	expect(read("#contents")).toMatchObject({ scrollWidth: 0, scrollHeight: 0 });
});

it("returns zero for ordinary inline and display:none boxes", () => {
	const { read } = fixture(
		'<span id="inline">Long text</span><div id="hidden" style="display:none;width:1000px;height:1000px"></div>',
	);
	expect(read("#inline")).toMatchObject({ scrollWidth: 0, scrollHeight: 0 });
	expect(read("#hidden")).toMatchObject({ scrollWidth: 0, scrollHeight: 0 });
});

it("keeps visibility:hidden layout measurable", () => {
	const { read } = fixture(
		'<div id="target" style="visibility:hidden;width:120px;height:50px"></div>',
	);
	expect(read()).toMatchObject({ scrollWidth: 120, scrollHeight: 50 });
});

it("preserves the child's border overflow despite negative trailing margins", () => {
	const { read } = fixture(
		'<div id="target"><div style="width:150px;height:100px;margin-right:-80px;margin-bottom:-80px;border:2px solid"></div></div>',
		"#target{width:80px;height:30px}",
	);
	expect(read()).toMatchObject({ scrollWidth: 154, scrollHeight: 104 });
});

it("retains one revision-scoped cache and refreshes after DOM mutation", () => {
	const { tree, read, id, owner } = fixture(
		'<div id="target" style="width:80px;height:30px"></div>',
	);
	expect(read().scrollWidth).toBe(80);
	const builds = owner.metrics().builds;
	read();
	expect(owner.metrics().builds).toBe(builds);
	tree.setAttribute(id("#target"), "style", "width:120px;height:90px");
	expect(read()).toMatchObject({ scrollWidth: 120, scrollHeight: 90 });
	expect(owner.metrics().builds).toBe(builds + 1);
});

it("does not subtract root viewport scrolling from element dimensions", () => {
	const { tree, read } = fixture(
		'<div id="target" style="width:700px;height:600px"></div>',
	);
	const before = read();
	documentScroll(tree).to(20, 50);
	expect(read()).toEqual(before);
	expect(read("html")).toMatchObject({
		scrollTop: 50,
		scrollLeft: 20,
		scrollWidth: 700,
		scrollHeight: 600,
	});
});

it("returns zero for detached elements and remeasures after insertion", () => {
	const { tree, owner } = fixture('<div id="target"></div>');
	const detached = tree.createElement("div", {
		style: "width:70px;height:40px",
	});
	expect(owner.get(detached).scrollWidth).toBe(0);
	const body = new DocumentQueries(tree).querySelector("body");
	if (body === null) throw new Error("Missing body");
	tree.append(body, detached);
	expect(owner.get(detached).scrollWidth).toBe(70);
});

it("rejects rendered control metrics rather than guessing internal scrolling", () => {
	const { read } = fixture('<input id="target" value="long text">');
	expect(() => read()).toThrow(/Control scroll/);
});

it.each(["auto", "hidden"])(
	"measures and clamps supported overflow:%s scrollports",
	(overflow) => {
		const { read, owner, id } = fixture(
			`<div id="target" style="overflow:${overflow};width:100px;height:100px"><div style="width:180px;height:220px"></div></div>`,
		);
		expect(read()).toEqual({
			scrollLeft: 0,
			scrollTop: 0,
			scrollWidth: 180,
			scrollHeight: 220,
		});
		expect(owner.to(id("#target"), 25, 45)).toBe(true);
		expect(read()).toMatchObject({ scrollLeft: 25, scrollTop: 45 });
		expect(owner.to(id("#target"), 999, 999)).toBe(true);
		expect(read()).toEqual({
			scrollLeft: 80,
			scrollTop: 120,
			scrollWidth: 180,
			scrollHeight: 220,
		});
	},
);

it("fails closed on unsupported transformed positioned layout", () => {
	const { read } = fixture(
		'<div id="target" style="position:sticky;transform:translateY(1px);width:100px;height:100px">Text</div>',
	);
	expect(() => read()).toThrow();
});

it.each([{ maxWork: 1 }, { maxElements: 1 }])(
	"enforces build resource bounds %s",
	(limits) => {
		const { tree, id } = fixture('<div id="target">Text</div>');
		const owner = new DocumentElementScroll(tree, limits);
		expect(() => owner.get(id("#target"))).toThrow(/limit/);
		expect(owner.metrics().elements).toBe(0);
		owner.close();
	},
);

it("bounds cached queries and revokes retained owners on close", () => {
	const { tree, id } = fixture('<div id="target">Text</div>');
	const owner = new DocumentElementScroll(tree, { maxQueries: 1 });
	owner.get(id("#target"));
	expect(() => owner.get(id("#target"))).toThrow(/query limit/);
	tree.close();
	expect(owner.metrics()).toMatchObject({ elements: 0, closed: true });
	expect(() => owner.get(1)).toThrow(/closed/);
});

it("rejects invalid custom limits", () => {
	const { tree } = fixture('<div id="target"></div>');
	expect(
		() =>
			new DocumentElementScroll(tree, {
				maxWork: elementScrollLimits.maxWork + 1,
			}),
	).toThrow();
	expect(() => new DocumentElementScroll(tree, { maxQueries: 0 })).toThrow();
});
