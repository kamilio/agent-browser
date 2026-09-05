import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { compileCssMedia } from "./css-media.js";
import { cssMediaMatches } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { nativeHeadlessDisplay } from "./native-headless-display.js";
import type { NetworkRequest, NetworkTransport } from "./network.js";
import { PageAnimationFrames } from "./page-animation-frames.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { PageIdleCallbacks } from "./page-idle-callbacks.js";
import { createPageScreen } from "./page-screen.js";
import { PageTimers } from "./page-timers.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const screenNames = [
	"width",
	"height",
	"availWidth",
	"availHeight",
	"colorDepth",
	"pixelDepth",
] as const;
type SyntheticScreen = Readonly<Record<(typeof screenNames)[number], number>>;
interface SyntheticWindow {
	readonly screen: SyntheticScreen;
	readonly innerWidth: number;
	readonly innerHeight: number;
	readonly outerWidth: number;
	readonly outerHeight: number;
	readonly devicePixelRatio: number;
	readonly self: SyntheticWindow;
	readonly window: SyntheticWindow;
	readonly top: SyntheticWindow;
	readonly parent: SyntheticWindow;
	matchMedia(source: string): {
		readonly media: string;
		readonly matches: boolean;
	};
}

const documents: DocumentTree[] = [];
const bindings: PageBindings[] = [];
const sessions: BrowserSession[] = [];

