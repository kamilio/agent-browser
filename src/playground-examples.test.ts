import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import { playgroundHtml } from "./playground-assets.js";
import { DocumentQueries } from "./selectors.js";

it("uses only established example URLs and labels every card unverified", () => {
	const tree = parseHtmlDocument(playgroundHtml, "https://playground.invalid/");
	try {
		const queries = new DocumentQueries(tree);
		const cards = queries.querySelectorAll("[data-url]");
		expect(cards.map((id) => tree.get(id).attributes["data-url"])).toEqual([
			"https://httpbingo.org/json",
			"https://www.rfc-editor.org/rfc/rfc9110.txt",
			"https://example.com/",
			"https://news.ycombinator.com/",
			"https://books.toscrape.com/",
			"https://todomvc.com/examples/javascript-es5/dist/",
			"https://todomvc.com/examples/react/dist/",
			"https://todomvc.com/examples/vue/dist/",
			"https://todomvc.com/examples/angular/dist/browser/",
			"https://todomvc.com/examples/preact/dist/",
		]);
		const pinned = readFileSync(
			new URL("../TASKS.md", import.meta.url),
			"utf8",
		);
		for (const url of [
			"https://news.ycombinator.com/",
			"https://books.toscrape.com/",
		])
			expect(pinned).toContain(url);
		for (const id of cards) {
			expect(tree.get(id).tagName).toBe("button");
			expect(tree.get(id).attributes).toHaveProperty("disabled");
			expect(tree.textContent(id)).toContain("UNVERIFIED");
		}
		expect(playgroundHtml).not.toContain('class="chip">WORKS');
	} finally {
		tree.close();
	}
});

it("maps all five TodoMVC variants to official index routes without claiming execution", () => {
	const tree = parseHtmlDocument(playgroundHtml, "https://playground.invalid/");
	try {
		const queries = new DocumentQueries(tree);
		const cards = queries.querySelectorAll("[data-framework]");
		expect(
			cards.map((id) => tree.get(id).attributes["data-framework"]),
		).toEqual(["vanilla", "react", "vue", "angular", "preact"]);
		const upstreamRoutes = [
			"examples/javascript-es5/dist/",
			"examples/react/dist/",
			"examples/vue/dist/",
			"examples/angular/dist/browser/",
			"examples/preact/dist/",
		];
		expect(cards.map((id) => tree.get(id).attributes["data-url"])).toEqual(
			upstreamRoutes.map(
				(route) => new URL(route, "https://todomvc.com/").href,
			),
		);
		for (const id of cards) {
			const attributes = tree.get(id).attributes;
			expect(attributes).toHaveProperty("disabled");
			expect(attributes).not.toHaveProperty("aria-disabled");
			expect(attributes["data-source"]).toBe(
				"https://github.com/tastejs/todomvc/blob/master/index.html",
			);
			expect(tree.textContent(id)).toContain("upstream-linked");
			expect(tree.textContent(id)).toContain("UNVERIFIED");
		}
		expect(playgroundHtml).toContain(
			"Site availability and framework execution remain unverified",
		);
	} finally {
		tree.close();
	}
});

it("exposes keyboard-named download controls, status feedback and selectable session command hints", () => {
	const tree = parseHtmlDocument(playgroundHtml, "https://playground.invalid/");
	try {
		const queries = new DocumentQueries(tree);
		for (const [kind, label] of [
			["markdown", "Download Markdown"],
			["json", "Download structured JSON"],
			["snapshot", "Download semantic snapshot"],
		]) {
			const id = queries.querySelector(`#download-${kind}`);
			expect(id).not.toBeNull();
			if (id === null) throw new Error("Missing extraction button");
			const node = tree.get(id);
			expect(node.tagName).toBe("button");
			expect(node.attributes["aria-label"]).toBe(label);
			expect(node.attributes).not.toHaveProperty("tabindex", "-1");
		}
		const stateId = queries.querySelector("#export-state");
		const commandsId = queries.querySelector("#export-commands");
		if (stateId === null || commandsId === null)
			throw new Error("Missing extraction feedback");
		expect(tree.get(stateId).attributes.role).toBe("status");
		const commands = tree.get(commandsId);
		expect(commands.attributes.tabindex).toBe("0");
		expect(commands.attributes["aria-label"]).toContain("selected session");
		expect(playgroundHtml).toContain("semantic snapshots can truncate");
		expect(playgroundHtml).toContain("fail on byte/node/depth limits");
	} finally {
		tree.close();
	}
});
