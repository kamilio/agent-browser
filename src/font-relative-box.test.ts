import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	computeBoxStyle,
	initialBoxStyle,
	type CssBoxProperty,
} from "./css-box.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(css = "", content = '<div id="target">ab</div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:20px}html,body{margin:0;padding:0}main{width:200px;font-size:10px}#target{font-size:12px}${css}</style><main id="outer">${content}</main>`,
		"https://fixture.invalid/font-units",
	);
	trees.push(tree);
	const styles = documentStyles(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing fixture node");
		return found;
	};
	return {
		tree,
		styles,
		id,
		box: () => styles.box(id()),
		read: (name: string) => resolvedStyleValue(tree, id(), name),
	};
}

const properties: CssBoxProperty[] = [
	"width",
	"height",
	"min-width",
	"min-height",
	"max-width",
	"max-height",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"border-top-width",
	"border-right-width",
	"border-bottom-width",
	"border-left-width",
];
it.each(
	properties.flatMap((property) =>
		["em", "rem"].map((unit) => ({ property, unit })),
	),
)(
	"computes $property:2$unit from the correct font basis",
	({ property, unit }) => {
		const { box } = fixture(`#target{${property}:2${unit}}`);
		expect(box()[property]).toBe(unit === "em" ? "24px" : "40px");
	},
);

