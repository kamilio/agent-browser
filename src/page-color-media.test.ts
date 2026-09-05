import { afterEach, expect, it, vi } from "vitest";
import { cssMediaMatches } from "./css-parser.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { nativeHeadlessDisplay } from "./native-headless-display.js";
import {
	nativeExposedColorDepth,
	nativeRasterColor,
} from "./native-raster-color.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { documentStyles } from "./styles.js";

const screenNames = [
	"width",
	"height",
	"availWidth",
	"availHeight",
	"colorDepth",
	"pixelDepth",
] as const;
type Screen = Readonly<Record<(typeof screenNames)[number], number>>;
interface MediaEvent {
	type: string;
	media: string;
	matches: boolean;
	target: MediaList;
	currentTarget: MediaList | null;
}
type Listener = (this: MediaList, event: MediaEvent) => void;
interface MediaList {
	readonly matches: boolean;
	readonly media: string;
	onchange: Listener | null;
	addListener(listener: Listener): void;
	addEventListener(type: string, listener: Listener): void;
}
interface ColorWindow {
	readonly screen: Screen;
	readonly navigator: object;
	readonly window: ColorWindow;
	readonly self: ColorWindow;
	readonly parent: ColorWindow;
	readonly top: ColorWindow;
	readonly innerWidth: number;
	readonly innerHeight: number;
	readonly devicePixelRatio: number;
	readonly outerWidth: number;
	readonly outerHeight: number;
	matchMedia(source: string): MediaList;
	addEventListener(type: string, listener: () => void): void;
}

const documents: DocumentTree[] = [];
const owners: PageBindings[] = [];

function fixture(markup = "<main></main>") {
	vi.useFakeTimers();
	const document = parseHtmlDocument(markup, "https://fixture.invalid/");
	documents.push(document);
	const styles = documentStyles(document);
	styles.setViewport(4, 2);
	const interactions = documentInteractions(document);
	let lifecycleClosed = false;
	const context: PageBindingContext = {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: vi.fn(),
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => lifecycleClosed,
		startCallback: vi.fn((callback, args, options) => {
			if (typeof callback !== "function") throw new Error("Expected callback");
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(callback.apply(options.thisValue, args)),
			};
		}),
		fail: vi.fn(),
		onConsoleCall: vi.fn(),
	};
	const bindings = new PageBindings(
		{ document, interactions },
		context,
		lifecycle,
	);
	owners.push(bindings);
	return {
		document,
		styles,
		interactions,
		bindings,
		lifecycle,
		window: bindings.window as ColorWindow,
		closeLifecycle: () => {
			lifecycleClosed = true;
		},
	};
}

afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const document of documents.splice(0)) document.close();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it("keeps the exact frozen raster policy separate from headless display scalars", () => {
	expect(nativeRasterColor).toEqual({
		componentBits: 8,
		paletteEntries: 0,
		monochromeBits: 0,
	});
	expect(Reflect.ownKeys(nativeRasterColor)).toEqual([
		"componentBits",
		"paletteEntries",
		"monochromeBits",
	]);
	expect(Object.isFrozen(nativeRasterColor)).toBe(true);
	for (const name of Object.keys(nativeRasterColor)) {
		expect(Reflect.set(nativeRasterColor, name, 16)).toBe(false);
		expect(Reflect.deleteProperty(nativeRasterColor, name)).toBe(false);
	}
	expect(
		Reflect.defineProperty(nativeRasterColor, "gamut", { value: "srgb" }),
	).toBe(false);
	expect(nativeExposedColorDepth).toBe(24);
	expect(nativeExposedColorDepth).toBe(3 * nativeRasterColor.componentBits);
	expect(nativeHeadlessDisplay).toEqual({
		devicePixelRatio: 1,
		outerWidth: 0,
		outerHeight: 0,
	});
	expect(Reflect.ownKeys(nativeHeadlessDisplay)).toEqual([
		"devicePixelRatio",
		"outerWidth",
		"outerHeight",
	]);
	expect(Object.isFrozen(nativeHeadlessDisplay)).toBe(true);
});

