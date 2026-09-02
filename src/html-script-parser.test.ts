import { expect, it } from "vitest";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocumentAsync } from "./html-parser.js";

it("pauses the real parser before constructing content following a classic script", async () => {
	const seen: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<p>before</p><script>first</script><p>after</p><script>second</script>",
		"https://example.com/",
		{},
		{
			start(document) {
				seen.push(document.textContent(document.root));
			},
			async script(document, id) {
				seen.push(document.textContent(document.root));
				await Promise.resolve();
				document.setAttribute(id, "data-ran", "true");
			},
			async finish() {},
		},
	);
	expect(seen).toEqual(["", "beforefirst", "beforefirstaftersecond"]);
	expect(
		[...tree.walk()].filter(
			({ node }) => node.attributes["data-ran"] === "true",
		),
	).toHaveLength(2);
	expect(htmlParseInfo(tree)).toMatchObject({ scripting: true });
	tree.close();
});

it("closes the partial document when a parser hook fails", async () => {
	let closed = false;
	await expect(
		parseHtmlDocumentAsync(
			"<script>failure</script><p>unparsed</p>",
			"https://example.com/",
			{},
			{
				start(document) {
					document.onClose(() => {
						closed = true;
					});
				},
				async script() {
					throw new Error("fixture");
				},
				async finish() {},
			},
		),
	).rejects.toThrow("fixture");
	expect(closed).toBe(true);
});

it("does not execute script-like markup inside noscript while scripting is enabled", async () => {
	const scripts: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<noscript><script>inert</script></noscript><script>active</script>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(document, id) {
				scripts.push(document.textContent(id));
			},
			async finish() {},
		},
	);
	expect(scripts).toEqual(["active"]);
	tree.close();
});

it("checks cancellation before resuming parser construction", async () => {
	const controller = new AbortController();
	let closed = false;
	await expect(
		parseHtmlDocumentAsync(
			"<script>stop</script><p>after</p>",
			"https://example.com/",
			{ signal: controller.signal },
			{
				start(document) {
					document.onClose(() => {
						closed = true;
					});
				},
				async script() {
					controller.abort();
				},
				async finish() {},
			},
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(closed).toBe(true);
});

it("does not expose the body to a head script before body construction", async () => {
	const bodies: boolean[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<head><script>head</script></head><body><script>body</script></body>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(document) {
				bodies.push(
					[...document.walk()].some(({ node }) => node.tagName === "body"),
				);
			},
			async finish() {},
		},
	);
	expect(bodies).toEqual([false, true]);
	tree.close();
});

it("closes a completed tree when the post-parse lifecycle hook fails", async () => {
	let closed = false;
	await expect(
		parseHtmlDocumentAsync(
			"<p>parsed</p>",
			"https://example.com/",
			{},
			{
				start(tree) {
					tree.onClose(() => {
						closed = true;
					});
				},
				async script() {},
				async parsed() {
					throw new Error("post-parse failure");
				},
				async finish() {},
			},
		),
	).rejects.toThrow("post-parse failure");
	expect(closed).toBe(true);
});
