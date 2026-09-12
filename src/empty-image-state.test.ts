import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import {
	documentImages,
	type DocumentImageOptions,
} from "./document-images.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	brokenImageAlternative,
	emptyImageAlternative,
} from "./image-fallback.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const origin = "https://fixture.invalid";
const gif = Uint8Array.from([
	71, 73, 70, 56, 55, 97, 2, 0, 1, 0, 128, 0, 0, 255, 0, 0, 0, 0, 255, 44, 0, 0,
	0, 0, 2, 0, 1, 0, 0, 2, 2, 68, 10, 0, 59,
]);

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("propagates asynchronous owner failure through a prepared empty-image paint", async () => {
	const tree = parseHtmlDocument(
		'<img id="photo" width="4" height="4">',
		`${origin}/prepared-empty`,
	);
	trees.push(tree);
	const nodeCount = [...tree.walk()].length;
	const images = documentImages(tree, {
		limits: { maxScanWork: nodeCount + 1 },
	});
	const prepared = prepareDocumentRaster(tree);
	const revision = tree.revision;
	await expect(images.settle()).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(images.metrics()).toMatchObject({
		closed: true,
		failure: "resource-limit",
	});
	expect(tree.revision).toBe(revision);
	expect(() => prepared.rasterize()).toThrow("Image scan work limit exceeded");
});

