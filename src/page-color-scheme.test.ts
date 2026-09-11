import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	PageBindings,
	type PageBindingContext,
	type PageBindingLifecycle,
} from "./page-bindings.js";
import { documentStyles } from "./styles.js";

interface MediaEvent {
	type: string;
	media: string;
	matches: boolean;
	target: MediaList;
}
interface MediaList {
	readonly media: string;
	readonly matches: boolean;
	onchange: ((event: MediaEvent) => void) | null;
	addEventListener(type: string, callback: (event: MediaEvent) => void): void;
	addListener(callback: (event: MediaEvent) => void): void;
}
interface Window {
	readonly innerWidth: number;
	readonly innerHeight: number;
	onresize: (() => void) | null;
	matchMedia(query: string): MediaList;
}

const documents: DocumentTree[] = [];
const ownedBindings: PageBindings[] = [];

afterEach(() => {
	for (const bindings of ownedBindings.splice(0)) bindings.close();
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});

function fixture() {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		"<main>Color preference</main>",
		"https://fixture.invalid/color-scheme",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(80, 40);
	const interactions = documentInteractions(tree);
	const context: PageBindingContext = {
		createHostObject(definition) {
			const object = Object.create(null);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, descriptor);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => {},
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback: (callback, args, options) => {
			if (typeof callback !== "function")
				throw new Error("Expected host callback");
			const result = callback.apply(options.thisValue, args);
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(result),
			};
		},
		fail: vi.fn(),
		onConsoleCall: () => {},
	};
	const bindings = new PageBindings(
		{ document: tree, interactions },
		context,
		lifecycle,
	);
	ownedBindings.push(bindings);
	const window = bindings.window as Window;
	return {
		tree,
		styles,
		bindings,
		window,
		lifecycle,
		query: (source: string) => window.matchMedia(source),
	};
}

it.each([null, "light", "dark"] as const)(
	"matches effective preference %s through the native media environment",
	(preference) => {
		const { styles, query, window, bindings } = fixture();
		styles.setColorSchemePreference(preference);
		expect(query("(prefers-color-scheme:light)").matches).toBe(
			preference !== "dark",
		);
		expect(query("(prefers-color-scheme:dark)").matches).toBe(
			preference === "dark",
		);
		expect(
			query("screen and (min-width:80px) and (prefers-color-scheme:dark)")
				.matches,
		).toBe(preference === "dark");
		expect(window.innerWidth).toBe(80);
		expect(window.innerHeight).toBe(40);
		expect(bindings.globals.matchMedia).toBe(window.matchMedia);
		expect(bindings.media.metrics().invalidOrUnsupportedQueries).toBe(0);
	},
);

it("updates matches synchronously and sends only effective changes without resize", async () => {
	const { styles, query, window, lifecycle } = fixture();
	const light = query("(prefers-color-scheme:light)");
	const dark = query("(prefers-color-scheme:dark)");
	const trace: string[] = [];
	light.onchange = (event) => {
		expect(event.target).toBe(light);
		trace.push(`light:${event.matches}`);
	};
	dark.addEventListener("change", (event) =>
		trace.push(`dark:${event.matches}`),
	);
	window.onresize = () => trace.push("resize");
	styles.setColorSchemePreference("light");
	await vi.runAllTimersAsync();
	expect(trace).toEqual([]);
	styles.setColorSchemePreference("dark");
	expect(dark.matches).toBe(true);
	expect(light.matches).toBe(false);
	expect(trace).toEqual([]);
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["light:false", "dark:true"]);
	styles.setColorSchemePreference(null);
	expect(light.matches).toBe(true);
	expect(dark.matches).toBe(false);
	await vi.runAllTimersAsync();
	expect(trace).toEqual([
		"light:false",
		"dark:true",
		"light:true",
		"dark:false",
	]);
	expect(window.innerWidth).toBe(80);
	expect(window.innerHeight).toBe(40);
	expect(lifecycle.fail).not.toHaveBeenCalled();
});

