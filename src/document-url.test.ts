import { expect, it, vi } from "vitest";
import {
	canRewriteDocumentUrl,
	decodeUrlFragment,
	documentBaseTarget,
	documentBaseUrl,
	selectDocumentFragmentTarget,
	urlFragment,
} from "./document-url.js";
import { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { extractDocument } from "./extraction.js";
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

it("caches a successful first-base scan without visiting later nodes", () => {
	const tree = new DocumentTree("https://example.com/start");
	const base = tree.createElement("base", { href: "/base/" });
	const later = tree.createElement("base", { href: "/ignored/" });
	tree.append(tree.root, base);
	tree.append(tree.root, later);
	const walk = vi.spyOn(tree, "walk");
	const get = vi.spyOn(tree, "get");
	try {
		for (let attempt = 0; attempt < 3; attempt++)
			expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
		expect(walk).toHaveBeenCalledTimes(1);
		expect(get).not.toHaveBeenCalledWith(later);
	} finally {
		tree.close();
	}
});

it.each([false, true])(
	"caches absent bases in a populated=%s document",
	(populated) => {
		const tree = new DocumentTree("https://example.com/start?query#fragment");
		if (populated) {
			const paragraph = tree.createElement("p");
			tree.append(tree.root, paragraph);
			tree.append(paragraph, tree.createText("No base here"));
		}
		const walk = vi.spyOn(tree, "walk");
		try {
			expect(documentBaseUrl(tree)).toBe(tree.url);
			expect(documentBaseUrl(tree)).toBe(tree.url);
			expect(walk).toHaveBeenCalledTimes(1);
		} finally {
			tree.close();
		}
	},
);

it("keeps independent cached results for documents at the same revision", () => {
	const first = new DocumentTree("https://first.example/start");
	const second = new DocumentTree("https://second.example/start");
	for (const tree of [first, second])
		tree.append(tree.root, tree.createElement("base", { href: "relative/" }));
	const firstWalk = vi.spyOn(first, "walk");
	const secondWalk = vi.spyOn(second, "walk");
	try {
		expect(first.revision).toBe(second.revision);
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(documentBaseUrl(first)).toBe("https://first.example/relative/");
			expect(documentBaseUrl(second)).toBe("https://second.example/relative/");
		}
		expect(firstWalk).toHaveBeenCalledTimes(1);
		expect(secondWalk).toHaveBeenCalledTimes(1);
	} finally {
		first.close();
		second.close();
	}
});

it("invalidates cached absence and bases after href insertion, change and removal", () => {
	const tree = new DocumentTree("https://example.com/start");
	const base = tree.createElement("base");
	tree.append(tree.root, base);
	const walk = vi.spyOn(tree, "walk");
	try {
		expect(documentBaseUrl(tree)).toBe(tree.url);
		expect(documentBaseUrl(tree)).toBe(tree.url);
		expect(walk).toHaveBeenCalledTimes(1);
		for (const [index, href] of ["/first/", "/second/", undefined].entries()) {
			const revision = tree.revision;
			if (href === undefined) tree.removeAttribute(base, "href");
			else tree.setAttribute(base, "href", href);
			expect(tree.revision).toBeGreaterThan(revision);
			const expected =
				href === undefined ? tree.url : new URL(href, tree.url).href;
			expect(documentBaseUrl(tree)).toBe(expected);
			expect(documentBaseUrl(tree)).toBe(expected);
			expect(walk).toHaveBeenCalledTimes(index + 2);
		}
	} finally {
		tree.close();
	}
});

