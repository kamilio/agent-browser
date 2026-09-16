import { afterEach, expect, it, vi } from "vitest";
import {
	type BrowserIdentity,
	createBrowserIdentity,
	defaultBrowserIdentity,
} from "./browser-identity.js";
import { bindDocumentIdentity, documentIdentity } from "./document-identity.js";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const owners: PageBindings[] = [];

afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const document of documents.splice(0)) document.close();
});

function documentFixture() {
	const document = new DocumentTree("https://identity.fixture.invalid/");
	documents.push(document);
	return document;
}

function fixture(identity?: Readonly<BrowserIdentity>) {
	const document = documentFixture();
	if (identity !== undefined) bindDocumentIdentity(document, identity);
	const definitions = new Map<object, ScriptHostObjectDefinition>();
	const context: PageBindingContext = {
		createHostObject(definition) {
			const capability = Object.assign(Object.create(null), definition.methods);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(capability, name, {
					get: descriptor.get,
					set: descriptor.set,
				});
			definitions.set(capability, definition);
			return capability;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: vi.fn(),
	};
	const owner = new PageBindings(
		{ document, interactions: new DocumentInteractions(document) },
		context,
		{
			isClosed: () => false,
			startCallback: () => {
				throw new Error("Unused identity fixture callback");
			},
			fail: vi.fn(),
			onConsoleCall: vi.fn(),
		},
	);
	owners.push(owner);
	const navigator = owner.navigator as {
		readonly userAgent: string;
		readonly language: string;
		readonly languages: readonly string[];
	};
	return { document, owner, navigator, definitions };
}

it("binds one immutable profile per document and rejects replacement", () => {
	const document = documentFixture();
	const identity = createBrowserIdentity({ languages: ["fr-ca", "en"] });
	bindDocumentIdentity(document, identity);
	bindDocumentIdentity(document, identity);
	expect(documentIdentity(document)).toBe(identity);
	expect(() => bindDocumentIdentity(document, defaultBrowserIdentity)).toThrow(
		"Document identity cannot be replaced",
	);
	expect(documentIdentity(document)).toBe(identity);
});

it("pins the default on first access rather than changing a published identity", () => {
	const document = documentFixture();
	expect(documentIdentity(document)).toBe(defaultBrowserIdentity);
	expect(() =>
		bindDocumentIdentity(
			document,
			createBrowserIdentity({ languages: ["de"] }),
		),
	).toThrow("Document identity cannot be replaced");
});

it("rejects forged profile records without evaluating their getters", () => {
	const document = documentFixture();
	const getter = vi.fn(() => "private marker");
	const fake = Object.defineProperty({}, "userAgent", { get: getter });
	expect(() => bindDocumentIdentity(document, fake as BrowserIdentity)).toThrow(
		"Expected an identity created by this module",
	);
	expect(getter).not.toHaveBeenCalled();
	expect(documentIdentity(document)).toBe(defaultBrowserIdentity);
});

it("does not share document profile assignment between documents", () => {
	const first = documentFixture();
	const second = documentFixture();
	const custom = createBrowserIdentity({ languages: ["ja"] });
	bindDocumentIdentity(first, custom);
	expect(documentIdentity(first)).toBe(custom);
	expect(documentIdentity(second)).toBe(defaultBrowserIdentity);
});

it("revokes identity lookup and binding when the document closes", () => {
	const document = documentFixture();
	bindDocumentIdentity(document, defaultBrowserIdentity);
	document.close();
	expect(() => documentIdentity(document)).toThrow(
		"Identity document is closed",
	);
	expect(() => bindDocumentIdentity(document, defaultBrowserIdentity)).toThrow(
		"Identity document is closed",
	);
});

it("exposes truthful default identity independently of passkeys", () => {
	const { document, owner, navigator } = fixture();
	expect(pageBindingGlobalNames(document)).toContain("navigator");
	expect(owner.globals.navigator).toBe(navigator);
	expect((owner.window as { navigator: object }).navigator).toBe(navigator);
	expect(navigator.userAgent).toBe("AgentBrowser/0.1");
	expect(navigator.language).toBe("en-US");
	expect(navigator.languages).toEqual(["en-US"]);
	expect(navigator).not.toHaveProperty("credentials");
});

it("uses the bound canonical profile with stable frozen native language data", () => {
	const input = ["PL-pl", "en-us", "de"];
	const identity = createBrowserIdentity({ languages: input });
	input[0] = "fr";
	const { navigator } = fixture(identity);
	expect(navigator.language).toBe("pl-PL");
	expect(navigator.languages).toBe(navigator.languages);
	expect(navigator.languages).toBe(identity.languages);
	expect(navigator.languages).toEqual(["pl-PL", "en-US", "de"]);
	expect(Object.isFrozen(navigator.languages)).toBe(true);
	expect(() => (navigator.languages as string[]).push("fr")).toThrow(TypeError);
	expect(navigator.language).toBe(navigator.languages[0]);
});

it.each(["userAgent", "language", "languages"] as const)(
	"keeps navigator.%s read-only and lifetime-owned",
	(name) => {
		const { owner, navigator, definitions } = fixture();
		const property = definitions.get(navigator)?.properties?.[name];
		expect(property?.set).toBeUndefined();
		expect(Reflect.set(navigator, name, "changed")).toBe(false);
		const get = property?.get;
		if (!get) throw new Error("Missing identity getter");
		expect(get()).toEqual(navigator[name]);
		owner.close();
		expect(() => get()).toThrow();
	},
);

it("exposes only a virtual screen without inventing platform, GPU or physical display identity", () => {
	const { document, owner, navigator, definitions } = fixture();
	for (const name of [
		"platform",
		"vendor",
		"userAgentData",
		"hardwareConcurrency",
		"deviceMemory",
		"plugins",
		"gpu",
	])
		expect(navigator).not.toHaveProperty(name);
	const screen = owner.screen as Readonly<Record<string, number>>;
	expect((owner.window as { screen: object }).screen).toBe(screen);
	expect(owner.globals.screen).toBe(screen);
	expect(
		pageBindingGlobalNames(document).filter((name) => name === "screen"),
	).toEqual(["screen"]);
	const expected = {
		width: 1280,
		height: 720,
		availWidth: 1280,
		availHeight: 720,
		colorDepth: 24,
		pixelDepth: 24,
	};
	expect(Reflect.ownKeys(screen)).toEqual(Object.keys(expected));
	for (const [name, value] of Object.entries(expected)) {
		expect(screen[name]).toBe(value);
		expect(definitions.get(screen)?.properties?.[name]?.get).toBeTypeOf(
			"function",
		);
		expect(definitions.get(screen)?.properties?.[name]?.set).toBeUndefined();
		expect(Reflect.set(screen, name, 999)).toBe(false);
		expect(screen[name]).toBe(value);
	}
	for (const name of [
		"Screen",
		"getScreenDetails",
		"screenX",
		"screenY",
		"screenLeft",
		"screenTop",
	])
		expect(owner.window).not.toHaveProperty(name);
	expect(owner.window).toHaveProperty("devicePixelRatio", 1);
	expect(owner.window).toHaveProperty("outerWidth", 0);
	expect(owner.window).toHaveProperty("outerHeight", 0);
	documentStyles(document).setViewport(640, 480);
	expect((owner.window as { screen: object }).screen).toBe(screen);
	for (const [name, value] of Object.entries({
		width: 640,
		height: 480,
		availWidth: 640,
		availHeight: 480,
		colorDepth: 24,
		pixelDepth: 24,
	}))
		expect(screen[name]).toBe(value);
	owner.close();
	expect(() => (owner.window as { screen: object }).screen).toThrow();
	for (const name of Object.keys(expected))
		expect(() => screen[name]).toThrow();
});

it("revokes Window identity access after document close", () => {
	const { document, owner, navigator } = fixture();
	const retained = navigator.languages;
	document.close();
	expect(() => (owner.window as { navigator: object }).navigator).toThrow();
	expect(() => navigator.languages).toThrow();
	expect(retained).toEqual(["en-US"]);
	expect(Object.isFrozen(retained)).toBe(true);
});
