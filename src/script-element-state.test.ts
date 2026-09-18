import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import {
	cloneScriptElementState,
	completeParserScriptElement,
	initializeParserScriptElement,
	initializeScriptElement,
	markScriptElementStarted,
	scriptElementAsync,
	scriptElementState,
	setScriptElementAsync,
} from "./script-element-state.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(origin: "dynamic" | "parser" | "inert" = "dynamic") {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	const id = tree.createElement("script");
	initializeScriptElement(tree, id, origin);
	return { tree, id };
}

it("distinguishes unregistered, dynamic and parser defaults without inferring origin from absent async", () => {
	const dynamic = fixture();
	const parser = fixture("parser");
	expect(scriptElementAsync(dynamic.tree, dynamic.id)).toBe(true);
	expect(scriptElementAsync(parser.tree, parser.id)).toBe(false);
	const unknown = dynamic.tree.createElement("script");
	expect(scriptElementState(dynamic.tree, unknown)).toEqual({
		origin: "unknown",
		forceAsync: true,
		alreadyStarted: false,
		parserNonceEligibility: "untrusted",
	});
	setScriptElementAsync(dynamic.tree, unknown, false);
	expect(scriptElementState(dynamic.tree, unknown).origin).toBe("unknown");
});

it("implements the async IDL setter and boolean content-attribute semantics", () => {
	const { tree, id } = fixture();
	setScriptElementAsync(tree, id, false);
	expect(scriptElementAsync(tree, id)).toBe(false);
	expect(tree.get(id).attributes.async).toBeUndefined();
	expect(scriptElementState(tree, id).forceAsync).toBe(false);
	setScriptElementAsync(tree, id, true);
	expect(tree.get(id).attributes.async).toBe("");
	expect(scriptElementAsync(tree, id)).toBe(true);
	tree.setAttribute(id, "async", "false");
	expect(scriptElementAsync(tree, id)).toBe(true);
	tree.removeAttribute(id, "async");
	expect(scriptElementAsync(tree, id)).toBe(false);
});

it("clears force-async when the async attribute is added but not when an absent attribute is removed", () => {
	const { tree, id } = fixture();
	tree.removeAttribute(id, "async");
	expect(scriptElementAsync(tree, id)).toBe(true);
	tree.setAttribute(id, "async", "");
	tree.removeAttribute(id, "async");
	expect(scriptElementAsync(tree, id)).toBe(false);
	expect(scriptElementState(tree, id).forceAsync).toBe(false);
});

it("keeps initialization idempotent and started state monotonic", () => {
	const { tree, id } = fixture();
	setScriptElementAsync(tree, id, false);
	initializeScriptElement(tree, id, "dynamic");
	expect(scriptElementAsync(tree, id)).toBe(false);
	expect(markScriptElementStarted(tree, id)).toBe(true);
	expect(markScriptElementStarted(tree, id)).toBe(false);
	initializeScriptElement(tree, id, "dynamic");
	expect(scriptElementState(tree, id).alreadyStarted).toBe(true);
	const snapshot = scriptElementState(tree, id);
	expect(Object.isFrozen(snapshot)).toBe(true);
});

it("does not reactivate inert scripts or claim unknown scripts through the async setter", () => {
	const { tree, id } = fixture("inert");
	setScriptElementAsync(tree, id, true);
	expect(() => initializeScriptElement(tree, id, "dynamic")).toThrow(/origin/);
	expect(scriptElementState(tree, id).origin).toBe("inert");
	const unknown = tree.createElement("script");
	setScriptElementAsync(tree, unknown, false);
	expect(scriptElementState(tree, unknown).origin).toBe("unknown");
});

it("copies already-started state without inheriting parser defaults or sharing mutable state", () => {
	const source = fixture("parser");
	const destination = fixture();
	markScriptElementStarted(source.tree, source.id);
	cloneScriptElementState(
		source.tree,
		source.id,
		destination.tree,
		destination.id,
	);
	expect(scriptElementState(destination.tree, destination.id)).toEqual({
		origin: "dynamic",
		forceAsync: true,
		alreadyStarted: true,
		parserNonceEligibility: "cloned",
	});
	setScriptElementAsync(destination.tree, destination.id, false);
	expect(scriptElementAsync(source.tree, source.id)).toBe(false);
	expect(scriptElementState(source.tree, source.id).origin).toBe("parser");
});

it("keeps unknown-source and inert-source clones inert", () => {
	const source = fixture("inert");
	for (const sourceId of [source.id, source.tree.createElement("script")]) {
		const destination = source.tree.createElement("script");
		cloneScriptElementState(source.tree, sourceId, source.tree, destination);
		expect(scriptElementState(source.tree, destination).origin).toBe("inert");
	}
});

it("uses one document cleanup hook and collector, then rejects all access after close", () => {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	const close = vi.spyOn(tree, "onClose");
	const baseline = tree.mutationMetrics().collectors;
	let last = 0;
	for (let index = 0; index < 100; index++) {
		last = tree.createElement("script");
		initializeScriptElement(tree, last, "dynamic");
	}
	expect(close).toHaveBeenCalledTimes(1);
	expect(tree.mutationMetrics().collectors).toBe(baseline + 1);
	tree.close();
	expect(tree.mutationMetrics().collectors).toBe(0);
	expect(() => scriptElementState(tree, last)).toThrow(/closed/);
	expect(() => setScriptElementAsync(tree, last, false)).toThrow(/closed/);
	expect(() => initializeScriptElement(tree, last, "dynamic")).toThrow(
		/closed/,
	);
});

