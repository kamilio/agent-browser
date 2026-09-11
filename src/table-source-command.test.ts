import { afterEach, expect, it } from "vitest";
import { parseInvocation } from "./cli-parser.js";
import { BrowserCommandHost } from "./command-host.js";
import { DocumentTree } from "./document.js";
import type { DocumentExtraction, ExtractedNode } from "./extraction.js";
import type { NetworkTransport } from "./network.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
const url = "https://table-source.fixture.invalid/";

async function fixture(headers = " heading\tmissing & literal ") {
	const tree = new DocumentTree(url);
	const body = tree.createElement("body");
	const table = tree.createElement("table", { id: "selected" });
	const row = tree.createElement("tr");
	const headingAttributes = {
		id: "heading",
		headers: "",
		colspan: " 02 ",
		rowspan: "not-a-number",
		scope: "Unusual Scope",
		abbr: " A & B ",
	};
	const cellAttributes = {
		id: "value",
		headers,
		colspan: "0",
		rowspan: "-1",
	};
	const heading = tree.createElement("th", {
		...headingAttributes,
		onclick: "ignored",
		"data-private": "ignored",
	});
	const cell = tree.createElement("td", {
		...cellAttributes,
		scope: "ignored",
		abbr: "ignored",
		href: "/ignored",
	});
	const hidden = tree.createElement("td", { id: "hidden", hidden: "" });
	const outside = tree.createElement("table", { id: "outside" });
	const outsideRow = tree.createElement("tr");
	const outsideCell = tree.createElement("td", { id: "outside-value" });
	tree.append(tree.root, body);
	tree.append(body, table);
	tree.append(table, row);
	tree.append(row, heading);
	tree.append(row, cell);
	tree.append(row, hidden);
	tree.setTextContent(heading, "Heading");
	tree.setTextContent(cell, "Value");
	tree.setTextContent(hidden, "Hidden");
	tree.append(body, outside);
	tree.append(outside, outsideRow);
	tree.append(outsideRow, outsideCell);
	tree.setTextContent(outsideCell, "Outside");
	const requests: string[] = [];
	let closed = false;
	const transport: NetworkTransport = {
		async request(input) {
			requests.push(input.url);
			return {
				url: input.url,
				status: 200,
				headers: {},
				body: new Uint8Array(),
				redirects: [],
				encodedBytes: 0,
				elapsedMs: 0,
			};
		},
		metrics: () => ({
			requests: requests.length,
			active: 0,
			closed,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
		}),
		close() {
			closed = true;
		},
	};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument: () => tree,
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", url]);
	return {
		host,
		tree,
		table,
		heading,
		cell,
		hidden,
		outside,
		outsideCell,
		headingAttributes,
		cellAttributes,
		requests,
	};
}

function extractedNodes(data: unknown): ExtractedNode[] {
	const extraction = data as DocumentExtraction;
	expect(extraction.format).toBe("json");
	if (extraction.format !== "json") throw new Error("Expected JSON extraction");
	const nodes: ExtractedNode[] = [];
	const pending = [extraction.content];
	while (pending.length) {
		const node = pending.pop();
		if (!node) break;
		nodes.push(node);
		pending.push(...(node.children ?? []));
	}
	return nodes;
}

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

it.each([
	{ flag: "--table-metadata", value: true },
	{ flag: "--table-metadata=true", value: true },
	{ flag: "--table-metadata=false", value: false },
])("parses extract $flag as boolean $value", ({ flag, value }) => {
	expect(
		parseInvocation(["extract", "#selected", "--format=json", flag]),
	).toMatchObject({
		command: "extract",
		arguments: ["#selected"],
		options: { format: "json", "table-metadata": value },
	});
});

it("leaves table metadata absent unless explicitly requested", () => {
	expect(
		parseInvocation(["extract", "--format=json"]).options,
	).not.toHaveProperty("table-metadata");
});