it("coalesces round trips, raw light/null equivalence and repeated setters", async () => {
	const { styles, query, window, bindings } = fixture();
	const dark = query("(prefers-color-scheme:dark)");
	const changed = vi.fn();
	dark.addListener(changed);
	window.onresize = changed;
	styles.setColorSchemePreference("dark");
	styles.setColorSchemePreference(null);
	await vi.runAllTimersAsync();
	expect(changed).not.toHaveBeenCalled();
	styles.setColorSchemePreference("light");
	styles.setColorSchemePreference(null);
	await vi.runAllTimersAsync();
	expect(changed).not.toHaveBeenCalled();
	styles.setColorSchemePreference("dark");
	styles.setColorSchemePreference("light");
	styles.setColorSchemePreference("dark");
	await vi.runAllTimersAsync();
	expect(changed).toHaveBeenCalledTimes(1);
	expect(changed.mock.calls[0][0].matches).toBe(true);
	styles.setColorSchemePreference("dark");
	expect(bindings.media.metrics().queued).toBe(false);
	await vi.runAllTimersAsync();
	expect(changed).toHaveBeenCalledTimes(1);
});

it("retains resize-before-media ordering when geometry and preference change together", async () => {
	const { styles, query, window } = fixture();
	const width = query("(min-width:60px)");
	const dark = query("(prefers-color-scheme:dark)");
	const trace: string[] = [];
	window.onresize = () => trace.push(`resize:${window.innerWidth}`);
	width.onchange = (event) => trace.push(`width:${event.matches}`);
	dark.onchange = (event) => trace.push(`dark:${event.matches}`);
	styles.setViewport(40, 80);
	styles.setColorSchemePreference("dark");
	expect(width.matches).toBe(false);
	expect(dark.matches).toBe(true);
	expect(trace).toEqual([]);
	await vi.runAllTimersAsync();
	expect(trace).toEqual(["resize:40", "width:false", "dark:true"]);
	styles.setColorSchemePreference("light");
	await vi.runAllTimersAsync();
	expect(trace).toEqual([
		"resize:40",
		"width:false",
		"dark:true",
		"dark:false",
	]);
});

it("handles a preference update during change delivery in a subsequent turn", async () => {
	const { styles, query, window, lifecycle, bindings } = fixture();
	const dark = query("(prefers-color-scheme:dark)");
	const changes: boolean[] = [];
	const resize = vi.fn();
	window.onresize = resize;
	dark.onchange = (event) => {
		changes.push(event.matches);
		if (event.matches) styles.setColorSchemePreference("light");
	};
	styles.setColorSchemePreference("dark");
	await vi.runAllTimersAsync();
	expect(changes).toEqual([true, false]);
	expect(dark.matches).toBe(false);
	expect(styles.colorSchemePreference).toBe("light");
	expect(resize).not.toHaveBeenCalled();
	expect(lifecycle.fail).not.toHaveBeenCalled();
	expect(bindings.media.metrics()).toMatchObject({
		queued: false,
		running: false,
	});
});

it.each(["bindings", "document"] as const)(
	"cancels pending preference notifications on %s close",
	async (kind) => {
		const { tree, styles, query, window, bindings } = fixture();
		const dark = query("(prefers-color-scheme:dark)");
		const changed = vi.fn();
		dark.onchange = changed;
		window.onresize = changed;
		styles.setColorSchemePreference("dark");
		if (kind === "bindings") bindings.close();
		else tree.close();
		await vi.runAllTimersAsync();
		expect(changed).not.toHaveBeenCalled();
		expect(bindings.media.metrics()).toMatchObject({
			closed: true,
			queued: false,
			lists: 0,
		});
		expect(() => dark.matches).toThrow(/closed/i);
		expect(() => query("(prefers-color-scheme:light)")).toThrow(/closed/i);
		if (kind === "bindings") {
			styles.setColorSchemePreference("light");
			styles.setViewport(40, 80);
			await vi.runAllTimersAsync();
			expect(changed).not.toHaveBeenCalled();
			expect(bindings.media.metrics().queued).toBe(false);
		}
	},
);
