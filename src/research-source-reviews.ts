import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseSourceLiteral } from "./source-literal.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export interface RtingsReviewRoute {
	readonly path: string;
}

export type ResearchSourceReviewScalar = string | number | boolean | null;

export interface ResearchSourceReviewLocation {
	readonly offset: number;
	readonly offsetBasis: "lf-normalized-utf16";
	readonly path: string;
}

export type ResearchSourceReviewEntry =
	| Readonly<{
			kind: "introduction";
			source: ResearchSourceReviewLocation;
			html: string;
	  }>
	| Readonly<{
			kind: "summary";
			source: ResearchSourceReviewLocation;
			html: string;
			id: string;
			title: string | null;
			priority: ResearchSourceReviewScalar;
			order: ResearchSourceReviewScalar;
			usageIds: readonly string[];
	  }>
	| Readonly<{
			kind: "rating-description";
			source: ResearchSourceReviewLocation;
			html: string;
			usageId: string;
			usageName: string;
			usageKind: string;
			unblurred: boolean;
			scoreState: "missing" | "null" | "omitted";
	  }>;

export interface ResearchSourceReviews {
	readonly kind: "rtings-component-review-text-v1";
	readonly scope: "document-source";
	readonly partial: true;
	readonly rendered: false;
	readonly verified: false;
	readonly textFormat: "html-source";
	readonly routePath: string;
	readonly productId: string;
	readonly productName: string;
	readonly reviewId: string;
	readonly entries: readonly ResearchSourceReviewEntry[];
	readonly truncated: boolean;
}

const information = new WeakMap<DocumentTree, ResearchSourceReviews>();
const registered = new WeakSet<DocumentTree>();
const reviewPath = "$.page_banner.page.product.review";
const maximumBytes = 32_768;

function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(value: unknown, key: string): unknown {
	return object(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

function text(value: unknown, maximum: number): value is string {
	return typeof value === "string" && value.length <= maximum;
}

function nonemptyText(value: unknown, maximum: number): value is string {
	return text(value, maximum) && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 32 &&
		/^[1-9][0-9]*$/.exec(value)?.[0] === value
	);
}

function scalar(value: unknown): value is ResearchSourceReviewScalar {
	return (
		value === null ||
		typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value)) ||
		text(value, 128)
	);
}

export function rtingsReviewRoute(
	value: string,
): RtingsReviewRoute | undefined {
	if (typeof value !== "string" || value.length > 4096 || /\p{Cc}/u.test(value))
		return;
	const matched =
		/^https:\/\/www\.rtings\.com(\/([a-z0-9][a-z0-9-]{0,63})\/reviews\/[a-z0-9][a-z0-9-]{0,127}\/[a-z0-9][a-z0-9-]{0,255})(?:#[\s\S]*)?$/.exec(
			value,
		);
	if (
		!matched ||
		matched[0].length !== value.length ||
		matched[2] === "early-access"
	)
		return;
	return Object.freeze({ path: matched[1] });
}

function snapshot(
	data: Pick<
		ResearchSourceReviews,
		"routePath" | "productId" | "productName" | "reviewId"
	>,
	entries: readonly ResearchSourceReviewEntry[],
	truncated: boolean,
): ResearchSourceReviews {
	return Object.freeze({
		kind: "rtings-component-review-text-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		verified: false,
		textFormat: "html-source",
		routePath: data.routePath,
		productId: data.productId,
		productName: data.productName,
		reviewId: data.reviewId,
		entries: Object.freeze(
			entries.map((entry): ResearchSourceReviewEntry => {
				const source = Object.freeze({
					offset: entry.source.offset,
					offsetBasis: "lf-normalized-utf16" as const,
					path: entry.source.path,
				});
				if (entry.kind === "introduction")
					return Object.freeze({ kind: entry.kind, source, html: entry.html });
				if (entry.kind === "summary")
					return Object.freeze({
						kind: entry.kind,
						source,
						html: entry.html,
						id: entry.id,
						title: entry.title,
						priority: entry.priority,
						order: entry.order,
						usageIds: Object.freeze([...entry.usageIds]),
					});
				return Object.freeze({
					kind: entry.kind,
					source,
					html: entry.html,
					usageId: entry.usageId,
					usageName: entry.usageName,
					usageKind: entry.usageKind,
					unblurred: entry.unblurred,
					scoreState: entry.scoreState,
				});
			}),
		),
		truncated,
	});
}

