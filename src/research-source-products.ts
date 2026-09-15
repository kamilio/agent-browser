import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface ResearchSourceProduct {
	readonly source: Readonly<{
		offset: number;
		offsetBasis: "lf-normalized-utf16";
		path: string;
	}>;
	readonly tcin: string;
	readonly relation: "route-product" | "variant-of-route-product";
	readonly title: string;
	readonly specifications: readonly string[];
	readonly highlights: readonly string[];
	readonly description?: string;
	readonly truncated: boolean;
}

export interface ResearchSourceProducts {
	readonly kind: "nextjs-target-product-descriptions-v1";
	readonly scope: "document-source";
	readonly partial: true;
	readonly rendered: false;
	readonly verified: false;
	readonly textFormat: "html-source";
	readonly routeTcin: string;
	readonly entries: readonly ResearchSourceProduct[];
	readonly truncated: boolean;
}

const information = new WeakMap<DocumentTree, ResearchSourceProducts>();
const encoder = new TextEncoder();
const identifier = /^[1-9][0-9]{5,11}$/;

export interface TargetProductRoute {
	readonly tcin: string;
	readonly slug: string;
}

function validSlug(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 1024 &&
		!/[\/\\\p{Cc}\p{Cf}]/u.test(value)
	);
}

function own(value: unknown, key: string): unknown {
	return value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.hasOwn(value, key)
		? (value as Record<string, unknown>)[key]
		: undefined;
}

function field(value: unknown, ...keys: string[]): unknown {
	let current = value;
	for (const key of keys) current = own(current, key);
	return current;
}

function text(
	value: unknown,
	limit: number,
	truncate: () => void,
): string | undefined {
	if (typeof value !== "string") return;
	if (value.length > limit) {
		truncate();
		return;
	}
	const escaped = value.replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
		character === "\n" || character === "\t"
			? character
			: `\\u{${character.codePointAt(0)?.toString(16)}}`,
	);
	if (escaped.length <= limit) return escaped;
	truncate();
}

function snapshot(
	routeTcin: string,
	entries: readonly ResearchSourceProduct[],
	truncated: boolean,
): ResearchSourceProducts {
	return Object.freeze({
		kind: "nextjs-target-product-descriptions-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		verified: false,
		textFormat: "html-source",
		routeTcin,
		truncated,
		entries: Object.freeze(
			entries.map((entry) =>
				Object.freeze({
					...entry,
					source: Object.freeze({ ...entry.source }),
					specifications: Object.freeze([...entry.specifications]),
					highlights: Object.freeze([...entry.highlights]),
				}),
			),
		),
	});
}

export function targetProductRoute(
	value: string,
): TargetProductRoute | undefined {
	try {
		const url = new URL(value);
		if (
			!["https://www.target.com", "https://target.com"].includes(url.origin) ||
			url.username ||
			url.password
		)
			return;
		const matched = /^\/p\/([^/]+)\/-\/A-([1-9][0-9]{5,11})\/?$/.exec(
			url.pathname,
		);
		if (!matched) return;
		const slug = decodeURIComponent(matched[1]);
		if (validSlug(slug)) return { tcin: matched[2], slug };
	} catch {
		return;
	}
}

export class ResearchSourceProductsCollector {
	private blocks = 0;
	private truncated = false;
	private readonly entries: ResearchSourceProduct[] = [];
	private readonly route: TargetProductRoute;

	constructor(route: TargetProductRoute) {
		if (
			!route ||
			typeof route.tcin !== "string" ||
			!identifier.test(route.tcin) ||
			!validSlug(route.slug)
		)
			throw new AgentBrowserError("invalid-input", "Invalid product source ID");
		this.route = Object.freeze({ tcin: route.tcin, slug: route.slug });
	}