it.each([
	[0, 0, 0, 0],
	[0, 0, 0, 255],
	[255, 255, 255, 255],
	[1, 127, 254, 128],
] as const)(
	"keeps RGBA(%i,%i,%i,%i) pixel content independent of numeric color capability",
	(red, green, blue, alpha) => {
		const image = createRaster(2, 1, [red, green, blue, alpha]);
		expect(image.pixels).toBeInstanceOf(Uint8Array);
		expect(image.pixels.BYTES_PER_ELEMENT).toBe(1);
		expect(Array.from(image.pixels)).toEqual([
			red,
			green,
			blue,
			alpha,
			red,
			green,
			blue,
			alpha,
		]);
		const before = image.pixels.slice();
		const png = encodePng(image);
		const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
		expect(Array.from(png.subarray(0, 8))).toEqual([
			137, 80, 78, 71, 13, 10, 26, 10,
		]);
		expect(header.getUint32(8)).toBe(13);
		expect(String.fromCharCode(...png.subarray(12, 16))).toBe("IHDR");
		expect(header.getUint32(16)).toBe(2);
		expect(header.getUint32(20)).toBe(1);
		expect(Array.from(png.subarray(24, 29))).toEqual([8, 6, 0, 0, 0]);
		expect(png[24]).toBe(nativeRasterColor.componentBits);
		expect(image.pixels).toEqual(before);
		const { window, styles } = fixture();
		expect(window.screen.colorDepth).toBe(24);
		expect(window.screen.pixelDepth).toBe(24);
		expect(window.screen.colorDepth).not.toBe(
			image.pixels.BYTES_PER_ELEMENT * 8 * 4,
		);
		for (const [query, expected] of [
			["(color: 8)", true],
			["(color-index)", false],
			["(monochrome)", false],
			["(color-index: 0)", true],
			["(monochrome: 0)", true],
		] as const) {
			const issue = vi.fn();
			expect(cssMediaMatches(query, styles.viewport, issue)).toBe(expected);
			expect(window.matchMedia(query).matches).toBe(expected);
			expect(issue).not.toHaveBeenCalled();
		}
	},
);

it.each([-1, 256, 0.5, Number.NaN])(
	"rejects non-byte RGBA channel %s rather than silently changing target depth",
	(value) => {
		for (let channel = 0; channel < 4; channel++) {
			const color: [number, number, number, number] = [0, 0, 0, 255];
			color[channel] = value;
			expect(() => createRaster(1, 1, color)).toThrow("Invalid RGBA color");
		}
		expect(nativeExposedColorDepth).toBe(24);
	},
);

it("does not expose the raster policy or change native Screen and Window identities", () => {
	const { document, bindings, window, styles } = fixture();
	const screen = window.screen;
	const navigator = window.navigator;
	const nodes = document.nodeCount;
	expect(Reflect.ownKeys(screen)).toEqual(screenNames);
	for (const name of [
		"nativeRasterColor",
		"nativeExposedColorDepth",
		"componentBits",
		"paletteEntries",
		"monochromeBits",
		"colorDepth",
		"pixelDepth",
	]) {
		expect(pageBindingGlobalNames(document)).not.toContain(name);
		expect(Object.hasOwn(bindings.globals, name)).toBe(false);
		expect(Object.hasOwn(window, name)).toBe(false);
	}
	for (const [width, height] of [
		[4, 2],
		[8, 4],
		[2, 8],
	]) {
		styles.setViewport(width, height);
		expect(window.screen).toBe(screen);
		expect(bindings.screen).toBe(screen);
		expect(bindings.globals.screen).toBe(screen);
		expect(window.navigator).toBe(navigator);
		for (const alias of [window.window, window.self, window.top, window.parent])
			expect(alias.screen).toBe(screen);
		expect(screenNames.map((name) => screen[name])).toEqual([
			width,
			height,
			width,
			height,
			24,
			24,
		]);
		expect(window.innerWidth).toBe(width);
		expect(window.innerHeight).toBe(height);
		expect([
			window.devicePixelRatio,
			window.outerWidth,
			window.outerHeight,
		]).toEqual([1, 0, 0]);
	}
	for (const name of ["colorDepth", "pixelDepth"] as const) {
		expect(Object.getOwnPropertyDescriptor(screen, name)?.set).toBeUndefined();
		expect(Reflect.set(screen, name, 32)).toBe(false);
	}
	expect(document.nodeCount).toBe(nodes);
});

