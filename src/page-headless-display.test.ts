import { afterEach, expect, it, vi } from "vitest";
import { cssMediaMatches } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { nativeHeadlessDisplay } from "./native-headless-display.js";
import type { NetworkRequest, NetworkTransport } from "./network.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const displayNames = ["devicePixelRatio", "outerWidth", "outerHeight"] as const;
const expectedDisplay = { devicePixelRatio: 1, outerWidth: 0, outerHeight: 0 };
interface MediaList {
	readonly matches: boolean;
	addListener(callback: (this: MediaList, event: unknown) => void): void;
}
interface DisplayWindow {
	readonly devicePixelRatio: number;
	readonly outerWidth: number;
	readonly outerHeight: number;
	readonly innerWidth: number;
	readonly innerHeight: number;
	readonly window: DisplayWindow;
	readonly self: DisplayWindow;
	readonly top: DisplayWindow;
	readonly parent: DisplayWindow;
	readonly navigator: object;
	matchMedia(source: string): MediaList;
	addEventListener(type: string, callback: () => void): void;
}
const documents: DocumentTree[] = [];
const ownedBindings: PageBindings[] = [];
const sessions: BrowserSession[] = [];

function fixture(
	document = parseHtmlDocument("<main>A</main>", "https://fixture.invalid/"),
) {
	vi.useFakeTimers();
	documents.push(document);
	const styles = documentStyles(document);
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
	ownedBindings.push(bindings);
	return {
		document,
		styles,
		interactions,
		context,
		lifecycle,
		bindings,
		window: bindings.window as DisplayWindow,
		closeLifecycle: () => {
			lifecycleClosed = true;
		},
	};
}

function expectDisplay(window: DisplayWindow, bindings: PageBindings) {
	for (const name of displayNames) {
		expect(window[name]).toBe(expectedDisplay[name]);
		expect(bindings.globals[name]).toBe(expectedDisplay[name]);
	}
}

afterEach(() => {
	for (const bindings of ownedBindings.splice(0)) bindings.close();
	for (const document of documents.splice(0)) document.close();
	for (const session of sessions.splice(0)) session.close();
	vi.useRealTimers();
});

it("exports exactly the frozen synthetic display profile", () => {
	expect(nativeHeadlessDisplay).toEqual(expectedDisplay);
	expect(Reflect.ownKeys(nativeHeadlessDisplay)).toEqual(displayNames);
	expect(Object.isFrozen(nativeHeadlessDisplay)).toBe(true);
	for (const name of displayNames) {
		expect(
			Object.getOwnPropertyDescriptor(nativeHeadlessDisplay, name),
		).toEqual({
			value: expectedDisplay[name],
			writable: false,
			enumerable: true,
			configurable: false,
		});
		expect(Reflect.set(nativeHeadlessDisplay, name, 9)).toBe(false);
		expect(Reflect.deleteProperty(nativeHeadlessDisplay, name)).toBe(false);
	}
	expect(
		Reflect.defineProperty(nativeHeadlessDisplay, "screen", { value: {} }),
	).toBe(false);
});

it("advertises numeric globals and exposes readonly native Window getters through aliases", () => {
	const { document, bindings, window, lifecycle, context } = fixture();
	const before = document.nodeCount;
	const names = pageBindingGlobalNames(document);
	expectDisplay(window, bindings);
	for (const name of displayNames) {
		expect(names.filter((candidate) => candidate === name)).toHaveLength(1);
		expect(typeof bindings.globals[name]).toBe("number");
		const descriptor = Object.getOwnPropertyDescriptor(window, name);
		expect(descriptor?.get).toBeTypeOf("function");
		expect(descriptor?.set).toBeUndefined();
		expect(descriptor).not.toHaveProperty("value");
		expect(Reflect.set(window, name, 9)).toBe(false);
	}
	for (const alias of [
		window.window,
		window.self,
		window.top,
		window.parent,
		bindings.globals.window,
		bindings.globals.self,
	]) {
		expect(alias).toBe(window);
		expectDisplay(alias as DisplayWindow, bindings);
	}
	expectDisplay(window, bindings);
	expect(document.nodeCount).toBe(before);
	expect(lifecycle.startCallback).not.toHaveBeenCalled();
	expect(context.releaseGuestReference).not.toHaveBeenCalled();
});