it("validates node ownership, HTML script kind, setter types and origin", () => {
	const { tree, id } = fixture();
	const other = fixture();
	expect(() => scriptElementState(other.tree, id)).toThrow();
	expect(() => scriptElementState(tree, tree.createElement("div"))).toThrow(
		/script/,
	);
	expect(() =>
		setScriptElementAsync(tree, id, "false" as unknown as boolean),
	).toThrow();
	expect(() =>
		initializeScriptElement(tree, id, "unknown" as "dynamic"),
	).toThrow();
});

it("rolls back collector registration when cleanup-hook admission fails", () => {
	const tree = new DocumentTree("https://example.com/");
	documents.push(tree);
	for (let index = 0; index < 64; index++) tree.onClose(() => {});
	const id = tree.createElement("script");
	expect(() => initializeScriptElement(tree, id, "dynamic")).toThrow(/limit/);
	expect(tree.mutationMetrics().collectors).toBe(0);
});

it("does not claim unknown or inert scripts as started", () => {
	const { tree, id } = fixture("inert");
	expect(markScriptElementStarted(tree, id)).toBe(false);
	const unknown = tree.createElement("script");
	expect(markScriptElementStarted(tree, unknown)).toBe(false);
	expect(scriptElementState(tree, unknown).alreadyStarted).toBe(false);
});

it("requires one-shot tokenizer ownership and matching completion without changing async or started state", () => {
	const { tree } = fixture();
	const input = new HtmlTokenizer(
		'<script nonce="synthetic"></script>',
		() => {},
	);
	const id = tree.createParserElement("script", { nonce: "synthetic" });
	const token = input.next();
	initializeParserScriptElement(tree, id, token);
	expect(scriptElementState(tree, id)).toEqual({
		origin: "parser",
		forceAsync: false,
		alreadyStarted: false,
		parserNonceEligibility: "pending",
	});
	setScriptElementAsync(tree, id, true);
	completeParserScriptElement(tree, id, input.next());
	expect(scriptElementState(tree, id)).toEqual({
		origin: "parser",
		forceAsync: false,
		alreadyStarted: false,
		parserNonceEligibility: "eligible",
	});
	expect(scriptElementAsync(tree, id)).toBe(true);
	expect(Object.keys(scriptElementState(tree, id))).not.toContain(
		"parserTokenOwner",
	);
	const reused = tree.createParserElement("script", { nonce: "synthetic" });
	initializeParserScriptElement(tree, reused, token);
	expect(scriptElementState(tree, reused).parserNonceEligibility).toBe(
		"untrusted",
	);
	expect(() => initializeParserScriptElement(tree, id, input.next())).toThrow(
		/provenance/,
	);
	initializeScriptElement(tree, id, "parser");
	expect(scriptElementState(tree, id).parserNonceEligibility).toBe("eligible");
});

it("does not accept fabricated metadata or a closing token from another tokenizer", () => {
	const { tree } = fixture();
	const fabricated = tree.createElement("script");
	const getter = vi.fn(() => true);
	initializeParserScriptElement(
		tree,
		fabricated,
		new Proxy({ nonceable: true }, { get: getter }),
	);
	expect(scriptElementState(tree, fabricated).parserNonceEligibility).toBe(
		"untrusted",
	);
	expect(getter).not.toHaveBeenCalled();
	const id = tree.createElement("script");
	const input = new HtmlTokenizer("<script></script>", () => {});
	initializeParserScriptElement(tree, id, input.next());
	completeParserScriptElement(
		tree,
		id,
		new HtmlTokenizer("</script>", () => {}).next(),
	);
	expect(scriptElementState(tree, id).parserNonceEligibility).toBe(
		"ineligible",
	);
	completeParserScriptElement(tree, id, input.next());
	expect(scriptElementState(tree, id).parserNonceEligibility).toBe(
		"ineligible",
	);
});

it.each([
	'nonce="synthetic" NONCE="synthetic"',
	'title="<SCRIPT"',
	'title="&lt;style"',
])("cannot clear tokenizer refusal for %s", (attributes) => {
	const { tree } = fixture();
	const input = new HtmlTokenizer(`<script ${attributes}></script>`, () => {});
	const id = tree.createElement("script");
	initializeParserScriptElement(tree, id, input.next());
	tree.setAttribute(id, "nonce", "synthetic");
	tree.removeAttribute(id, "title");
	completeParserScriptElement(tree, id, input.next());
	expect(scriptElementState(tree, id).parserNonceEligibility).toBe(
		"ineligible",
	);
	expect(() =>
		initializeParserScriptElement(
			tree,
			id,
			new HtmlTokenizer("<script>", () => {}).next(),
		),
	).toThrow(/provenance/);
});

it("never transfers parser trust through cloning, importing, inert transitions or document closure", () => {
	const { tree } = fixture();
	const input = new HtmlTokenizer("<script></script>", () => {});
	const source = tree.createElement("script");
	initializeParserScriptElement(tree, source, input.next());
	completeParserScriptElement(tree, source, input.next());
	for (const targetTree of [tree, fixture().tree]) {
		const copy = targetTree.copyFrom(tree, source);
		cloneScriptElementState(tree, source, targetTree, copy);
		expect(scriptElementState(targetTree, copy).parserNonceEligibility).toBe(
			"cloned",
		);
	}
	initializeScriptElement(tree, source, "inert");
	expect(scriptElementState(tree, source).parserNonceEligibility).toBe(
		"ineligible",
	);
	tree.close();
	expect(() => completeParserScriptElement(tree, source, input.next())).toThrow(
		/closed/,
	);
});