function collectReviews(
	data: unknown,
	routePath: string,
	offset: number,
): ResearchSourceReviews | undefined {
	const query = own(data, "query_details");
	if (
		own(query, "url") !== routePath ||
		own(query, "named_version") !== "public" ||
		own(query, "version_id") !== null
	)
		return;
	for (const key of [
		"has_insider_access",
		"has_admin_access",
		"has_preview_access",
		"has_preview_access_through_product_token",
	]) {
		if (own(data, key) !== false) return;
	}
	for (const key of [
		"has_preview_access_through_share_token",
		"had_preview_access_through_expired_share_token",
	]) {
		const flag = own(data, key);
		if (flag !== false && flag !== null) return;
	}
	const product = own(own(own(data, "page_banner"), "page"), "product");
	const productId = own(product, "id");
	const productName = own(product, "fullname");
	const review = own(product, "review");
	const reviewId = own(review, "id");
	const summaries = own(review, "summaries");
	const ratings = own(review, "ratings");
	if (
		!identifier(productId) ||
		!nonemptyText(productName, 512) ||
		!identifier(reviewId) ||
		!Array.isArray(summaries) ||
		!Array.isArray(ratings)
	)
		return;
	const entries: ResearchSourceReviewEntry[] = [];
	let truncated = summaries.length > 32 || ratings.length > 16;
	const location = (path: string): ResearchSourceReviewLocation => ({
		offset,
		offsetBasis: "lf-normalized-utf16",
		path: `${reviewPath}.${path}`,
	});
	const introduction = own(review, "introduction_linked");
	if (nonemptyText(introduction, 4096)) {
		entries.push({
			kind: "introduction",
			source: location("introduction_linked"),
			html: introduction,
		});
	} else if (
		introduction !== undefined &&
		!(typeof introduction === "string" && introduction.trim().length === 0)
	) {
		truncated = true;
	}
	for (let index = 0; index < Math.min(summaries.length, 32); index++) {
		const summary = summaries[index];
		const id = own(summary, "id");
		const title = own(summary, "title");
		const priority = own(summary, "priority");
		const order = own(summary, "order");
		const usageIds = own(summary, "usage_ids");
		const html = own(summary, "blurb");
		if (
			!identifier(id) ||
			!(title === null || text(title, 256)) ||
			!scalar(priority) ||
			!scalar(order) ||
			!Array.isArray(usageIds) ||
			usageIds.length > 32 ||
			!usageIds.every(identifier) ||
			!nonemptyText(html, 4096)
		) {
			truncated = true;
			continue;
		}
		entries.push({
			kind: "summary",
			source: location(`summaries[${index}].blurb`),
			html,
			id,
			title,
			priority,
			order,
			usageIds,
		});
	}
	for (let index = 0; index < Math.min(ratings.length, 16); index++) {
		const rating = ratings[index];
		const usage = own(rating, "usage");
		if (own(usage, "is_hidden_from_featured_sections") === true) continue;
		const usageId = own(usage, "id");
		const usageName = own(usage, "name");
		const usageKind = own(usage, "kind");
		const unblurred = own(rating, "unblurred");
		const html = own(rating, "linked_description");
		if (
			!identifier(usageId) ||
			!nonemptyText(usageName, 256) ||
			!nonemptyText(usageKind, 64) ||
			typeof unblurred !== "boolean" ||
			!nonemptyText(html, 4096)
		) {
			truncated = true;
			continue;
		}
		entries.push({
			kind: "rating-description",
			source: location(`ratings[${index}].linked_description`),
			html,
			usageId,
			usageName,
			usageKind,
			unblurred,
			scoreState: !Object.hasOwn(rating, "score")
				? "missing"
				: own(rating, "score") === null
					? "null"
					: "omitted",
		});
	}
	if (!entries.length) return;
	return fitResearchSourceReviews(
		snapshot(
			{ routePath, productId, productName, reviewId },
			entries,
			truncated,
		),
		maximumBytes,
	);
}

export class ResearchSourceReviewsCollector {
	private readonly routePath: string;
	private matched = false;
	private data: ResearchSourceReviews | undefined;

	constructor(route: RtingsReviewRoute) {
		const path = own(route, "path");
		const validated =
			typeof path === "string"
				? rtingsReviewRoute(`https://www.rtings.com${path}`)
				: undefined;
		if (!validated || validated.path !== path)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid review source route",
			);
		this.routePath = validated.path;
	}

	add(value: string | undefined, offset: number): void {
		if (
			(value !== undefined && typeof value !== "string") ||
			!Number.isSafeInteger(offset) ||
			offset < 0
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid review source input",
			);
		if (this.matched) {
			this.data = undefined;
			return;
		}
		this.matched = true;
		if (value === undefined || value.length > 65_536) return;
		let literal: unknown;
		try {
			JSON.parse(value);
			literal = parseSourceLiteral(value);
		} catch {
			return;
		}
		this.data = collectReviews(literal, this.routePath, offset);
	}

	finish(): ResearchSourceReviews | undefined {
		return this.data;
	}
}

export function fitResearchSourceReviews(
	data: ResearchSourceReviews,
	maxBytes: number,
): ResearchSourceReviews | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid review source byte limit",
		);
	const limit = Math.min(maxBytes, maximumBytes);
	for (let count = Math.min(data.entries.length, 49); count >= 0; count--) {
		const prefix = snapshot(
			data,
			data.entries.slice(0, count),
			data.truncated || count === 0 || count < data.entries.length,
		);
		if (utf8ByteLength(JSON.stringify(prefix)) <= limit) return prefix;
	}
	return;
}

export function researchSourceReviews(
	tree: DocumentTree,
): ResearchSourceReviews | undefined {
	return information.get(tree);
}

export function setResearchSourceReviews(
	tree: DocumentTree,
	data: ResearchSourceReviews,
): void {
	const copied = fitResearchSourceReviews(data, maximumBytes);
	if (!registered.has(tree)) {
		tree.onClose(() => {
			information.delete(tree);
			registered.delete(tree);
		});
		registered.add(tree);
	}
	if (copied) information.set(tree, copied);
	else information.delete(tree);
}