	add(source: string, start: number, end: number, offset: number): void {
		if (
			![start, end, offset].every(Number.isSafeInteger) ||
			offset < 0 ||
			start < offset ||
			end < start ||
			end > source.length
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid product source span",
			);
		if (++this.blocks > 1 || end - start > 1_048_576) {
			this.truncated = true;
			return;
		}
		let data: unknown;
		try {
			data = JSON.parse(source.slice(start, end));
		} catch {
			return;
		}
		const subpath = field(data, "query", "subpath");
		if (
			own(data, "page") !== "/p/[...subpath]" ||
			!Array.isArray(subpath) ||
			subpath.length !== 3 ||
			subpath[0] !== this.route.slug ||
			subpath[1] !== "-" ||
			subpath[2] !== `A-${this.route.tcin}`
		)
			return;
		const queries = field(data, "props", "dehydratedState", "queries");
		if (!Array.isArray(queries)) return;
		if (queries.length > 16) this.truncated = true;
		for (
			let queryIndex = 0;
			queryIndex < Math.min(queries.length, 16);
			queryIndex++
		) {
			const modules = field(
				queries[queryIndex],
				"state",
				"data",
				"data",
				"data_source_modules",
			);
			if (!Array.isArray(modules)) continue;
			if (modules.length > 32) this.truncated = true;
			for (
				let moduleIndex = 0;
				moduleIndex < Math.min(modules.length, 32);
				moduleIndex++
			) {
				const product = field(
					modules[moduleIndex],
					"module_data",
					"data",
					"product",
				);
				if (own(product, "tcin") !== this.route.tcin) continue;
				const path = `$.props.dehydratedState.queries[${queryIndex}].state.data.data.data_source_modules[${moduleIndex}].module_data.data.product`;
				const entry = this.product(product, offset, path, "route-product");
				if (!entry) continue;
				this.entries.push(entry);
				const children = own(product, "children");
				if (Array.isArray(children)) {
					if (children.length > 3) this.truncated = true;
					for (
						let index = 0;
						index < Math.min(children.length, 32) && this.entries.length < 4;
						index++
					) {
						const tcin = own(children[index], "tcin");
						if (
							typeof tcin !== "string" ||
							!identifier.test(tcin) ||
							this.entries.some((item) => item.tcin === tcin)
						) {
							this.truncated = true;
							continue;
						}
						const child = this.product(
							children[index],
							offset,
							`${path}.children[${index}]`,
							"variant-of-route-product",
						);
						if (!child) continue;
						this.entries.push(child);
					}
				}
				return;
			}
		}
	}

	private product(
		value: unknown,
		offset: number,
		path: string,
		relation: ResearchSourceProduct["relation"],
	): ResearchSourceProduct | undefined {
		const tcin = own(value, "tcin");
		if (typeof tcin !== "string" || !identifier.test(tcin)) return;
		let truncated = false;
		const truncate = () => {
			truncated = true;
			this.truncated = true;
		};
		const description = field(value, "item", "product_description");
		const title = text(own(description, "title"), 512, truncate);
		if (!title?.trim()) return;
		const list = (items: unknown, limit: number) => {
			const values: string[] = [];
			if (!Array.isArray(items)) return values;
			if (items.length > limit) truncate();
			for (let index = 0; index < Math.min(items.length, limit); index++) {
				const item = text(items[index], 2048, truncate);
				if (item !== undefined) values.push(item);
			}
			return values;
		};
		const specifications = list(own(description, "bullet_descriptions"), 32);
		const highlights = list(field(description, "soft_bullets", "bullets"), 24);
		const downstream = text(
			own(description, "downstream_description"),
			8192,
			truncate,
		);
		return {
			source: { offset, offsetBasis: "lf-normalized-utf16", path },
			tcin,
			relation,
			title,
			specifications,
			highlights,
			...(downstream === undefined ? {} : { description: downstream }),
			truncated,
		};
	}

	finish(): ResearchSourceProducts | undefined {
		return fitResearchSourceProducts(
			snapshot(this.route.tcin, this.entries, this.truncated),
			32768,
		);
	}
}

export function fitResearchSourceProducts(
	data: ResearchSourceProducts,
	maxBytes: number,
): ResearchSourceProducts | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid product source byte limit",
		);
	const limit = Math.min(maxBytes, 32768);
	const bytes = (value: unknown) =>
		encoder.encode(JSON.stringify(value)).byteLength;
	if (!data.entries.length) return;
	if (bytes(data) <= limit) return data;
	for (let count = Math.min(data.entries.length - 1, 4); count > 0; count--) {
		const prefix = snapshot(data.routeTcin, data.entries.slice(0, count), true);
		if (bytes(prefix) <= limit) return prefix;
	}
	const first = data.entries[0];
	let entry = {
		...first,
		specifications: [...first.specifications],
		highlights: [...first.highlights],
		truncated: true,
	};
	for (;;) {
		const prefix = snapshot(data.routeTcin, [entry], true);
		if (bytes(prefix) <= limit) return prefix;
		if (entry.highlights.length) entry.highlights.pop();
		else if (entry.specifications.length) entry.specifications.pop();
		else if (entry.description !== undefined)
			entry = {
				source: entry.source,
				tcin: entry.tcin,
				relation: entry.relation,
				title: entry.title,
				specifications: entry.specifications,
				highlights: entry.highlights,
				truncated: true,
			};
		else return;
	}
}

export function researchSourceProducts(
	tree: DocumentTree,
): ResearchSourceProducts | undefined {
	return information.get(tree);
}

export function setResearchSourceProducts(
	tree: DocumentTree,
	data: ResearchSourceProducts,
): void {
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(tree, snapshot(data.routeTcin, data.entries, data.truncated));
}
