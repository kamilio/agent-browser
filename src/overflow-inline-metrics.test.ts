import { afterEach, expect, it } from "vitest";
import { documentImages } from "./document-images.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content: string, overflow: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}#port{overflow:${overflow};width:10px;height:10px}#port div{width:40px;height:40px}</style>${content}<div id="port"><div></div></div>`,
		"https://fixture.invalid/overflow-inline-metrics",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 100);
	const target = new DocumentQueries(tree).querySelector("#target");
	if (target === null) throw new Error("Missing target");
	return { tree, target, owner: documentElementScroll(tree) };
}

it.each(["visible", "hidden", "clip", "auto"])(
	"retains inline image dimensions beside overflow:%s",
	async (overflow) => {
		const { tree, target, owner } = fixture(
			'<img id="target" src="/image.png" style="padding:5px;border:3px solid">',
			overflow,
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
		expect(owner.get(target)).toEqual({
			scrollLeft: 0,
			scrollTop: 0,
			scrollWidth: 74,
			scrollHeight: 40,
		});
	},
);

it.each(["visible", "hidden", "clip", "auto"])(
	"retains inline control metric guards beside overflow:%s",
	(overflow) => {
		const { target, owner } = fixture(
			'<input id="target" value="long text" style="display:inline">',
			overflow,
		);
		expect(() => owner.get(target)).toThrow(/Control scroll/);
		expect(() => owner.to(target, 5, 5)).toThrow(/Control scroll/);
	},
);

it("does not invent dimensions for ordinary nonreplaced inline elements beside overflow", () => {
	const { target, owner } = fixture(
		'<span id="target">some text</span>',
		"hidden",
	);
	expect(owner.get(target)).toEqual({
		scrollLeft: 0,
		scrollTop: 0,
		scrollWidth: 0,
		scrollHeight: 0,
	});
});
