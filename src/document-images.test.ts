import { afterEach, expect, it } from "vitest";
import {
	DocumentImages,
	documentImages,
	type DocumentImageOptions,
} from "./document-images.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

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
	html = '<img src="/a.png">',
	options: DocumentImageOptions = {},
) {
	const tree = parseHtmlDocument(html, "https://example.com/page");
	trees.push(tree);
	const requested: { url: string; signal: AbortSignal }[] = [];
	const images = documentImages(tree, {
		fetch: async (url, signal) => {
			requested.push({ url, signal });
			return response(url);
		},
		...options,
	});
	const ids = [...tree.walk()]
		.filter(({ node }) => node.tagName === "img")
		.map(({ node }) => node.id);
	return { tree, images, ids, requested };
}

it("loads shared resources once, delivers non-bubbling events and retains exact decoded pixels", async () => {
	const { tree, images, ids, requested } = fixture(
		'<img src="/a.png"><img src="/a.png">',
	);
	const events = documentInteractions(tree).events;
	const loaded: number[] = [];
	for (const id of ids)
		events.addEventListener(id, "load", (event) => {
			loaded.push(id);
			expect(event.bubbles).toBe(false);
			expect(event.cancelable).toBe(false);
		});
	expect(images.get(ids[0])).toMatchObject({
		state: "loading",
		complete: false,
		naturalWidth: 0,
	});
	await images.settle();
	expect(requested).toHaveLength(1);
	expect(loaded).toEqual(ids);
	expect(images.get(ids[1])).toMatchObject({
		state: "complete",
		complete: true,
		naturalWidth: 3,
		naturalHeight: 2,
		originClean: true,
	});
	expect(images.decoded(ids[0])).toBe(images.decoded(ids[1]));
	const decoded = images.decoded(ids[0]);
	if (!decoded) throw new Error("Missing decoded image");
	expect([...decoded.image.pixels.slice(0, 4)]).toEqual([20, 40, 60, 255]);
	expect(images.metrics()).toMatchObject({
		decodedBytes: 24,
		requests: 1,
		delivered: 2,
	});
	await images.decode(ids[0]);
});

it("releases shared pixels only when the final consumer changes source", async () => {
	const { tree, images, ids } = fixture('<img src="/a.png"><img src="/a.png">');
	await images.settle();
	tree.removeAttribute(ids[0], "src");
	images.get(ids[0]);
	expect(images.metrics().decodedBytes).toBe(24);
	tree.removeAttribute(ids[1], "src");
	images.get(ids[1]);
	expect(images.metrics()).toMatchObject({ decodedBytes: 0, resources: 0 });
	expect(images.get(ids[1])).toMatchObject({
		complete: true,
		currentSrc: "",
		naturalWidth: 0,
	});
});

it("rejects a superseded decode promptly even when another consumer retains the old request", async () => {
	let finish!: (response: NetworkResponse) => void;
	const old = new Promise<NetworkResponse>((resolve) => {
		finish = resolve;
	});
	const { tree, images, ids } = fixture(
		'<img src="/a.png"><img src="/a.png">',
		{
			fetch: async (url) => (url.endsWith("a.png") ? old : response(url, 5, 4)),
		},
	);
	images.get(ids[1]);
	const decoding = images.decode(ids[0]);
	const rejected = expect(decoding).rejects.toMatchObject({
		name: "EncodingError",
	});
	tree.setAttribute(ids[0], "src", "/b.png");
	images.get(ids[0]);
	await rejected;
	finish(response("https://example.com/a.png"));
	await images.settle();
	expect(images.get(ids[0]).naturalWidth).toBe(5);
	expect(images.get(ids[1]).naturalWidth).toBe(3);
});

it("aborts unused requests and ignores late results after source replacement", async () => {
	let finish!: (response: NetworkResponse) => void;
	let oldSignal: AbortSignal | undefined;
	const { tree, images, ids } = fixture(undefined, {
		fetch: async (url, signal) => {
			if (url.endsWith("a.png")) {
				oldSignal = signal;
				return new Promise((resolve) => {
					finish = resolve;
				});
			}
			return response(url, 7, 1);
		},
	});
	images.get(ids[0]);
	tree.setAttribute(ids[0], "src", "/b.png");
	images.get(ids[0]);
	expect(oldSignal?.aborted).toBe(true);
	finish(response("https://example.com/a.png", 100, 100));
	await images.settle();
	expect(images.get(ids[0]).naturalWidth).toBe(7);
	expect(images.metrics().decodedBytes).toBe(28);
});

it("discovers inserted images, loads tracked detached elements and updates base URL selection", async () => {
	const { tree, images, requested } = fixture(
		'<base href="/first/"><main></main>',
	);
	const image = tree.createElement("img", { src: "child.png" });
	images.get(image);
	await images.settle();
	expect(requested[0].url).toBe("https://example.com/first/child.png");
	const base = [...tree.walk()].find(({ node }) => node.tagName === "base");
	if (!base) throw new Error("Missing fixture base");
	tree.setAttribute(base.node.id, "href", "/next/");
	tree.append(tree.root, tree.createElement("img", { src: "new.png" }));
	await images.settle();
	expect(requested.map((entry) => entry.url)).toContain(
		"https://example.com/next/child.png",
	);
	expect(images.metrics().elements).toBe(2);
});