function response(url: string, type = "image/png"): NetworkResponse {
	const body =
		type === "image/gif"
			? gif.slice()
			: encodePng(createRaster(4, 2, [0, 128, 0, 255]));
	return {
		url,
		status: 200,
		headers: { "content-type": [type] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function fixture(
	attributes: Record<string, string> = {},
	options: DocumentImageOptions = {},
	doctype = "<!doctype html>",
	tagName = "img",
) {
	const tree = parseHtmlDocument(
		`${doctype}<style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}body{width:96px}</style><main></main>`,
		`${origin}/state`,
	);
	trees.push(tree);
	documentStyles(tree).setViewport(96, 48);
	const parent = [...tree.walk()].find(({ node }) => node.tagName === "main")
		?.node.id;
	if (parent === undefined) throw new Error("Missing main fixture");
	const id = tree.createElement(tagName, {
		id: "photo",
		style: "display:block",
		...attributes,
	});
	tree.append(parent, id);
	const requests: { url: string; signal: AbortSignal }[] = [];
	const fetch =
		options.fetch ??
		(async (url: string) => {
			if (url.endsWith("/missing.png"))
				return { ...response(url), status: 404 };
			if (url.endsWith("/bad.png"))
				return { ...response(url), body: new Uint8Array([0]), encodedBytes: 1 };
			return response(url, url.endsWith(".gif") ? "image/gif" : "image/png");
		});
	const images = documentImages(tree, {
		...options,
		fetch: async (url, signal) => {
			requests.push({ url, signal });
			return fetch(url, signal);
		},
	});
	const events: string[] = [];
	for (const type of ["load", "error"])
		documentInteractions(tree).events.addEventListener(id, type, (event) => {
			expect(event.bubbles).toBe(false);
			expect(event.cancelable).toBe(false);
			events.push(type);
		});
	const empty = () => emptyImageAlternative(tree, tree.get(id));
	const node = () =>
		buildFormattingTree(tree).nodes.find(
			(entry) => entry.ref === tree.reference(id) && entry.kind !== "text",
		);
	const rect = () => documentGeometry(tree).getBoundingClientRect(id);
	return { tree, parent, id, images, requests, events, empty, node, rect };
}

const alternatives = [undefined, "", "Badge", " \t\r\n", "\u00a0"];
const sources = [
	undefined,
	"",
	" \t",
	"/missing.png",
	"/bad.png",
	"/loaded.png",
	"/loaded.gif",
];

it.each(sources.flatMap((src) => alternatives.map((alt) => ({ src, alt }))))(
	"applies the native policy matrix to src=$src alt=$alt without fabricated requests or events",
	async ({ src, alt }) => {
		const page = fixture({
			...(src === undefined ? {} : { src }),
			...(alt === undefined ? {} : { alt }),
		});
		await page.images.settle();
		const state = page.images.get(page.id);
		const expected =
			src === undefined || src === ""
				? alt === undefined || alt === ""
				: alt === "" && state.state === "broken";
		const before = page.images.metrics();
		const events = [...page.events];
		const snapshot = snapshotDocument(page.tree);
		expect(page.empty()).toBe(expected);
		expect(page.empty()).toBe(expected);
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
			alt !== undefined && alt !== "" && state.state !== "complete"
				? alt
				: undefined,
		);
		if (expected) {
			expect(page.node()).toMatchObject({
				kind: "replaced",
				emptyImage: true,
				intrinsic: { width: 0, height: 0 },
				ref: page.tree.reference(page.id),
			});
			expect(page.rect()).toMatchObject({ width: 0, height: 0 });
			expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(0);
		}
		await page.images.settle();
		expect(page.images.metrics()).toMatchObject({
			requests: before.requests,
			updates: before.updates,
			delivered: before.delivered,
		});
		expect(page.events).toEqual(events);
		expect(page.events).toEqual(
			src === undefined ? [] : [state.state === "complete" ? "load" : "error"],
		);
		expect(page.requests).toHaveLength(src?.startsWith("/") ? 1 : 0);
		expect(snapshotDocument(page.tree)).toEqual(snapshot);
	},
);

it.each([htmlNamespace, svgNamespace, mathmlNamespace])(
	"requires the HTML image namespace, not merely the img local name: %s",
	async (namespace) => {
		const page = fixture();
		const other = page.tree.createParserElement(
			"img",
			{ alt: "", src: "" },
			namespace,
		);
		page.tree.append(page.parent, other);
		await page.images.settle();
		expect(emptyImageAlternative(page.tree, page.tree.get(other))).toBe(
			namespace === htmlNamespace,
		);
		page.tree.setAttribute(other, "alt", "Badge");
		expect(brokenImageAlternative(page.tree, page.tree.get(other))).toBe(
			namespace === htmlNamespace ? "Badge" : undefined,
		);
		expect(emptyImageAlternative(page.tree, page.tree.get(page.parent))).toBe(
			false,
		);
		expect(page.requests).toEqual([]);
	},
);

it.each(["xlink:href", "xlink:src", "xml:src"])(
	"does not reinterpret a qualified %s attribute as HTML src",
	async (attribute) => {
		const page = fixture({ [attribute]: "/loaded.png" });
		await page.images.settle();
		expect(page.empty()).toBe(true);
		expect(page.tree.get(page.id).attributes[attribute]).toBe("/loaded.png");
		expect(page.images.get(page.id).currentSrc).toBe("");
		expect(page.requests).toEqual([]);
		expect(page.events).toEqual([]);
	},
);

it.each(
	["srcset", "crossorigin", "referrerpolicy"].flatMap((attribute) =>
		["", "value"].flatMap((value) =>
			[undefined, "", "/missing.png"].flatMap((src) =>
				["", "Badge"].map((alt) => ({ attribute, value, src, alt })),
			),
		),
	),
)(
	"excludes exact $attribute=$value presence for src=$src alt=$alt and recovers after removal",
	async ({ attribute, value, src, alt }) => {
		const page = fixture({
			alt,
			[attribute]: value,
			...(src === undefined ? {} : { src }),
		});
		await page.images.settle();
		expect(page.empty()).toBe(false);
		expect(
			brokenImageAlternative(page.tree, page.tree.get(page.id)),
		).toBeUndefined();
		expect(page.node()?.emptyImage).toBeUndefined();
		page.tree.removeAttribute(page.id, attribute);
		await page.images.settle();
		expect(page.empty()).toBe(alt === "");
		expect(page.node()?.emptyImage).toBe(alt === "" ? true : undefined);
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
			alt || undefined,
		);
		const before = page.images.metrics();
		page.empty();
		page.node();
		await page.images.settle();
		expect(page.images.metrics()).toMatchObject({
			requests: before.requests,
			delivered: before.delivered,
		});
	},
);

it.each(["", "Badge"])(
	"excludes a real HTML picture parent with alt=%j and recovers after reparenting",
	async (alt) => {
		const page = fixture({ alt });
		const picture = page.tree.createElement("picture");
		page.tree.append(page.parent, picture);
		page.tree.append(picture, page.id);
		await page.images.settle();
		expect(page.empty()).toBe(false);
		expect(
			brokenImageAlternative(page.tree, page.tree.get(page.id)),
		).toBeUndefined();
		page.tree.append(page.parent, page.id);
		await page.images.settle();
		expect(page.empty()).toBe(alt === "");
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
			alt || undefined,
		);
		expect(page.requests).toEqual([]);
		expect(page.events).toEqual([]);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"does not confuse a foreign picture parent with HTML picture: %s",
	async (namespace) => {
		const page = fixture();
		const picture = page.tree.createParserElement("picture", {}, namespace);
		page.tree.append(page.parent, picture);
		page.tree.append(picture, page.id);
		await page.images.settle();
		expect(page.empty()).toBe(true);
	},
);

it.each(
	["image/png", "image/gif"].flatMap((type) =>
		["", "Badge"].map((alt) => ({ type, alt })),
	),
)(
	"keeps delayed $type with alt=$alt guarded, decodes it, and invalidates prepared fallback paint",
	async ({ type, alt }) => {
		let release!: (value: NetworkResponse) => void;
		const pending = new Promise<NetworkResponse>((resolve) => {
			release = resolve;
		});
		const page = fixture({ alt }, { fetch: () => pending });
		await page.images.settle();
		const prepared = prepareDocumentRaster(page.tree);
		page.tree.setAttribute(page.id, "src", "/delayed");
		expect(() => prepared.rasterize()).toThrow(/stale/i);
		expect(page.images.get(page.id)).toMatchObject({
			state: "loading",
			complete: false,
			naturalWidth: 0,
			naturalHeight: 0,
		});
		expect(page.empty()).toBe(false);
		expect(
			brokenImageAlternative(page.tree, page.tree.get(page.id)),
		).toBeUndefined();
		expect(page.node()?.emptyImage).toBeUndefined();
		expect(page.events).toEqual([]);
		const decode = page.images.decode(page.id);
		release(response(`${origin}/delayed`, type));
		await decode;
		await page.images.settle();
		expect(page.images.get(page.id)).toMatchObject({
			state: "complete",
			complete: true,
			mediaType: type,
			naturalWidth: type === "image/png" ? 4 : 2,
			naturalHeight: type === "image/png" ? 2 : 1,
		});
		expect(page.empty()).toBe(false);
		expect(
			brokenImageAlternative(page.tree, page.tree.get(page.id)),
		).toBeUndefined();
		expect(page.images.decoded(page.id)).toBeDefined();
		expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(1);
		expect(page.events).toEqual(["load"]);
		expect(page.requests).toHaveLength(1);
	},
);

it.each(["/bad.png", "/missing.png"])(
	"preserves failed decode/error observability while admitting terminal empty alt: %s",
	async (src) => {
		const page = fixture({ src, alt: "" });
		await expect(page.images.decode(page.id)).rejects.toMatchObject({
			name: "EncodingError",
		});
		await page.images.settle();
		expect(page.images.get(page.id)).toMatchObject({
			state: "broken",
			complete: true,
			currentSrc: origin + src,
			naturalWidth: 0,
			naturalHeight: 0,
		});
		expect(page.images.get(page.id).error).toBeDefined();
		expect(page.empty()).toBe(true);
		expect(page.images.decoded(page.id)).toBeUndefined();
		expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(0);
		expect(page.events).toEqual(["error"]);
		expect(page.requests).toHaveLength(1);
		expect(page.images.metrics().waiters).toBe(0);
	},
);

it.each(["network-error", "timeout", "unsupported"] as const)(
	"keeps the native terminal %s error visible with present-empty alt",
	async (code) => {
		const page = fixture(
			{ src: "/failed.png", alt: "" },
			{
				fetch: async () => {
					throw new AgentBrowserError(code, "In-memory terminal failure");
				},
			},
		);
		await page.images.settle();
		expect(page.images.get(page.id)).toMatchObject({
			state: "broken",
			error: code,
		});
		expect(page.empty()).toBe(true);
		expect(page.events).toEqual(["error"]);
		expect(page.requests).toHaveLength(1);
	},
);

it.each([
	"same-origin-fetch-denial",
	"mixed-content",
	"mixed-redirect",
	"owner-csp",
	"meta-csp",
])("never admits a policy-denied image as empty: %s", async (policy) => {
	const page = fixture(
		{
			src:
				policy === "mixed-content"
					? "http://fixture.invalid/loaded.png"
					: "/loaded.png",
			alt: "",
		},
		{
			blockedByCsp: policy === "owner-csp",
			fetch: async (url) => {
				if (policy === "same-origin-fetch-denial")
					throw new AgentBrowserError(
						"policy-denied",
						"In-memory same-origin denial",
					);
				return response(
					policy === "mixed-redirect"
						? "http://fixture.invalid/final.png"
						: url,
				);
			},
		},
	);
	if (policy === "meta-csp") {
		const meta = page.tree.createElement("meta", {
			"http-equiv": "content-security-policy",
			content: "img-src 'none'",
		});
		page.tree.append(page.parent, meta);
	}
	await page.images.settle();
	expect(page.images.get(page.id)).toMatchObject({
		state: "broken",
		error: "policy-denied",
		complete: true,
	});
	expect(page.empty()).toBe(false);
	expect(page.node()?.emptyImage).toBeUndefined();
	expect(page.events).toEqual(["error"]);
	expect(page.requests).toHaveLength(
		["same-origin-fetch-denial", "mixed-redirect"].includes(policy) ? 1 : 0,
	);
	const failure = page.images.get(page.id);
	const before = page.images.metrics();
	const requestCount = page.requests.length;
	page.tree.setAttribute(page.id, "alt", "Badge");
	expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
		"Badge",
	);
	expect(page.empty()).toBe(false);
	expect(buildFormattingTree(page.tree).issues).toEqual({});
	const raster = rasterizeDocument(page.tree);
	expect(raster.metrics.paintedImages).toBe(0);
	expect(
		raster.image.pixels.some(
			(channel, index) => index % 4 !== 3 && channel < 255,
		),
	).toBe(true);
	expect(page.images.decoded(page.id)).toBeUndefined();
	await expect(page.images.decode(page.id)).rejects.toMatchObject({
		name: "EncodingError",
	});
	await page.images.settle();
	expect(page.images.get(page.id)).toEqual(failure);
	expect(page.images.metrics()).toMatchObject({
		requests: before.requests,
		updates: before.updates,
		delivered: before.delivered,
	});
	expect(page.requests).toHaveLength(requestCount);
	expect(page.events).toEqual(["error"]);
	page.tree.setAttribute(page.id, "alt", "");
	expect(page.empty()).toBe(false);
	await expect(page.images.decode(page.id)).rejects.toMatchObject({
		name: "EncodingError",
	});
	expect(page.events).toEqual(["error"]);
	page.tree.removeAttribute(page.id, "src");
	await page.images.settle();
	expect(page.empty()).toBe(true);
	expect(page.images.metrics()).toMatchObject({
		resources: 0,
		decodedBytes: 0,
	});
});