it("requires explicit metrics for standalone relative computation", () => {
	expect(() =>
		computeBoxStyle({ width: "2em" }, initialBoxStyle, {
			width: 100,
			height: 100,
		}),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
	expect(
		computeBoxStyle(
			{ width: "2em", height: "3rem" },
			initialBoxStyle,
			{ width: 100, height: 100 },
			{ fontSize: 9, rootFontSize: 15 },
		),
	).toMatchObject({ width: "18px", height: "45px" });
	expect(
		computeBoxStyle(
			{ width: "2em" },
			initialBoxStyle,
			{ width: 100, height: 100 },
			{ fontSize: 9 },
		).width,
	).toBe("18px");
	expect(
		computeBoxStyle(
			{ width: "2rem" },
			initialBoxStyle,
			{ width: 100, height: 100 },
			{ rootFontSize: 15 },
		).width,
	).toBe("30px");
	expect(() =>
		computeBoxStyle(
			{ width: "2em" },
			initialBoxStyle,
			{ width: 100, height: 100 },
			{ rootFontSize: 15 },
		),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
});

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects invalid font metrics %s",
	(value) => {
		expect(() =>
			computeBoxStyle(
				{ width: "1em" },
				initialBoxStyle,
				{ width: 100, height: 100 },
				{ fontSize: value, rootFontSize: 16 },
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(() =>
			computeBoxStyle(
				{ width: "1rem" },
				initialBoxStyle,
				{ width: 100, height: 100 },
				{ fontSize: 16, rootFontSize: value },
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);

it("detects computed overflow without clamping it to an arbitrary font size", () => {
	expect(() =>
		computeBoxStyle(
			{ width: "1e308em" },
			initialBoxStyle,
			{ width: 100, height: 100 },
			{ fontSize: 100, rootFontSize: 16 },
		),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	const { read } = fixture("#target{width:1e20rem}");
	expect(() => read("width")).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("does not introduce a font-computation dependency for absolute box values", () => {
	const { styles, id, box } = fixture("#target{width:22px;font-size:1e20px}");
	expect(box().width).toBe("22px");
	expect(() => styles.text(id())).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("does not compute an unrelated own font when the box uses only rem", () => {
	const { styles, id, box } = fixture("#target{width:2rem;font-size:1e20px}");
	expect(box().width).toBe("40px");
	expect(() => styles.text(id())).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("propagates font computation limits when a relative box actually needs them", () => {
	const { box } = fixture("#target{width:1em;font-size:1e20px}");
	expect(() => box()).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("uses the computed own font for em after resolving a relative font-size", () => {
	const { box } = fixture("#target{font-size:1.5em;width:2em;height:2rem}");
	expect(box()).toMatchObject({ width: "30px", height: "40px" });
});

it("uses the root initial font only for the root font-size self-reference", () => {
	const { styles, id, box } = fixture(
		"html{font-size:2rem;padding:1rem}#target{width:2rem}",
	);
	expect(styles.text(id("html"))["font-size"]).toBe("32px");
	expect(styles.box(id("html"))["padding-top"]).toBe("32px");
	expect(box().width).toBe("64px");
});

it("inherits already computed box values rather than recomputing them with the child's font", () => {
	const { box } = fixture(
		"#outer{width:2em;margin-left:1em}#target{font-size:30px;width:inherit;margin-left:inherit}",
	);
	expect(box()).toMatchObject({ width: "20px", "margin-left": "10px" });
});

it("resolves inherited custom-property tokens at the consuming element", () => {
	const { box } = fixture(
		"#outer{--Size:2em;--Gap:0.5rem}#target{width:var(--Size);padding:var(--Gap)}",
	);
	expect(box()).toMatchObject({ width: "24px", "padding-left": "10px" });
});

it("preserves signed/fractional margins and percentage containing-block bases", () => {
	const { box, read } = fixture(
		"#target{width:2em;margin-left:-0.25em;margin-top:.125rem;padding-right:10%}",
	);
	expect(box()).toMatchObject({
		width: "24px",
		"margin-left": "-3px",
		"margin-top": "2.5px",
		"padding-right": "10%",
	});
	expect(read("padding-right")).toBe("20px");
});

it("applies ordinary min/max and border-box constraints after font conversion", () => {
	const { box, read } = fixture(
		"#target{box-sizing:border-box;width:10em;max-width:4rem;min-width:2rem;padding:1em;border:.5em solid red}",
	);
	expect(box()).toMatchObject({
		width: "120px",
		"max-width": "80px",
		"min-width": "40px",
	});
	expect(read("width")).toBe("80px");
});

it("retains the native border snapping profile after conversion", () => {
	const { box, read } = fixture(
		"#target{border:.15em solid blue;border-right-width:.01em;border-bottom-width:0rem;border-left-style:none}",
	);
	expect(box()).toMatchObject({
		"border-top-width": "1px",
		"border-right-width": "1px",
		"border-bottom-width": "0px",
		"border-left-width": "1px",
	});
	expect(read("border-left-width")).toBe("0px");
});

it("handles zero element/root fonts without selecting a fallback size", () => {
	expect(
		fixture("#target{font-size:0;width:2em;height:1rem}").box(),
	).toMatchObject({ width: "0px", height: "20px" });
	expect(
		fixture("html{font-size:0}#target{width:2rem;height:1em}").box(),
	).toMatchObject({ width: "0px", height: "12px" });
});

it("invalidates cached relative values after root and element font changes", () => {
	const { tree, styles, id, box, read } = fixture(
		"#target{width:2rem;height:1em;background:blue}",
	);
	styles.setViewport(200, 100);
	expect(box()).toMatchObject({ width: "40px", height: "12px" });
	const before = rasterizeDocument(tree).image.pixels.slice();
	tree.setAttribute(id("html"), "style", "font-size:30px");
	expect(read("width")).toBe("60px");
	tree.setAttribute(id(), "style", "font-size:16px");
	expect(read("height")).toBe("16px");
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
});

it("recomputes em after reparenting without changing the rem basis", () => {
	const { tree, id, box } = fixture(
		"#left{font-size:8px}#right{font-size:18px}#target{font-size:inherit;width:2em;height:1rem}",
		'<div id="left"><div id="target"></div></div><div id="right"></div>',
	);
	expect(box()).toMatchObject({ width: "16px", height: "20px" });
	tree.append(id("#right"), id());
	expect(box()).toMatchObject({ width: "36px", height: "20px" });
});

it("changes rem lengths with media-selected root font sizes", () => {
	const { styles, box } = fixture(
		"@media(min-width:200px){html{font-size:30px}}#target{width:2rem}",
	);
	styles.setViewport(100, 100);
	expect(box().width).toBe("40px");
	styles.setViewport(300, 100);
	expect(box().width).toBe("60px");
});

it.each(["block", "inline", "control"])(
	"matches explicit-pixel native geometry and paint for %s boxes",
	(kind) => {
		const content =
			kind === "inline"
				? '<span id="target">ab</span>'
				: kind === "control"
					? '<input id="target" value="ab">'
					: '<div id="target">ab</div>';
		const dimensions = kind === "inline" ? "" : "width:4em;height:2rem;";
		const pixelDimensions = kind === "inline" ? "" : "width:48px;height:40px;";
		const relative = fixture(
			`#target{${dimensions}padding:.5em 1rem;border:.25em solid red;background:blue}`,
			content,
		);
		const pixels = fixture(
			`#target{${pixelDimensions}padding:6px 20px;border:3px solid red;background:blue}`,
			content,
		);
		relative.styles.setViewport(240, 120);
		pixels.styles.setViewport(240, 120);
		expect(rasterizeDocument(relative.tree).image.pixels).toEqual(
			rasterizeDocument(pixels.tree).image.pixels,
		);
		expect(
			documentGeometry(relative.tree).getBoundingClientRect(relative.id()),
		).toEqual(documentGeometry(pixels.tree).getBoundingClientRect(pixels.id()));
	},
);

it("uses relative lengths on decoded images through the same box geometry", async () => {
	const { tree, styles, id, read } = fixture(
		"#target{width:2em;height:1rem;padding:.5em;border:.1em solid black}",
		'<img id="target" src="/pixel.png">',
	);
	const body = encodePng(createRaster(2, 2, [255, 0, 0, 255]));
	const images = documentImages(tree, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body,
			redirects: [],
			encodedBytes: body.length,
			elapsedMs: 0,
		}),
	});
	await images.settle();
	styles.setViewport(200, 100);
	expect(read("width")).toBe("24px");
	expect(read("height")).toBe("20px");
	expect(documentGeometry(tree).getBoundingClientRect(id()).width).toBe(38);
	const pixels = rasterizeDocument(tree).image.pixels;
	expect(
		pixels.some(
			(value, index) =>
				index % 4 === 0 &&
				value === 255 &&
				pixels[index + 1] === 0 &&
				pixels[index + 2] === 0 &&
				pixels[index + 3] === 255,
		),
	).toBe(true);
});

it("advertises the exact font-unit and custom-property profiles without opening a session", async () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("Unexpected session creation");
		},
	});
	try {
		const result = await host.execute(["capabilities"]);
		expect(result.data).toMatchObject({
			cssBox: { fontRelativeLengths: true, fontRelativeUnits: ["em", "rem"] },
			computedStyles: {
				customProperties: true,
				customPropertyProfile: "unregistered-custom-properties",
			},
		});
	} finally {
		host.close();
	}
});
