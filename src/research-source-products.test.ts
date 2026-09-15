import { afterEach, describe, expect, it } from "vitest";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";

type Tree = ReturnType<typeof loadResearchDocument>;
type VisibilityPolicy = Parameters<typeof loadResearchDocument>[4];
type Extraction = ReturnType<typeof extractDocument>;
type ProductEntry = {
	source: {
		offset: number;
		offsetBasis: "lf-normalized-utf16";
		path: string;
	};
	tcin: string;
	relation: "route-product" | "variant-of-route-product";
	title: string;
	specifications: string[];
	highlights: string[];
	description?: string;
	truncated: boolean;
};
type SourceProducts = {
	kind: "nextjs-target-product-descriptions-v1";
	scope: "document-source";
	partial: true;
	rendered: false;
	verified: false;
	textFormat: "html-source";
	truncated: boolean;
	routeTcin: string;
	entries: ProductEntry[];
};
type ProductFixture = {
	tcin: unknown;
	item: { product_description: Record<string, unknown> };
	children?: ProductFixture[];
	[key: string]: unknown;
};

const url = "https://www.target.com/p/item/-/A-12345678";
const routeTcin = "12345678";
const formats = ["markdown", "json"] as const;
const encoder = new TextEncoder();
const article =
	'<main id="article"><h1>Product shell</h1><p>Visible café 😀 shell only.</p></main>';
const productPath =
	"$.props.dehydratedState.queries[0].state.data.data.data_source_modules[0].module_data.data.product";
const context = {
	tabId: "source-products-fixture",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 2048,
		maxDepth: 64,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 128,
	},
};
const trees: Tree[] = [];

function product(
	description: Record<string, unknown> = {},
	tcin: unknown = routeTcin,
	children?: ProductFixture[],
): ProductFixture {
	return {
		tcin,
		item: {
			product_description: {
				title: "Source café chair Ω",
				bullet_descriptions: ["Material: oak", "Width: 40 cm"],
				soft_bullets: { bullets: ["Solid wood", "Indoor use"] },
				downstream_description: "<p>Literal &amp; source description 😀</p>",
				...description,
			},
		},
		...(children ? { children } : {}),
	};
}

function query(products: ProductFixture[] = [product()]) {
	return {
		state: {
			data: {
				data: {
					data_source_modules: products.map((entry) => ({
						module_data: { data: { product: entry } },
					})),
				},
			},
		},
	};
}

function payload(products: ProductFixture[] = [product()]) {
	return {
		page: "/p/[...subpath]",
		query: { subpath: ["item", "-", `A-${routeTcin}`] },
		props: { dehydratedState: { queries: [query(products)] } },
	};
}

function script(
	data: unknown = payload(),
	attributes = 'id="__NEXT_DATA__" type="application/json"',
): string {
	return `<script ${attributes}>${JSON.stringify(data)}</script>`;
}

