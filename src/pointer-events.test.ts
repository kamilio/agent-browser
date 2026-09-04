import { afterEach, expect, it } from "vitest";
import {
	computePointerEvents,
	parseInteractionValue,
} from "./css-interaction.js";
import { directDeclaration } from "./css-declarations.js";
import { resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture(
	css = "",
	content = '<div id="back" tabindex="0">A</div><div id="front"><span id="child">B</span></div>',
) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{width:100px}#back,#front{width:30px;height:20px}#back{background:blue}#front{position:relative;top:-20px;z-index:1;background:red}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/pointer-events",
	);
	documents.push(document);
	documentStyles(document).setViewport(100, 100);
	const query = new DocumentQueries(document);
	const id = (selector: string) => {
		const value = query.querySelector(selector);
		if (value === null) throw Error(selector);
		return value;
	};
	return {
		document,
		id,
		styles: documentStyles(document),
		hits: documentHitTesting(document),
		actions: documentInteractions(document),
	};
}

it.each(["auto", "none", "initial", "inherit", "unset", "revert"])(
	"shares pointer-events grammar across stylesheets and CSSOM: %s",
	(value) => {
		expect(parseInteractionValue(` ${value.toUpperCase()} `)).toBe(value);
		expect(directDeclaration("pointer-events", value, true)).toEqual([
			{ name: "pointer-events", value, important: true },
		]);
	},
);

it.each(["visiblepainted", "all", "bounding-box", "auto none", "1", ""])(
	"rejects unimplemented/invalid hit policy %s",
	(value) => {
		expect(parseInteractionValue(value)).toBeUndefined();
		expect(directDeclaration("pointer-events", value, false)).toEqual([]);
	},
);

it.each([undefined, "inherit", "unset", "revert"])(
	"inherits pointer policy for %s",
	(value) => {
		expect(computePointerEvents(value, "none")).toBe("none");
		expect(computePointerEvents(value, "auto")).toBe("auto");
	},
);

it.each(["auto", "initial"])("resets inherited none with %s", (value) => {
	expect(computePointerEvents(value, "none")).toBe("auto");
});

it("passes through an overlay without changing its pixels, text or geometry", () => {
	const { document, id, hits } = fixture();
	const before = documentGeometry(document).getBoundingClientRect(id("#front"));
	const image = rasterizeDocument(document).image;
	const height = layoutDocument(document).flowHeight;
	expect(hits.elementFromPoint(15, 5)).toBe(id("#front"));
	document.setAttribute(id("#front"), "style", "pointer-events:none");
	expect(hits.elementFromPoint(15, 5)).toBe(id("#back"));
	expect(hits.elementsFromPoint(15, 5)).not.toContain(id("#front"));
	expect(
		documentGeometry(document).getBoundingClientRect(id("#front")),
	).toEqual(before);
	expect(rasterizeDocument(document).image.pixels).toEqual(image.pixels);
	expect(layoutDocument(document).flowHeight).toBe(height);
	expect(renderDocumentPdf(document).metrics.glyphs).toBe(2);
});

it("inherits through descendants, including glyph source parents", () => {
	const { id, styles, hits } = fixture("#front{pointer-events:none}");
	expect(styles.pointerEvents(id("#child"))).toBe("none");
	expect(hits.elementFromPoint(1, 4)).toBe(id("#back"));
});

it("allows a descendant auto override without making its ancestor a target", () => {
	const { id, hits } = fixture(
		"#front{pointer-events:none}#child{pointer-events:auto;display:block;width:10px;height:10px}",
	);
	expect(hits.elementFromPoint(1, 4)).toBe(id("#child"));
	expect(hits.elementFromPoint(15, 5)).toBe(id("#back"));
	expect(hits.elementsFromPoint(1, 4)).not.toContain(id("#front"));
});

