import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export interface ReactPlaygroundRoute {
	readonly pathname: string;
	readonly markdownPath: readonly string[];
}

export interface ResearchSourcePlaygroundEntry {
	readonly source: Readonly<{
		offset: number;
		offsetBasis: "lf-normalized-utf16";
		path: string;
		playgroundPath: string;
	}>;
	readonly code: string;
	readonly className?: string;
	readonly meta?: string;
}

export interface ResearchSourcePlaygrounds {
	readonly kind: "react-sandpack-source-code-v1";
	readonly scope: "document-source";
	readonly partial: true;
	readonly rendered: false;
	readonly verified: false;
	readonly textFormat: "code-source";
	readonly routePathname: string;
	readonly entries: readonly ResearchSourcePlaygroundEntry[];
	readonly truncated: boolean;
}

const maximumBytes = 65_536;
const information = new WeakMap<DocumentTree, ResearchSourcePlaygrounds>();
const registered = new WeakSet<DocumentTree>();

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(value: unknown, key: string): unknown {
	return record(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

function snapshot(
	routePathname: string,
	entries: readonly ResearchSourcePlaygroundEntry[],
	truncated: boolean,
): ResearchSourcePlaygrounds {
	return Object.freeze({
		kind: "react-sandpack-source-code-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		verified: false,
		textFormat: "code-source",
		routePathname,
		entries: Object.freeze(
			entries.map((entry) =>
				Object.freeze({
					source: Object.freeze({ ...entry.source }),
					code: entry.code,
					...(entry.className === undefined
						? {}
						: { className: entry.className }),
					...(entry.meta === undefined ? {} : { meta: entry.meta }),
				}),
			),
		),
		truncated,
	});
}

export function reactPlaygroundRoute(
	value: string,
): ReactPlaygroundRoute | undefined {
	if (typeof value !== "string" || /[\\\p{Cc} ]/u.test(value)) return;
	const matched =
		/^https:\/\/react\.dev(\/(?:learn|reference)(?:\/[a-z0-9-]+)*\/?)$/.exec(
			value.split(/[?#]/, 1)[0],
		);
	if (!matched) return;
	const pathname = matched[1].replace(/\/$/, "");
	return Object.freeze({
		pathname,
		markdownPath: Object.freeze(pathname.slice(1).split("/")),
	});
}

export class ResearchSourcePlaygroundsCollector {
	private blocks = 0;
	private visited = 0;
	private codeUnits = 0;
	private truncated = false;
	private readonly entries: ResearchSourcePlaygroundEntry[] = [];
	private readonly route: ReactPlaygroundRoute;

	constructor(
		route: ReactPlaygroundRoute,
		private readonly checkpoint?: () => void,
	) {
		const normalized =
			route && reactPlaygroundRoute(`https://react.dev${route.pathname}`);
		if (
			!normalized ||
			normalized.pathname !== route.pathname ||
			!Array.isArray(route.markdownPath) ||
			route.markdownPath.length !== normalized.markdownPath.length ||
			!normalized.markdownPath.every(
				(segment, index) => segment === route.markdownPath[index],
			)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid playground source route",
			);
		this.route = normalized;
	}

	private decode(value: string): unknown {
		this.checkpoint?.();
		let parsed: unknown;
		try {
			parsed = JSON.parse(value);
		} catch {
			parsed = undefined;
		}
		this.checkpoint?.();
		return parsed;
	}

	add(source: string, start: number, end: number, offset: number): void {
		if (
			typeof source !== "string" ||
			![start, end, offset].every(Number.isSafeInteger) ||
			offset < 0 ||
			start < offset ||
			end < start ||
			end > source.length
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid playground source span",
			);
		if (++this.blocks > 1 || end - start > 1_048_576) {
			this.truncated = true;
			return;
		}
		const data = this.decode(source.slice(start, end));
		const markdownPath = own(own(data, "query"), "markdownPath");
		if (
			own(data, "page") !== "/[[...markdownPath]]" ||
			!Array.isArray(markdownPath) ||
			markdownPath.length !== this.route.markdownPath.length ||
			!this.route.markdownPath.every(
				(segment, index) => segment === markdownPath[index],
			)
		)
			return;
		const content = own(own(own(data, "props"), "pageProps"), "content");
		if (typeof content !== "string") return;
		if (content.length > 524_288) {
			this.truncated = true;
			return;
		}
		this.visit(this.decode(content), "content", 0, offset);
	}

	private visit(
		value: unknown,
		path: string,
		depth: number,
		offset: number,
		playgroundPath?: string,
		parentTag?: string,
	): void {
		if (this.visited >= 10_000 || depth > 64) {
			this.truncated = true;
			return;
		}
		this.visited++;
		this.checkpoint?.();
		if (!Array.isArray(value)) return;
		if (value[0] !== "$r") {
			if (depth === 64 && value.length > 0) {
				this.truncated = true;
				return;
			}
			for (let index = 0; index < value.length; index++) {
				if (this.visited >= 10_000) {
					this.truncated = true;
					break;
				}
				this.visit(
					value[index],
					`${path}[${index}]`,
					depth + 1,
					offset,
					playgroundPath,
					parentTag,
				);
			}
			return;
		}
		const tag: unknown = value[1];
		const props: unknown = value[3];
		if (value.length !== 4 || typeof tag !== "string" || !record(props)) return;
		const owner = tag === "Sandpack" ? path : playgroundPath;
		const children = own(props, "children");
		if (
			tag === "code" &&
			parentTag === "pre" &&
			owner !== undefined &&
			typeof children === "string"
		) {
			this.collect(props, children, offset, path, owner);
			return;
		}
		if (children !== undefined)
			this.visit(children, `${path}.children`, depth + 1, offset, owner, tag);
	}

	private collect(
		props: Record<string, unknown>,
		code: string,
		offset: number,
		path: string,
		playgroundPath: string,
	): void {
		if (
			this.entries.length >= 32 ||
			code.length > 16_384 ||
			this.codeUnits + code.length > 65_536
		) {
			this.truncated = true;
			return;
		}
		const bounded = (key: string, limit: number): string | undefined => {
			const value = own(props, key);
			if (typeof value !== "string") return;
			if (value.length <= limit) return value;
			this.truncated = true;
		};
		const className = bounded("className", 256);
		const meta = bounded("meta", 512);
		this.entries.push({
			source: {
				offset,
				offsetBasis: "lf-normalized-utf16",
				path,
				playgroundPath,
			},
			code,
			...(className === undefined ? {} : { className }),
			...(meta === undefined ? {} : { meta }),
		});
		this.codeUnits += code.length;
	}

	finish(): ResearchSourcePlaygrounds | undefined {
		return fitResearchSourcePlaygrounds(
			snapshot(this.route.pathname, this.entries, this.truncated),
			maximumBytes,
		);
	}
}

export function fitResearchSourcePlaygrounds(
	data: ResearchSourcePlaygrounds,
	maxBytes: number,
): ResearchSourcePlaygrounds | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid playground source byte limit",
		);
	const limit = Math.min(maxBytes, maximumBytes);
	for (let count = Math.min(data.entries.length, 32); count > 0; count--) {
		const prefix = snapshot(
			data.routePathname,
			data.entries.slice(0, count),
			data.truncated || count < data.entries.length,
		);
		if (utf8ByteLength(JSON.stringify(prefix)) <= limit) return prefix;
	}
	return;
}

export function researchSourcePlaygrounds(
	tree: DocumentTree,
): ResearchSourcePlaygrounds | undefined {
	return information.get(tree);
}

export function setResearchSourcePlaygrounds(
	tree: DocumentTree,
	data: ResearchSourcePlaygrounds,
): void {
	const copied = fitResearchSourcePlaygrounds(data, maximumBytes);
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
