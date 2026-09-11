import { parseCssImports } from "./css-imports.js";
import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";

export interface StylesheetInput {
	readonly url: string;
	readonly text: string;
	readonly encoding: string;
}
export interface ImportedStylesheet {
	readonly start: number;
	readonly end: number;
	readonly url: string;
	readonly media: string;
	readonly sheet: StylesheetSource | null;
	readonly cycle: boolean;
}
export interface StylesheetSource extends StylesheetInput {
	readonly imports: readonly Readonly<ImportedStylesheet>[];
}
export interface StylesheetImportOptions {
	readonly signal: AbortSignal;
	readonly fetch: (
		url: string,
		parent: Readonly<StylesheetInput>,
	) => Promise<Readonly<StylesheetInput>>;
	readonly requestedUrl?: string;
	readonly inline?: boolean;
	readonly maxSheets?: number;
	readonly maxImports?: number;
	readonly maxCodeUnits?: number;
	readonly maxDepth?: number;
	readonly maxWork?: number;
}
export const stylesheetImportLimits = Object.freeze({
	maxSheets: 64,
	maxImports: 64,
	maxCodeUnits: 524_288,
	maxDepth: 16,
	maxWork: 4_000_000,
});

const sourceSizes = new WeakMap<
	Readonly<StylesheetSource>,
	Readonly<{ sheets: number; codeUnits: number }>
>();

export function stylesheetSourceSize(source: Readonly<StylesheetSource>) {
	const size = sourceSizes.get(source);
	if (!size)
		throw new AgentBrowserError(
			"invalid-input",
			"Stylesheet source must come from the import loader",
		);
	return size;
}

function stylesheetUrl(value: string): string {
	if (
		typeof value !== "string" ||
		value.length > 16_384 ||
		/\p{Cc}/u.test(value)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid stylesheet source URL",
		);
	const url = parseNetworkUrl(value);
	url.hash = "";
	return url.href;
}