it.each([
	{ maxResponseBytes: 1 },
	{ maxReceivedBytes: 1 },
	{ maxDecodedBytes: 1 },
	{ maxDecodeWork: 1 },
])(
	"does not hide per-resource budget failure %j and recovers with no source",
	async (limits) => {
		const page = fixture({ src: "/loaded.png", alt: "" }, { limits });
		await page.images.settle();
		expect(page.images.get(page.id)).toMatchObject({
			state: "broken",
			error: "resource-limit",
		});
		expect(page.empty()).toBe(false);
		expect(page.node()?.emptyImage).toBeUndefined();
		expect(page.events).toEqual(["error"]);
		const failure = page.images.get(page.id);
		const before = page.images.metrics();
		const requestCount = page.requests.length;
		page.tree.setAttribute(page.id, "alt", "Badge");
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
			"Badge",
		);
		expect(page.empty()).toBe(false);
		expect(buildFormattingTree(page.tree).issues).toEqual({});
		const raster = rasterizeDocument(page.tree);
		expect(raster.metrics.paintedImages).toBe(0);
		expect(
			raster.image.pixels.some(
				(channel, index) => index % 4 !== 3 && channel < 255,
			),
		).toBe(true);
		expect(page.images.decoded(page.id)).toBeUndefined();
		await expect(page.images.decode(page.id)).rejects.toMatchObject({
			name: "EncodingError",
		});
		await page.images.settle();
		expect(page.images.get(page.id)).toEqual(failure);
		expect(page.images.metrics()).toMatchObject({
			requests: before.requests,
			updates: before.updates,
			delivered: before.delivered,
		});
		expect(page.requests).toHaveLength(requestCount);
		expect(page.events).toEqual(["error"]);
		page.tree.setAttribute(page.id, "alt", "");
		expect(page.empty()).toBe(false);
		page.tree.removeAttribute(page.id, "src");
		await page.images.settle();
		expect(page.empty()).toBe(true);
		expect(page.images.metrics()).toMatchObject({
			resources: 0,
			decodedBytes: 0,
			requests: 1,
			closed: false,
		});
		expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(0);
	},
);