it.each([
	["<img>", undefined],
	['<img src="">', "invalid-input"],
	['<img src="data:image/png;base64,AA==">', "policy-denied"],
	['<img src="http://example.com/a.png">', "policy-denied"],
	['<img src="/a.png" srcset="/b.png 2x">', "unsupported"],
	['<img src="/a.png" crossorigin>', "unsupported"],
	['<picture><img src="/a.png"></picture>', "unsupported"],
])(
	"handles unsupported/empty source selection without network: %s",
	async (html, error) => {
		const { images, ids, requested } = fixture(html);
		await images.settle();
		expect(images.get(ids[0]).error).toBe(error);
		expect(images.get(ids[0]).complete).toBe(true);
		expect(requested).toHaveLength(0);
		await expect(images.decode(ids[0])).rejects.toMatchObject({
			name: "EncodingError",
		});
	},
);

it.each([true, false])(
	"blocks header or meta CSP before fetching (header=%s)",
	async (header) => {
		const { images, ids, requested } = fixture(
			`${header ? "" : '<meta http-equiv="Content-Security-Policy" content="img-src none">'}<img src="/a.png">`,
			{ blockedByCsp: header },
		);
		await images.settle();
		expect(images.get(ids[0]).error).toBe("policy-denied");
		expect(requested).toHaveLength(0);
	},
);

it.each(["status", "mime", "corrupt", "redirect"])(
	"records image failure and error events: %s",
	async (kind) => {
		const { tree, images, ids } = fixture(undefined, {
			fetch: async (url) => {
				const result = response(url);
				if (kind === "status") result.status = 404;
				if (kind === "mime") result.headers = { "content-type": ["text/html"] };
				if (kind === "corrupt") result.body = new Uint8Array([1, 2]);
				if (kind === "redirect") result.url = "http://example.com/a.png";
				return result;
			},
		});
		let failed = 0;
		documentInteractions(tree).events.addEventListener(ids[0], "error", () => {
			failed++;
		});
		await images.settle();
		expect(failed).toBe(1);
		expect(images.get(ids[0]).state).toBe("broken");
	},
);

it("marks cross-origin and cross-origin-return redirects as not origin-clean and redacts agent URLs", async () => {
	const { images, ids } = fixture(
		'<img src="https://cdn.example/a.png?secret=private#fragment">',
		{
			fetch: async (url) => ({
				...response("https://example.com/final.png"),
				redirects: [
					{ url, status: 302, location: "https://example.com/final.png" },
				],
			}),
		},
	);
	await images.settle();
	expect(images.get(ids[0]).originClean).toBe(false);
	expect(JSON.stringify(images.inspect())).not.toContain("secret=private");
	expect(images.get(ids[0]).currentSrc).toContain("secret=private");
});

it("bounds concurrent requests and settles a port that ignores cancellation", async () => {
	const pending: (() => void)[] = [];
	let active = 0;
	let maximum = 0;
	const { images } = fixture(
		Array.from({ length: 7 }, (_, index) => `<img src="/${index}.png">`).join(
			"",
		),
		{
			limits: { maxConcurrent: 2 },
			fetch: async (url) => {
				active++;
				maximum = Math.max(maximum, active);
				await new Promise<void>((resolve) => pending.push(resolve));
				active--;
				return response(url);
			},
		},
	);
	const settled = images.settle();
	for (let turn = 0; turn < 8; turn++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		for (const resolve of pending.splice(0)) resolve();
	}
	await settled;
	expect(maximum).toBe(2);
	const timed = fixture(undefined, {
		limits: { timeoutMs: 5 },
		fetch: () => new Promise(() => {}),
	});
	await timed.images.settle();
	expect(timed.images.get(timed.ids[0]).error).toBe("timeout");
});

it("preflights retained decoded pixels and bounds received bytes and decode work", async () => {
	for (const limits of [
		{ maxDecodedBytes: 4 },
		{ maxResponseBytes: 1 },
		{ maxReceivedBytes: 1 },
		{ maxDecodeWork: 1 },
	]) {
		const { images, ids } = fixture(undefined, { limits });
		await images.settle();
		expect(images.get(ids[0]).error).toBe("resource-limit");
		expect(images.metrics().decodedBytes).toBe(0);
	}
	const { images, ids } = fixture('<img src="/a.png"><img src="/b.png">', {
		limits: { maxDecodedBytes: 24 },
	});
	await images.settle();
	expect(ids.map((id) => images.get(id).state).sort()).toEqual([
		"broken",
		"complete",
	]);
	expect(images.metrics().decodedBytes).toBe(24);
});