export async function loadStylesheetImports(
	input: Readonly<StylesheetInput>,
	options: StylesheetImportOptions,
) {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		(options.inline !== undefined && typeof options.inline !== "boolean") ||
		!(options.signal instanceof AbortSignal) ||
		typeof options.fetch !== "function"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid stylesheet import options",
		);
	const limits: Record<keyof typeof stylesheetImportLimits, number> = {
		...stylesheetImportLimits,
	};
	for (const name of Object.keys(limits) as (keyof typeof limits)[]) {
		const value = options[name];
		if (value === undefined) continue;
		if (!Number.isSafeInteger(value) || value < 1 || value > limits[name])
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid stylesheet import limit",
			);
		limits[name] = value;
	}
	let work = 0;
	let sheets = 0;
	let codeUnits = 0;
	let requests = 0;
	let cycles = 0;
	let imported = 0;
	const issues: Record<string, number> = Object.create(null);
	const charge = (amount = 1) => {
		work += amount;
		if (work > limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Stylesheet import work limit exceeded",
			);
		if (options.signal.aborted)
			throw new AgentBrowserError(
				"aborted",
				"Stylesheet import loading aborted",
			);
	};
	const issue = (code: string, count = 1) => {
		issues[code] = (issues[code] ?? 0) + count;
	};
	const fetchImport = (url: string, parent: Readonly<StylesheetInput>) =>
		new Promise<Readonly<StylesheetInput>>((resolve, reject) => {
			const signal = options.signal;
			const abort = () =>
				reject(
					new AgentBrowserError("aborted", "Stylesheet import loading aborted"),
				);
			if (signal.aborted) {
				abort();
				return;
			}
			signal.addEventListener("abort", abort, { once: true });
			Promise.resolve()
				.then(() => {
					charge();
					return options.fetch(url, parent);
				})
				.then(
					(value) => {
						signal.removeEventListener("abort", abort);
						resolve(value);
					},
					(error) => {
						signal.removeEventListener("abort", abort);
						reject(error);
					},
				);
		});
	const sourceInput = (
		source: Readonly<StylesheetInput>,
	): Readonly<StylesheetInput> => {
		charge();
		if (
			!source ||
			typeof source !== "object" ||
			typeof source.text !== "string" ||
			typeof source.encoding !== "string" ||
			source.encoding.length > 128
		)
			throw new AgentBrowserError("invalid-input", "Invalid stylesheet source");
		if (source.text.length > limits.maxCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Stylesheet import text limit exceeded",
			);
		return Object.freeze({
			url: stylesheetUrl(source.url),
			text: source.text,
			encoding: source.encoding,
		});
	};
	const root = sourceInput(input);
	const rootAliases = new Set(options.inline ? [] : [root.url]);
	if (options.requestedUrl !== undefined) {
		const requested = stylesheetUrl(options.requestedUrl);
		if (!options.inline) rootAliases.add(requested);
	}
	const visit = async (
		source: Readonly<StylesheetInput>,
		depth: number,
		ancestors: ReadonlySet<string>,
	): Promise<Readonly<StylesheetSource>> => {
		charge();
		const previousSheets = sheets;
		const previousCodeUnits = codeUnits;
		if (depth > limits.maxDepth || ++sheets > limits.maxSheets)
			throw new AgentBrowserError(
				"resource-limit",
				"Stylesheet import graph limit exceeded",
			);
		codeUnits += source.text.length;
		if (codeUnits > limits.maxCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Stylesheet import aggregate text limit exceeded",
			);
		const parsed = parseCssImports(source.text, {
			maxCodeUnits: limits.maxCodeUnits,
			maxWork: Math.max(1, limits.maxWork - work),
		});
		charge(parsed.metrics.work);
		for (const [code, count] of Object.entries(parsed.issues)) {
			charge();
			issue(code, count);
		}
		const imports: Readonly<ImportedStylesheet>[] = [];
		for (const entry of parsed.imports) {
			charge();
			if (++imported > limits.maxImports)
				throw new AgentBrowserError(
					"resource-limit",
					"Stylesheet import count limit exceeded",
				);
			let url: string;
			try {
				if (/\p{Cc}/u.test(entry.url))
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid stylesheet import URL",
					);
				url = stylesheetUrl(new URL(entry.url, source.url).href);
			} catch {
				issue("css-import-invalid-url");
				continue;
			}
			const record = {
				start: entry.start,
				end: entry.end,
				media: entry.media,
				url,
			};
			if (ancestors.has(url)) {
				cycles++;
				imports.push(Object.freeze({ ...record, sheet: null, cycle: true }));
				continue;
			}
			if (depth >= limits.maxDepth || sheets >= limits.maxSheets)
				throw new AgentBrowserError(
					"resource-limit",
					"Stylesheet import graph limit exceeded",
				);
			let child: Readonly<StylesheetInput> | undefined;
			try {
				requests++;
				child = sourceInput(await fetchImport(url, source));
				charge();
			} catch (error) {
				if (options.signal.aborted)
					throw new AgentBrowserError(
						"aborted",
						"Stylesheet import loading aborted",
					);
				if (
					error instanceof AgentBrowserError &&
					["aborted", "resource-limit"].includes(error.code)
				)
					throw error;
				issue(
					error instanceof AgentBrowserError
						? `css-import-${error.code}`
						: "css-import-load-failed",
				);
			}
			if (!child) {
				imports.push(Object.freeze({ ...record, sheet: null, cycle: false }));
				continue;
			}
			if (ancestors.has(child.url)) {
				cycles++;
				imports.push(Object.freeze({ ...record, sheet: null, cycle: true }));
				continue;
			}
			charge(ancestors.size);
			const path = new Set(ancestors);
			path.add(url);
			path.add(child.url);
			imports.push(
				Object.freeze({
					...record,
					sheet: await visit(child, depth + 1, path),
					cycle: false,
				}),
			);
		}
		const result = Object.freeze({
			...source,
			imports: Object.freeze(imports),
		});
		sourceSizes.set(
			result,
			Object.freeze({
				sheets: sheets - previousSheets,
				codeUnits: codeUnits - previousCodeUnits,
			}),
		);
		return result;
	};
	const source = await visit(root, 0, rootAliases);
	charge();
	return Object.freeze({
		source,
		issues: Object.freeze(issues),
		metrics: Object.freeze({
			work,
			sheets,
			codeUnits,
			requests,
			cycles,
			imports: imported,
		}),
	});
}