it("retains the lifetime request budget across loaded-to-empty-to-loaded transitions", async () => {
	const page = fixture(
		{ src: "/loaded.png", alt: "" },
		{ limits: { maxRequests: 1 } },
	);
	await page.images.settle();
	page.tree.removeAttribute(page.id, "src");
	await page.images.settle();
	expect(page.empty()).toBe(true);
	page.tree.setAttribute(page.id, "src", "/next.png");
	await page.images.settle();
	expect(page.empty()).toBe(false);
	expect(page.images.get(page.id).error).toBe("resource-limit");
	expect(page.requests).toHaveLength(1);
	expect(page.events).toEqual(["load", "error"]);
});

it.each(["scan", "element", "update"])(
	"propagates fatal owner %s budgets rather than manufacturing empty content",
	async (budget) => {
		const limits =
			budget === "scan"
				? { maxScanWork: 1 }
				: budget === "element"
					? { maxElements: 1 }
					: { maxUpdates: 1 };
		const page = fixture({ alt: "" }, { limits });
		if (budget === "element")
			page.tree.append(page.parent, page.tree.createElement("img"));
		if (budget === "update") {
			await page.images.settle();
			page.tree.setAttribute(page.id, "src", "");
		}
		await expect(page.images.settle()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(() => page.empty()).toThrow(AgentBrowserError);
		expect(() => buildFormattingTree(page.tree)).toThrow(AgentBrowserError);
		expect(page.images.metrics()).toMatchObject({
			closed: true,
			failure: "resource-limit",
			resources: 0,
			decodedBytes: 0,
		});
		expect(page.requests).toEqual([]);
		page.tree.removeAttribute(page.id, "src");
		expect(() => page.empty()).toThrow(AgentBrowserError);
		page.tree.setAttribute(page.id, "alt", "Badge");
		expect(() =>
			brokenImageAlternative(page.tree, page.tree.get(page.id)),
		).toThrow(AgentBrowserError);
		const recovery = fixture({ alt: "" });
		await recovery.images.settle();
		expect(recovery.empty()).toBe(true);
	},
);

it("recovers from an oversized source selection without erasing its budget error", async () => {
	const page = fixture(
		{ src: `/${"a".repeat(64)}`, alt: "" },
		{ limits: { maxUrlCodeUnits: 48 } },
	);
	await page.images.settle();
	expect(page.images.get(page.id).error).toBe("resource-limit");
	expect(page.empty()).toBe(false);
	page.tree.removeAttribute(page.id, "src");
	await page.images.settle();
	expect(page.empty()).toBe(true);
	expect(page.images.get(page.id).error).toBeUndefined();
	expect(page.events).toEqual(["error"]);
	expect(page.requests).toEqual([]);
});

it("keeps author boxes, hit/source identity and cleanup across loaded, empty and reloaded states", async () => {
	const page = fixture({
		src: "/loaded.png",
		alt: "",
		style:
			"display:block;width:12px;height:6px;padding:2px;border:1px solid red;background:blue",
	});
	await page.images.settle();
	const ref = page.tree.reference(page.id);
	const rectangle = page.rect();
	expect(rectangle).toMatchObject({ width: 18, height: 12 });
	expect(page.images.metrics()).toMatchObject({
		resources: 1,
		decodedBytes: 32,
	});
	const loaded = prepareDocumentRaster(page.tree);
	page.tree.removeAttribute(page.id, "src");
	expect(() => loaded.rasterize()).toThrow(/stale/i);
	await page.images.settle();
	expect(page.empty()).toBe(true);
	expect(page.node()).toMatchObject({ ref, emptyImage: true });
	expect(page.rect()).toEqual(rectangle);
	expect(documentHitTesting(page.tree).elementFromPoint(4, 4)).toBe(page.id);
	expect(page.images.decoded(page.id)).toBeUndefined();
	expect(page.images.metrics()).toMatchObject({
		resources: 0,
		decodedBytes: 0,
		requests: 1,
	});
	expect(page.events).toEqual(["load"]);
	const empty = prepareDocumentRaster(page.tree);
	expect(empty.rasterize().metrics.paintedImages).toBe(0);
	page.tree.setAttribute(page.id, "src", "/loaded.gif");
	expect(() => empty.rasterize()).toThrow(/stale/i);
	await page.images.settle();
	expect(page.empty()).toBe(false);
	expect(page.node()?.ref).toBe(ref);
	expect(page.rect()).toEqual(rectangle);
	expect(page.images.metrics()).toMatchObject({
		resources: 1,
		decodedBytes: 8,
		requests: 2,
	});
	expect(page.events).toEqual(["load", "load"]);
	expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(1);
});

it("releases shared decoded data only after the last loaded consumer becomes empty", async () => {
	const page = fixture({ src: "/loaded.png", alt: "" });
	const sibling = page.tree.createElement("img", {
		src: "/loaded.png",
		alt: "",
		style: "display:block",
	});
	page.tree.append(page.parent, sibling);
	await page.images.settle();
	const decoded = page.images.decoded(sibling);
	expect(page.images.decoded(page.id)).toBe(decoded);
	expect(page.requests).toHaveLength(1);
	page.tree.removeAttribute(page.id, "src");
	await page.images.settle();
	expect(page.empty()).toBe(true);
	expect(page.images.decoded(page.id)).toBeUndefined();
	expect(page.images.decoded(sibling)).toBe(decoded);
	expect(page.images.metrics()).toMatchObject({
		resources: 1,
		decodedBytes: 32,
	});
	expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(1);
	page.tree.removeAttribute(sibling, "src");
	await page.images.settle();
	expect(page.images.metrics()).toMatchObject({
		resources: 0,
		decodedBytes: 0,
		requests: 1,
	});
	expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(0);
});

it("aborts a removed pending source, rejects its decode and ignores its late completion", async () => {
	let release!: (value: NetworkResponse) => void;
	const pending = new Promise<NetworkResponse>((resolve) => {
		release = resolve;
	});
	const page = fixture(
		{ src: "/delayed.png", alt: "" },
		{ fetch: () => pending },
	);
	const decode = expect(page.images.decode(page.id)).rejects.toMatchObject({
		name: "EncodingError",
	});
	expect(page.empty()).toBe(false);
	page.tree.removeAttribute(page.id, "src");
	expect(page.empty()).toBe(true);
	expect(page.requests[0].signal.aborted).toBe(true);
	await decode;
	await page.images.settle();
	const prepared = prepareDocumentRaster(page.tree);
	release(response(`${origin}/delayed.png`));
	await pending;
	await page.images.settle();
	expect(page.empty()).toBe(true);
	expect(page.events).toEqual([]);
	expect(page.images.metrics()).toMatchObject({
		resources: 0,
		decodedBytes: 0,
		requests: 1,
		waiters: 0,
	});
	expect(prepared.rasterize().metrics.paintedImages).toBe(0);
});

it("invalidates prepared rasters on alt/style/source mutations without restarting unchanged image selection", async () => {
	const page = fixture({ src: "/missing.png", alt: "" });
	await page.images.settle();
	const empty = prepareDocumentRaster(page.tree);
	page.tree.setAttribute(page.id, "alt", "Badge");
	expect(() => empty.rasterize()).toThrow(/stale/i);
	expect(page.empty()).toBe(false);
	expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
		"Badge",
	);
	expect(page.rect()).toMatchObject({ width: 96, height: 8 });
	const text = prepareDocumentRaster(page.tree);
	page.tree.setAttribute(page.id, "alt", "");
	expect(() => text.rasterize()).toThrow(/stale/i);
	expect(page.empty()).toBe(true);
	expect(page.rect()).toMatchObject({ width: 0, height: 0 });
	const beforeStyle = prepareDocumentRaster(page.tree);
	page.tree.setAttribute(
		page.id,
		"style",
		"display:block;width:17px;height:9px;background:red",
	);
	expect(() => beforeStyle.rasterize()).toThrow(/stale/i);
	expect(page.rect()).toMatchObject({ width: 17, height: 9 });
	expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(0);
	await page.images.settle();
	expect(page.images.metrics()).toMatchObject({
		requests: 1,
		updates: 1,
		delivered: 1,
	});
	expect(page.events).toEqual(["error"]);
	const beforeSource = prepareDocumentRaster(page.tree);
	page.tree.setAttribute(page.id, "src", "/loaded.png");
	expect(() => beforeSource.rasterize()).toThrow(/stale/i);
	await page.images.settle();
	expect(page.empty()).toBe(false);
	expect(page.rect()).toMatchObject({ width: 17, height: 9 });
	expect(page.events).toEqual(["error", "load"]);
});

