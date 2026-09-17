import { afterEach, describe, expect, it, vi } from "vitest";
import { browserChallengeStructure } from "./browser-challenge-structure.js";
import { type DocumentNode, DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { htmlParseInfo, initializeHtmlScripting } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";

const marker = "behavioral-challenge-shell-v1";
const url = "https://structure.fixture.invalid/";
const documents: DocumentTree[] = [];
const shell = `<div id="sec-if-cpt-container" role="main" style="display:none">
<div class="behavioral-content">
<div id="sec-bc-text-container">Complete the interaction</div>
<div id="sec-bc-tile-parent"><div id="sec-bc-tile-container"></div></div>
<div class="behavioral-button"><div id="progress-button" role="button" disabled>Continue</div><div class="progress"></div></div>
</div>
<div class="branding"><svg><title>Logo</title><path d="M0 0"></path></svg><a href="/privacy">Privacy</a></div>
</div>`;

function fixture(body = shell, head = "<title></title>", scripting = false) {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head>${head}</head><body><script>void 0;</script>${body}<script src="/shell.js"></script></body></html>`,
		url,
		{ initializeDocument: (tree) => initializeHtmlScripting(tree, scripting) },
	);
	documents.push(tree);
	return tree;
}

function find(
	tree: DocumentTree,
	predicate: (node: Readonly<DocumentNode>) => boolean,
) {
	for (const { node } of tree.walk()) if (predicate(node)) return node.id;
	throw new Error("Missing synthetic fixture node");
}

function byId(tree: DocumentTree, id: string) {
	return find(tree, (node) => node.attributes.id === id);
}

function bodyId(tree: DocumentTree) {
	return find(tree, (node) => node.tagName === "body");
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

describe("bounded behavioral challenge structure", () => {
	it.each([
		'<script title="',
		"<script>unfinished",
		"<style>unfinished",
		"<!--unfinished",
		"<!unfinished",
		"<!DOCTYPE html",
		'<!DOCTYPE html PUBLIC "unfinished',
	])(
		"rejects a complete marker set followed by an incomplete token %#",
		(tail) => {
			const tree = parseHtmlDocument(
				`<!doctype html><html><head></head><body>${shell}${tail}`,
				url,
			);
			documents.push(tree);
			const before = serializeHtml(tree);
			expect(browserChallengeStructure(tree)).toBeUndefined();
			expect(serializeHtml(tree)).toBe(before);
		},
	);
	it.each([false, true])(
		"recognizes the hidden structural conjunction with scripting %s",
		(scripting) => {
			expect(
				browserChallengeStructure(fixture(shell, "<title></title>", scripting)),
			).toBe(marker);
		},
	);

	it.each(["", "<title></title>", "<title> \t\n\r\f </title>"])(
		"accepts an absent or ASCII-empty title %#",
		(head) => {
			expect(browserChallengeStructure(fixture(shell, head))).toBe(marker);
		},
	);

	it.each([
		"display:none",
		"display: none;",
		" DISPLAY : NONE ; ",
		"display:none !important",
		"\tdisplay\n:\fnone ! important;\r",
	])("accepts the conservative hidden style %#", (style) => {
		expect(
			browserChallengeStructure(fixture(shell.replace("display:none", style))),
		).toBe(marker);
	});

	it("accepts class tokens, neutral div wrappers and progress inside the disabled control", () => {
		const html = shell
			.replace(
				'class="behavioral-content"',
				'class="extra behavioral-content behavioral-content"',
			)
			.replace(
				'<div id="sec-bc-tile-parent">',
				'<div><div id="sec-bc-tile-parent">',
			)
			.replace(
				'<div id="sec-bc-tile-container"></div></div>',
				'<div id="sec-bc-tile-container"></div></div></div>',
			)
			.replace(
				'disabled>Continue</div><div class="progress"></div>',
				'disabled><div class="progress"></div>Continue</div>',
			);
		expect(browserChallengeStructure(fixture(html))).toBe(marker);
	});

	it("does not require branding, scripts or vendor text", () => {
		const tree = fixture();
		for (const { node } of [...tree.walk()]) {
			if (node.tagName === "script" || node.attributes.class === "branding")
				tree.remove(node.id);
			else if (node.kind === "text") tree.setTextContent(node.id, "");
		}
		expect(browserChallengeStructure(tree)).toBe(marker);
	});

	it.each(["empty", "absent"])(
		"retains recognition when raw-policy script nodes are %s",
		(mode) => {
			const tree = fixture();
			const scripts = [...tree.walk()]
				.filter(({ node }) => node.tagName === "script")
				.map(({ node }) => node.id);
			for (const script of scripts) {
				if (mode === "empty") tree.setTextContent(script, "");
				else tree.remove(script);
			}
			expect(browserChallengeStructure(tree)).toBe(marker);
		},
	);

	it.each([
		{ id: "sec-if-cpt-container", attribute: "style" },
		{ id: "progress-button", attribute: "disabled" },
	])(
		"does not infer source evidence when a reader omitted $attribute",
		({ id, attribute }) => {
			const tree = fixture();
			tree.removeAttribute(byId(tree, id), attribute);
			expect(browserChallengeStructure(tree)).toBeUndefined();
		},
	);

	it.each([
		"sec-if-cpt-container",
		"sec-bc-text-container",
		"sec-bc-tile-parent",
		"sec-bc-tile-container",
		"progress-button",
		"behavioral-content",
		"behavioral-button",
		"progress",
	])("requires every marker: %s", (name) => {
		const html = shell.replace(`="${name}"`, `="ordinary-${name}"`);
		expect(browserChallengeStructure(fixture(html))).toBeUndefined();
	});

	it.each([
		{ name: "root role", from: 'role="main"', to: 'role="region"' },
		{ name: "button role", from: 'role="button"', to: 'role="link"' },
		{ name: "disabled marker", from: " disabled", to: "" },
		{
			name: "class substring",
			from: 'class="behavioral-content"',
			to: 'class="not-behavioral-content"',
		},
		{ name: "class case", from: 'class="progress"', to: 'class="Progress"' },
		{
			name: "duplicate source attributes",
			from: 'role="main"',
			to: 'role="main" role="region"',
		},
	])("rejects missing or ambiguous $name", ({ from, to }) => {
		expect(
			browserChallengeStructure(fixture(shell.replace(from, to))),
		).toBeUndefined();
	});

	it.each([
		"",
		"display:block",
		"visibility:hidden",
		"display:none;display:block",
		"display:block;display:none",
		"display:var(--hidden)",
		"display:/**/none",
		"display:none;color:red",
		"display:none!important!important",
	])("rejects unsupported or ambiguous hiding %#", (style) => {
		expect(
			browserChallengeStructure(fixture(shell.replace("display:none", style))),
		).toBeUndefined();
	});

	it.each(["Article", "&#160;", "<b></b>", "<!--empty?-->"])(
		"rejects a nonempty title even when hidden %#",
		(title) => {
			expect(
				browserChallengeStructure(
					fixture(shell, `<title hidden>${title}</title>`),
				),
			).toBeUndefined();
		},
	);

	it("rejects duplicate empty title elements", () => {
		expect(
			browserChallengeStructure(
				fixture(shell, "<title></title><title></title>"),
			),
		).toBeUndefined();
	});

	it.each([
		"Visible article text",
		"<main><h1>Article</h1><p>Useful public content.</p></main>",
		'<img src="/article.png" alt="Article">',
		"<iframe src='/article'></iframe>",
		"<input value='Search'>",
		"<canvas></canvas>",
		"<video></video>",
		"<svg><path></path></svg>",
		"<div></div>",
		"<div hidden>Unrelated hidden content</div>",
	])("rejects extra body content before or after the widget %#", (sibling) => {
		expect(browserChallengeStructure(fixture(sibling + shell))).toBeUndefined();
		expect(browserChallengeStructure(fixture(shell + sibling))).toBeUndefined();
	});

	it("accepts only inert metadata, comments and ASCII whitespace beside the root", () => {
		expect(
			browserChallengeStructure(
				fixture(` \t<!-- explanation -->${shell}\n<meta name="x" content="y">`),
			),
		).toBe(marker);
	});

	it.each([
		"sec-if-cpt-container",
		"sec-bc-text-container",
		"sec-bc-tile-parent",
		"sec-bc-tile-container",
		"progress-button",
	])("rejects duplicate marker ID %s anywhere in the connected tree", (id) => {
		const tree = fixture();
		tree.append(
			byId(tree, "sec-if-cpt-container"),
			tree.createElement("div", { id }),
		);
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it.each(["behavioral-content", "behavioral-button", "progress"])(
		"rejects ambiguous repeated marker class %s",
		(className) => {
			const tree = fixture();
			tree.append(
				byId(tree, "sec-if-cpt-container"),
				tree.createElement("div", { class: className }),
			);
			expect(browserChallengeStructure(tree)).toBeUndefined();
		},
	);

	it.each([
		{ child: "sec-bc-tile-container", parent: "sec-bc-text-container" },
		{ child: "sec-bc-text-container", parent: "sec-if-cpt-container" },
		{ child: "sec-bc-tile-parent", parent: "sec-if-cpt-container" },
		{ child: "progress-button", parent: "sec-bc-tile-container" },
	])("rejects incomplete ancestry $child -> $parent", ({ child, parent }) => {
		const tree = fixture();
		tree.append(byId(tree, parent), byId(tree, child));
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it("rejects progress outside the behavioral button container", () => {
		const tree = fixture();
		tree.append(
			byId(tree, "sec-if-cpt-container"),
			find(tree, (node) => node.attributes.class === "progress"),
		);
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it.each([
		"template",
		"noscript",
		"script",
		"style",
		"textarea",
		"xmp",
		"pre",
		"code",
	])("ignores examples enclosed in %s", (tagName) => {
		expect(
			browserChallengeStructure(fixture(`<${tagName}>${shell}</${tagName}>`)),
		).toBeUndefined();
	});

	it("ignores escaped markup and comments instead of scanning their contents", () => {
		const escaped = shell
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;");
		expect(browserChallengeStructure(fixture(escaped))).toBeUndefined();
		expect(
			browserChallengeStructure(fixture(`<!--${shell}-->`)),
		).toBeUndefined();
	});

	it("does not interpret marker strings inside scripts or comments as duplicate elements", () => {
		expect(
			browserChallengeStructure(
				fixture(
					`${shell}<script>${JSON.stringify(shell)}</script><!--${shell}-->`,
				),
			),
		).toBe(marker);
	});

	it.each([svgNamespace, mathmlNamespace])(
		"rejects foreign-namespace marker elements in %s",
		(namespaceURI) => {
			for (const name of [
				"sec-if-cpt-container",
				"sec-bc-text-container",
				"sec-bc-tile-parent",
				"sec-bc-tile-container",
				"progress-button",
			]) {
				const tree = fixture();
				const previous = byId(tree, name);
				const node = tree.get(previous);
				const replacement = tree.createParserElement(
					"div",
					{ ...node.attributes },
					namespaceURI,
				);
				for (const child of [...node.children]) tree.append(replacement, child);
				if (node.parent === null) throw new Error("Missing fixture parent");
				tree.replace(node.parent, replacement, previous);
				expect(browserChallengeStructure(tree)).toBeUndefined();
			}
		},
	);

	it("rejects duplicate IDs even on foreign logo descendants", () => {
		const tree = fixture();
		const logo = find(tree, (node) => node.tagName === "svg");
		tree.append(
			logo,
			tree.createParserElement(
				"g",
				{ id: "sec-bc-tile-container" },
				svgNamespace,
			),
		);
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it("rejects HTML markers beneath a foreign integration-point ancestor", () => {
		const tree = fixture();
		const content = find(
			tree,
			(node) => node.attributes.class === "behavioral-content",
		);
		const wrapper = tree.createParserElement("foreignObject", {}, svgNamespace);
		tree.append(byId(tree, "sec-if-cpt-container"), wrapper);
		tree.append(wrapper, content);
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it("accepts exactly 512 retained nodes, then refuses over-budget trees before reading nodes", () => {
		const tree = fixture();
		const body = bodyId(tree);
		while (tree.nodeCount < 512) tree.append(body, tree.createComment(""));
		expect(browserChallengeStructure(tree)).toBe(marker);
		tree.append(body, tree.createComment(""));
		const read = vi.spyOn(tree, "get");
		expect(browserChallengeStructure(tree)).toBeUndefined();
		expect(read).not.toHaveBeenCalled();
	});

	it("includes detached allocations in the conservative whole-document node budget", () => {
		const tree = fixture();
		while (tree.nodeCount <= 512) tree.createElement("div");
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it("accepts depth 32 but refuses depth 33 even inside the hidden root", () => {
		const tree = fixture();
		let parent = byId(tree, "sec-if-cpt-container");
		let depth = [...tree.walk()].find(({ node }) => node.id === parent)?.depth;
		if (depth === undefined) throw new Error("Missing fixture root");
		while (depth++ < 32) {
			const child = tree.createElement("div");
			tree.append(parent, child);
			parent = child;
		}
		expect(browserChallengeStructure(tree)).toBe(marker);
		tree.append(parent, tree.createElement("div"));
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it("caps attribute count and individual attribute name/value units", () => {
		const tree = fixture();
		const root = byId(tree, "sec-if-cpt-container");
		tree.setAttribute(
			root,
			"data-extra",
			"x".repeat(1024 - "data-extra".length),
		);
		expect(browserChallengeStructure(tree)).toBe(marker);
		tree.setAttribute(
			root,
			"data-extra",
			"x".repeat(1025 - "data-extra".length),
		);
		expect(browserChallengeStructure(tree)).toBeUndefined();
		tree.removeAttribute(root, "data-extra");
		for (let index = 0; index < 29; index++)
			tree.setAttribute(root, `data-${index}`, "");
		expect(browserChallengeStructure(tree)).toBe(marker);
		tree.setAttribute(root, "data-overflow", "");
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it("bounds cumulative inspected units without scanning script or comment contents", () => {
		const tree = fixture();
		const root = byId(tree, "sec-if-cpt-container");
		const script = find(tree, (node) => node.tagName === "script");
		tree.setTextContent(script, "x".repeat(65_536));
		expect(browserChallengeStructure(tree)).toBe(marker);
		tree.append(root, tree.createText("x".repeat(32_768)));
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it("bounds snapshot work using retained text units before reading nodes", () => {
		const tree = fixture();
		const script = find(tree, (node) => node.tagName === "script");
		tree.setTextContent(script, "x".repeat(1_000_001));
		const read = vi.spyOn(tree, "get");
		expect(browserChallengeStructure(tree)).toBeUndefined();
		expect(read).not.toHaveBeenCalled();
	});

	it.each([
		"cycle",
		"duplicate-child",
		"missing-child",
		"wrong-parent",
		"throw",
	])("returns undefined for malformed tree access: %s", (kind) => {
		const tree = fixture();
		const root = byId(tree, "sec-if-cpt-container");
		const original = tree.get.bind(tree);
		vi.spyOn(tree, "get").mockImplementation((id) => {
			const node = original(id);
			if (id !== root) return node;
			if (kind === "throw") throw new Error("Synthetic unreadable tree");
			if (kind === "wrong-parent") return { ...node, parent: tree.root };
			const extra =
				kind === "cycle"
					? root
					: kind === "duplicate-child"
						? node.children[0]
						: Number.MAX_SAFE_INTEGER;
			return { ...node, children: [...node.children, extra] };
		});
		expect(browserChallengeStructure(tree)).toBeUndefined();
	});

	it("does not recognize closed or incomplete documents", () => {
		const tree = fixture();
		tree.close();
		expect(browserChallengeStructure(tree)).toBeUndefined();
		const empty = new DocumentTree(url);
		documents.push(empty);
		expect(browserChallengeStructure(empty)).toBeUndefined();
	});

	it.each([false, true])(
		"preserves markup, revisions, resources and mutation observers (negative: %s)",
		(negative) => {
			const tree = fixture(
				negative ? `${shell}<article>Real content</article>` : shell,
			);
			const changed = vi.fn();
			const mutated = vi.fn();
			const unsubscribeChange = tree.onChange(changed);
			const unsubscribeMutation = tree.onMutation(mutated);
			const revision = tree.revision;
			const before = {
				markup: serializeHtml(tree),
				usage: tree.resourceUsage(),
				metrics: tree.mutationMetrics(),
				info: htmlParseInfo(tree),
			};
			for (let repeat = 0; repeat < 3; repeat++)
				expect(browserChallengeStructure(tree)).toBe(
					negative ? undefined : marker,
				);
			expect(serializeHtml(tree)).toBe(before.markup);
			expect(tree.revision).toBe(revision);
			expect(tree.changesSince(revision).changes).toEqual([]);
			expect(tree.resourceUsage()).toEqual(before.usage);
			expect(tree.mutationMetrics()).toEqual(before.metrics);
			expect(htmlParseInfo(tree)).toBe(before.info);
			expect(changed).not.toHaveBeenCalled();
			expect(mutated).not.toHaveBeenCalled();
			unsubscribeChange();
			unsubscribeMutation();
		},
	);

	it("does not cache a classification across structural mutations", () => {
		const tree = fixture();
		const button = byId(tree, "progress-button");
		expect(browserChallengeStructure(tree)).toBe(marker);
		tree.removeAttribute(button, "disabled");
		expect(browserChallengeStructure(tree)).toBeUndefined();
		tree.setAttribute(button, "disabled", "");
		expect(browserChallengeStructure(tree)).toBe(marker);
	});
});
