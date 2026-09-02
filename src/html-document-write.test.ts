import { expect, it } from "vitest";
import {
	type HtmlScriptContext,
	parseHtmlDocumentAsync,
} from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

it("keeps plaintext mode across parser write boundaries", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<body><script>outer</script><p>original</p>",
		"https://example.com/",
		{},
		{
			start() {},
			async finish() {},
			async script(_document, _id, context) {
				context.write("<plaintext>written");
			},
		},
	);
	expect(new DocumentQueries(tree).querySelector("p")).toBeNull();
	expect(tree.textContent(tree.root)).toBe("outerwritten<p>original</p>");
	tree.close();
});

it("does not execute an unterminated script at the end of input", async () => {
	let executions = 0;
	const tree = await parseHtmlDocumentAsync(
		"<script>unfinished",
		"https://example.com/",
		{},
		{
			start() {},
			async finish() {},
			async script() {
				executions++;
			},
		},
	);
	expect(executions).toBe(0);
	tree.close();
});

it("bounds cumulative original and written source before insertion", async () => {
	await expect(
		parseHtmlDocumentAsync(
			"<script>outer</script>",
			"https://example.com/",
			{ limits: { maxTextCodeUnits: 80 } },
			{
				start() {},
				async finish() {},
				async script(_document, _id, context) {
					context.write("x".repeat(80));
				},
			},
		),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it("retains primitive policy failures even if the writer catches them", async () => {
	let completed = false;
	try {
		await parseHtmlDocumentAsync(
			"<script>outer</script>",
			"https://example.com/",
			{},
			{
				start() {},
				async finish() {},
				policy() {
					throw null;
				},
				async script(_document, _id, context) {
					try {
						context.write(
							'<meta http-equiv="content-security-policy" content="default-src none">',
						);
					} catch {}
				},
			},
		);
		completed = true;
	} catch (error) {
		expect(error).toBeNull();
	}
	expect(completed).toBe(false);
});

it("writes synchronously at the parser insertion point, outside the invoking script", async () => {
	let saved: HtmlScriptContext | undefined;
	const tree = await parseHtmlDocumentAsync(
		'<body><script id="outer">outer</script><p id="future">future</p>',
		"https://example.com/",
		{},
		{
			start() {},
			async finish() {},
			async script(document, id, context) {
				saved = context;
				context.write('<b id="written">hello</b>');
				const queries = new DocumentQueries(document);
				expect(queries.querySelector("#future")).toBeNull();
				expect(queries.querySelector("body > #written")).not.toBeNull();
				expect(document.textContent(id)).toBe("outer");
			},
		},
	);
	expect(new DocumentQueries(tree).querySelector("#future")).not.toBeNull();
	expect(() => saved?.write("late")).toThrow();
	tree.close();
});

it("retains partial tokens across writes and affects subsequent parser tree construction", async () => {
	const tree = await parseHtmlDocumentAsync(
		'<body><script>outer</script><p id="future">future</p>',
		"https://example.com/",
		{},
		{
			start() {},
			async finish() {},
			async script(document, _id, context) {
				context.write('<section id="wr');
				expect(
					new DocumentQueries(document).querySelector("section"),
				).toBeNull();
				context.write('itten">first &am');
				context.write("p; second");
				const section = new DocumentQueries(document).querySelector("section");
				if (section === null) throw new Error("Missing written section");
				expect(document.textContent(section)).toBe("first & second");
			},
		},
	);
	expect(
		new DocumentQueries(tree).querySelector("#written > #future"),
	).not.toBeNull();
	tree.close();
});

it("pauses for a written external script and preserves later writes and nested insertion order", async () => {
	const calls: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		'<body><script id="outer">outer</script><p>original</p>',
		"https://example.com/",
		{},
		{
			start() {},
			async finish() {},
			async script(document, id, context) {
				if (document.get(id).attributes.src) {
					calls.push("child");
					context.write('<b id="inner">inner</b>');
				} else {
					context.write(
						'<script src="/child.js"></script><i id="later">later</i>',
					);
					expect(
						new DocumentQueries(document).querySelector("#later"),
					).toBeNull();
					context.write("<em>more</em>");
					calls.push("outer-return");
				}
			},
		},
	);
	expect(calls).toEqual(["outer-return", "child"]);
	expect(tree.textContent(tree.root)).toBe("outerinnerlatermoreoriginal");
	tree.close();
});

it("does not pretend unsupported nested inline execution ran synchronously", async () => {
	await expect(
		parseHtmlDocumentAsync(
			"<script>outer</script>",
			"https://example.com/",
			{},
			{
				start() {},
				async finish() {},
				async script(_document, _id, context) {
					try {
						context.write("<script>inner</script>");
					} catch {}
				},
			},
		),
	).rejects.toMatchObject({ code: "unsupported" });
});

it("bounds total parser write calls even when the caller catches the error", async () => {
	await expect(
		parseHtmlDocumentAsync(
			"<script>outer</script>",
			"https://example.com/",
			{},
			{
				start() {},
				async finish() {},
				async script(_document, _id, context) {
					for (let index = 0; index < 257; index++) {
						try {
							context.write("");
						} catch {}
					}
				},
			},
		),
	).rejects.toMatchObject({ code: "resource-limit" });
});