it.each(["<!doctype html>", ""])(
	"preserves nonempty broken-image text behavior in doctype %j",
	async (doctype) => {
		const page = fixture({ src: "/missing.png", alt: "Badge" }, {}, doctype);
		await page.images.settle();
		expect(page.empty()).toBe(false);
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
			"Badge",
		);
		expect(buildFormattingTree(page.tree).issues).toEqual({});
		expect(page.rect()).toMatchObject({ height: 8 });
		const raster = rasterizeDocument(page.tree);
		expect(
			raster.image.pixels.some(
				(channel, index) => index % 4 !== 3 && channel < 255,
			),
		).toBe(true);
		expect(page.events).toEqual(["error"]);
	},
);

it.each(
	[undefined, "", " \t\r\n"].flatMap((src) =>
		["<!doctype html>", ""].map((doctype) => ({ src, doctype })),
	),
)(
	"renders source-backed literal alt text for src=$src in doctype=$doctype with source/paint identity",
	async ({ src, doctype }) => {
		const alt = "A  B\nC";
		const page = fixture(
			{ alt, ...(src === undefined ? {} : { src }) },
			{},
			doctype,
		);
		const control = fixture({}, {}, doctype, "span");
		control.tree.append(control.id, control.tree.createText(alt));
		await page.images.settle();
		const snapshot = snapshotDocument(page.tree);
		expect(page.empty()).toBe(false);
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(alt);
		expect(page.images.get(page.id)).toMatchObject({
			state: src === undefined ? "empty" : "broken",
			complete: true,
			currentSrc: "",
		});
		expect(page.images.get(page.id).error).toBe(
			src === undefined ? undefined : "invalid-input",
		);
		expect(buildFormattingTree(page.tree).issues).toEqual({});
		expect(page.node()?.ref).toBe(page.tree.reference(page.id));
		expect(page.rect()).toEqual(control.rect());
		expect(rasterizeDocument(page.tree).image.pixels).toEqual(
			rasterizeDocument(control.tree).image.pixels,
		);
		expect(snapshotDocument(page.tree)).toEqual(snapshot);
		expect(page.tree.get(page.id).attributes.alt).toBe(alt);
		expect(page.tree.get(page.id).attributes.src).toBe(src);
		expect(page.requests).toEqual([]);
		expect(page.events).toEqual(src === undefined ? [] : ["error"]);
	},
);