it.each(["http://[", "data:text/plain,example", "javascript:void(0)"])(
	"caches first-base fallback for %s without consulting a later base",
	(href) => {
		const tree = new DocumentTree("https://example.com/start");
		const first = tree.createElement("base", { href });
		const second = tree.createElement("base", { href: "/later/" });
		tree.append(tree.root, first);
		tree.append(tree.root, second);
		const walk = vi.spyOn(tree, "walk");
		try {
			expect(documentBaseUrl(tree)).toBe(tree.url);
			expect(documentBaseUrl(tree)).toBe(tree.url);
			expect(walk).toHaveBeenCalledTimes(1);
			tree.removeAttribute(first, "href");
			expect(documentBaseUrl(tree)).toBe("https://example.com/later/");
			expect(documentBaseUrl(tree)).toBe("https://example.com/later/");
			expect(walk).toHaveBeenCalledTimes(2);
		} finally {
			tree.close();
		}
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"ignores foreign base elements in %s before and after caching",
	(namespace) => {
		const tree = new DocumentTree("https://example.com/start");
		const foreign = tree.createParserElement(
			"base",
			{ href: "/foreign/" },
			namespace,
		);
		tree.append(tree.root, foreign);
		const walk = vi.spyOn(tree, "walk");
		try {
			expect(documentBaseUrl(tree)).toBe(tree.url);
			expect(documentBaseUrl(tree)).toBe(tree.url);
			expect(walk).toHaveBeenCalledTimes(1);
			const base = tree.createElement("base", { href: "/html/" });
			tree.append(tree.root, base);
			expect(documentBaseUrl(tree)).toBe("https://example.com/html/");
			expect(documentBaseUrl(tree)).toBe("https://example.com/html/");
			expect(walk).toHaveBeenCalledTimes(2);
			tree.setAttribute(foreign, "href", "/changed-foreign/");
			expect(documentBaseUrl(tree)).toBe("https://example.com/html/");
			expect(documentBaseUrl(tree)).toBe("https://example.com/html/");
			expect(walk).toHaveBeenCalledTimes(3);
		} finally {
			tree.close();
		}
	},
);

it("skips target-only bases but accepts an empty first href", () => {
	const tree = new DocumentTree("https://example.com/start?query#fragment");
	const first = tree.createElement("base", { target: "report" });
	const second = tree.createElement("base", { href: "/later/" });
	tree.append(tree.root, first);
	tree.append(tree.root, second);
	const walk = vi.spyOn(tree, "walk");
	try {
		expect(documentBaseUrl(tree)).toBe("https://example.com/later/");
		expect(documentBaseUrl(tree)).toBe("https://example.com/later/");
		expect(walk).toHaveBeenCalledTimes(1);
		tree.setAttribute(first, "href", "");
		expect(documentBaseUrl(tree)).toBe("https://example.com/start?query");
		expect(documentBaseUrl(tree)).toBe("https://example.com/start?query");
		expect(walk).toHaveBeenCalledTimes(2);
	} finally {
		tree.close();
	}
});

it("rescans in tree order after insertion, reparenting and subtree removal", () => {
	const tree = new DocumentTree("https://example.com/start");
	const early = tree.createElement("section");
	const late = tree.createElement("section");
	const first = tree.createElement("base", { href: "/first/" });
	const second = tree.createElement("base", { href: "/second/" });
	tree.append(tree.root, early);
	tree.append(tree.root, late);
	tree.append(late, first);
	tree.append(late, second);
	const walk = vi.spyOn(tree, "walk");
	try {
		const check = (expected: string, scans: number) => {
			expect(documentBaseUrl(tree)).toBe(expected);
			expect(documentBaseUrl(tree)).toBe(expected);
			expect(walk).toHaveBeenCalledTimes(scans);
		};
		check("https://example.com/first/", 1);
		tree.insert(late, second, first);
		check("https://example.com/second/", 2);
		tree.append(early, first);
		check("https://example.com/first/", 3);
		tree.remove(early);
		check("https://example.com/second/", 4);
		tree.remove(late);
		check(tree.url, 5);
	} finally {
		tree.close();
	}
});

it.each(["assets/", undefined, "http://["])(
	"invalidates href=%s resolution on same-document URL changes",
	(href) => {
		const tree = new DocumentTree("https://example.com/old/page");
		if (href !== undefined)
			tree.append(tree.root, tree.createElement("base", { href }));
		const walk = vi.spyOn(tree, "walk");
		try {
			expect(documentBaseUrl(tree)).toBe(
				href === "assets/" ? "https://example.com/old/assets/" : tree.url,
			);
			expect(walk).toHaveBeenCalledTimes(1);
			const revision = tree.revision;
			tree.setUrl("https://example.com/new/page?query#fragment");
			expect(tree.revision).toBeGreaterThan(revision);
			const expected =
				href === "assets/" ? "https://example.com/new/assets/" : tree.url;
			expect(documentBaseUrl(tree)).toBe(expected);
			expect(documentBaseUrl(tree)).toBe(expected);
			expect(walk).toHaveBeenCalledTimes(2);
		} finally {
			tree.close();
		}
	},
);

it.each(["attribute", "text", "presentation"])(
	"invalidates on unrelated %s revisions without selective mutation filtering",
	(mutation) => {
		const tree = new DocumentTree("https://example.com/start");
		const base = tree.createElement("base", { href: "/base/" });
		const paragraph = tree.createElement("p");
		const text = tree.createText("Before");
		tree.append(tree.root, base);
		tree.append(tree.root, paragraph);
		tree.append(paragraph, text);
		const walk = vi.spyOn(tree, "walk");
		try {
			expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
			const revision = tree.revision;
			if (mutation === "attribute")
				tree.setAttribute(paragraph, "title", "Changed");
			else if (mutation === "text") tree.setData(text, "After");
			else tree.invalidatePresentation("paint");
			expect(tree.revision).toBeGreaterThan(revision);
			expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
			expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
			expect(walk).toHaveBeenCalledTimes(2);
		} finally {
			tree.close();
		}
	},
);

it("retains cached results for no-op mutations and rejected URL changes", () => {
	const tree = new DocumentTree("https://example.com/start");
	const base = tree.createElement("base", { href: "/base/" });
	const text = tree.createText("Unchanged");
	tree.append(tree.root, base);
	tree.append(tree.root, text);
	const walk = vi.spyOn(tree, "walk");
	try {
		expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
		const revision = tree.revision;
		tree.setUrl("https://example.com:443/start");
		tree.setAttribute(base, "href", "/base/");
		tree.removeAttribute(base, "missing");
		tree.setData(text, "Unchanged");
		expect(() => tree.setUrl("https://other.example/start")).toThrow(
			"not permitted",
		);
		expect(tree.revision).toBe(revision);
		expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
		expect(walk).toHaveBeenCalledTimes(1);
	} finally {
		tree.close();
	}
});

it.each([false, true])(
	"does not cache a failed partial=%s traversal",
	(partial) => {
		const tree = new DocumentTree("https://example.com/start");
		const walk = vi.spyOn(tree, "walk");
		walk.mockImplementationOnce(function* () {
			if (partial) yield { node: tree.get(tree.root), depth: 0 };
			throw new Error("scan failed");
		});
		try {
			const revision = tree.revision;
			expect(() => documentBaseUrl(tree)).toThrow("scan failed");
			expect(tree.revision).toBe(revision);
			expect(documentBaseUrl(tree)).toBe(tree.url);
			expect(documentBaseUrl(tree)).toBe(tree.url);
			expect(walk).toHaveBeenCalledTimes(2);
		} finally {
			tree.close();
		}
	},
);

it("does not serve or replace a stale cached result when a rescan fails", () => {
	const tree = new DocumentTree("https://example.com/start");
	const base = tree.createElement("base", { href: "/before/" });
	tree.append(tree.root, base);
	const walk = vi.spyOn(tree, "walk");
	try {
		expect(documentBaseUrl(tree)).toBe("https://example.com/before/");
		tree.setAttribute(base, "href", "/after/");
		walk.mockImplementationOnce(() => {
			throw new Error("rescan failed");
		});
		expect(() => documentBaseUrl(tree)).toThrow("rescan failed");
		expect(documentBaseUrl(tree)).toBe("https://example.com/after/");
		expect(documentBaseUrl(tree)).toBe("https://example.com/after/");
		expect(walk).toHaveBeenCalledTimes(3);
	} finally {
		tree.close();
	}
});

it("does not cache a base when closing an early-base traversal fails", () => {
	const tree = new DocumentTree("https://example.com/start");
	const base = tree.createElement("base", { href: "/base/" });
	tree.append(tree.root, base);
	const walk = vi.spyOn(tree, "walk");
	walk.mockImplementationOnce(() => {
		const iterator = (function* () {
			yield { node: tree.get(base), depth: 1 };
		})();
		iterator.return = () => {
			throw new Error("scan cleanup failed");
		};
		return iterator;
	});
	try {
		expect(() => documentBaseUrl(tree)).toThrow("scan cleanup failed");
		expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
		expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
		expect(walk).toHaveBeenCalledTimes(2);
	} finally {
		tree.close();
	}
});

it.each([
	["empty", false],
	["empty", true],
	["populated", false],
	["populated", true],
	["base", false],
	["base", true],
] as const)(
	"rejects closed %s documents with cached=%s results",
	(kind, cached) => {
		const tree = new DocumentTree("https://example.com/start");
		if (kind === "populated") tree.append(tree.root, tree.createElement("p"));
		if (kind === "base")
			tree.append(tree.root, tree.createElement("base", { href: "/base/" }));
		if (cached)
			expect(documentBaseUrl(tree)).toBe(
				kind === "base" ? "https://example.com/base/" : tree.url,
			);
		const revision = tree.revision;
		tree.close();
		expect(tree.revision).toBe(revision);
		expect(() => documentBaseUrl(tree)).toThrow("closed");
		expect(() => documentBaseUrl(tree)).toThrow("closed");
	},
);

it("does not consume change or cleanup handlers when cleanup capacity is saturated", () => {
	const tree = new DocumentTree("https://example.com/start");
	const handlers = Array.from({ length: 64 }, () => vi.fn());
	for (const handler of handlers) tree.onClose(handler);
	const onClose = vi.spyOn(tree, "onClose");
	const onChange = vi.spyOn(tree, "onChange");
	const onMutation = vi.spyOn(tree, "onMutation");
	const walk = vi.spyOn(tree, "walk");
	try {
		expect(documentBaseUrl(tree)).toBe(tree.url);
		expect(documentBaseUrl(tree)).toBe(tree.url);
		tree.setUrl("https://example.com/updated");
		expect(documentBaseUrl(tree)).toBe(tree.url);
		expect(documentBaseUrl(tree)).toBe(tree.url);
		expect(walk).toHaveBeenCalledTimes(2);
		expect(onClose).not.toHaveBeenCalled();
		expect(onChange).not.toHaveBeenCalled();
		expect(onMutation).not.toHaveBeenCalled();
	} finally {
		tree.close();
	}
	for (const handler of handlers) expect(handler).toHaveBeenCalledTimes(1);
	expect(() => documentBaseUrl(tree)).toThrow("closed");
});

it("keeps link, form, snapshot and extraction resolution live after cached base changes", () => {
	const tree = new DocumentTree("https://example.com/start");
	const base = tree.createElement("base", {
		href: "/before/",
		target: "report",
	});
	const link = tree.createElement("a", { href: "next" });
	const form = tree.createElement("form", { action: "submit" });
	tree.append(tree.root, base);
	tree.append(tree.root, link);
	tree.append(link, tree.createText("Next"));
	tree.append(tree.root, form);
	const interactions = new DocumentInteractions(tree);
	const linkRef = tree.reference(link);
	const formRef = tree.reference(form);
	try {
		const check = (expectedBase: string, target: string) => {
			const expectedLink = new URL("next", expectedBase).href;
			const expectedForm = new URL("submit", expectedBase).href;
			expect(documentBaseUrl(tree)).toBe(expectedBase);
			expect(documentBaseUrl(tree)).toBe(expectedBase);
			expect(documentBaseTarget(tree)).toBe(target);
			expect(interactions.click(linkRef).defaultAction).toMatchObject({
				url: expectedLink,
				target,
			});
			expect(
				snapshotDocument(tree).entries.find((entry) => entry.ref === linkRef)
					?.href,
			).toBe(expectedLink);
			expect(prepareFormSubmission(tree, formRef)).toMatchObject({
				request: { url: expectedForm },
				target,
			});
			expect(extractDocument(tree).content).toContain(
				`[Next](<${expectedLink}>)`,
			);
			expect(
				JSON.stringify(extractDocument(tree, { format: "json" })),
			).toContain(`"url":"${expectedLink}"`);
		};
		check("https://example.com/before/", "report");
		tree.setAttribute(base, "href", "/after/");
		tree.setAttribute(base, "target", "unsafe\n<target");
		check("https://example.com/after/", "_blank");
		tree.remove(base);
		tree.setUrl("https://example.com/final/page");
		check(tree.url, "_self");
	} finally {
		tree.close();
	}
});

it.each(["change", "remove"])(
	"refreshes a warmed base inside href %s mutation callbacks before revision changes",
	(operation) => {
		const tree = new DocumentTree("https://example.com/start");
		const base = tree.createElement("base", { href: "/before/" });
		const later = tree.createElement("base", { href: "/later/" });
		tree.append(tree.root, base);
		tree.append(tree.root, later);
		const walk = vi.spyOn(tree, "walk");
		const observed: { revision: number; url: string; repeated: string }[] = [];
		try {
			expect(documentBaseUrl(tree)).toBe("https://example.com/before/");
			const revision = tree.revision;
			tree.onMutation(() => {
				observed.push({
					revision: tree.revision,
					url: documentBaseUrl(tree),
					repeated: documentBaseUrl(tree),
				});
			});
			if (operation === "change") tree.setAttribute(base, "href", "/after/");
			else tree.removeAttribute(base, "href");
			const expected =
				operation === "change"
					? "https://example.com/after/"
					: "https://example.com/later/";
			expect(observed).toEqual([
				{ revision, url: expected, repeated: expected },
			]);
			expect(tree.mutationMetrics().collectorFailures).toBe(0);
			expect(walk).toHaveBeenCalledTimes(2);
			expect(tree.revision).toBeGreaterThan(revision);
			expect(documentBaseUrl(tree)).toBe(expected);
			expect(documentBaseUrl(tree)).toBe(expected);
			expect(walk).toHaveBeenCalledTimes(3);
		} finally {
			tree.close();
		}
	},
);

it.each(["insert", "reorder", "remove"])(
	"refreshes a warmed base inside tree %s mutation callbacks before revision changes",
	(operation) => {
		const tree = new DocumentTree("https://example.com/start");
		const first = tree.createElement("base", { href: "/first/" });
		const second = tree.createElement("base", { href: "/second/" });
		const inserted = tree.createElement("base", { href: "/inserted/" });
		tree.append(tree.root, first);
		tree.append(tree.root, second);
		const walk = vi.spyOn(tree, "walk");
		const observed: {
			revision: number;
			notifications: number;
			url: string;
			repeated: string;
		}[] = [];
		try {
			expect(documentBaseUrl(tree)).toBe("https://example.com/first/");
			const revision = tree.revision;
			const notifications = tree.mutationMetrics().notifications;
			tree.onMutation(() => {
				observed.push({
					revision: tree.revision,
					notifications: tree.mutationMetrics().notifications,
					url: documentBaseUrl(tree),
					repeated: documentBaseUrl(tree),
				});
			});
			if (operation === "insert") tree.insert(tree.root, inserted, first);
			else if (operation === "reorder") tree.insert(tree.root, second, first);
			else tree.remove(first);
			const expected =
				operation === "insert"
					? ["https://example.com/inserted/"]
					: operation === "reorder"
						? ["https://example.com/first/", "https://example.com/second/"]
						: ["https://example.com/second/"];
			expect(observed).toEqual(
				expected.map((url, index) => ({
					revision,
					notifications: notifications + index + 1,
					url,
					repeated: url,
				})),
			);
			expect(tree.mutationMetrics().collectorFailures).toBe(0);
			expect(walk).toHaveBeenCalledTimes(expected.length + 1);
			expect(tree.revision).toBeGreaterThan(revision);
			expect(documentBaseUrl(tree)).toBe(expected.at(-1));
			expect(documentBaseUrl(tree)).toBe(expected.at(-1));
			expect(walk).toHaveBeenCalledTimes(expected.length + 2);
		} finally {
			tree.close();
		}
	},
);

it("invalidates on no-op mutation notifications even when revision stays fixed", () => {
	const tree = new DocumentTree("https://example.com/start");
	const base = tree.createElement("base", { href: "/base/" });
	tree.append(tree.root, base);
	const walk = vi.spyOn(tree, "walk");
	const observed: string[] = [];
	try {
		expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
		const revision = tree.revision;
		const notifications = tree.mutationMetrics().notifications;
		tree.onMutation(() => {
			observed.push(documentBaseUrl(tree), documentBaseUrl(tree));
		});
		tree.setAttribute(base, "href", "/base/");
		expect(tree.revision).toBe(revision);
		expect(tree.mutationMetrics().notifications).toBe(notifications + 1);
		expect(observed).toEqual([
			"https://example.com/base/",
			"https://example.com/base/",
		]);
		expect(documentBaseUrl(tree)).toBe("https://example.com/base/");
		expect(walk).toHaveBeenCalledTimes(2);
	} finally {
		tree.close();
	}
});