it("still propagates child mouse events through a none ancestor", () => {
	const { id, actions } = fixture(
		"#front{pointer-events:none}#child{pointer-events:auto;display:block;width:10px;height:10px}",
	);
	const calls: string[] = [];
	actions.events.addEventListener(
		id("#front"),
		"click",
		() => calls.push("capture"),
		{ capture: true },
	);
	actions.events.addEventListener(id("#child"), "click", () =>
		calls.push("target"),
	);
	actions.events.addEventListener(id("#front"), "click", () =>
		calls.push("bubble"),
	);
	actions.mouse.move(2, 4);
	actions.mouse.down();
	actions.mouse.up();
	expect(calls).toEqual(["capture", "target", "bubble"]);
});

it("coordinate clicks target the underlying element while programmatic clicks remain possible", () => {
	const { document, id, actions } = fixture("#front{pointer-events:none}");
	const targets: number[] = [];
	actions.events.addEventListener(
		document.root,
		"click",
		(event) => {
			if (event.target !== null) targets.push(event.target);
		},
		{ capture: true },
	);
	actions.mouse.move(15, 5);
	actions.mouse.down();
	actions.mouse.up();
	actions.click(document.reference(id("#front")));
	expect(targets).toEqual([id("#back"), id("#front")]);
});

it("does not remove keyboard focusability or sequential navigation", () => {
	const { document, id, actions } = fixture(
		"#front{pointer-events:none}",
		'<div id="back" tabindex="0"></div><div id="front" tabindex="0"></div>',
	);
	actions.focus.focus(document.reference(id("#back")));
	actions.keyboard.press("Tab");
	expect(actions.focus.active()).toBe(id("#front"));
});

it.each(["initial", "auto"])(
	"a child can reset inherited pointer suppression using %s",
	(value) => {
		const { id, hits } = fixture(
			`#front{pointer-events:none}#child{pointer-events:${value};display:block;width:10px;height:10px}`,
		);
		expect(hits.elementFromPoint(2, 4)).toBe(id("#child"));
	},
);

it.each(["unset", "inherit", "revert"])(
	"a child keeps inherited suppression using %s",
	(value) => {
		const { id, hits } = fixture(
			`#front{pointer-events:none}#child{pointer-events:${value}}`,
		);
		expect(hits.elementFromPoint(2, 4)).toBe(id("#back"));
	},
);

it.each(["initial", "unset", "revert"])(
	"all:%s participates in interaction-property cascade",
	(value) => {
		const { id, styles } = fixture(
			`main{pointer-events:none}#front{pointer-events:auto;all:${value}}`,
		);
		expect(styles.pointerEvents(id("#front"))).toBe(
			value === "initial" ? "auto" : "none",
		);
	},
);

it("honors specificity, source order and importance", () => {
	const { document, id, hits } = fixture(
		"#front{pointer-events:none!important}#front{pointer-events:auto}",
	);
	document.setAttribute(id("#front"), "style", "pointer-events:auto");
	expect(hits.elementFromPoint(15, 5)).toBe(id("#back"));
	document.setAttribute(id("#front"), "style", "pointer-events:auto!important");
	expect(hits.elementFromPoint(15, 5)).toBe(id("#front"));
});

it("recascades custom-property changes and invalid-at-computed-value inheritance", () => {
	const { document, id, hits, styles } = fixture(
		"main{--policy:none}#front{pointer-events:var(--policy)}",
	);
	expect(hits.elementFromPoint(15, 5)).toBe(id("#back"));
	document.setAttribute(id("#host"), "style", "--policy:auto");
	expect(hits.elementFromPoint(15, 5)).toBe(id("#front"));
	document.setAttribute(
		id("#host"),
		"style",
		"pointer-events:none;--policy:invalid",
	);
	expect(styles.pointerEvents(id("#front"))).toBe("none");
	expect(hits.elementsFromPoint(15, 5)).toEqual([id("body"), id("html")]);
});

it("retains root fallback even when root policy excludes ordinary hit regions", () => {
	const { id, hits } = fixture("html{pointer-events:none}");
	expect(hits.elementFromPoint(1, 1)).toBe(id("html"));
	expect(hits.elementsFromPoint(1, 1)).toEqual([id("html")]);
	expect(hits.elementFromPoint(-1, 1)).toBeNull();
});

