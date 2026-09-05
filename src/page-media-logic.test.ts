import { afterEach, expect, it, vi } from "vitest";
import { cssMediaMatches } from "./css-parser.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
} from "./page-bindings.js";
import { documentStyles } from "./styles.js";

interface MediaEvent {
	type: string;
	media: string;
	matches: boolean;
	target: MediaList;
	currentTarget: MediaList | null;
}
type Listener = (this: MediaList, event: MediaEvent) => void;
interface MediaList {
	readonly media: string;
	readonly matches: boolean;
	onchange: Listener | null;
	addListener(listener: Listener): void;
	addEventListener(type: string, listener: Listener): void;
}
interface MediaWindow {
	matchMedia(source: string): MediaList;
}

const documents: DocumentTree[] = [];
const owners: PageBindings[] = [];
const diagnostic = "unimplemented-or-invalid-media-query";

function fixture(source = "all") {
	vi.useFakeTimers();
	const document = parseHtmlDocument(
		`<style>main{height:2px;background:red}@media ${source}{main{background:blue}}</style><main></main>`,
		"https://fixture.invalid/",
	);
	documents.push(document);
	const styles = documentStyles(document);
	styles.setViewport(4, 2);
	const interactions = documentInteractions(document);
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
		isClosed: () => false,
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
		window: bindings.window as MediaWindow,
		resize: (width: number) => styles.setViewport(width, 2),
	};
}

afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const document of documents.splice(0)) document.close();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it.each([
	["(future-feature: yes) or (width > 3px)", true, false],
	["(width > 3px) or (future-feature: yes)", true, false],
	["(future-feature: yes) and (width > 3px)", false, false],
	["(width > 3px) and (future-feature: yes)", false, false],
	["not ((future-feature: yes) and (width > 3px))", false, true],
	["not ((width > 3px) and (future-feature: yes))", false, true],
	["not ((future-feature: yes) or (width > 3px))", false, false],
	["not ((width > 3px) or (future-feature: yes))", false, false],
	["(future-feature: yes) or (width > 3px) or (height: 2px)", true, true],
	[
		"not ((future-feature: yes) and (width > 3px) and (height: 1px))",
		true,
		true,
	],
	["((future-feature: yes) and (width > 3px)) or (height: 2px)", true, true],
	["((future-feature: yes) or (width > 3px)) and (height: 1px)", false, false],
	["future(yes) or (width > 3px)", true, false],
	["not (future(yes) and (width > 3px))", false, true],
	["screen and ((future-feature: yes) or (width > 3px))", true, false],
	["print and (future-feature: yes)", false, false],
	["not print and (future-feature: yes)", true, true],
	["only print and (future-feature: yes)", false, false],
	["not screen and (future-feature: yes)", false, false],
	["not all and ((future-feature: yes) and (width > 3px))", false, true],
	["mystery and (future-feature: yes)", false, false],
	["not mystery and (future-feature: yes)", true, true],
] as const)(
	"keeps CSS paint, diagnostics and retained matchMedia aligned for %s",
	(source, wide, narrow) => {
		const { document, styles, window, bindings, resize } = fixture(source);
		const list = window.matchMedia(source);
		for (const [width, matches] of [
			[4, wide],
			[2, narrow],
			[4, wide],
		] as const) {
			resize(width);
			const issue = vi.fn();
			expect(cssMediaMatches(source, styles.viewport, issue)).toBe(matches);
			expect(issue).toHaveBeenCalledExactlyOnceWith(diagnostic);
			expect(list.matches).toBe(matches);
			expect(list.media).toBe(source);
			const image = rasterizeDocument(document).image;
			expect([image.width, image.height]).toEqual([width, 2]);
			expect(Array.from(image.pixels.subarray(0, 4))).toEqual(
				matches ? [0, 0, 255, 255] : [255, 0, 0, 255],
			);
			expect(styles.metrics().issues[diagnostic]).toBeGreaterThan(0);
		}
		expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(1);
	},
);