it("keeps missing-alt broken sources guarded until alt is explicitly empty", async () => {
	const page = fixture({ src: "/missing.png" });
	await page.images.settle();
	expect(page.empty()).toBe(false);
	expect(page.node()?.kind).toBe("deferred");
	page.tree.setAttribute(page.id, "alt", "");
	expect(page.empty()).toBe(true);
	expect(page.node()?.emptyImage).toBe(true);
	page.tree.removeAttribute(page.id, "alt");
	expect(page.empty()).toBe(false);
	expect(page.node()?.emptyImage).toBeUndefined();
	page.tree.removeAttribute(page.id, "src");
	await page.images.settle();
	expect(page.empty()).toBe(true);
	expect(page.images.metrics()).toMatchObject({
		requests: 1,
		delivered: 1,
		resources: 0,
	});
	expect(page.events).toEqual(["error"]);
});

it("does not treat a loaded cross-origin image as empty or origin-clean", async () => {
	const page = fixture({ src: "https://other.invalid/loaded.png", alt: "" });
	await page.images.settle();
	expect(page.images.get(page.id)).toMatchObject({
		state: "complete",
		originClean: false,
		naturalWidth: 4,
		naturalHeight: 2,
	});
	expect(page.empty()).toBe(false);
	expect(page.requests.map(({ url }) => url)).toEqual([
		"https://other.invalid/loaded.png",
	]);
	expect(page.events).toEqual(["load"]);
});