function response(source: string, targetUrl = url) {
	const body = encoder.encode(source);
	return {
		url: targetUrl,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function load(
	source: string,
	targetUrl = url,
	policy?: VisibilityPolicy,
): Tree {
	const tree = loadResearchDocument(
		response(source, targetUrl),
		context,
		undefined,
		undefined,
		policy,
	);
	trees.push(tree);
	return tree;
}

function companion(result: Extraction): SourceProducts | undefined {
	const data = (result as Extraction & { sourceProducts?: SourceProducts })
		.sourceProducts;
	if (data) {
		for (const entry of data.entries)
			expect(entry.source.offsetBasis).toBe("lf-normalized-utf16");
	}
	return data;
}

function required(result: Extraction): SourceProducts {
	const data = companion(result);
	expect(data).toBeDefined();
	if (!data) throw new Error("Expected product-source companion");
	return data;
}

function collect(products: ProductFixture[]): SourceProducts {
	return required(
		extractDocument(load(`${article}${script(payload(products))}`)),
	);
}

function bytes(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

function expectFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectFrozen(child);
}

function snapshot(tree: Tree) {
	return {
		revision: tree.revision,
		text: tree.textContent(tree.root),
		nodes: JSON.stringify([...tree.walk()]),
		refs: [...tree.walk()].map(({ node }) => tree.reference(node.id)),
	};
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

describe("bounded Target product-source reader companion", () => {
	it.each(formats)(
		"keeps product-source evidence separate from %s DOM",
		(format) => {
			const source = `<!--😀 source prefix-->${script()}${article}`;
			const input = response(source);
			const originalBytes = input.body.slice();
			const tree = loadResearchDocument(input, context);
			trees.push(tree);
			const before = snapshot(tree);
			const result = extractDocument(tree, { format });
			const data = required(result);
			expect(data).toEqual({
				kind: "nextjs-target-product-descriptions-v1",
				scope: "document-source",
				partial: true,
				rendered: false,
				verified: false,
				textFormat: "html-source",
				truncated: false,
				routeTcin,
				entries: [
					{
						source: {
							offset: source.indexOf("<script"),
							offsetBasis: "lf-normalized-utf16",
							path: productPath,
						},
						tcin: routeTcin,
						relation: "route-product",
						title: "Source café chair Ω",
						specifications: ["Material: oak", "Width: 40 cm"],
						highlights: ["Solid wood", "Indoor use"],
						description: "<p>Literal &amp; source description 😀</p>",
						truncated: false,
					},
				],
			});
			expect(JSON.stringify(result.content)).toContain(
				"Visible café 😀 shell only",
			);
			expect(JSON.stringify(result.content)).not.toContain("Source café chair");
			expect(JSON.stringify(result.content)).not.toContain("Literal &amp;");
			expect(snapshot(tree)).toEqual(before);
			expect(input.body).toEqual(originalBytes);
			expectFrozen(data);
			const inactive = source.replace("__NEXT_DATA__", "__SKIP_DATA__");
			expect(sanitizeResearchHtml(source).html).toBe(
				sanitizeResearchHtml(inactive).html,
			);
			const ordinary = extractDocument(load(inactive), { format });
			expect(companion(ordinary)).toBeUndefined();
			if (format === "markdown") expect(result.content).toBe(ordinary.content);
			expect(extractDocument(tree, { format })).toEqual(result);
		},
	);

	it.each(formats)(
		"labels LF-normalized UTF-16 offsets after CRLF and bare CR in %s",
		(format) => {
			const primary = product({}, routeTcin, [
				product({ title: "Variant β 😀" }, "87654321"),
			]);
			const source = `<!--😀 café\r\nprefix-->\r${script(payload([primary]))}\r\n${article}`;
			const normalized = source.replace(/\r\n?/g, "\n");
			const offset = normalized.indexOf("<script");
			const prefix = normalized.slice(0, offset);
			expect(offset).not.toBe(source.indexOf("<script"));
			expect(offset).not.toBe(encoder.encode(prefix).byteLength);
			expect(offset).not.toBe(
				encoder.encode(source.slice(0, source.indexOf("<script"))).byteLength,
			);
			expect(offset).not.toBe([...prefix].length);
			const input = response(source);
			const originalBytes = input.body.slice();
			const tree = loadResearchDocument(input, context);
			trees.push(tree);
			const before = snapshot(tree);
			const data = required(extractDocument(tree, { format }));
			expect(data.entries.map((entry) => entry.source)).toEqual(
				[productPath, `${productPath}.children[0]`].map((path) => ({
					offset,
					offsetBasis: "lf-normalized-utf16",
					path,
				})),
			);
			expect(data).toEqual(
				required(extractDocument(load(normalized), { format })),
			);
			expectFrozen(data);
			expect(input.body).toEqual(originalBytes);
			expect(snapshot(tree)).toEqual(before);
		},
	);

	it.each([url, url.replace("www.target.com", "target.com")])(
		"admits the supported HTTPS product origin %s",
		(targetUrl) => {
			expect(
				required(extractDocument(load(`${article}${script()}`, targetUrl)))
					.routeTcin,
			).toBe(routeTcin);
		},
	);

	it("keeps direct variants separate and collects only the first matching primary", () => {
		const children = [
			product({ title: "Blue variant" }, "87654321"),
			product({ title: "Red variant" }, "87654322"),
		];
		const state = payload([
			product({ title: "UNRELATED_RECOMMENDATION" }, "99999999"),
			product({}, routeTcin, children),
			product({ title: "LATER_PRIMARY" }),
		]);
		state.props.dehydratedState.queries.push(
			query([product({ title: "LATER_QUERY" })]),
		);
		const data = required(extractDocument(load(`${article}${script(state)}`)));
		expect(
			data.entries.map(({ tcin, relation, title }) => ({
				tcin,
				relation,
				title,
			})),
		).toEqual([
			{
				tcin: routeTcin,
				relation: "route-product",
				title: "Source café chair Ω",
			},
			{
				tcin: "87654321",
				relation: "variant-of-route-product",
				title: "Blue variant",
			},
			{
				tcin: "87654322",
				relation: "variant-of-route-product",
				title: "Red variant",
			},
		]);
		const primaryPath = productPath.replace("modules[0]", "modules[1]");
		expect(data.entries.map((entry) => entry.source.path)).toEqual([
			primaryPath,
			`${primaryPath}.children[0]`,
			`${primaryPath}.children[1]`,
		]);
		expect(JSON.stringify(data)).not.toMatch(/UNRELATED_|LATER_/);
	});

	it("returns literal markup and escapes controls without decoding HTML entities", () => {
		const literal =
			'<img src="x" onerror="PRIVATE_EXECUTION()"> &amp; café 😀\u001b\u202e';
		const escaped =
			'<img src="x" onerror="PRIVATE_EXECUTION()"> &amp; café 😀\\u{1b}\\u{202e}';
		const data = collect([
			product({
				title: literal,
				bullet_descriptions: [literal],
				soft_bullets: { bullets: [literal] },
				downstream_description: literal,
			}),
		]);
		expect(data.entries[0]).toMatchObject({
			title: escaped,
			specifications: [escaped],
			highlights: [escaped],
			description: escaped,
			truncated: false,
		});
	});

	it("ignores all undeclared product, query, pricing and session fields", () => {
		const primary = product({
			cookie: "PRIVATE_DESCRIPTION_COOKIE",
			unknown: "PRIVATE_DESCRIPTION_UNKNOWN",
			soft_bullets: {
				bullets: ["Declared highlight"],
				context: "PRIVATE_SOFT_CONTEXT",
			},
		});
		Object.assign(primary, {
			price: { formatted_current_price: "PRIVATE_PRICE" },
			offers: [{ price: "PRIVATE_OFFER" }],
			visitor_id: "PRIVATE_VISITOR",
			context: { title: "PRIVATE_CONTEXT_TITLE" },
		});
		const state = payload([primary]);
		Object.assign(state.query, { cookie: "PRIVATE_QUERY_COOKIE" });
		Object.assign(state.props, {
			session: "PRIVATE_SESSION",
			recommendations: [product({ title: "PRIVATE_RECOMMENDATION" })],
		});
		Object.assign(state.props.dehydratedState.queries[0], {
			queryKey: ["PRIVATE_QUERY_KEY"],
		});
		const result = extractDocument(load(`${article}${script(state)}`));
		expect(required(result).entries[0].highlights).toEqual([
			"Declared highlight",
		]);
		expect(JSON.stringify(result)).not.toContain("PRIVATE_");
	});

	it("does not attach the companion during ordinary native HTML parsing", () => {
		const tree = parseHtmlDocument(`${article}${script()}`, url);
		trees.push(tree);
		for (const format of formats)
			expect(companion(extractDocument(tree, { format }))).toBeUndefined();
	});

	it("retains document-source attribution when extracting a selected body root", () => {
		const tree = load(`${script()}${article}`);
		const data = required(extractDocument(tree));
		const main = [...tree.walk()].find(({ node }) => node.tagName === "main");
		if (!main) throw new Error("Expected main fixture element");
		const root = tree.reference(main.node.id);
		const before = snapshot(tree);
		for (const format of formats) {
			const result = extractDocument(tree, { format, root });
			expect(result.scope).toBe(root);
			expect(required(result)).toEqual(data);
			expect(required(result).scope).toBe("document-source");
			expect(JSON.stringify(result.content)).not.toContain("Source café chair");
		}
		expect(snapshot(tree)).toEqual(before);
	});

	it("retains immutable snapshots through extraction fitting and tree closure", () => {
		const tree = load(`${article}${script()}`);
		const result = extractDocument(tree);
		const data = required(result);
		const serialized = JSON.stringify(data);
		const { sourceProducts: omitted, ...baseline } = result as Extraction & {
			sourceProducts?: SourceProducts;
		};
		expect(omitted).toBe(data);
		expect(extractDocument(tree, { maxBytes: bytes(baseline) })).toEqual(
			baseline,
		);
		expect(required(extractDocument(tree))).toEqual(data);
		expectFrozen(data);
		tree.close();
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(JSON.stringify(data)).toBe(serialized);
		expect(companion(extractDocument(load(article)))).toBeUndefined();
	});
});

describe("product-source admission controls", () => {
	it.each([
		"http://www.target.com/p/item/-/A-12345678",
		"https://www.target.com:444/p/item/-/A-12345678",
		"https://www.target.com.example.invalid/p/item/-/A-12345678",
		"https://example.invalid/p/item/-/A-12345678",
		"https://shop.target.com/p/item/-/A-12345678",
		"https://www.target.com/c/item/-/A-12345678",
		"https://www.target.com/p/item/-/A-87654321",
		"https://www.target.com/p/item/-/A-01234567",
		"https://www.target.com/p/item/-/A-12345",
		"https://www.target.com/p/item/-/A-1234567890123",
	])("does not admit an unsupported or mismatched URL: %s", (targetUrl) => {
		expect(
			companion(extractDocument(load(`${article}${script()}`, targetUrl))),
		).toBeUndefined();
	});

	it.each([
		'id="__NEXT_DATA__" type="application/json" src="/external.json"',
		'id="__NEXT_DATA__" type="application/json" src=""',
		'id="__NEXT_DATA__" type="text/javascript"',
		'id="__NEXT_DATA__" type="application/javascript"',
		'id="__NEXT_DATA__" type="module"',
		'id="__NEXT_DATA__"',
		'type="application/json"',
		'id="__OTHER_DATA__" type="application/json"',
	])("rejects external, executable or unrelated scripts: %s", (attributes) => {
		expect(
			companion(
				extractDocument(load(`${article}${script(payload(), attributes)}`)),
			),
		).toBeUndefined();
	});

	it.each(["svg", "math", "template", "noscript"])(
		"ignores the %s subtree",
		(tag) => {
			expect(
				companion(
					extractDocument(load(`${article}<${tag}>${script()}</${tag}>`)),
				),
			).toBeUndefined();
		},
	);

	it("ignores commented-out scripts and malformed JSON", () => {
		for (const source of [
			`<!--${script()}-->`,
			'<script id="__NEXT_DATA__" type="application/json">{not JSON}</script>',
			'<script id="__NEXT_DATA__" type="application/json">null</script>',
		])
			expect(
				companion(extractDocument(load(`${article}${source}`))),
			).toBeUndefined();
	});

	it.each([
		{
			name: "wrong Next page",
			data: { ...payload(), page: "/c/[...subpath]" },
		},
		{
			name: "wrong JSON product ID",
			data: { ...payload(), query: { subpath: ["item", "-", "A-87654321"] } },
		},
		{
			name: "wrong JSON route slug",
			data: { ...payload(), query: { subpath: ["other", "-", "A-12345678"] } },
		},
		{
			name: "string subpath",
			data: { ...payload(), query: { subpath: "item/-/A-12345678" } },
		},
		{
			name: "unrelated state shape",
			data: {
				page: "/p/[...subpath]",
				query: payload().query,
				props: { product: product() },
			},
		},
		{
			name: "prototype-shaped props",
			data: {
				page: "/p/[...subpath]",
				query: payload().query,
				["__proto__"]: { props: payload().props },
			},
		},
		{ name: "array root", data: [payload()] },
	])(
		"requires exact own route and query/module properties: $name",
		({ data }) => {
			expect(
				companion(extractDocument(load(`${article}${script(data)}`))),
			).toBeUndefined();
		},
	);

	it.each(["source-hidden-v1", "source-hidden-inline-v1"] as const)(
		"honors explicit source attribute visibility under %s",
		(policy) => {
			for (const hidden of [
				script(payload(), 'id="__NEXT_DATA__" type="application/json" hidden'),
				script(
					payload(),
					'id="__NEXT_DATA__" type="application/json" aria-hidden="true"',
				),
				`<div hidden>${script()}</div>`,
				`<div aria-hidden="true">${script()}</div>`,
			])
				expect(
					companion(extractDocument(load(`${article}${hidden}`, url, policy))),
				).toBeUndefined();
		},
	);

	it("honors explicit inline hiding on scripts and their ancestors", () => {
		for (const style of ["display:none", "display: none !important"]) {
			for (const hidden of [
				script(
					payload(),
					`id="__NEXT_DATA__" type="application/json" style="${style}"`,
				),
				`<div style="${style}">${script()}</div>`,
			])
				expect(
					companion(
						extractDocument(
							load(`${article}${hidden}`, url, "source-hidden-inline-v1"),
						),
					),
				).toBeUndefined();
		}
	});

	it.each(["", "   ", null, 123, "x".repeat(513)])(
		"never substitutes a child for invalid primary title %j",
		(title) => {
			const parent = product({ title }, routeTcin, [
				product({ title: "CHILD_FALLBACK" }, "87654321"),
			]);
			expect(
				companion(
					extractDocument(load(`${article}${script(payload([parent]))}`)),
				),
			).toBeUndefined();
		},
	);

	it("never substitutes a matching child for an unrelated primary", () => {
		const parent = product({ title: "UNRELATED_PARENT" }, "87654321", [
			product(),
		]);
		expect(
			companion(
				extractDocument(load(`${article}${script(payload([parent]))}`)),
			),
		).toBeUndefined();
	});

	it.each([
		12345678,
		"012345678",
		"12345",
		"1234567890123",
		"+12345678",
		"12345678.0",
		"１２３４５６７８",
		null,
	])("rejects noncanonical primary TCIN %j", (tcin) => {
		expect(
			companion(
				extractDocument(
					load(`${article}${script(payload([product({}, tcin)]))}`),
				),
			),
		).toBeUndefined();
	});

	it("does not read a product description through a prototype-shaped key", () => {
		const parent = product();
		Object.assign(parent, { item: { ["__proto__"]: parent.item } });
		expect(
			companion(
				extractDocument(load(`${article}${script(payload([parent]))}`)),
			),
		).toBeUndefined();
	});

	it("does not merge duplicate source IDs or silently treat them as complete", () => {
		const source = `${article}${script()}${script(payload([product({ title: "SECOND_BLOCK" })]))}`;
		const data = companion(extractDocument(load(source)));
		if (data) {
			expect(data.truncated).toBe(true);
			expect(data.entries).toHaveLength(1);
			expect(data.entries[0].title).toBe("Source café chair Ω");
			expect(data.entries[0].source.offset).toBe(source.indexOf("<script"));
			expect(JSON.stringify(data)).not.toContain("SECOND_BLOCK");
		}
	});
});

describe("product-source bounds and exact output fitting", () => {
	it.each([31, 32])(
		"bounds direct variant scanning at child index %i",
		(index) => {
			const children = [
				...Array.from({ length: index }, () => product({}, "invalid")),
				product({ title: "Boundary variant" }, "87654321"),
			];
			const data = collect([product({}, routeTcin, children)]);
			expect(data.truncated).toBe(true);
			expect(data.entries.map((entry) => entry.tcin)).toEqual(
				index === 31 ? [routeTcin, "87654321"] : [routeTcin],
			);
		},
	);

	it("matches a percent-encoded route slug to its decoded JSON segment", () => {
		const data = payload();
		data.query.subpath[0] = "itém";
		const result = extractDocument(
			load(
				`${article}${script(data)}`,
				"https://www.target.com/p/it%C3%A9m/-/A-12345678",
			),
		);
		expect(required(result).routeTcin).toBe(routeTcin);
	});

	it("caps entries at the parent and three unique, canonical direct variants", () => {
		const children = [
			product({ title: "DUPLICATE_PARENT" }),
			product({}, "01234567"),
			product({}, 87654321),
			product({ title: "Six digits" }, "123456"),
			product({ title: "DUPLICATE_VARIANT" }, "123456"),
			product({ title: "Twelve digits" }, "123456789012"),
			product({ title: "Third variant" }, "87654323", [
				product({ title: "GRANDCHILD" }, "87654325"),
			]),
			product({ title: "FOURTH_VARIANT" }, "87654324"),
		];
		const data = collect([product({}, routeTcin, children)]);
		expect(data.entries.map((entry) => entry.tcin)).toEqual([
			routeTcin,
			"123456",
			"123456789012",
			"87654323",
		]);
		expect(data.entries.map((entry) => entry.source.path)).toEqual([
			productPath,
			`${productPath}.children[3]`,
			`${productPath}.children[5]`,
			`${productPath}.children[6]`,
		]);
		expect(data.truncated).toBe(true);
		expect(JSON.stringify(data)).not.toMatch(
			/DUPLICATE_|GRANDCHILD|FOURTH_VARIANT/,
		);
	});

	it("accepts exact field code-unit limits without marking truncation", () => {
		const title = "😀".repeat(256);
		const item = "é".repeat(2048);
		const description = "Ω".repeat(8192);
		const entry = collect([
			product({
				title,
				bullet_descriptions: [item],
				soft_bullets: { bullets: [item] },
				downstream_description: description,
			}),
		]).entries[0];
		expect(entry).toMatchObject({
			title,
			specifications: [item],
			highlights: [item],
			description,
			truncated: false,
		});
	});

	it("caps each list and marks omitted fields without inventing cutoff prose", () => {
		const specifications = Array.from(
			{ length: 33 },
			(_, index) => `Spec ${index}`,
		);
		const highlights = Array.from(
			{ length: 25 },
			(_, index) => `Highlight ${index}`,
		);
		const data = collect([
			product({
				bullet_descriptions: specifications,
				soft_bullets: { bullets: highlights },
				downstream_description: "x".repeat(8193),
			}),
		]);
		expect(data.truncated).toBe(true);
		expect(data.entries[0]).toMatchObject({
			specifications: specifications.slice(0, 32),
			highlights: highlights.slice(0, 24),
			truncated: true,
		});
		expect(data.entries[0]).not.toHaveProperty("description");
	});

	it("omits list values over either the raw or escaped length budget", () => {
		const values = [
			"Keep first",
			"x".repeat(2049),
			"\u202e".repeat(300),
			"Keep last",
		];
		const data = collect([
			product({
				bullet_descriptions: values,
				soft_bullets: { bullets: values },
				downstream_description: "\u202e".repeat(1200),
			}),
		]);
		expect(data.entries[0]).toMatchObject({
			specifications: ["Keep first", "Keep last"],
			highlights: ["Keep first", "Keep last"],
			truncated: true,
		});
		expect(data.entries[0]).not.toHaveProperty("description");
		expect(data.truncated).toBe(true);
	});

	it("omits a primary whose title only exceeds its limit after escaping", () => {
		const source = script(payload([product({ title: "\u202e".repeat(74) })]));
		expect(
			companion(extractDocument(load(`${article}${source}`))),
		).toBeUndefined();
	});

	it("skips invalid and overlong child titles without child fallback", () => {
		const data = collect([
			product({}, routeTcin, [
				product({ title: "x".repeat(513) }, "87654321"),
				product({ title: null }, "87654322"),
				product({ title: "Kept variant" }, "87654323"),
			]),
		]);
		expect(data.entries.map((entry) => entry.tcin)).toEqual([
			routeTcin,
			"87654323",
		]);
		expect(data.truncated).toBe(true);
	});

	it("does not stringify invalid declared field types", () => {
		const entry = collect([
			product({
				bullet_descriptions: [
					null,
					42,
					{ text: "PRIVATE_OBJECT" },
					"Valid specification",
				],
				soft_bullets: {
					bullets: [false, ["PRIVATE_ARRAY"], "Valid highlight"],
				},
				downstream_description: { text: "PRIVATE_DESCRIPTION" },
			}),
		]).entries[0];
		expect(entry.specifications).toEqual(["Valid specification"]);
		expect(entry.highlights).toEqual(["Valid highlight"]);
		expect(entry).not.toHaveProperty("description");
		expect(JSON.stringify(entry)).not.toContain("PRIVATE_");
	});

	it.each([15, 16])(
		"bounds query traversal with a primary at query index %i",
		(index) => {
			const state = payload();
			state.props.dehydratedState.queries = [
				...Array.from({ length: index }, () => query([])),
				query(),
			];
			const result = extractDocument(load(`${article}${script(state)}`));
			if (index === 16) expect(companion(result)).toBeUndefined();
			else
				expect(required(result).entries[0].source.path).toBe(
					productPath.replace("queries[0]", "queries[15]"),
				);
		},
	);

	it.each([31, 32])(
		"bounds module traversal with a primary at module index %i",
		(index) => {
			const products = [
				...Array.from({ length: index }, () => product({}, "99999999")),
				product(),
			];
			const result = extractDocument(
				load(`${article}${script(payload(products))}`),
			);
			if (index === 32) expect(companion(result)).toBeUndefined();
			else
				expect(required(result).entries[0].source.path).toBe(
					productPath.replace("modules[0]", "modules[31]"),
				);
		},
	);

	it.each([1_048_576, 1_048_577])(
		"bounds inert JSON block input to %i code units",
		(length) => {
			const json = JSON.stringify(payload()).padEnd(length, " ");
			const source = `${article}<script id="__NEXT_DATA__" type="application/json">${json}</script>`;
			const tree = loadResearchDocument(
				response(source),
				context,
				undefined,
				"separate-omitted-raw-v1",
			);
			trees.push(tree);
			const result = extractDocument(tree);
			if (length > 1_048_576) expect(companion(result)).toBeUndefined();
			else expect(required(result).entries[0].tcin).toBe(routeTcin);
		},
	);

	it("caps the entire source companion at 32768 UTF-8 JSON bytes", () => {
		const description = "😀".repeat(3500);
		const primary = product(
			{ downstream_description: description },
			routeTcin,
			Array.from({ length: 3 }, (_, index) =>
				product(
					{ downstream_description: description },
					String(87654321 + index),
				),
			),
		);
		const data = collect([primary]);
		expect(bytes(data)).toBeLessThanOrEqual(32768);
		expect(data.truncated).toBe(true);
		expect(data.entries[0].tcin).toBe(routeTcin);
		for (const entry of data.entries) {
			if (entry.description !== undefined)
				expect(entry.description).toBe(description);
		}
	});

	it.each(formats)(
		"fits exact final UTF-8 %s output without turning base success into failure",
		(format) => {
			const primary = product({}, routeTcin, [
				product({ title: "Variant β 😀" }, "87654321"),
			]);
			const tree = load(`${article}${script(payload([primary]))}`);
			const full = extractDocument(tree, { format });
			const data = required(full);
			const stored = JSON.stringify(data);
			const { sourceProducts: omitted, ...baseline } = full as Extraction & {
				sourceProducts?: SourceProducts;
			};
			expect(omitted).toBe(data);
			const baselineBytes = bytes(baseline);
			expect(baselineBytes).toBeGreaterThan(JSON.stringify(baseline).length);
			expect(
				extractDocument(tree, { format, maxBytes: baselineBytes }),
			).toEqual(baseline);
			const emptyEnvelope = { ...data, truncated: true, entries: [] };
			const noEntryBudget = bytes({
				...baseline,
				sourceProducts: emptyEnvelope,
			});
			expect(
				extractDocument(tree, { format, maxBytes: noEntryBudget }),
			).toEqual(baseline);
			const prefix = {
				...data,
				truncated: true,
				entries: data.entries.slice(0, 1),
			};
			const prefixBudget = bytes({ ...baseline, sourceProducts: prefix });
			const prefixResult = extractDocument(tree, {
				format,
				maxBytes: prefixBudget,
			});
			expect(prefixResult).toEqual({ ...baseline, sourceProducts: prefix });
			expect(bytes(prefixResult)).toBe(prefixBudget);
			const exact = extractDocument(tree, { format, maxBytes: bytes(full) });
			expect(exact).toEqual(full);
			expect(bytes(exact)).toBe(bytes(full));
			for (const maxBytes of [prefixBudget - 1, bytes(full) - 1]) {
				const result = extractDocument(tree, { format, maxBytes });
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
				expect(result.content).toEqual(full.content);
				const fitted = companion(result);
				if (fitted) {
					expect(fitted.entries.length).toBeGreaterThan(0);
					expect(fitted.entries[0].tcin).toBe(routeTcin);
					expect(fitted.truncated).toBe(true);
					expectFrozen(fitted);
				}
			}
			expect(JSON.stringify(data)).toBe(stored);
			expect(required(extractDocument(tree, { format }))).toEqual(data);
		},
	);
});