it.each([
	["mystery", false],
	["not mystery", true],
	["only mystery", false],
	["-future", false],
	["not -future", true],
	["mystery and (width > 3px)", false],
	["not mystery and (width > 3px)", true],
	["only mystery and (width > 3px)", false],
] as const)(
	"treats unknown media type %s as supported false before negation",
	(source, matches) => {
		const { document, styles, window, bindings, resize } = fixture(source);
		const list = window.matchMedia(source);
		for (const width of [4, 2, 4]) {
			resize(width);
			const issue = vi.fn();
			expect(cssMediaMatches(source, styles.viewport, issue)).toBe(matches);
			expect(issue).not.toHaveBeenCalled();
			expect(list.matches).toBe(matches);
			expect(list.media).toBe(source);
			expect(
				Array.from(rasterizeDocument(document).image.pixels.subarray(0, 4)),
			).toEqual(matches ? [0, 0, 255, 255] : [255, 0, 0, 255]);
			expect(styles.metrics().issues[diagnostic] ?? 0).toBe(0);
		}
		expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(0);
	},
);

it.each([
	"(future-feature: yes)",
	"not (future-feature: yes)",
	"(future-feature: yes) and (another-future: yes)",
	"(future-feature: yes) or (another-future: yes)",
	"not ((future-feature: yes) or (another-future: yes))",
	"future(yes)",
	"not future(yes)",
	"not",
	"only",
	"and",
	"or",
	"layer",
	"not layer",
	"only layer",
	"layer and (width > 3px)",
	"screen or (width > 3px)",
	"screen and (width > 3px) or (height: 2px)",
])(
	"keeps all-unknown or malformed query %s nonmatching as not all",
	(source) => {
		const { styles, window, bindings, resize } = fixture();
		const list = window.matchMedia(source);
		for (const width of [4, 2, 4]) {
			resize(width);
			const issue = vi.fn();
			expect(cssMediaMatches(source, styles.viewport, issue)).toBe(false);
			expect(issue).toHaveBeenCalledExactlyOnceWith(diagnostic);
			expect(list.matches).toBe(false);
			expect(list.media).toBe("not all");
		}
		expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(1);
	},
);

it.each([
	[
		"(future-feature: yes), (width > 3px)",
		"not all, (width > 3px)",
		true,
		false,
		true,
	],
	["layer, (width > 3px)", "not all, (width > 3px)", true, false, true],
	["mystery, (width > 3px)", "mystery, (width > 3px)", true, false, false],
	[
		"(future-feature: yes), not mystery",
		"not all, not mystery",
		true,
		true,
		true,
	],
	[
		"(future-feature: yes), not (another-future: yes)",
		"not all, not all",
		false,
		false,
		true,
	],
	[
		" ( FUTURE-FEATURE : YES ) or ( WIDTH > 3px ), PRINT ",
		"(future-feature: yes) or (width > 3px), print",
		true,
		false,
		true,
	],
] as const)(
	"retains stable list alternatives for %s",
	(source, media, wide, narrow, unsupported) => {
		const { document, styles, window, bindings, resize } = fixture(source);
		const list = window.matchMedia(source);
		for (const [width, matches] of [
			[4, wide],
			[2, narrow],
			[4, wide],
		] as const) {
			resize(width);
			const issue = vi.fn();
			expect(cssMediaMatches(source, styles.viewport, issue)).toBe(matches);
			expect(issue).toHaveBeenCalledTimes(unsupported ? 1 : 0);
			if (unsupported) expect(issue).toHaveBeenCalledWith(diagnostic);
			expect(list.media).toBe(media);
			expect(list.matches).toBe(matches);
			expect(
				Array.from(rasterizeDocument(document).image.pixels.subarray(0, 4)),
			).toEqual(matches ? [0, 0, 255, 255] : [255, 0, 0, 255]);
		}
		expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(
			unsupported ? 1 : 0,
		);
	},
);