it("inherits through boxless display-contents ancestors", () => {
	const { id, styles, hits } = fixture(
		"#front{display:contents;pointer-events:none}#child{display:block;position:relative;top:-20px;width:30px;height:20px}",
	);
	expect(styles.pointerEvents(id("#child"))).toBe("none");
	expect(hits.elementFromPoint(1, 1)).toBe(id("#back"));
});

it.each(["inline-block", "inline-flex", "flex", "block"])(
	"suppresses complete %s content without losing child overrides",
	(display) => {
		const { document, id, hits } = fixture(
			`#front{display:${display};pointer-events:none}#child{display:block;width:10px;height:10px}`,
		);
		const bounds = documentGeometry(document).getBoundingClientRect(
			id("#child"),
		);
		expect(hits.elementsFromPoint(bounds.x + 1, bounds.y + 1)).not.toContain(
			id("#child"),
		);
		document.setAttribute(id("#child"), "style", "pointer-events:auto");
		expect(hits.elementFromPoint(bounds.x + 1, bounds.y + 1)).toBe(
			id("#child"),
		);
	},
);

it("auto does not override inert ancestry", () => {
	const { document, id, hits } = fixture(
		"#front{pointer-events:none}#child{pointer-events:auto;display:block;width:10px;height:10px}",
	);
	document.setAttribute(id("#front"), "inert", "");
	expect(hits.elementFromPoint(2, 4)).toBe(id("#back"));
});

it("applies to replaced controls without changing disabled state or layout", () => {
	const { document, id, hits } = fixture(
		"#front{pointer-events:none}",
		'<div id="back"></div><input id="front" type="text" value="hello">',
	);
	const bounds = documentGeometry(document).getBoundingClientRect(id("#front"));
	expect(hits.elementsFromPoint(bounds.x + 1, bounds.y + 1)).not.toContain(
		id("#front"),
	);
	expect(document.get(id("#front")).attributes.disabled).toBeUndefined();
	expect(bounds.width).toBe(30);
});

it("remains coherent after root scrolling", () => {
	const { document, id, hits } = fixture(
		"main{margin-top:120px}#front{pointer-events:none}",
	);
	documentScroll(document).to(0, 60);
	const bounds = documentGeometry(document).getBoundingClientRect(id("#back"));
	expect(hits.elementFromPoint(15, bounds.y + 5)).toBe(id("#back"));
});

it("invalidates inherited policy on reparenting and closes the shared owner", () => {
	const { document, id, styles } = fixture("#front{pointer-events:none}");
	const child = id("#child");
	expect(resolvedStyleValue(document, child, "pointer-events")).toBe("none");
	document.append(id("#back"), child);
	expect(styles.pointerEvents(child)).toBe("auto");
	document.remove(child);
	expect(resolvedStyleValue(document, child, "pointer-events")).toBe("");
	document.append(id("#front"), child);
	expect(styles.pointerEvents(child)).toBe("none");
	document.close();
	expect(() => styles.pointerEvents(child)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("keeps stable hit caches between reads and refreshes after pointer policy mutation", () => {
	const { document, id, hits } = fixture();
	hits.elementFromPoint(15, 5);
	const before = hits.metrics().builds;
	for (let index = 0; index < 10; index++) hits.elementFromPoint(15, 5);
	expect(hits.metrics().builds).toBe(before);
	document.setAttribute(id("#front"), "style", "pointer-events:none");
	expect(hits.elementFromPoint(15, 5)).toBe(id("#back"));
	expect(hits.metrics().builds).toBe(before + 1);
});

it("preserves hit work limits even when all ordinary targets are excluded", () => {
	const { document } = fixture("html{pointer-events:none}");
	const hits = new DocumentHitTesting(document, { maxWork: 2 });
	expect(() => hits.elementFromPoint(1, 1)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(hits.metrics().builds).toBe(0);
});