it("keeps independent documents and bindings isolated", () => {
	const first = fixture();
	const second = fixture();
	first.styles.setViewport(80, 40);
	second.styles.setViewport(30, 90);
	expect(first.window).not.toBe(second.window);
	expect(first.bindings.globals).not.toBe(second.bindings.globals);
	for (const test of [first, second]) expectDisplay(test.window, test.bindings);
	first.document.close();
	expect(() => first.window.devicePixelRatio).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expectDisplay(second.window, second.bindings);
	expect(second.window.innerWidth).toBe(30);
	expect(second.window.innerHeight).toBe(90);
	expect(second.window.matchMedia("(resolution: 1dppx)").matches).toBe(true);
});

it("updates viewport orientation and owned callbacks without changing display constants", async () => {
	const { styles, window, bindings, lifecycle, context } = fixture();
	styles.setViewport(80, 40);
	await vi.runAllTimersAsync();
	const resolution = window.matchMedia("(resolution: 1dppx)");
	const portrait = window.matchMedia("(orientation: portrait)");
	const resolutionChanged = vi.fn();
	const orientationChanged = vi.fn(function (this: MediaList) {
		expect(this).toBe(portrait);
	});
	const resized = vi.fn(function (this: DisplayWindow) {
		expect(this).toBe(window);
	});
	resolution.addListener(resolutionChanged);
	portrait.addListener(orientationChanged);
	window.addEventListener("resize", resized);
	for (const [width, height, expectedPortrait] of [
		[40, 80, true],
		[40, 40, true],
		[120, 40, false],
	] as const) {
		styles.setViewport(width, height);
		expect(window.innerWidth).toBe(width);
		expect(window.innerHeight).toBe(height);
		expect(portrait.matches).toBe(expectedPortrait);
		expect(resolution.matches).toBe(true);
		expectDisplay(window, bindings);
		await vi.runAllTimersAsync();
	}
	expect(resized).toHaveBeenCalledTimes(3);
	expect(orientationChanged).toHaveBeenCalledTimes(2);
	expect(resolutionChanged).not.toHaveBeenCalled();
	expect(lifecycle.fail).not.toHaveBeenCalled();
	bindings.close();
	expect(bindings.dom.eventBindings?.metrics()).toMatchObject({
		listeners: 0,
		closed: true,
	});
	expect(context.releaseGuestReference).not.toHaveBeenCalled();
});

it.each([
	["(resolution)", true],
	["(resolution: 1dppx)", true],
	["(resolution: 1x)", true],
	["(resolution: 96dpi)", true],
	["(resolution: 9.6e1dpi)", true],
	["(min-resolution: 37dpcm)", true],
	["(max-resolution: 38dpcm)", true],
	["(min-resolution: 38dpcm)", false],
	["(max-resolution: 37dpcm)", false],
	["(min-resolution: 1dppx)", true],
	["(max-resolution: 1dppx)", true],
	["(resolution: 2dppx)", false],
	["(resolution: 0dppx)", false],
	["(resolution: 192dpi)", false],
	["(min-resolution: 1.01dppx)", false],
	["(max-resolution: .99dppx)", false],
	["(resolution > 1dppx)", false],
	["(resolution < 1dppx)", false],
	["(96dpi <= resolution <= 1x)", true],
	["(1dppx < resolution < 2dppx)", false],
	["not (resolution: 2dppx)", true],
	["print and (resolution: 1dppx)", false],
	["screen and (resolution: 96dpi)", true],
	["(resolution: 2dppx), (resolution: 1x)", true],
	["(resolution: 1)", false],
	["(resolution: 1px)", false],
	["(resolution: NaNdppx)", false],
	["(resolution: 1e999dppx)", false],
	["(resolution: infinite)", false],
	["(resolution:)", false],
	["(device-pixel-ratio: 1)", false],
	["(-webkit-device-pixel-ratio: 1)", false],
	["(device-width: 80px)", false],
])(
	"matches fixed resolution in page and stylesheet queries: %s",
	(source, expected) => {
		const { window, styles } = fixture();
		const query = window.matchMedia(source);
		for (const [width, height] of [
			[80, 40],
			[40, 80],
		]) {
			styles.setViewport(width, height);
			expect(query.matches).toBe(expected);
			expect(cssMediaMatches(source, styles.viewport, () => {})).toBe(expected);
		}
	},
);

it.each(["bindings", "document", "lifecycle"] as const)(
	"revokes saved Window getters after %s closure, not copied numeric data",
	(owner) => {
		const test = fixture();
		const copies = displayNames.map((name) => test.bindings.globals[name]);
		const getters = displayNames.map(
			(name) => Object.getOwnPropertyDescriptor(test.window, name)?.get,
		);
		const alias = test.window.self;
		if (owner === "bindings") test.bindings.close();
		else if (owner === "document") test.document.close();
		else test.closeLifecycle();
		for (const name of displayNames) {
			expect(() => test.window[name]).toThrow(
				expect.objectContaining({ code: "closed" }),
			);
			expect(() => alias[name]).toThrow(
				expect.objectContaining({ code: "closed" }),
			);
		}
		for (const getter of getters) {
			expect(getter).toBeTypeOf("function");
			expect(() => getter?.call(test.window)).toThrow(
				expect.objectContaining({ code: "closed" }),
			);
		}
		expect(copies).toEqual([1, 0, 0]);
		expect(nativeHeadlessDisplay).toEqual(expectedDisplay);
	},
);