it.each([
	["(color)", true],
	["(color: +008)", true],
	["(min-color: 8)", true],
	["(max-color: 8)", true],
	["(0 < color <= 8)", true],
	["(color > 8)", false],
	["(color-index)", false],
	["not (monochrome)", true],
	["(max-color-index: 0)", true],
	["(monochrome: 0)", true],
] as const)("applies actual native @media paint for %s", (source, matches) => {
	const { document, window, styles } = fixture(
		`<style>main{height:2px;background:red}@media ${source}{main{background:blue}}</style><main></main>`,
	);
	const issue = vi.fn();
	expect(cssMediaMatches(source, styles.viewport, issue)).toBe(matches);
	expect(window.matchMedia(source).matches).toBe(matches);
	expect(issue).not.toHaveBeenCalled();
	const image = rasterizeDocument(document).image;
	expect(image.width).toBe(4);
	expect(image.height).toBe(2);
	expect(Array.from(image.pixels.subarray(0, 4))).toEqual(
		matches ? [0, 0, 255, 255] : [255, 0, 0, 255],
	);
});

it.each(["(color-gamut: srgb)", "(device-width: 4px)", "(device-height: 2px)"])(
	"keeps unsupported %s distinct from supported false numeric color features",
	(source) => {
		const { document, styles, window, bindings } = fixture(
			`<style>main{height:2px;background:red}@media ${source}{main{background:blue}}</style><main></main>`,
		);
		const issue = vi.fn();
		expect(cssMediaMatches(source, styles.viewport, issue)).toBe(false);
		expect(issue).toHaveBeenCalledExactlyOnceWith(
			"unimplemented-or-invalid-media-query",
		);
		expect(window.matchMedia(source).matches).toBe(false);
		expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(1);
		for (const supported of ["(color-index)", "(monochrome)", "(color: 9)"]) {
			issue.mockClear();
			expect(cssMediaMatches(supported, styles.viewport, issue)).toBe(false);
			expect(window.matchMedia(supported).matches).toBe(false);
			expect(issue).not.toHaveBeenCalled();
		}
		expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(1);
		const main = Array.from(document.walk()).find(
			({ node }) => node.tagName === "main",
		);
		if (!main) throw new Error("Expected fixture main element");
		expect(styles.paint(main.node.id)["background-color"]).toEqual([
			255, 0, 0, 255,
		]);
		expect(
			styles.metrics().issues["unimplemented-or-invalid-media-query"],
		).toBe(1);
		expect(() => rasterizeDocument(document)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("updates mixed width/color CSS and matchMedia while color-only lists stay silent", async () => {
	const source = "(min-width: 6px) and (color: 8)";
	const { document, window, styles, bindings, lifecycle } = fixture(
		`<style>main{height:2px;background:red}@media ${source}{main{background:blue}}</style><main></main>`,
	);
	const stable = [
		"(color)",
		"(color-index)",
		"(monochrome)",
		"(color-index: 0)",
	].map((query) => window.matchMedia(query));
	const stableChanged = vi.fn();
	for (const list of stable) list.addListener(stableChanged);
	const mixed = window.matchMedia(source);
	const zeroMixed = window.matchMedia("(max-width: 5px) and (monochrome: 0)");
	const trace: string[] = [];
	window.addEventListener("resize", () =>
		trace.push(`resize:${window.innerWidth}`),
	);
	mixed.addEventListener("change", function (event) {
		expect(this).toBe(mixed);
		expect(event.target).toBe(mixed);
		expect(event.currentTarget).toBe(mixed);
		expect(event.type).toBe("change");
		expect(event.media).toBe(mixed.media);
		trace.push(`color:${event.matches}`);
	});
	zeroMixed.onchange = function (event) {
		expect(this).toBe(zeroMixed);
		expect(event.target).toBe(zeroMixed);
		trace.push(`zero:${event.matches}`);
	};
	for (const [width, expected] of [
		[8, true],
		[9, true],
		[4, false],
	] as const) {
		styles.setViewport(width, 2);
		expect(mixed.matches).toBe(expected);
		expect(zeroMixed.matches).toBe(!expected);
		expect(cssMediaMatches(source, styles.viewport, vi.fn())).toBe(expected);
		expect(stable.map((list) => list.matches)).toEqual([
			true,
			false,
			false,
			true,
		]);
		expect(
			Array.from(rasterizeDocument(document).image.pixels.subarray(0, 4)),
		).toEqual(expected ? [0, 0, 255, 255] : [255, 0, 0, 255]);
		expect(window.screen.colorDepth).toBe(24);
		await vi.runAllTimersAsync();
	}
	expect(trace).toEqual([
		"resize:8",
		"color:true",
		"zero:false",
		"resize:9",
		"resize:4",
		"color:false",
		"zero:true",
	]);
	expect(stableChanged).not.toHaveBeenCalled();
	expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(0);
	expect(lifecycle.fail).not.toHaveBeenCalled();
});

it.each(["binding", "document", "lifecycle"] as const)(
	"revokes Screen and query access after %s closure, then closes owned media lists",
	async (closure) => {
		const test = fixture();
		const screen = test.window.screen;
		const copies = screenNames.map((name) => screen[name]);
		const getters = screenNames.map(
			(name) => Object.getOwnPropertyDescriptor(screen, name)?.get,
		);
		const savedQuery = test.window.matchMedia;
		const list = savedQuery("(color: 8)");
		const copiedMatch = list.matches;
		const copiedMedia = list.media;
		if (closure === "binding") test.bindings.close();
		else if (closure === "document") test.document.close();
		else test.closeLifecycle();
		for (const operation of [
			() => test.window.screen,
			() => savedQuery("(monochrome: 0)"),
			...screenNames.map((name) => () => screen[name]),
			...getters.map((getter) => () => getter?.()),
		])
			expect(operation).toThrow(expect.objectContaining({ code: "closed" }));
		expect(copies).toEqual([4, 2, 4, 2, 24, 24]);
		expect(copiedMatch).toBe(true);
		if (closure === "lifecycle") {
			expect(list.matches).toBe(true);
			expect(list.media).toBe(copiedMedia);
			expect(test.bindings.media.metrics().closed).toBe(false);
		} else {
			for (const operation of [
				() => list.matches,
				() => list.media,
				() => list.addListener(vi.fn()),
			])
				expect(operation).toThrow(expect.objectContaining({ code: "closed" }));
		}
		test.bindings.close();
		for (const operation of [
			() => list.matches,
			() => list.media,
			() => list.addListener(vi.fn()),
		])
			expect(operation).toThrow(expect.objectContaining({ code: "closed" }));
		await vi.runAllTimersAsync();
		expect(test.bindings.media.metrics()).toMatchObject({
			closed: true,
			lists: 0,
			queued: false,
		});
	},
);

it("cancels a pending mixed-color change when bindings close", async () => {
	const { window, styles, bindings, interactions } = fixture();
	const list = window.matchMedia("(color: 8) and (min-width: 6px)");
	const changed = vi.fn();
	list.addListener(changed);
	styles.setViewport(8, 2);
	expect(list.matches).toBe(true);
	bindings.close();
	await vi.runAllTimersAsync();
	expect(changed).not.toHaveBeenCalled();
	expect(interactions.events.metrics().listeners).toBe(0);
	expect(bindings.media.metrics()).toMatchObject({
		closed: true,
		lists: 0,
		queued: false,
		running: false,
	});
	expect(vi.getTimerCount()).toBe(0);
});
