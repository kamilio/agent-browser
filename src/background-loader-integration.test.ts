import { afterEach, expect, it } from "vitest";
import { documentImages } from "./document-images.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster, type RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const pageUrl = "https://example.com/docs/page";
const sessions: BrowserSession[] = [];

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

function response(
	url: string,
	content: string | Uint8Array,
	contentType = "text/html",
): NetworkResponse {
	const body =
		typeof content === "string" ? new TextEncoder().encode(content) : content;
	return {
		url,
		status: 200,
		headers: { "content-type": [contentType] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function png(url: string): NetworkResponse {
	const image = createRaster(2, 1);
	image.pixels.set([255, 0, 0, 255, 0, 0, 255, 255]);
	return response(url, encodePng(image), "image/png");
}

function redirect(url: string, location: string): NetworkResponse {
	return {
		...response(url, ""),
		status: 302,
		headers: { location: [location] },
	};
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

function fixture(
	load: (request: NetworkRequest) => NetworkResponse | Promise<NetworkResponse>,
) {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			request: async (request) => {
				requests.push(request);
				return load(request);
			},
			metrics: () => ({
				requests: requests.length,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				active: 0,
				closed,
			}),
			close: () => {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab().id;
	session.resize(tab, 12, 12);
	return {
		session,
		tab,
		requests,
		load: () => session.navigate(tab, pageUrl),
		tree: () => session.page(tab).document,
		urls: () => requests.map((request) => request.url),
	};
}

function target(tree: DocumentTree, selector = "#target") {
	const id = new DocumentQueries(tree).querySelector(selector);
	if (id === null) throw new Error(`Missing fixture element: ${selector}`);
	return id;
}

function pixel(
	image: Readonly<RasterImage>,
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it.each([false, true])(
	"routes ordinary background-backed link clicks and respects cancellation=%s",
	async (cancel) => {
		const nextUrl = "https://example.com/next";
		const imageUrl = "https://example.com/Tile.PNG";
		const test = fixture((request) => {
			if (request.url === imageUrl) return png(request.url);
			if (request.url === nextUrl)
				return response(
					request.url,
					"<!doctype html><title>Next</title><p>Done</p>",
				);
			if (request.url !== pageUrl)
				throw new Error("Unexpected fixture request");
			return response(
				request.url,
				'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}a{display:block;width:8px;height:8px;background-image:url(/Tile.PNG);background-size:cover}</style><a id="target" href="/next">A</a>',
			);
		});
		await test.load();
		const page = test.session.page(test.tab);
		const element = target(page.document);
		const events: string[] = [];
		for (const type of ["mousedown", "mouseup", "click"])
			page.interactions.events.addEventListener(element, type, (event) => {
				events.push(type);
				if (type === "click" && cancel) event.preventDefault();
			});
		await test.session.click(test.tab, page.document.reference(element));
		expect(events).toEqual(["mousedown", "mouseup", "click"]);
		expect(test.urls()).toEqual(
			cancel ? [pageUrl, imageUrl] : [pageUrl, imageUrl, nextUrl],
		);
		expect(test.tree().url).toBe(cancel ? pageUrl : nextUrl);
	},
);

it("waits for external stylesheets before requesting the winning background", async () => {
	const stylesheetStarted = deferred<void>();
	const stylesheet = deferred<NetworkResponse>();
	const sheetUrl = "https://example.com/styles/main.css";
	const selectedUrl = "https://example.com/styles/Selected.PNG";
	const test = fixture((request) => {
		if (request.url === pageUrl)
			return response(
				request.url,
				`<!doctype html><style>#target{background-image:url(/discarded.png)}</style>
				<link rel="stylesheet" href="${sheetUrl}"><main id="target"></main>`,
			);
		if (request.url === sheetUrl) {
			stylesheetStarted.resolve();
			return stylesheet.promise;
		}
		return png(request.url);
	});
	const navigation = test.load();
	try {
		await stylesheetStarted.promise;
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(test.urls()).toEqual([pageUrl, sheetUrl]);
	} finally {
		stylesheet.resolve(
			response(
				sheetUrl,
				"#target{background-image:url(Selected.PNG)}",
				"text/css",
			),
		);
		await navigation;
	}
	expect(test.urls()).toEqual([pageUrl, sheetUrl, selectedUrl]);
	expect(
		documentImages(test.tree()).background(target(test.tree())),
	).toMatchObject({
		state: "complete",
		currentSrc: selectedUrl,
		naturalWidth: 2,
		naturalHeight: 1,
	});
});

it("requests case-preserved URLs relative to a redirected stylesheet without imports", async () => {
	const sheetUrl = "https://example.com/styles/start.css";
	const finalSheetUrl = "https://example.com/assets/theme/Final.css";
	const imageUrl = "https://example.com/assets/Images/MiXeD.PNG";
	const test = fixture((request) => {
		if (request.url === pageUrl)
			return response(
				request.url,
				`<!doctype html><base href="/wrong/"><link rel="stylesheet" href="${sheetUrl}">
				<main id="target"></main>`,
			);
		if (request.url === sheetUrl) return redirect(request.url, finalSheetUrl);
		if (request.url === finalSheetUrl)
			return response(
				request.url,
				"#target{background-image:url('../Images/MiXeD.PNG')}",
				"text/css",
			);
		return png(request.url);
	});
	await test.load();
	expect(test.urls()).toEqual([pageUrl, sheetUrl, finalSheetUrl, imageUrl]);
	expect(
		documentImages(test.tree()).background(target(test.tree())),
	).toMatchObject({
		state: "complete",
		currentSrc: imageUrl,
	});
});

it("loads redirected imports before backgrounds and resolves variables at their use-site", async () => {
	const sheetUrl = "https://example.com/styles/start.css";
	const finalSheetUrl = "https://example.com/assets/theme/Main.css";
	const importUrl = "https://example.com/assets/theme/nested.css";
	const finalImportUrl = "https://example.com/skins/Night/Rules.css";
	const mainImageUrl = "https://example.com/assets/theme/Icon.PNG";
	const importedImageUrl = "https://example.com/skins/Night/Icon.PNG";
	const pseudoImageUrl = "https://example.com/skins/Night/Pseudo.PNG";
	const test = fixture((request) => {
		if (request.url === pageUrl)
			return response(
				request.url,
				`<!doctype html><link rel="stylesheet" href="${sheetUrl}">
				<main id="target"></main><div id="imported"></div>`,
			);
		if (request.url === sheetUrl) return redirect(request.url, finalSheetUrl);
		if (request.url === finalSheetUrl)
			return response(
				request.url,
				`@import "nested.css";
				:root{--icon:url(Icon.PNG)}
				#target{background-image:var(--icon)}`,
				"text/css",
			);
		if (request.url === importUrl) return redirect(request.url, finalImportUrl);
		if (request.url === finalImportUrl)
			return response(
				request.url,
				`#imported{background-image:var(--icon)}
				#imported::before{content:"";display:inline-block;width:2px;height:1px;
				background-image:url(Pseudo.PNG)}`,
				"text/css",
			);
		return png(request.url);
	});
	await test.load();
	expect(test.urls().slice(0, 5)).toEqual([
		pageUrl,
		sheetUrl,
		finalSheetUrl,
		importUrl,
		finalImportUrl,
	]);
	expect(test.urls().slice(5).sort()).toEqual(
		[mainImageUrl, importedImageUrl, pseudoImageUrl].sort(),
	);
	const tree = test.tree();
	const images = documentImages(tree);
	for (const [selector, pseudo, url] of [
		["#target", undefined, mainImageUrl],
		["#imported", undefined, importedImageUrl],
		["#imported", "before", pseudoImageUrl],
	] as const)
		expect(images.background(target(tree, selector), pseudo)).toMatchObject({
			state: "complete",
			currentSrc: url,
		});
});

it("fetches only displayed selected backgrounds and generated pseudos", async () => {
	const test = fixture((request) =>
		request.url === pageUrl
			? response(
					request.url,
					`<!doctype html><style>
					#target{background-image:url(/overridden.png)}
					#target{background-image:url(/Selected.PNG)}
					@media print{#target{background-image:url(/inactive.png)}}
					.missing{background-image:url(/unmatched.png)}
					#hidden{display:none;background-image:url(/hidden.png)}
					#child{background-image:url(/child.png)}
					#target::before{background-image:url(/absent.png)}
					#target::after{content:none;background-image:url(/none.png)}
					#pseudo::before{content:"";display:inline-block;width:2px;height:1px;
					background-image:url(/Pseudo.PNG)}
					#pseudo::after{content:"";display:none;background-image:url(/hidden-pseudo.png)}
					</style><main id="target"></main><div id="hidden"><div id="child"></div></div>
					<div id="pseudo"></div>`,
				)
			: png(request.url),
	);
	await test.load();
	expect(test.urls().slice(1).sort()).toEqual([
		"https://example.com/Pseudo.PNG",
		"https://example.com/Selected.PNG",
	]);
	const tree = test.tree();
	const images = documentImages(tree);
	expect(images.background(target(tree)).state).toBe("complete");
	expect(images.background(target(tree, "#pseudo"), "before").state).toBe(
		"complete",
	);
	for (const [selector, pseudo] of [
		["#hidden", undefined],
		["#child", undefined],
		["#target", "before"],
		["#target", "after"],
		["#pseudo", "after"],
	] as const) {
		expect(images.background(target(tree, selector), pseudo).state).toBe(
			"empty",
		);
		expect(
			images.decodedBackground(target(tree, selector), pseudo),
		).toBeUndefined();
	}
});

it.each([
	["img-src 'none'", "https://example.com/Denied.PNG"],
	["default-src 'self'", "https://other.example/Denied.PNG"],
])(
	"blocks background requests under %s before contacting the image host",
	async (policy, imageUrl) => {
		const sheetUrl = "https://example.com/styles/main.css";
		const test = fixture((request) => {
			if (request.url === pageUrl) {
				const result = response(
					request.url,
					`<!doctype html><link rel="stylesheet" href="${sheetUrl}"><main id="target"></main>`,
				);
				return {
					...result,
					headers: { ...result.headers, "content-security-policy": [policy] },
				};
			}
			if (request.url === sheetUrl)
				return response(
					request.url,
					`#target,#target::before{background-image:url(${imageUrl})}
				#target::before{content:"";display:inline-block;width:2px;height:1px}`,
					"text/css",
				);
			return png(request.url);
		});
		await test.load();
		expect(test.urls()).toEqual([pageUrl, sheetUrl]);
		const tree = test.tree();
		const images = documentImages(tree);
		for (const pseudo of [undefined, "before"] as const) {
			expect(images.background(target(tree), pseudo)).toMatchObject({
				state: "broken",
				error: "policy-denied",
				naturalWidth: 0,
			});
			expect(images.decodedBackground(target(tree), pseudo)).toBeUndefined();
		}
	},
);

it("rechecks background redirects against CSP before fetching a denied target", async () => {
	const sheetUrl = "https://example.com/styles/main.css";
	const imageUrl = "https://example.com/Start.PNG";
	const deniedUrl = "https://other.example/Denied.PNG";
	const test = fixture((request) => {
		if (request.url === pageUrl) {
			const result = response(
				request.url,
				`<!doctype html><link rel="stylesheet" href="${sheetUrl}"><main id="target"></main>`,
			);
			return {
				...result,
				headers: {
					...result.headers,
					"content-security-policy": ["img-src 'self'"],
				},
			};
		}
		if (request.url === sheetUrl)
			return response(
				request.url,
				"#target{background-image:url(/Start.PNG)}",
				"text/css",
			);
		if (request.url === imageUrl) return redirect(request.url, deniedUrl);
		return png(request.url);
	});
	await test.load();
	expect(test.urls()).toEqual([pageUrl, sheetUrl, imageUrl]);
	expect(
		documentImages(test.tree()).background(target(test.tree())),
	).toMatchObject({
		state: "broken",
		error: "policy-denied",
	});
});

it("shares one decoded response between an img, a background and an atomic pseudo", async () => {
	const imageUrl = "https://example.com/Shared.PNG";
	const test = fixture((request) =>
		request.url === pageUrl
			? response(
					request.url,
					`<!doctype html><style>
					#target,#target::before{background-image:url(/Shared.PNG)}
					#target::before{content:"";display:inline-block;width:2px;height:1px}
					</style><main id="target"></main><img id="image" src="/Shared.PNG">`,
				)
			: png(request.url),
	);
	await test.load();
	expect(test.urls()).toEqual([pageUrl, imageUrl]);
	const tree = test.tree();
	const images = documentImages(tree);
	const decoded = images.decoded(target(tree, "#image"));
	expect(decoded).toBeDefined();
	for (const pseudo of [undefined, "before"] as const) {
		expect(images.background(target(tree), pseudo).state).toBe("complete");
		expect(images.decodedBackground(target(tree), pseudo)).toBe(decoded);
	}
	expect(images.metrics()).toMatchObject({ resources: 1, decodedBytes: 8 });
});

it("aborts a pending background and releases its owner when the committed page closes", async () => {
	const started = deferred<NetworkRequest>();
	const pending = deferred<NetworkResponse>();
	const imageUrl = "https://example.com/Pending.PNG";
	const test = fixture((request) => {
		if (request.url === pageUrl)
			return response(request.url, '<!doctype html><main id="target"></main>');
		started.resolve(request);
		return pending.promise;
	});
	await test.load();
	const tree = test.tree();
	const images = documentImages(tree);
	tree.setAttribute(
		target(tree),
		"style",
		"background-image:url(/Pending.PNG)",
	);
	const settlement = images.settle();
	const rejected = expect(settlement).rejects.toMatchObject({ code: "closed" });
	try {
		const request = await started.promise;
		expect(request.signal?.aborted).toBe(false);
		expect(images.metrics()).toMatchObject({ active: 1, closed: false });
		test.session.closeTab(test.tab);
		await rejected;
		expect(request.signal?.aborted).toBe(true);
		expect(tree.nodeCount).toBe(0);
		expect(images.metrics()).toMatchObject({
			closed: true,
			active: 0,
			queued: 0,
			resources: 0,
			decodedBytes: 0,
		});
		expect(test.urls()).toEqual([pageUrl, imageUrl]);
	} finally {
		test.session.close();
		pending.resolve(png(imageUrl));
		await rejected;
	}
});

it("paints settled loader background pixels using authored size, position and repeat", async () => {
	const sheetUrl = "https://example.com/styles/paint.css";
	const test = fixture((request) => {
		if (request.url === pageUrl)
			return response(
				request.url,
				`<!doctype html><link rel="stylesheet" href="${sheetUrl}"><main id="target"></main>`,
			);
		if (request.url === sheetUrl)
			return response(
				request.url,
				`html,body{margin:0;padding:0}
				main{width:8px;height:8px;background-color:white;background-image:url(Tile.PNG);
				background-size:contain;background-position:center;background-repeat:no-repeat}`,
				"text/css",
			);
		return png(request.url);
	});
	await test.load();
	expect(test.urls()).toEqual([
		pageUrl,
		sheetUrl,
		"https://example.com/styles/Tile.PNG",
	]);
	const tree = test.tree();
	expect(documentImages(tree).background(target(tree)).state).toBe("complete");
	const { image } = rasterizeDocument(tree);
	expect(pixel(image, 0, 1)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 0, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 3, 5)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 4, 2)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 7, 5)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 7, 6)).toEqual([255, 255, 255, 255]);
});