it("preserves loaded pixels and resource identity across alt and style mutations", async () => {
	const page = fixture({ src: "/loaded.png", alt: "" });
	await page.images.settle();
	const decoded = page.images.decoded(page.id);
	const pixels = rasterizeDocument(page.tree).image.pixels;
	for (const alt of ["Badge", undefined, ""]) {
		const prepared = prepareDocumentRaster(page.tree);
		if (alt === undefined) page.tree.removeAttribute(page.id, "alt");
		else page.tree.setAttribute(page.id, "alt", alt);
		expect(() => prepared.rasterize()).toThrow(/stale/i);
		expect(page.empty()).toBe(false);
		expect(page.images.decoded(page.id)).toBe(decoded);
		expect(rasterizeDocument(page.tree).image.pixels).toEqual(pixels);
	}
	const prepared = prepareDocumentRaster(page.tree);
	page.tree.setAttribute(
		page.id,
		"style",
		"display:block;width:8px;height:4px",
	);
	expect(() => prepared.rasterize()).toThrow(/stale/i);
	expect(page.rect()).toMatchObject({ width: 8, height: 4 });
	await page.images.settle();
	expect(page.images.metrics()).toMatchObject({
		requests: 1,
		updates: 1,
		delivered: 1,
	});
	expect(page.events).toEqual(["load"]);
});