it.each(["bindings", "document"] as const)(
	"cancels pending media callbacks and releases references on %s closure",
	async (owner) => {
		const test = fixture();
		test.styles.setViewport(80, 40);
		await vi.runAllTimersAsync();
		const list = test.window.matchMedia("(orientation: portrait)");
		const callback = vi.fn();
		list.addListener(callback);
		test.styles.setViewport(40, 80);
		if (owner === "bindings") test.bindings.close();
		else test.document.close();
		await vi.runAllTimersAsync();
		expect(callback).not.toHaveBeenCalled();
		expect(test.bindings.dom.eventBindings?.metrics()).toMatchObject({
			listeners: 0,
			closed: true,
		});
		expect(test.context.releaseGuestReference).not.toHaveBeenCalled();
		expect(test.interactions.events.metrics().listeners).toBe(0);
		expect(test.bindings.media.metrics()).toMatchObject({
			closed: true,
			queued: false,
			lists: 0,
		});
		expect(() => list.matches).toThrow("closed");
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("does not fabricate Screen, platform, monitor or configurable device metadata", () => {
	const { window, bindings, document } = fixture();
	const names = pageBindingGlobalNames(document);
	for (const name of [
		"Screen",
		"screen",
		"ScreenOrientation",
		"visualViewport",
		"VisualViewport",
		"getScreenDetails",
		"screenX",
		"screenY",
		"deviceScaleFactor",
		"device",
		"monitor",
		"clientWindow",
		"zoom",
	]) {
		expect(name in window).toBe(false);
		expect(Object.hasOwn(bindings.globals, name)).toBe(false);
		expect(names).not.toContain(name);
	}
	for (const name of [
		"platform",
		"userAgentData",
		"deviceMemory",
		"hardwareConcurrency",
		"maxTouchPoints",
		"gpu",
	]) {
		expect(name in window.navigator).toBe(false);
	}
});

it("keeps mock-transport session viewport scale aligned before navigation and across resizes", async () => {
	const request = vi.fn(async (input: NetworkRequest) => ({
		url: input.url,
		status: 200,
		headers: {},
		body: new Uint8Array(),
		redirects: [],
		encodedBytes: 0,
		elapsedMs: 0,
	}));
	const transport: NetworkTransport = {
		request,
		metrics: () => ({
			requests: request.mock.calls.length,
			active: 0,
			closed: false,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
		}),
		close: vi.fn(),
	};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument: (response) =>
			parseHtmlDocument("<main>A</main>", response.url),
	});
	sessions.push(session);
	const tab = session.createTab();
	const initial = session.viewport(tab.id);
	expect(initial).toMatchObject({
		document: null,
		deviceScaleFactor: 1,
		partial: true,
		profile: "logical-css-viewport",
	});
	expect(Object.isFrozen(initial)).toBe(true);
	session.resize(tab.id, 80, 40);
	expect(session.viewport(tab.id).deviceScaleFactor).toBe(
		nativeHeadlessDisplay.devicePixelRatio,
	);
	await session.navigate(tab.id, "https://fixture.invalid/");
	const test = fixture(session.page(tab.id).document);
	for (const [width, height] of [
		[80, 40],
		[40, 80],
		[40, 40],
	]) {
		session.resize(tab.id, width, height);
		const viewport = session.viewport(tab.id);
		expect(viewport).toMatchObject({
			width,
			height,
			deviceScaleFactor: test.window.devicePixelRatio,
		});
		expect(viewport.document).not.toBeNull();
		expect(viewport.key).toBe(initial.key);
		expect(test.window.innerWidth).toBe(width);
		expect(test.window.innerHeight).toBe(height);
		expectDisplay(test.window, test.bindings);
		expect(
			test.window.matchMedia(`(resolution: ${viewport.deviceScaleFactor}dppx)`)
				.matches,
		).toBe(true);
		await vi.runAllTimersAsync();
	}
	expect(request).toHaveBeenCalledTimes(1);
	session.close();
	expect(transport.close).toHaveBeenCalledTimes(1);
	expect(() => test.window.devicePixelRatio).toThrow("closed");
});
