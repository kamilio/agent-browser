import { AgentBrowserError } from "./errors.js";
import {
	isHtmlSpecial,
	isHtmlScopeBoundary,
	type HtmlParserNode,
} from "./html-formatting.js";

const implied = new Set([
	"dd",
	"dt",
	"li",
	"optgroup",
	"option",
	"p",
	"rb",
	"rp",
	"rt",
	"rtc",
]);
const headings = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const bodyEndAllowed = new Set([
	...implied,
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
	"body",
	"html",
]);
type ScopeKind = "normal" | "button" | "list";
interface ScopeOptions {
	stack(): HtmlParserNode[];
	reset(): void;
	issue(code: string): void;
	check(): void;
	maxWork: number;
}

export class HtmlScope {
	private work = 0;
	private readonly options: Readonly<ScopeOptions>;

	constructor(options: ScopeOptions) {
		if (!Number.isSafeInteger(options.maxWork) || options.maxWork < 1)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid HTML scope work limit",
			);
		this.options = Object.freeze({ ...options });
	}

	find(target: string | HtmlParserNode, kind: ScopeKind = "normal"): number {
		return this.search(
			(node) =>
				typeof target === "string" ? node.tag === target : node === target,
			kind,
		);
	}

	findHeading(): number {
		return this.search((node) => headings.has(node.tag), "normal");
	}

	canEndBody(): boolean {
		const stack = this.options.stack();
		let unclosed = false;
		for (let index = stack.length - 1; index >= 0; index--) {
			this.visit();
			const tag = stack[index].tag;
			if (tag === "body") {
				if (unclosed) this.options.issue("unclosed-elements-at-body-end");
				return true;
			}
			if (isHtmlScopeBoundary(tag)) return false;
			if (!bodyEndAllowed.has(tag)) unclosed = true;
		}
		return false;
	}

	imply(except?: string): void {
		const stack = this.options.stack();
		while (stack.length > 1) {
			this.visit();
			const tag = stack[stack.length - 1].tag;
			if (tag === except || !implied.has(tag)) break;
			stack.pop();
		}
		this.options.reset();
	}

	close(index: number, except?: string, expected?: string): boolean {
		const stack = this.options.stack();
		if (index < 1 || index >= stack.length) return false;
		const node = stack[index];
		this.imply(except);
		if (stack[stack.length - 1] !== node || (expected && node.tag !== expected))
			this.options.issue("misnested-body-end");
		stack.length = Math.min(stack.length, index);
		this.options.reset();
		return true;
	}

	ordinaryEnd(tag: string): boolean {
		const stack = this.options.stack();
		for (let index = stack.length - 1; index > 0; index--) {
			this.visit();
			if (stack[index].tag === tag) return this.close(index, tag);
			if (isHtmlSpecial(stack[index].tag)) break;
		}
		return false;
	}

	startList(tag: "li" | "dd" | "dt"): void {
		const stack = this.options.stack();
		for (let index = stack.length - 1; index > 0; index--) {
			this.visit();
			const current = stack[index].tag;
			if (
				current === tag ||
				(tag !== "li" && (current === "dd" || current === "dt"))
			) {
				this.close(index, current);
				return;
			}
			if (isHtmlSpecial(current) && !["address", "div", "p"].includes(current))
				return;
		}
	}

	private search(
		matches: (node: HtmlParserNode) => boolean,
		kind: ScopeKind,
	): number {
		const stack = this.options.stack();
		for (let index = stack.length - 1; index > 0; index--) {
			this.visit();
			const node = stack[index];
			if (matches(node)) return index;
			if (
				isHtmlScopeBoundary(node.tag) ||
				(kind === "button" && node.tag === "button") ||
				(kind === "list" && (node.tag === "ol" || node.tag === "ul"))
			)
				break;
		}
		return -1;
	}

	private visit(): void {
		this.options.check();
		if (++this.work > this.options.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"HTML scope work limit exceeded",
			);
	}
}