it.each(["scan", "element", "update"])(
	"propagates a first classifier read exceeding the %s owner budget",
	async (budget) => {
		const limits =
			budget === "scan"
				? { maxScanWork: 1 }
				: budget === "element"
					? { maxElements: 1 }
					: { maxUpdates: 1 };
		const page = fixture({}, { limits });
		if (budget === "element") {
			expect(page.empty()).toBe(true);
			const sibling = page.tree.createElement("img");
			page.tree.append(page.parent, sibling);
			expect(() =>
				emptyImageAlternative(page.tree, page.tree.get(sibling)),
			).toThrow(/element limit/i);
		} else {
			if (budget === "update") {
				expect(page.empty()).toBe(true);
				page.tree.setAttribute(page.id, "src", "");
			}
			expect(() => page.empty()).toThrow(
				budget === "scan" ? /scan work/i : /update limit/i,
			);
		}
		expect(page.requests).toEqual([]);
		await expect(page.images.settle()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(page.images.metrics().failure).toBe("resource-limit");
	},
);

it("keeps a fragment-bearing source and author attributes unchanged by empty rendering", async () => {
	const page = fixture({
		src: "/missing.png#owner-identity",
		alt: "",
		title: "retained",
		width: "11",
		height: "7",
	});
	await page.images.settle();
	const snapshot = snapshotDocument(page.tree);
	expect(page.images.get(page.id).currentSrc).toBe(
		`${origin}/missing.png#owner-identity`,
	);
	expect(page.requests.map(({ url }) => url)).toEqual([
		`${origin}/missing.png`,
	]);
	expect(page.empty()).toBe(true);
	expect(page.rect()).toMatchObject({ width: 11, height: 7 });
	expect(page.node()).toMatchObject({
		ref: page.tree.reference(page.id),
		emptyImage: true,
	});
	expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(0);
	expect(snapshotDocument(page.tree)).toEqual(snapshot);
	expect(page.tree.get(page.id).attributes).toMatchObject({
		src: "/missing.png#owner-identity",
		alt: "",
		title: "retained",
		width: "11",
		height: "7",
	});
	expect(page.events).toEqual(["error"]);
});

it.each([undefined, "", " \t"])(
	"invalidates text/empty/loaded prepared paint through alt, style and source mutations from src=%j",
	async (src) => {
		const page = fixture({
			alt: "Badge",
			...(src === undefined ? {} : { src }),
		});
		await page.images.settle();
		const reference = page.tree.reference(page.id);
		const initialEvents = src === undefined ? [] : ["error"];
		const text = prepareDocumentRaster(page.tree);
		page.tree.setAttribute(page.id, "alt", "");
		expect(() => text.rasterize()).toThrow(/stale/i);
		expect(page.empty()).toBe(true);
		expect(page.rect()).toMatchObject({ width: 0, height: 0 });
		const empty = prepareDocumentRaster(page.tree);
		page.tree.setAttribute(page.id, "alt", "Badge");
		expect(() => empty.rasterize()).toThrow(/stale/i);
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
			"Badge",
		);
		expect(page.rect()).toMatchObject({ height: 8 });
		const beforeStyle = prepareDocumentRaster(page.tree);
		page.tree.setAttribute(page.id, "style", "display:block;color:red");
		expect(() => beforeStyle.rasterize()).toThrow(/stale/i);
		const beforeSource = prepareDocumentRaster(page.tree);
		expect(
			beforeSource
				.rasterize()
				.image.pixels.some(
					(channel, index) => index % 4 === 1 && channel === 0,
				),
		).toBe(true);
		await page.images.settle();
		expect(page.events).toEqual(initialEvents);
		expect(page.images.metrics()).toMatchObject({ requests: 0, updates: 1 });
		page.tree.setAttribute(page.id, "src", "/loaded.png");
		expect(() => beforeSource.rasterize()).toThrow(/stale/i);
		expect(page.images.get(page.id).state).toBe("loading");
		expect(page.empty()).toBe(false);
		expect(
			brokenImageAlternative(page.tree, page.tree.get(page.id)),
		).toBeUndefined();
		await page.images.settle();
		const loaded = prepareDocumentRaster(page.tree);
		expect(loaded.rasterize().metrics.paintedImages).toBe(1);
		page.tree.removeAttribute(page.id, "src");
		expect(() => loaded.rasterize()).toThrow(/stale/i);
		await page.images.settle();
		expect(page.empty()).toBe(false);
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
			"Badge",
		);
		expect(page.node()?.ref).toBe(reference);
		expect(page.images.decoded(page.id)).toBeUndefined();
		expect(page.images.metrics()).toMatchObject({
			resources: 0,
			decodedBytes: 0,
			requests: 1,
		});
		expect(page.events).toEqual([...initialEvents, "load"]);
		expect(rasterizeDocument(page.tree).metrics.paintedImages).toBe(0);
	},
);

it("preserves source/error identity as nonempty-alt text moves from absent to empty and whitespace sources", async () => {
	const page = fixture({ alt: "Badge" });
	await page.images.settle();
	const pixels = rasterizeDocument(page.tree).image.pixels;
	for (const src of ["", " \t\r\n"]) {
		const prepared = prepareDocumentRaster(page.tree);
		page.tree.setAttribute(page.id, "src", src);
		expect(() => prepared.rasterize()).toThrow(/stale/i);
		await page.images.settle();
		expect(brokenImageAlternative(page.tree, page.tree.get(page.id))).toBe(
			"Badge",
		);
		expect(page.images.get(page.id)).toMatchObject({
			state: "broken",
			error: "invalid-input",
			currentSrc: "",
		});
		expect(page.tree.get(page.id).attributes.src).toBe(src);
		expect(rasterizeDocument(page.tree).image.pixels).toEqual(pixels);
	}
	expect(page.events).toEqual(["error", "error"]);
	expect(page.requests).toEqual([]);
	expect(page.images.metrics()).toMatchObject({ updates: 3, delivered: 2 });
});