function hostObject(definition: ScriptHostObjectDefinition): object {
	const object = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(object, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(object, name, { value: method });
	return object;
}

function fixture(
	document = parseHtmlDocument(
		"<main>Fixture</main>",
		"https://fixture.invalid/",
	),
) {
	documents.push(document);
	const styles = documentStyles(document);
	const interactions = documentInteractions(document);
	let lifecycleClosed = false;
	const createHostObject = vi.fn(hostObject);
	const context: PageBindingContext = {
		createHostObject,
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: vi.fn(),
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => lifecycleClosed,
		startCallback: vi.fn(() => {
			throw new Error("Unexpected synthetic callback");
		}),
		fail: vi.fn(),
		onConsoleCall: vi.fn(),
	};
	return {
		document,
		styles,
		interactions,
		context,
		createHostObject,
		lifecycle,
		closeLifecycle: () => {
			lifecycleClosed = true;
		},
		build() {
			const owner = new PageBindings(
				{ document, interactions },
				context,
				lifecycle,
			);
			bindings.push(owner);
			return owner;
		},
	};
}

function expectDimensions(
	screen: SyntheticScreen,
	width: number,
	height: number,
) {
	expect(screen.width).toBe(width);
	expect(screen.availWidth).toBe(width);
	expect(screen.height).toBe(height);
	expect(screen.availHeight).toBe(height);
	expect(screen.colorDepth).toBe(24);
	expect(screen.pixelDepth).toBe(24);
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
	for (const owner of bindings.splice(0)) owner.close();
	for (const session of sessions.splice(0)) session.close();
	for (const document of documents.splice(0)) document.close();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it("creates one six-getter Screen before Window and shares it across aliases", () => {
	const test = fixture();
	const owner = test.build();
	const window = owner.window as SyntheticWindow;
	const screen = window.screen;
	expect(owner.screen).toBe(screen);
	expect(owner.globals.screen).toBe(screen);
	for (const alias of [window.self, window.window, window.parent, window.top])
		expect(alias.screen).toBe(screen);
	expect(Reflect.ownKeys(screen)).toEqual(screenNames);
	const definitions = test.createHostObject.mock.calls.map(
		([definition]) => definition,
	);
	const screenIndex = definitions.findIndex(
		(definition) => definition.properties?.colorDepth,
	);
	const windowIndex = definitions.findIndex(
		(definition) => definition.properties?.screen,
	);
	expect(screenIndex).toBeGreaterThanOrEqual(0);
	expect(windowIndex).toBeGreaterThan(screenIndex);
	expect(
		definitions.filter((definition) => definition.properties?.colorDepth),
	).toHaveLength(1);
	expect(
		pageBindingGlobalNames(test.document).filter((name) => name === "screen"),
	).toHaveLength(1);
	expect(
		Object.keys(owner.globals).filter((name) => name === "screen"),
	).toHaveLength(1);
	expectDimensions(screen, 1280, 720);
});

it("keeps Screen identity and closure isolated across independent bindings", () => {
	const first = fixture();
	const firstOwner = first.build();
	const second = fixture();
	const secondOwner = second.build();
	expect(firstOwner.screen).not.toBe(secondOwner.screen);
	first.styles.setViewport(900, 1200);
	expectDimensions(firstOwner.screen as SyntheticScreen, 900, 1200);
	expectDimensions(secondOwner.screen as SyntheticScreen, 1280, 720);
	firstOwner.close();
	expect(() => (firstOwner.screen as SyntheticScreen).width).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expectDimensions(secondOwner.screen as SyntheticScreen, 1280, 720);
});

it.each([
	{ width: 1, height: 1 },
	{ width: 16_384, height: 16_384 },
	{ width: 1, height: 16_384 },
	{ width: 16_384, height: 1 },
	{ width: 900, height: 1200 },
])(
	"keeps live dimensions and supported media aligned at $width × $height",
	({ width, height }) => {
		const test = fixture();
		const owner = test.build();
		const window = owner.window as SyntheticWindow;
		const savedScreen = window.screen;
		const savedWidth = Object.getOwnPropertyDescriptor(
			savedScreen,
			"width",
		)?.get;
		const portrait = window.matchMedia("(orientation: portrait)");
		expectDimensions(savedScreen, 1280, 720);
		test.styles.setViewport(width, height);
		expect(window.screen).toBe(savedScreen);
		expectDimensions(savedScreen, width, height);
		expect(savedWidth?.()).toBe(width);
		expect(window.innerWidth).toBe(savedScreen.width);
		expect(window.innerHeight).toBe(savedScreen.height);
		expect(portrait.matches).toBe(height >= width);
		for (const source of [
			`(width: ${width}px)`,
			`(height: ${height}px)`,
			`(aspect-ratio: ${width}/${height})`,
			"(resolution: 1dppx)",
			"screen",
		]) {
			expect(window.matchMedia(source).matches).toBe(true);
			expect(cssMediaMatches(source, test.styles.viewport, () => {})).toBe(
				true,
			);
		}
		expect(window.devicePixelRatio).toBe(1);
		expect(window.outerWidth).toBe(0);
		expect(window.outerHeight).toBe(0);
	},
);

it.each([0, -1, 16_385, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects invalid trusted viewport dimensions without changing Screen: %s",
	(value) => {
		const test = fixture();
		const screen = test.build().screen as SyntheticScreen;
		for (const [width, height] of [
			[value, 720],
			[1280, value],
		]) {
			expect(() => test.styles.setViewport(width, height)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
			expectDimensions(screen, 1280, 720);
		}
	},
);

it("keeps exactly the original three headless constants and adds no unsupported Screen surface", () => {
	const test = fixture();
	const owner = test.build();
	const window = owner.window as SyntheticWindow;
	expect(nativeHeadlessDisplay).toEqual({
		devicePixelRatio: 1,
		outerWidth: 0,
		outerHeight: 0,
	});
	expect(Object.keys(nativeHeadlessDisplay)).toEqual([
		"devicePixelRatio",
		"outerWidth",
		"outerHeight",
	]);
	expect(Object.isFrozen(nativeHeadlessDisplay)).toBe(true);
	for (const name of [
		"Screen",
		"ScreenOrientation",
		"orientation",
		"availLeft",
		"availTop",
		"left",
		"top",
		"isExtended",
		"onchange",
		"addEventListener",
		"removeEventListener",
		"dispatchEvent",
		"constructor",
	])
		expect(name in window.screen).toBe(false);
	for (const name of [
		...screenNames,
		"Screen",
		"ScreenOrientation",
		"orientation",
		"getScreenDetails",
		"screenX",
		"screenY",
		"availLeft",
		"availTop",
	]) {
		expect(name in window).toBe(false);
		expect(Object.hasOwn(owner.globals, name)).toBe(false);
		expect(pageBindingGlobalNames(test.document)).not.toContain(name);
	}
});

it("provides getter-only Screen and Window.screen through synthetic descriptors", () => {
	const owner = fixture().build();
	const window = owner.window as SyntheticWindow;
	for (const [object, names] of [
		[window.screen, screenNames],
		[window, ["screen"]],
	] as const) {
		for (const name of names) {
			const descriptor = Object.getOwnPropertyDescriptor(object, name);
			expect(descriptor?.get).toBeTypeOf("function");
			expect(descriptor?.set).toBeUndefined();
			expect(descriptor).not.toHaveProperty("value");
			expect(Reflect.set(object, name, 999)).toBe(false);
			expect(Reflect.defineProperty(object, name, { value: 999 })).toBe(false);
			expect(Reflect.deleteProperty(object, name)).toBe(false);
		}
	}
	expectDimensions(window.screen, 1280, 720);
	expect(owner.globals.screen).toBe(window.screen);
});

it.each(["binding", "document", "lifecycle"] as const)(
	"revokes all saved Screen getters after %s closure, retaining copied primitives",
	(closure) => {
		const test = fixture();
		const owner = test.build();
		const window = owner.window as SyntheticWindow;
		const saved = window.screen;
		const copies = screenNames.map((name) => saved[name]);
		const getters = screenNames.map(
			(name) => Object.getOwnPropertyDescriptor(saved, name)?.get,
		);
		if (closure === "binding") owner.close();
		else if (closure === "document") test.document.close();
		else test.closeLifecycle();
		expect(owner.screen).toBe(saved);
		expect(owner.globals.screen).toBe(saved);
		expect(() => window.screen).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
		for (const name of screenNames)
			expect(() => saved[name]).toThrow(
				expect.objectContaining({ code: "closed" }),
			);
		for (const getter of getters)
			expect(() => getter?.()).toThrow(
				expect.objectContaining({ code: "closed" }),
			);
		expect(copies).toEqual([1280, 720, 1280, 720, 24, 24]);
	},
);

it.each([
	"(color-gamut: srgb)",
	"(device-width: 1280px)",
	"(device-height: 720px)",
])(
	"keeps unsupported CSS media explicit instead of inferring hardware color: %s",
	(source) => {
		const test = fixture();
		const window = test.build().window as SyntheticWindow;
		const compiled = compileCssMedia(source);
		expect(compiled.unsupported).toBe(true);
		expect(compiled.media).toBe("not all");
		expect(window.matchMedia(source)).toMatchObject({
			media: "not all",
			matches: false,
		});
		expect(cssMediaMatches(source, test.styles.viewport, () => {})).toBe(false);
		expect(window.screen.colorDepth).toBe(24);
	},
);

it("does not add subscriptions, callback references, or timer ownership on Screen reads", async () => {
	const test = fixture();
	const owner = test.build();
	const subscribe = vi.spyOn(test.styles, "onViewportChange");
	const closeSubscribe = vi.spyOn(test.document, "onClose");
	const original = {
		timers: owner.timers.metrics(),
		frames: owner.animationFrames.metrics(),
		idle: owner.idleCallbacks.metrics(),
		media: owner.media.metrics(),
		events: test.interactions.events.metrics(),
	};
	for (let index = 0; index < 20; index++)
		expectDimensions(owner.screen as SyntheticScreen, 1280, 720);
	expect(owner.timers.metrics()).toEqual(original.timers);
	expect(owner.animationFrames.metrics()).toEqual(original.frames);
	expect(owner.idleCallbacks.metrics()).toEqual(original.idle);
	expect(owner.media.metrics()).toEqual(original.media);
	expect(test.interactions.events.metrics()).toEqual(original.events);
	expect(subscribe).not.toHaveBeenCalled();
	expect(closeSubscribe).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
	test.styles.setViewport(900, 1200);
	const resizeTimers = vi.getTimerCount();
	expectDimensions(owner.screen as SyntheticScreen, 900, 1200);
	expect(vi.getTimerCount()).toBe(resizeTimers);
	await vi.runAllTimersAsync();
	expect(test.lifecycle.startCallback).not.toHaveBeenCalled();
	expect(test.context.releaseGuestReference).not.toHaveBeenCalled();
	expect(test.lifecycle.fail).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("checks helper lifecycle before and after host creation and before every read", () => {
	const trace: string[] = [];
	const viewport = { width: 10, height: 20 };
	const ensureOpen = vi.fn(() => {
		trace.push("open");
	});
	const readViewport = vi.fn(() => {
		trace.push("viewport");
		return viewport;
	});
	const createHostObject = vi.fn((definition: ScriptHostObjectDefinition) => {
		trace.push("host");
		expect(Object.keys(definition)).toEqual(["properties"]);
		return hostObject(definition);
	});
	const screen = createPageScreen(
		{ createHostObject },
		readViewport,
		ensureOpen,
	) as SyntheticScreen;
	expect(trace).toEqual(["open", "host", "open"]);
	expect(createHostObject).toHaveBeenCalledOnce();
	expect(readViewport).not.toHaveBeenCalled();
	for (const name of screenNames) {
		trace.length = 0;
		expect(screen[name]).toBe(
			name.endsWith("Depth")
				? 24
				: name.toLowerCase().includes("width")
					? 10
					: 20,
		);
		expect(trace).toEqual(
			name.endsWith("Depth") ? ["open"] : ["open", "viewport"],
		);
	}
	expect(vi.getTimerCount()).toBe(0);
});

it("does not construct a helper host or read the viewport when already closed", () => {
	const createHostObject = vi.fn(hostObject);
	const readViewport = vi.fn(() => ({ width: 1, height: 1 }));
	expect(() =>
		createPageScreen({ createHostObject }, readViewport, () => {
			throw new AgentBrowserError("closed", "Synthetic closure");
		}),
	).toThrow(expect.objectContaining({ code: "closed" }));
	expect(createHostObject).not.toHaveBeenCalled();
	expect(readViewport).not.toHaveBeenCalled();
});

it("propagates helper host construction failure without reading viewport or scheduling work", () => {
	const failure = new Error("Synthetic host failure");
	const ensureOpen = vi.fn();
	const readViewport = vi.fn(() => ({ width: 1, height: 1 }));
	const createHostObject = vi.fn(() => {
		throw failure;
	});
	expect(() =>
		createPageScreen({ createHostObject }, readViewport, ensureOpen),
	).toThrow(failure);
	expect(ensureOpen).toHaveBeenCalledOnce();
	expect(readViewport).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("rejects reentrant helper closure after factory return and revokes the captured object", () => {
	let closed = false;
	let captured: SyntheticScreen | undefined;
	const readViewport = vi.fn(() => ({ width: 1, height: 1 }));
	const ensureOpen = vi.fn(() => {
		if (closed) throw new AgentBrowserError("closed", "Synthetic closure");
	});
	const createHostObject = vi.fn((definition: ScriptHostObjectDefinition) => {
		captured = hostObject(definition) as SyntheticScreen;
		closed = true;
		return captured;
	});
	expect(() =>
		createPageScreen({ createHostObject }, readViewport, ensureOpen),
	).toThrow(expect.objectContaining({ code: "closed" }));
	expect(ensureOpen).toHaveBeenCalledTimes(2);
	expect(captured).toBeDefined();
	for (const name of screenNames)
		expect(() => captured?.[name]).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
	expect(readViewport).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it.each(["throw", "document", "lifecycle"] as const)(
	"cleans up binding ownership after %s during Screen host construction",
	async (mode) => {
		const test = fixture();
		const timersClose = vi.spyOn(PageTimers.prototype, "close");
		const framesClose = vi.spyOn(PageAnimationFrames.prototype, "close");
		const idleClose = vi.spyOn(PageIdleCallbacks.prototype, "close");
		const failure = new Error("Synthetic Screen construction failure");
		let captured: SyntheticScreen | undefined;
		test.createHostObject.mockImplementation((definition) => {
			const object = hostObject(definition);
			if (definition.properties?.colorDepth) {
				captured = object as SyntheticScreen;
				if (mode === "throw") throw failure;
				if (mode === "document") test.document.close();
				else test.closeLifecycle();
			}
			return object;
		});
		expect(() => test.build()).toThrow(
			mode === "throw" ? failure : expect.objectContaining({ code: "closed" }),
		);
		expect(captured).toBeDefined();
		for (const name of screenNames)
			expect(() => captured?.[name]).toThrow(
				expect.objectContaining({ code: "closed" }),
			);
		expect(
			test.createHostObject.mock.calls.some(
				([definition]) => definition.properties?.screen,
			),
		).toBe(false);
		for (const close of [timersClose, framesClose, idleClose]) {
			expect(close).toHaveBeenCalled();
			for (const owner of close.mock.instances) {
				if (
					!(owner instanceof PageTimers) &&
					!(owner instanceof PageAnimationFrames) &&
					!(owner instanceof PageIdleCallbacks)
				)
					throw new Error("Unexpected cleanup owner");
				expect(owner.metrics()).toMatchObject({ closed: true, active: 0 });
			}
		}
		if (mode !== "document") test.styles.setViewport(900, 1200);
		await vi.runAllTimersAsync();
		expect(test.interactions.events.metrics().listeners).toBe(0);
		expect(test.lifecycle.startCallback).not.toHaveBeenCalled();
		expect(test.context.releaseGuestReference).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each(["close", "navigate"] as const)(
	"matches session viewport metadata and revokes Screen on %s",
	async (boundary) => {
		const request = vi.fn(async (input: NetworkRequest) => ({
			url: input.url,
			status: 200,
			headers: {},
			body: new Uint8Array(),
			encodedBytes: 0,
			redirects: [],
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
				parseHtmlDocument("<main>Fixture</main>", response.url),
		});
		sessions.push(session);
		const tab = session.createTab();
		session.resize(tab.id, 900, 1200);
		await session.navigate(tab.id, "https://fixture.invalid/");
		const owner = fixture(session.page(tab.id).document).build();
		const window = owner.window as SyntheticWindow;
		const saved = window.screen;
		for (const [width, height] of [
			[900, 1200],
			[1, 1],
			[16_384, 16_384],
		]) {
			session.resize(tab.id, width, height);
			const viewport = session.viewport(tab.id);
			expect(viewport).toMatchObject({
				width,
				height,
				deviceScaleFactor: 1,
				partial: true,
				profile: "logical-css-viewport",
			});
			expect(viewport.document).not.toBeNull();
			expectDimensions(saved, viewport.width, viewport.height);
			expect(window.innerWidth).toBe(viewport.width);
			expect(window.innerHeight).toBe(viewport.height);
			expect(window.devicePixelRatio).toBe(viewport.deviceScaleFactor);
		}
		expect(request).toHaveBeenCalledOnce();
		if (boundary === "navigate") {
			await session.navigate(tab.id, "https://fixture.invalid/next");
			for (const name of screenNames)
				expect(() => saved[name]).toThrow(
					expect.objectContaining({ code: "closed" }),
				);
			const next = fixture(session.page(tab.id).document).build();
			const nextScreen = (next.window as SyntheticWindow).screen;
			expect(nextScreen).not.toBe(saved);
			expect(next.globals.screen).toBe(nextScreen);
			expectDimensions(nextScreen, 16_384, 16_384);
			expect(request).toHaveBeenCalledTimes(2);
		}
		session.close();
		expect(transport.close).toHaveBeenCalledOnce();
		for (const name of screenNames)
			expect(() => saved[name]).toThrow(
				expect.objectContaining({ code: "closed" }),
			);
		expect(vi.getTimerCount()).toBe(0);
	},
);
