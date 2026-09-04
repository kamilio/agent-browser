import { AgentBrowserError } from "./errors.js";
import type { HtmlParserNode } from "./html-formatting.js";
import type { HtmlToken } from "./html-tokenizer.js";

type TagToken = Extract<HtmlToken, { kind: "start" | "end" }>;
type Mode =
	| "body"
	| "table"
	| "section"
	| "row"
	| "cell"
	| "caption"
	| "colgroup";
interface Context {
	mode: Mode;
	index: number;
	virtual: boolean;
}
const sections = new Set(["tbody", "thead", "tfoot"]);
const structure = new Set([
	"caption",
	"col",
	"colgroup",
	"tbody",
	"thead",
	"tfoot",
	"tr",
	"td",
	"th",
]);
const containers = new Set(["table", "tbody", "thead", "tfoot", "tr"]);
const forbidden = new Set([
	"body",
	"caption",
	"col",
	"colgroup",
	"html",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
]);

export class HtmlTables {
	private readonly pending: string[] = [];
	private pendingUnits = 0;
	private nonWhitespace = false;
	private work = 0;

	constructor(
		private readonly options: {
			stack: () => HtmlParserNode[];
			template: () => { index: number; mode: string } | undefined;
			push: (tag: string, attributes: Record<string, string>) => void;
			insert: (tag: string, attributes: Record<string, string>) => void;
			form: (attributes: Record<string, string>) => void;
			emit: (data: string, foster: boolean, reconstruct: boolean) => void;
			reset: () => void;
			issue: (code: string) => void;
			check: () => void;
			maxWork: number;
			maxText: number;
		},
	) {
		this.options = Object.freeze({ ...options });
		if (
			!Number.isSafeInteger(this.options.maxWork) ||
			this.options.maxWork < 1 ||
			!Number.isSafeInteger(this.options.maxText) ||
			this.options.maxText < 1
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid HTML table work limits",
			);
	}

	context(): Context {
		const stack = this.options.stack();
		for (let index = stack.length - 1; index >= 0; index--) {
			this.visit();
			let tag = stack[index].tag;
			const virtual = index === 0 || tag === "template";
			if (tag === "template") tag = this.options.template()?.mode ?? "body";
			const mode: Mode | undefined =
				tag === "table"
					? "table"
					: sections.has(tag)
						? "section"
						: tag === "tr"
							? "row"
							: tag === "td" || tag === "th"
								? "cell"
								: tag === "caption"
									? "caption"
									: tag === "colgroup"
										? "colgroup"
										: virtual
											? "body"
											: undefined;
			if (mode) return { mode, index, virtual };
		}
		return { mode: "body", index: 0, virtual: true };
	}

	characters(source: string) {
		let data = source;
		while (data) {
			this.visit();
			const context = this.context();
			if (context.mode === "colgroup") {
				const whitespace = /^[\t\n\f\r ]*/.exec(data)?.[0] ?? "";
				if (whitespace) this.options.emit(whitespace, false, false);
				data = data.slice(whitespace.length);
				if (!data) return;
				if (context.virtual) {
					this.options.issue("ignored-text-in-colgroup");
					this.options.emit(data.replace(/[^\t\n\f\r ]/g, ""), false, false);
					return;
				}
				this.close(context);
				continue;
			}
			const table = ["table", "section", "row"].includes(context.mode);
			const stack = this.options.stack();
			if (table && containers.has(stack[stack.length - 1].tag)) {
				if (data.length > this.options.maxText - this.pendingUnits)
					throw new AgentBrowserError(
						"resource-limit",
						"HTML pending table text limit exceeded",
					);
				this.pending.push(data);
				this.pendingUnits += data.length;
				this.nonWhitespace ||= /[^\t\n\f\r ]/.test(data);
				return;
			}
			this.options.emit(data, table, true);
			return;
		}
	}

	flush() {
		if (!this.pending.length) return;
		this.visit();
		const data = this.pending.join("");
		const foster = this.nonWhitespace;
		this.pending.length = 0;
		this.pendingUnits = 0;
		this.nonWhitespace = false;
		if (foster) this.options.issue("non-whitespace-table-text");
		this.options.emit(data, foster, foster);
	}