it.each(["", "TRUE", "False", "1", "0", "yes", "null", "undefined"])(
	"rejects the nonboolean table-metadata value %j",
	(value) => {
		expect(() =>
			parseInvocation(["extract", `--table-metadata=${value}`]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each(["snapshot", "text", "html", "dom"])(
	"rejects table metadata on the unrelated %s command",
	(command) => {
		expect(() => parseInvocation([command, "--table-metadata"])).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each(["--table-metadata", "--table-metadata=true"])(
	"passes %s through the host and preserves raw allowed cell attributes",
	async (flag) => {
		const {
			host,
			tree,
			heading,
			cell,
			hidden,
			headingAttributes,
			cellAttributes,
			requests,
		} = await fixture();
		const result = await host.execute(["extract", "--format=json", flag]);
		const nodes = extractedNodes(result.data);
		for (const [reference, attributes] of [
			[tree.reference(heading), headingAttributes],
			[tree.reference(cell), cellAttributes],
		] as const) {
			const node = nodes.find((entry) => entry.ref === reference);
			expect(node).toMatchObject({
				type: "cell",
				tableSource: { kind: "native-table-source-v1" },
			});
			expect(node).toHaveProperty("tableSource.attributes", attributes);
		}
		expect(nodes.some((node) => node.ref === tree.reference(hidden))).toBe(
			false,
		);
		expect(requests).toEqual([url]);
	},
);

it("keeps default and explicit-false JSON unchanged across an opt-in extraction", async () => {
	const { host, requests } = await fixture();
	const before = await host.execute(["extract", "--format=json"]);
	for (const node of extractedNodes(before.data))
		expect(node).not.toHaveProperty("tableSource");
	await host.execute(["extract", "--format=json", "--table-metadata"]);
	expect((await host.execute(["extract", "--format=json"])).data).toEqual(
		before.data,
	);
	expect(
		(await host.execute(["extract", "--format=json", "--table-metadata=false"]))
			.data,
	).toEqual(before.data);
	expect(requests).toEqual([url]);
});

it.each([
	{ label: "default", formatOptions: [] },
	{ label: "explicit", formatOptions: ["--format=markdown"] },
])(
	"rejects true metadata with $label Markdown but accepts false",
	async ({ formatOptions }) => {
		const { host, requests } = await fixture();
		const baseline = await host.execute(["extract", ...formatOptions]);
		for (const flag of ["--table-metadata", "--table-metadata=true"])
			await expect(
				host.execute(["extract", ...formatOptions, flag]),
			).rejects.toMatchObject({ code: "invalid-input" });
		expect(
			(
				await host.execute([
					"extract",
					...formatOptions,
					"--table-metadata=false",
				])
			).data,
		).toEqual(baseline.data);
		expect(baseline.data).toMatchObject({ format: "markdown" });
		expect(requests).toEqual([url]);
	},
);

it.each(["selector", "reference"])(
	"preserves scoped metadata using a %s without including another table",
	async (selection) => {
		const { host, tree, table, cell, outside, outsideCell, requests } =
			await fixture();
		const target =
			selection === "selector" ? "#selected" : tree.reference(table);
		const result = await host.execute([
			"extract",
			target,
			"--format=json",
			"--table-metadata",
		]);
		expect(result.data).toMatchObject({ scope: tree.reference(table) });
		const nodes = extractedNodes(result.data);
		expect(
			nodes.find((node) => node.ref === tree.reference(cell)),
		).toHaveProperty("tableSource.attributes.id", "value");
		for (const excluded of [outside, outsideCell])
			expect(nodes.some((node) => node.ref === tree.reference(excluded))).toBe(
				false,
			);
		expect(requests).toEqual([url]);
	},
);

it("propagates missing scope errors with metadata enabled", async () => {
	const { host, requests } = await fixture();
	await expect(
		host.execute(["extract", "#missing", "--format=json", "--table-metadata"]),
	).rejects.toMatchObject({ code: "not-found" });
	expect(requests).toEqual([url]);
});

it.each(["--max-bytes=256", "--max-nodes=1", "--depth=0"])(
	"propagates the extraction resource limit for %s",
	async (limit) => {
		const { host, requests } = await fixture();
		await expect(
			host.execute(["extract", "--format=json", "--table-metadata", limit]),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(requests).toEqual([url]);
	},
);

it("retains 4096 UTF-16 code units and rejects 4097 only when opted in", async () => {
	const headers = "\u{1f600}".repeat(2048);
	const { host, tree, cell, requests } = await fixture(headers);
	const args = ["extract", "#value", "--format=json", "--table-metadata"];
	const result = await host.execute(args);
	expect(extractedNodes(result.data)[0]).toHaveProperty(
		"tableSource.attributes.headers",
		headers,
	);
	tree.setAttribute(cell, "headers", `${headers}x`);
	await expect(host.execute(args)).rejects.toMatchObject({
		code: "resource-limit",
	});
	for (const flags of [[], ["--table-metadata=false"]]) {
		const legacy = await host.execute(["extract", "--format=json", ...flags]);
		for (const node of extractedNodes(legacy.data))
			expect(node).not.toHaveProperty("tableSource");
	}
	expect(requests).toEqual([url]);
});