it.each([
	["(future-feature: yes) or (width > 3px)", true, false],
	["not ((future-feature: yes) and (width > 3px))", false, true],
	["(future-feature: yes), (width > 3px)", true, false],
] as const)(
	"delivers boolean changes through unknown for retained %s",
	async (source, wide, narrow) => {
		const { window, bindings, lifecycle, resize } = fixture();
		const list = window.matchMedia(source);
		const media = list.media;
		const trace: Array<[string, boolean, string]> = [];
		const handler = function (this: MediaList, event: MediaEvent) {
			expect(this).toBe(list);
			expect(event.target).toBe(list);
			expect(event.currentTarget).toBe(list);
			trace.push([event.type, event.matches, event.media]);
		};
		list.onchange = handler;
		const legacy = vi.fn();
		list.addListener(legacy);
		const ordinary = vi.fn();
		list.addEventListener("change", ordinary);
		expect(list.matches).toBe(wide);
		resize(2);
		expect(list.matches).toBe(narrow);
		expect(trace).toEqual([]);
		await vi.runAllTimersAsync();
		expect(trace).toEqual([["change", narrow, media]]);
		resize(1);
		await vi.runAllTimersAsync();
		expect(trace).toHaveLength(1);
		resize(4);
		expect(list.matches).toBe(wide);
		await vi.runAllTimersAsync();
		expect(trace).toEqual([
			["change", narrow, media],
			["change", wide, media],
		]);
		expect(list.media).toBe(media);
		expect(legacy).toHaveBeenCalledTimes(2);
		expect(ordinary).toHaveBeenCalledTimes(2);
		expect(bindings.media.metrics().eventsDelivered).toBe(5);
		expect(lifecycle.fail).not.toHaveBeenCalled();
	},
);

it("does not emit changes between internal false and unknown or for stable alternatives", async () => {
	const { window, bindings, resize } = fixture();
	const lists = [
		"(future-feature: yes) and (width > 3px)",
		"not ((future-feature: yes) or (width > 3px))",
		"(future-feature: yes), not mystery",
		"not mystery and (width > 3px)",
		"(future-feature: yes)",
	].map((source) => window.matchMedia(source));
	const media = lists.map((list) => list.media);
	const changed = vi.fn();
	for (const list of lists) list.addListener(changed);
	for (const width of [2, 4, 2, 4]) {
		resize(width);
		expect(lists.map((list) => list.matches)).toEqual([
			false,
			false,
			true,
			true,
			false,
		]);
		await vi.runAllTimersAsync();
		expect(lists.map((list) => list.media)).toEqual(media);
	}
	expect(changed).not.toHaveBeenCalled();
	expect(bindings.media.metrics().eventsDelivered).toBe(4);
});

it("coalesces a true to unknown to true round trip without a change", async () => {
	const { window, resize } = fixture();
	const list = window.matchMedia("(future-feature: yes) or (width > 3px)");
	const changed = vi.fn();
	list.addListener(changed);
	resize(2);
	expect(list.matches).toBe(false);
	resize(4);
	expect(list.matches).toBe(true);
	await vi.runAllTimersAsync();
	expect(changed).not.toHaveBeenCalled();
});

it("keeps mixed-query media and matches read-only across result changes", () => {
	const { window, resize } = fixture();
	const source = "(future-feature: yes) or (width > 3px)";
	const list = window.matchMedia(source);
	for (const width of [4, 2]) {
		resize(width);
		expect(() => Reflect.set(list, "media", "all")).toThrow("read-only");
		expect(() => Reflect.set(list, "matches", true)).toThrow("read-only");
		expect(Reflect.defineProperty(list, "media", { value: "all" })).toBe(false);
		expect(Reflect.defineProperty(list, "matches", { value: true })).toBe(
			false,
		);
		expect(list.media).toBe(source);
		expect(list.matches).toBe(width === 4);
	}
});

it.each(["bindings", "document"] as const)(
	"revokes retained mixed-query lists and pending delivery when %s closes",
	async (owner) => {
		const { document, window, bindings, interactions, resize } = fixture();
		const list = window.matchMedia("(future-feature: yes) or (width > 3px)");
		const changed = vi.fn();
		list.onchange = changed;
		list.addListener(changed);
		resize(2);
		expect(bindings.media.metrics().queued).toBe(true);
		if (owner === "bindings") bindings.close();
		else document.close();
		await vi.runAllTimersAsync();
		expect(changed).not.toHaveBeenCalled();
		expect(bindings.media.metrics()).toMatchObject({
			closed: true,
			queued: false,
			lists: 0,
			retainedCodeUnits: 0,
		});
		expect(interactions.events.metrics().listeners).toBe(0);
		for (const operation of [
			() => list.media,
			() => list.matches,
			() => list.onchange,
			() => list.addListener(changed),
			() => window.matchMedia("all"),
		])
			expect(operation).toThrow("closed");
	},
);