it("closes pending decodes and releases all retained owners", async () => {
	const { tree, images, ids } = fixture(undefined, {
		fetch: () => new Promise(() => {}),
	});
	const rejected = expect(images.decode(ids[0])).rejects.toMatchObject({
		code: "closed",
	});
	tree.close();
	await rejected;
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(images.metrics()).toMatchObject({
		closed: true,
		resources: 0,
		elements: 0,
		decodedBytes: 0,
		active: 0,
	});
	expect(() => images.get(ids[0])).toThrow(/closed/);
});

it("enforces owner configuration, element, source and scan limits", async () => {
	const { tree, images, ids } = fixture("<img><img>", {
		limits: { maxElements: 1 },
	});
	expect(() => images.get(tree.root)).toThrow(/img element/);
	await expect(images.settle()).rejects.toThrow(/element limit/);
	expect(() => documentImages(tree, {})).toThrow(/configured/);
	expect(
		() => new DocumentImages(tree, { limits: { maxElements: 0 } }),
	).toThrow(/limit/);
	const source = fixture('<img src="/too-long.png">', {
		limits: { maxUrlCodeUnits: 5 },
	});
	await source.images.settle();
	expect(source.images.get(source.ids[0]).error).toBe("resource-limit");
	const scan = fixture("<main><img></main>", { limits: { maxScanWork: 1 } });
	await expect(scan.images.settle()).rejects.toThrow(/scan work/);
	expect(ids).toHaveLength(2);
});

it("bounds lifetime requests and stops queued transfers after exhausting received bytes", async () => {
	const html = '<img src="/a.png"><img src="/b.png">';
	const requests = fixture(html, { limits: { maxRequests: 1 } });
	await requests.images.settle();
	expect(requests.requested).toHaveLength(1);
	expect(requests.images.get(requests.ids[1]).error).toBe("resource-limit");
	const bytes = fixture(html, {
		limits: {
			maxConcurrent: 1,
			maxReceivedBytes: response("https://example.com/a.png").body.length,
		},
	});
	await bytes.images.settle();
	expect(bytes.requested).toHaveLength(1);
	expect(bytes.images.get(bytes.ids[1]).error).toBe("resource-limit");
});

it("bounds decode waiters and releases them on owner close", async () => {
	const { tree, images, ids } = fixture(undefined, {
		limits: { maxDecodeWaiters: 1 },
		fetch: () => new Promise(() => {}),
	});
	const first = expect(images.decode(ids[0])).rejects.toMatchObject({
		code: "closed",
	});
	await expect(images.decode(ids[0])).rejects.toMatchObject({
		code: "resource-limit",
	});
	tree.close();
	await first;
	expect(images.metrics().waiters).toBe(0);
});

it("halts repeated source churn under the update budget", async () => {
	const { tree, images, ids } = fixture(undefined, {
		limits: { maxUpdates: 1 },
	});
	await images.settle();
	tree.setAttribute(ids[0], "src", "/b.png");
	await expect(images.settle()).rejects.toThrow(/update limit/);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(images.metrics()).toMatchObject({
		closed: true,
		decodedBytes: 0,
		failure: "resource-limit",
	});
});

it("observes committed native mutations through bounded, removable document hooks", () => {
	const { tree, ids } = fixture();
	const seen: string[] = [];
	const remove = tree.onChange((change) => {
		expect(Object.isFrozen(change)).toBe(true);
		seen.push(`${change.kind}:${tree.get(ids[0]).attributes.alt ?? ""}`);
	});
	tree.setAttribute(ids[0], "alt", "committed");
	remove();
	tree.setAttribute(ids[0], "alt", "later");
	expect(seen).toEqual(["attribute:committed"]);
	const removals = Array.from({ length: 31 }, () => tree.onChange(() => {}));
	expect(() => tree.onChange(() => {})).toThrow(/handler limit/);
	for (const unregister of removals) unregister();
	tree.close();
	expect(() => tree.onChange(() => {})).toThrow(/closed/);
});

it("binds live image properties, decode and event handler attributes to the owned DOM facade", async () => {
	const { tree, images, ids } = fixture();
	const events = documentInteractions(tree).events;
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	};
	const dom = new ScriptDom(tree, factory, {
		events,
		callbacks: {
			isClosed: () => false,
			startCallback(callback, args, options) {
				if (typeof callback !== "function")
					throw new Error("Expected callback");
				const result = callback.apply(options.thisValue, args);
				return {
					synchronous: Promise.resolve(),
					result: Promise.resolve(result),
				};
			},
		},
	});
	const image = dom.node(ids[0]) as {
		complete: boolean;
		naturalWidth: number;
		currentSrc: string;
		alt: string;
		onload: ((this: unknown) => void) | null;
		decode(): Promise<void>;
	};
	let receiver: unknown;
	image.onload = function () {
		receiver = this;
	};
	image.alt = "diagram";
	expect(image.complete).toBe(false);
	await images.settle();
	await image.decode();
	expect(receiver).toBe(image);
	expect(image.naturalWidth).toBe(3);
	expect(image.alt).toBe("diagram");
	expect(() => {
		image.naturalWidth = 99;
	}).toThrow();
	dom.close();
	expect(() => image.complete).toThrow(/closed/);
});
