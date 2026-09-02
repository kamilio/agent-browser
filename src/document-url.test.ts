import { expect, it } from "vitest";
import {
	canRewriteDocumentUrl,
	decodeUrlFragment,
	documentBaseTarget,
	documentBaseUrl,
	selectDocumentFragmentTarget,
	urlFragment,
} from "./document-url.js";
import { DocumentTree } from "./document.js";
import { prepareFormSubmission } from "./forms.js";
import { DocumentInteractions } from "./interactions.js";
import { snapshotDocument } from "./snapshot.js";

it.each([
	["https://example.com/a", "https://example.com/b?q=1#x", true],
	["https://example.com/a", "https://example.com:443/b", true],
	["https://example.com/a", "http://example.com/a", false],
	["https://example.com/a", "https://other.test/a", false],
	["https://example.com/a", "https://example.com:444/a", false],
	["https://example.com/a", "https://user:secret@example.com/a", false],
	["file:///path/a", "file:///path/a?q=1#x", true],
	["file:///path/a", "file:///path/b", false],
	["about:blank", "about:blank#x", true],
	["about:blank", "about:blank?q=1", false],
	["about:blank", "about:srcdoc", false],
	["data:text/html,hello", "data:text/html,hello#x", true],
	["data:text/html,hello", "data:text/html,other", false],
	["blob:https://example.com/id", "blob:https://example.com/id#x", true],
	["blob:https://example.com/id", "blob:https://example.com/other", false],
] as [string, string, boolean][])(
	"checks URL rewrite %s -> %s",
	(current, next, expected) => {
		expect(canRewriteDocumentUrl(new URL(current), new URL(next))).toBe(
			expected,
		);
	},
);

it("updates same-document URLs without changing refs or silently permitting origin changes", () => {
	const tree = new DocumentTree("https://example.com/a");
	const link = tree.createElement("a", { href: "next" });
	tree.append(tree.root, link);
	const reference = tree.reference(link);
	const revision = tree.revision;
	tree.setUrl("https://example.com/updated/#fragment");
	expect(tree.resolve(reference).id).toBe(link);
	expect(tree.changesSince(revision).changes).toEqual([
		{ revision: revision + 1, kind: "location", target: tree.root },
	]);
	expect(
		snapshotDocument(tree).entries.find((entry) => entry.ref === reference)
			?.href,
	).toBe("https://example.com/updated/next");
	tree.setUrl(tree.url);
	expect(tree.revision).toBe(revision + 1);
	expect(() => tree.setUrl("https://other.test/")).toThrow("not permitted");
	expect(() => tree.setUrl("relative")).toThrow("Invalid");
	expect(() => tree.setUrl(`https://example.com/${"日".repeat(3000)}`)).toThrow(
		"URL limit",
	);
	tree.close();
	expect(() => tree.setUrl("https://example.com/")).toThrow("closed");
});

it("shares the first base URL and target across links, forms and snapshots", () => {
	const tree = new DocumentTree("https://example.com/start");
	const base = tree.createElement("base", { href: "/base/", target: "report" });
	tree.append(tree.root, base);
	const later = tree.createElement("base", {
		href: "/ignored/",
		target: "ignored",
	});
	tree.append(tree.root, later);
	const link = tree.createElement("a", { href: "next" });
	tree.append(tree.root, link);
	const form = tree.createElement("form", { action: "submit" });
	tree.append(tree.root, form);
	const interactions = new DocumentInteractions(tree);
	expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
	expect(documentBaseTarget(tree)).toBe("report");
	expect(interactions.click(tree.reference(link)).defaultAction).toMatchObject({
		url: "https://example.com/base/next",
		target: "report",
	});
	expect(
		snapshotDocument(tree).entries.find(
			(entry) => entry.ref === tree.reference(link),
		)?.href,
	).toBe("https://example.com/base/next");
	expect(prepareFormSubmission(tree, tree.reference(form))).toMatchObject({
		request: { url: "https://example.com/base/submit" },
		target: "report",
	});
	tree.setAttribute(form, "target", "");
	expect(prepareFormSubmission(tree, tree.reference(form)).target).toBe(
		"_self",
	);
	tree.setAttribute(base, "target", "unsafe\n<target");
	expect(documentBaseTarget(tree)).toBe("_blank");
});

it("does not use later bases when the first href is invalid or a prohibited base scheme", () => {
	const tree = new DocumentTree("https://example.com/start");
	const first = tree.createElement("base", { href: "http://[" });
	const second = tree.createElement("base", { href: "/other" });
	tree.append(tree.root, first);
	tree.append(tree.root, second);
	for (const href of [
		"http://[",
		"data:text/plain,example",
		"javascript:void(0)",
	]) {
		tree.setAttribute(first, "href", href);
		expect(documentBaseUrl(tree)).toBe(tree.url);
	}
	tree.remove(first);
	expect(documentBaseUrl(tree)).toBe("https://example.com/other");
});

it("distinguishes an empty fragment from no fragment and decodes without form-style plus conversion", () => {
	expect(urlFragment(new URL("https://example.com/"))).toBeNull();
	expect(urlFragment(new URL("https://example.com/#"))).toBe("");
	expect(decodeUrlFragment("a+b&c=%E6%97%A5")).toBe("a+b&c=日");
	expect(decodeUrlFragment("%E9")).toBe("�");
	expect(decodeUrlFragment("%zz")).toBe("%zz");
});

it("prefers raw fragment matches before decoded matches and preserves the selected element across ID changes", () => {
	const tree = new DocumentTree("https://example.com/#%61");
	const decoded = tree.createElement("div", { id: "a" });
	const raw = tree.createElement("div", { id: "%61" });
	tree.append(tree.root, decoded);
	tree.append(tree.root, raw);
	expect(selectDocumentFragmentTarget(tree)).toBe(raw);
	tree.setTargetElement(raw);
	tree.setAttribute(raw, "id", "renamed");
	expect(tree.targetElement).toBe(raw);
	expect(selectDocumentFragmentTarget(tree)).toBe(decoded);
	tree.close();
	expect(tree.targetElement).toBeNull();
	expect(() => selectDocumentFragmentTarget(tree)).toThrow("closed");
});