	scan(count: number) {
		if (!Number.isSafeInteger(count) || count < 0)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid HTML table scan work",
			);
		this.visit(count);
	}

	tag(token: TagToken): { handled: boolean; foster: boolean } {
		const { name, attributes } = token;
		const start = token.kind === "start";
		for (let attempt = 0; attempt < 32; attempt++) {
			this.visit();
			const context = this.context();
			if (context.mode === "body") {
				if (start && structure.has(name))
					return this.ignore("table-tag-outside-table");
				return { handled: false, foster: false };
			}
			if (!start && ["body", "html"].includes(name))
				return this.ignore("ignored-table-end");
			if (context.mode === "cell") {
				if (!start && ["td", "th"].includes(name)) {
					if (this.find(name) < 0 || !this.close(context))
						return this.ignore("unmatched-table-cell-end");
					return this.handled();
				}
				if (
					(start && structure.has(name)) ||
					(!start && ["table", "tbody", "tfoot", "thead", "tr"].includes(name))
				) {
					if ((!start && this.find(name) < 0) || !this.close(context))
						return this.ignore("ignored-table-cell-token");
					continue;
				}
				if (!start && ["caption", "col", "colgroup"].includes(name))
					return this.ignore("ignored-table-end");
				return { handled: false, foster: false };
			}
			if (context.mode === "caption") {
				if (!start && name === "caption") {
					if (!this.close(context))
						return this.ignore("unmatched-table-caption-end");
					return this.handled();
				}
				if ((start && structure.has(name)) || (!start && name === "table")) {
					if (!this.close(context))
						return this.ignore("ignored-table-caption-token");
					continue;
				}
				if (!start && forbidden.has(name))
					return this.ignore("ignored-table-end");
				return { handled: false, foster: false };
			}
			if (context.mode === "colgroup") {
				if (start && name === "col") {
					this.options.insert(name, attributes);
					return this.handled();
				}
				if (!start && name === "col") return this.ignore("ignored-col-end");
				if (!start && name === "colgroup") {
					if (!this.close(context))
						return this.ignore("ignored-colgroup-context-end");
					return this.handled();
				}
				if (!this.close(context)) return this.ignore("ignored-tag-in-colgroup");
				continue;
			}
			if (context.mode === "row") {
				if (start && ["td", "th"].includes(name)) {
					this.push(context, token);
					return this.handled();
				}
				if (!start && name === "tr") {
					if (!this.close(context))
						return this.ignore("unmatched-table-row-end");
					return this.handled();
				}
				if (
					(start && structure.has(name)) ||
					(!start && (name === "table" || sections.has(name)))
				) {
					if (
						(!start && sections.has(name) && this.find(name) < 0) ||
						!this.close(context)
					)
						return this.ignore("ignored-template-table-container");
					continue;
				}
				if (!start && forbidden.has(name))
					return this.ignore("ignored-table-end");
			}
			if (context.mode === "section") {
				if (start && name === "tr") {
					this.push(context, token);
					return this.handled();
				}
				if (start && ["td", "th"].includes(name)) {
					this.clear(context.index);
					this.options.push("tr", {});
					this.options.issue("implicit-table-row");
					continue;
				}
				if (!start && sections.has(name)) {
					if (this.find(name) < 0 || !this.close(context))
						return this.ignore("unmatched-table-section-end");
					return this.handled();
				}
				if (
					(start &&
						["caption", "col", "colgroup", "tbody", "tfoot", "thead"].includes(
							name,
						)) ||
					(!start && name === "table")
				) {
					if (!this.close(context))
						return this.ignore("ignored-template-table-container");
					continue;
				}
				if (!start && forbidden.has(name))
					return this.ignore("ignored-table-end");
			}
			if (
				start &&
				["caption", "colgroup", "tbody", "thead", "tfoot"].includes(name)
			) {
				const table = this.tableContext(context);
				this.push(table, token);
				return this.handled();
			}
			if (start && (name === "col" || ["tr", "td", "th"].includes(name))) {
				this.clear(this.tableContext(context).index);
				this.options.push(name === "col" ? "colgroup" : "tbody", {});
				continue;
			}
			if (name === "table") {
				const index = this.find("table");
				if (index < 1) return this.ignore("unmatched-table-token");
				this.close({ mode: "table", index, virtual: false });
				if (!start) return this.handled();
				this.options.issue("nested-table-reprocessed");
				continue;
			}
			if (!start && forbidden.has(name))
				return this.ignore("ignored-table-end");
			if (["style", "script", "template"].includes(name))
				return { handled: false, foster: false };
			if (
				start &&
				name === "input" &&
				attributes.type?.replace(/[A-Z]/g, (letter) => letter.toLowerCase()) ===
					"hidden"
			) {
				this.options.insert(name, attributes);
				return this.handled();
			}
			if (start && name === "form") {
				this.options.form(attributes);
				return this.handled();
			}
			return { handled: false, foster: true };
		}
		throw new AgentBrowserError(
			"resource-limit",
			"HTML table token reprocessing limit exceeded",
		);
	}

	private tableContext(fallback: Context): Context {
		const index = this.find("table");
		return index >= 0
			? { mode: "table", index, virtual: index === 0 }
			: fallback;
	}
	private find(tag: string) {
		const stack = this.options.stack();
		for (let index = stack.length - 1; index > 0; index--) {
			this.visit();
			if (stack[index].tag === tag) return index;
			if (["table", "template", "html"].includes(stack[index].tag)) break;
		}
		return -1;
	}
	private clear(index: number) {
		this.options.stack().length = index + 1;
		this.options.reset();
	}
	private close(context: Context) {
		if (context.virtual) return false;
		this.options.stack().length = context.index;
		this.options.reset();
		return true;
	}
	private push(context: Context, token: TagToken) {
		this.clear(context.index);
		this.options.push(token.name, token.attributes);
		if (token.selfClosing) this.options.issue("nonvoid-self-close-ignored");
	}
	private ignore(code: string) {
		this.options.issue(code);
		return this.handled();
	}
	private handled() {
		return { handled: true, foster: false };
	}
	private visit(count = 1) {
		this.options.check();
		this.work += count;
		if (this.work > this.options.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"HTML table work limit exceeded",
			);
	}
}
