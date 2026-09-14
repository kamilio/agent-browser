import { afterEach, expect, it } from "vitest";
import {
	documentImages,
	type DocumentImageOptions,
} from "./document-images.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function response(url: string, width = 3, height = 2): NetworkResponse {
	const body = encodePng(createRaster(width, height, [20, 40, 60, 255]));
	return {
		url,
		status: 200,
		headers: { "content-type": ["image/png"] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function fixture(
	html = '<main id="target" style="background-image:url(/a.png)"></main>',
	options: DocumentImageOptions = {},
) {
	const tree = parseHtmlDocument(html, "https://example.com/page");
	trees.push(tree);
	const requested: { url: string; signal: AbortSignal }[] = [];
	const images = documentImages(tree, {
		...options,
		fetch: async (url, signal) => {
			requested.push({ url, signal });
			return options.fetch ? options.fetch(url, signal) : response(url);
		},
	});
	const target = (name = "target") => {
		const found = [...tree.walk()].find(
			({ node }) => node.attributes.id === name,
		);
		if (!found) throw new Error(`Missing fixture element: ${name}`);
		return found.node.id;
	};
	return { tree, images, requested, target };
}

it("deduplicates img, element and pseudo resources without background load events", async () => {
	const { tree, images, requested, target } = fixture(`
		<style>
			main, img { background-image: url(/a.png) }
			main::before, main::after { content: ''; background-image: url(/a.png) }
		</style>
		<main id="target"></main><img id="image" src="/a.png">
	`);
	const image = target("image");
	const element = target();
	const delivered: string[] = [];
	for (const id of [image, element])
		for (const type of ["load", "error"])
			documentInteractions(tree).events.addEventListener(id, type, () => {
				delivered.push(`${id}:${type}`);
			});
	expect(images.background(element)).toMatchObject({
		state: "loading",
		complete: false,
		naturalWidth: 0,
	});
	await images.settle();
	expect(requested).toHaveLength(1);
	expect(delivered).toEqual([`${image}:load`]);
	expect(images.background(element)).toMatchObject({
		state: "complete",
		complete: true,
		currentSrc: "https://example.com/a.png",
		naturalWidth: 3,
		naturalHeight: 2,
		originClean: true,
		mediaType: "image/png",
	});
	for (const pseudo of [undefined, "before", "after"] as const)
		expect(images.decodedBackground(element, pseudo)).toBe(
			images.decoded(image),
		);
	expect(images.decodedBackground(image)).toBe(images.decoded(image));
	expect(images.metrics()).toMatchObject({
		elements: 5,
		resources: 1,
		decodedBytes: 24,
		delivered: 1,
	});
	expect(images.inspect().images).toHaveLength(1);
	await images.decode(image);
	const metrics = images.metrics();
	for (let repeat = 0; repeat < 20; repeat++) {
		images.background(element);
		images.decodedBackground(element, "before");
		images.get(image);
	}
	await images.settle();
	expect(images.metrics()).toEqual(metrics);
});

it("defers backgrounds until enabled without releasing existing img resources", async () => {
	const { tree, images, requested, target } = fixture(
		`<link id="sheet" rel="stylesheet" href="/style.css">
		<img id="image" src="/shared.png">
		<main id="target" style="background-image:url(/discarded.png)"></main>`,
		{ deferBackgrounds: true },
	);
	const element = target();
	const image = target("image");
	await images.settle();
	const decoded = images.decoded(image);
	expect(decoded).toBeDefined();
	expect(images.background(element).state).toBe("empty");
	documentStyles(tree).setExternalSheet(
		target("sheet"),
		"https://example.com/style.css",
		`main { background-image:url(/winning.png) !important }
		main::before { content: ""; background-image:url(/shared.png) }`,
	);
	await images.settle();
	expect(images.background(element).state).toBe("empty");
	expect(images.background(element, "before").state).toBe("empty");
	expect(requested.map(({ url }) => url)).toEqual([
		"https://example.com/shared.png",
	]);
	images.enableBackgrounds();
	await images.settle();
	expect(images.background(element)).toMatchObject({
		state: "complete",
		currentSrc: "https://example.com/winning.png",
	});
	expect(images.decoded(image)).toBe(decoded);
	expect(images.decodedBackground(element, "before")).toBe(decoded);
	expect(requested[0].signal.aborted).toBe(false);
	expect(requested.map(({ url }) => url)).toEqual([
		"https://example.com/shared.png",
		"https://example.com/winning.png",
	]);
	const metrics = images.metrics();
	for (let repeat = 0; repeat < 20; repeat++) images.enableBackgrounds();
	await images.settle();
	expect(images.metrics()).toEqual(metrics);
	images.close();
	expect(() => images.enableBackgrounds()).toThrow(/closed/);
});

it.each([undefined, false])(
	"enables background discovery by default: %s",
	async (deferBackgrounds) => {
		const { images, requested, target } = fixture(undefined, {
			deferBackgrounds,
		});
		await images.settle();
		expect(images.background(target()).state).toBe("complete");
		expect(requested).toHaveLength(1);
		const scanWork = images.metrics().scanWork;
		images.enableBackgrounds();
		await images.settle();
		expect(images.metrics().scanWork).toBe(scanWork);
	},
);

it.each([null, 0, 1, "true", {}])(
	"rejects a nonboolean deferBackgrounds option: %j",
	(deferBackgrounds) => {
		expect(() =>
			fixture(undefined, {
				deferBackgrounds: deferBackgrounds as unknown as boolean,
			}),
		).toThrow(/Invalid image owner options/);
	},
);

it("keeps img and background selections independent at the same element id", async () => {
	const { images, target, requested } = fixture(
		`
		<style>
			main::before { content: ''; background-image: url(/before.png) }
			main::after { content: ''; background-image: url(/after.png) }
		</style>
		<main id="target" style="background-image:url(/main.png)"></main>
		<img id="image" src="/a.png" style="background-image:url(/background.png)">
	`,
		{
			fetch: async (url) =>
				response(url, url.endsWith("background.png") ? 7 : 3),
		},
	);
	await images.settle();
	expect(requested).toHaveLength(5);
	expect(images.get(target("image")).naturalWidth).toBe(3);
	expect(images.background(target("image")).naturalWidth).toBe(7);
	expect(images.background(target(), "before").currentSrc).toBe(
		"https://example.com/before.png",
	);
	expect(images.background(target(), "after").currentSrc).toBe(
		"https://example.com/after.png",
	);
	expect(images.background(target()).currentSrc).toBe(
		"https://example.com/main.png",
	);
});

it("does not request hidden elements, hidden descendants or absent pseudos", async () => {
	const { images, requested, target } = fixture(`
		<style>
			main::before { background-image: url(/absent.png) }
			main::after { content: none; background-image: url(/none.png) }
			section::before { content: ''; display: none; background-image: url(/pseudo.png) }
		</style>
		<main id="target"></main><section></section>
		<div style="display:none;background-image:url(/hidden.png)">
			<div id="child" style="background-image:url(/child.png)"></div>
		</div>
	`);
	await images.settle();
	for (const pseudo of [undefined, "before", "after"] as const)
		expect(images.background(target(), pseudo)).toMatchObject({
			state: "empty",
			complete: true,
			currentSrc: "",
			originClean: false,
		});
	expect(images.background(target("child")).state).toBe("empty");
	expect(images.decodedBackground(target())).toBeUndefined();
	expect(images.metrics().elements).toBe(0);
	expect(requested).toHaveLength(0);
});

it("skips display:contents backgrounds while loading generated block pseudos", async () => {
	const { images, requested, target } = fixture(`
		<style>
			main { display: contents; background-image: url(/own.png) }
			main::before { content: ""; display: block; background-image: url(/pseudo.png) }
		</style><main id="target"></main>
	`);
	const element = target();
	await images.settle();
	expect(images.background(element)).toMatchObject({
		state: "empty",
		complete: true,
		currentSrc: "",
	});
	expect(images.decodedBackground(element)).toBeUndefined();
	expect(images.background(element, "before")).toMatchObject({
		state: "complete",
		currentSrc: "https://example.com/pseudo.png",
		naturalWidth: 3,
	});
	expect(images.decodedBackground(element, "before")).toBeDefined();
	expect(requested.map(({ url }) => url)).toEqual([
		"https://example.com/pseudo.png",
	]);
	expect(images.metrics()).toMatchObject({ elements: 1, resources: 1 });
});

it("does not rescan on image completion or repeated background lookups", async () => {
	let finish!: (value: NetworkResponse) => void;
	const { tree, images, requested, target } = fixture(
		'<img src="/a.png"><main id="target" style="background-image:url(/a.png)"></main>',
		{
			fetch: () =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		},
	);
	const element = target();
	expect(images.background(element).state).toBe("loading");
	const scanWork = images.metrics().scanWork;
	const revision = tree.revision;
	finish(response(requested[0].url));
	await images.settle();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(tree.revision).toBeGreaterThan(revision);
	expect(images.metrics().scanWork).toBe(scanWork);
	for (let repeat = 0; repeat < 20; repeat++) {
		expect(images.background(element).state).toBe("complete");
		expect(images.decodedBackground(element)).toBeDefined();
		expect(images.metrics().scanWork).toBe(scanWork);
	}
	await images.settle();
	expect(images.metrics().scanWork).toBe(scanWork);
	expect(requested).toHaveLength(1);
});

it("refreshes inline sources, display changes and stylesheet text", async () => {
	const { tree, images, requested, target } = fixture(`
		<style id="sheet">main { background-image:url(/a.png) }</style><main id="target"></main>
	`);
	const element = target();
	await images.settle();
	tree.setAttribute(element, "style", "background-image:url(/b.png)");
	await images.settle();
	expect(images.background(element).currentSrc).toBe(
		"https://example.com/b.png",
	);
	tree.setAttribute(
		element,
		"style",
		"display:none;background-image:url(/unused.png)",
	);
	await images.settle();
	expect(images.background(element).state).toBe("empty");
	expect(images.metrics()).toMatchObject({ resources: 0, decodedBytes: 0 });
	tree.setTextContent(target("sheet"), "main { background-image:url(/c.png) }");
	tree.removeAttribute(element, "style");
	await images.settle();
	expect(images.background(element).currentSrc).toBe(
		"https://example.com/c.png",
	);
	expect(requested.map(({ url }) => url)).toEqual([
		"https://example.com/a.png",
		"https://example.com/b.png",
		"https://example.com/c.png",
	]);
});

it("refreshes externally replaced stylesheets without an attribute or DOM mutation", async () => {
	const { tree, images, requested, target } = fixture(
		'<link id="sheet" rel="stylesheet" href="/style.css"><main id="target"></main>',
	);
	await images.settle();
	const styles = documentStyles(tree);
	styles.setExternalSheet(
		target("sheet"),
		"https://example.com/style.css",
		"main { background-image:url(https://example.com/a.png) }",
	);
	expect(images.background(target()).state).toBe("loading");
	await images.settle();
	styles.setExternalSheet(
		target("sheet"),
		"https://example.com/style.css",
		"main { background-image:url(https://example.com/b.png) }",
	);
	await images.settle();
	expect(images.background(target()).currentSrc).toBe(
		"https://example.com/b.png",
	);
	expect(requested).toHaveLength(2);
	styles.setExternalSheet(
		target("sheet"),
		"https://example.com/style.css",
		"main { background-image:none }",
	);
	await images.settle();
	expect(images.metrics()).toMatchObject({
		resources: 0,
		elements: 0,
		decodedBytes: 0,
	});
});

it("preserves shared resources when another consumer changes or detaches", async () => {
	const { tree, images, target, requested } = fixture(
		'<main id="target" style="background-image:url(/a.png)"></main><img id="image" src="/a.png">',
	);
	const element = target();
	const image = target("image");
	await images.settle();
	const decoded = images.decodedBackground(element);
	tree.setAttribute(image, "src", "/b.png");
	await images.settle();
	expect(images.decodedBackground(element)).toBe(decoded);
	expect(requested[0].signal.aborted).toBe(false);
	tree.setAttribute(image, "src", "/a.png");
	await images.settle();
	tree.remove(element);
	await images.settle();
	expect(images.background(element).state).toBe("empty");
	expect(images.decoded(image)).toBe(decoded);
	expect(images.metrics()).toMatchObject({
		resources: 1,
		decodedBytes: 24,
		elements: 1,
	});
	expect(requested).toHaveLength(2);
	tree.remove(image);
	await images.settle();
	expect(images.decoded(image)).toBe(decoded);
});

it("retains disconnected img get and decode ownership through background discovery", async () => {
	const { tree, images, requested, target } = fixture();
	const detached = tree.createElement("img", { src: "/detached.png" });
	expect(tree.get(detached).parent).toBeNull();
	expect(images.get(detached).state).toBe("loading");
	const decoding = images.decode(detached);
	expect(images.background(target()).state).toBe("loading");
	await Promise.all([decoding, images.settle()]);
	expect(images.get(detached)).toMatchObject({
		state: "complete",
		currentSrc: "https://example.com/detached.png",
		naturalWidth: 3,
	});
	const decoded = images.decoded(detached);
	expect(decoded).toBeDefined();
	tree.setAttribute(target(), "style", "background-image:url(/detached.png)");
	await images.settle();
	await images.decode(detached);
	expect(tree.get(detached).parent).toBeNull();
	expect(images.decoded(detached)).toBe(decoded);
	expect(images.decodedBackground(target())).toBe(decoded);
	expect(requested).toHaveLength(2);
	expect(requested[0].signal.aborted).toBe(false);
	expect(images.metrics()).toMatchObject({
		elements: 2,
		resources: 1,
		decodedBytes: 24,
	});
});

it("moves a background consumer at the existing element and request limits", async () => {
	const { tree, images, requested, target } = fixture(
		'<main id="first" style="background-image:url(/a.png)"></main><main id="second"></main>',
		{ limits: { maxElements: 1, maxRequests: 1 } },
	);
	const first = target("first");
	const second = target("second");
	await images.settle();
	const decoded = images.decodedBackground(first);
	tree.setAttribute(first, "style", "background-image:none");
	tree.setAttribute(second, "style", "background-image:url(/a.png)");
	await images.settle();
	expect(images.background(first).state).toBe("empty");
	expect(images.background(second).state).toBe("complete");
	expect(images.decodedBackground(second)).toBe(decoded);
	expect(requested).toHaveLength(1);
	expect(requested[0].signal.aborted).toBe(false);
	expect(images.metrics()).toMatchObject({
		elements: 1,
		resources: 1,
		requests: 1,
		decodedBytes: 24,
		closed: false,
	});
});

it("swaps background sources without discarding resources still needed by the final selection", async () => {
	const { tree, images, requested, target } = fixture(
		'<main id="first" style="background-image:url(/a.png)"></main><main id="second" style="background-image:url(/b.png)"></main>',
		{ limits: { maxRequests: 2, maxElements: 2 } },
	);
	const first = target("first");
	const second = target("second");
	await images.settle();
	const firstDecoded = images.decodedBackground(first);
	const secondDecoded = images.decodedBackground(second);
	tree.setAttribute(first, "style", "background-image:url(/b.png)");
	tree.setAttribute(second, "style", "background-image:url(/a.png)");
	await images.settle();
	expect(images.background(first).state).toBe("complete");
	expect(images.background(second).state).toBe("complete");
	expect(images.decodedBackground(first)).toBe(secondDecoded);
	expect(images.decodedBackground(second)).toBe(firstDecoded);
	expect(requested).toHaveLength(2);
	expect(requested.every(({ signal }) => !signal.aborted)).toBe(true);
	expect(images.metrics()).toMatchObject({
		elements: 2,
		resources: 2,
		requests: 2,
		decodedBytes: 48,
		closed: false,
	});
});

it("retains queued and loading resources across a background source swap", async () => {
	const pending: { url: string; finish: (value: NetworkResponse) => void }[] =
		[];
	const { tree, images, requested, target } = fixture(
		'<main id="first" style="background-image:url(/a.png)"></main><main id="second" style="background-image:url(/b.png)"></main>',
		{
			limits: { maxRequests: 2, maxConcurrent: 1 },
			fetch: (url) =>
				new Promise((finish) => {
					pending.push({ url, finish });
				}),
		},
	);
	const first = target("first");
	const second = target("second");
	expect(images.background(first).state).toBe("loading");
	tree.setAttribute(first, "style", "background-image:url(/b.png)");
	tree.setAttribute(second, "style", "background-image:url(/a.png)");
	expect(images.background(first).state).toBe("loading");
	expect(requested).toHaveLength(1);
	expect(requested[0].signal.aborted).toBe(false);
	expect(images.metrics()).toMatchObject({ active: 1, queued: 1, requests: 2 });
	pending[0].finish(response(pending[0].url));
	for (let turn = 0; turn < 20 && pending.length < 2; turn++)
		await Promise.resolve();
	expect(pending).toHaveLength(2);
	pending[1].finish(response(pending[1].url));
	await images.settle();
	expect(images.background(first)).toMatchObject({
		state: "complete",
		currentSrc: "https://example.com/b.png",
	});
	expect(images.background(second)).toMatchObject({
		state: "complete",
		currentSrc: "https://example.com/a.png",
	});
	expect(requested).toHaveLength(2);
});

it("releases disappearing pseudo resources without changing their sibling", async () => {
	const { tree, images, target } = fixture(`
		<style id="sheet">
			main::before { content: ''; background-image:url(/before.png) }
			main::after { content: ''; background-image:url(/after.png) }
		</style><main id="target"></main>
	`);
	await images.settle();
	const after = images.decodedBackground(target(), "after");
	tree.setTextContent(
		target("sheet"),
		"main::after { content: ''; background-image:url(/after.png) }",
	);
	await images.settle();
	expect(images.background(target(), "before").state).toBe("empty");
	expect(images.decodedBackground(target(), "after")).toBe(after);
	expect(images.metrics()).toMatchObject({
		resources: 1,
		elements: 1,
		delivered: 0,
	});
});

it("aborts unused background requests and ignores late results", async () => {
	let finish!: (value: NetworkResponse) => void;
	const { tree, images, target, requested } = fixture(undefined, {
		fetch: () =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	});
	const element = target();
	expect(images.background(element).state).toBe("loading");
	tree.remove(element);
	await images.settle();
	expect(requested[0].signal.aborted).toBe(true);
	finish(response(requested[0].url));
	await images.settle();
	expect(images.background(element).state).toBe("empty");
	expect(images.metrics()).toMatchObject({
		resources: 0,
		decodedBytes: 0,
		delivered: 0,
	});
});

it("closes and cancels background settling without delivering img events", async () => {
	const { tree, images, target, requested } = fixture(undefined, {
		fetch: () => new Promise(() => {}),
	});
	const element = target();
	const settling = images.settle();
	const rejected = expect(settling).rejects.toMatchObject({ code: "closed" });
	tree.close();
	await rejected;
	expect(requested[0].signal.aborted).toBe(true);
	expect(images.metrics()).toMatchObject({
		closed: true,
		elements: 0,
		resources: 0,
		decodedBytes: 0,
		delivered: 0,
	});
	expect(() => images.background(element)).toThrow(/closed/);
	expect(() => images.decodedBackground(element)).toThrow(/closed/);
});

it.each(["status", "mime", "corrupt", "redirect"])(
	"records broken backgrounds without error events: %s",
	async (kind) => {
		const { tree, images, target } = fixture(undefined, {
			fetch: async (url) => {
				const result = response(url);
				if (kind === "status") result.status = 404;
				if (kind === "mime")
					result.headers = { "content-type": ["text/plain"] };
				if (kind === "corrupt") result.body = new Uint8Array([1, 2]);
				if (kind === "redirect") result.url = "http://example.com/a.png";
				return result;
			},
		});
		const delivered: string[] = [];
		documentInteractions(tree).events.addEventListener(
			target(),
			"error",
			() => {
				delivered.push("error");
			},
		);
		await images.settle();
		expect(images.background(target())).toMatchObject({
			state: "broken",
			complete: true,
			naturalWidth: 0,
			originClean: false,
		});
		expect(images.decodedBackground(target())).toBeUndefined();
		expect(delivered).toEqual([]);
	},
);

it.each(["header", "meta", "mixed", "scheme", "redirect"])(
	"enforces background image policy: %s",
	async (kind) => {
		const source =
			kind === "mixed"
				? "http://example.com/a.png"
				: kind === "scheme"
					? "data:image/png;base64,AA=="
					: "/a.png";
		const { images, target, requested } = fixture(
			`${kind === "meta" ? '<meta http-equiv="Content-Security-Policy" content="img-src *">' : ""}<main id="target" style="background-image:url(${source})"></main>`,
			{
				contentSecurityPolicy:
					kind === "header" ? ["img-src 'none'"] : ["img-src 'self'"],
				fetch: async (url) =>
					response(kind === "redirect" ? "https://other.example/a.png" : url),
			},
		);
		await images.settle();
		expect(images.background(target())).toMatchObject({
			state: "broken",
			error: "policy-denied",
		});
		expect(requested).toHaveLength(kind === "redirect" ? 1 : 0);
	},
);

it("resolves base URLs and preserves URL case and cross-origin taint", async () => {
	const { tree, images, target, requested } = fixture(
		'<base id="base" href="https://other.example/First/"><main id="target" style="background-image:url(Pixel.PNG)"></main>',
	);
	await images.settle();
	expect(images.background(target())).toMatchObject({
		currentSrc: "https://other.example/First/Pixel.PNG",
		state: "complete",
		originClean: false,
	});
	tree.setAttribute(target("base"), "href", "/Next/");
	await images.settle();
	expect(images.background(target())).toMatchObject({
		currentSrc: "https://example.com/Next/Pixel.PNG",
		originClean: true,
	});
	expect(requested).toHaveLength(2);
});

it("taints backgrounds redirected through another origin", async () => {
	const { images, target } = fixture(undefined, {
		fetch: async (url) => ({
			...response(url),
			redirects: [
				{ url: "https://other.example/a.png", status: 302, location: url },
			],
		}),
	});
	await images.settle();
	expect(images.background(target())).toMatchObject({
		state: "complete",
		originClean: false,
	});
});

it("counts element and pseudo backgrounds against the shared entry limit", async () => {
	const { images } = fixture(
		`<style>main::before { content: ''; background-image:url(/a.png) }</style><main style="background-image:url(/a.png)"></main><img src="/a.png">`,
		{ limits: { maxElements: 2 } },
	);
	await expect(images.settle()).rejects.toThrow(/element limit/);
	expect(images.metrics()).toMatchObject({
		failure: "resource-limit",
		closed: true,
	});
});

it("preserves empty img reads before asynchronous discovery exhausts its scan budget", async () => {
	const tree = parseHtmlDocument(
		'<img id="image" width="4" height="4">',
		"https://example.com/page",
	);
	trees.push(tree);
	const nodes = [...tree.walk()];
	const image = nodes.find(({ node }) => node.attributes.id === "image")?.node
		.id;
	if (image === undefined) throw new Error("Missing fixture image");
	const images = documentImages(tree, {
		limits: { maxScanWork: nodes.length + 1 },
	});
	for (let repeat = 0; repeat < 20; repeat++) {
		expect(images.get(image).state).toBe("empty");
		expect(images.decoded(image)).toBeUndefined();
		expect(images.metrics().scanWork).toBe(nodes.length);
	}
	const revision = tree.revision;
	await expect(images.settle()).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(images.metrics()).toMatchObject({
		closed: true,
		failure: "resource-limit",
	});
	expect(tree.revision).toBe(revision);
	expect(() => images.get(image)).toThrow("Image scan work limit exceeded");
});

it("charges the final resource sweep against the existing scan budget", async () => {
	const sample = fixture();
	await sample.images.settle();
	const scanWork = sample.images.metrics().scanWork;
	const { images, requested } = fixture(undefined, {
		limits: { maxScanWork: scanWork - 1 },
	});
	await expect(images.settle()).rejects.toThrow(
		"Image scan work limit exceeded",
	);
	expect(images.metrics()).toMatchObject({
		closed: true,
		failure: "resource-limit",
		resources: 0,
		scanWork,
	});
	expect(requested).toHaveLength(0);
});

it("bounds background discovery and update work", async () => {
	const scan = fixture(undefined, { limits: { maxScanWork: 1 } });
	await expect(scan.images.settle()).rejects.toThrow(/scan work/);
	const updates = fixture(undefined, { limits: { maxUpdates: 1 } });
	await updates.images.settle();
	updates.tree.setAttribute(updates.target(), "style", "background-image:none");
	await expect(updates.images.settle()).rejects.toThrow(/update limit/);
});

it.each([
	{ maxDecodedBytes: 4 },
	{ maxResponseBytes: 1 },
	{ maxReceivedBytes: 1 },
	{ maxDecodeWork: 1 },
	{ maxUrlCodeUnits: 5 },
])("applies existing resource budgets to backgrounds: %j", async (limits) => {
	const { images, target } = fixture(undefined, { limits });
	await images.settle();
	expect(images.background(target())).toMatchObject({
		state: "broken",
		error: "resource-limit",
	});
	expect(images.metrics().decodedBytes).toBe(0);
});

it("shares request and retained pixel limits with img resources", async () => {
	for (const limits of [{ maxRequests: 1 }, { maxDecodedBytes: 24 }]) {
		const { images, target } = fixture(
			'<img id="image" src="/a.png"><main id="target" style="background-image:url(/b.png)"></main>',
			{ limits },
		);
		await images.settle();
		expect(images.get(target("image")).state).toBe("complete");
		expect(images.background(target()).error).toBe("resource-limit");
		expect(images.metrics().decodedBytes).toBe(24);
	}
});

it("bounds lifetime decode work across img and background resources", async () => {
	const sample = fixture();
	await sample.images.settle();
	const work = sample.images.metrics().decodeWork;
	const { images, target } = fixture(
		'<img id="image" src="/a.png"><main id="target" style="background-image:url(/b.png)"></main>',
		{ limits: { maxDecodeWork: work } },
	);
	await images.settle();
	expect(images.get(target("image")).state).toBe("complete");
	expect(images.background(target()).error).toBe("resource-limit");
	expect(images.metrics().decodeWork).toBe(work);
});

it("shares the concurrency limit and releases queued work on close", async () => {
	const pending: { url: string; finish: (value: NetworkResponse) => void }[] =
		[];
	const { images, requested, target } = fixture(
		'<img src="/a.png"><main id="target" style="background-image:url(/b.png)"></main>',
		{
			limits: { maxConcurrent: 1 },
			fetch: (url) =>
				new Promise((finish) => {
					pending.push({ url, finish });
				}),
		},
	);
	expect(images.background(target()).state).toBe("loading");
	expect(requested).toHaveLength(1);
	expect(images.metrics()).toMatchObject({ active: 1, queued: 1 });
	pending[0].finish(response(pending[0].url));
	for (let turn = 0; turn < 20 && pending.length < 2; turn++)
		await Promise.resolve();
	expect(requested).toHaveLength(2);
	expect(images.metrics().active).toBe(1);
	images.close();
	expect(requested[1].signal.aborted).toBe(true);
	expect(images.metrics()).toMatchObject({
		resources: 0,
		queued: 0,
		decodedBytes: 0,
	});
});
