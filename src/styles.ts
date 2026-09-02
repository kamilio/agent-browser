import {
	type CssDeclaration,
	type CssParseBudget,
	type StyleViewport,
	type VisibilityProperty,
	cssMediaMatches,
	parseCssDeclarations,
	parseCssRules,
} from "./css-parser.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	DocumentQueries,
	type SelectorSpecificity,
	compareSpecificity,
} from "./selectors.js";

export interface StyleLimits {
	maxCodeUnits: number;
	maxRules: number;
	maxDeclarations: number;
	maxWork: number;
	maxSheets: number;
}
export interface VisibilityStyle {
	display: string;
	visibility: "visible" | "hidden" | "collapse";
	displayed: boolean;
	visible: boolean;
}
interface Winner {
	declaration: CssDeclaration;
	specificity: SelectorSpecificity;
	inline: boolean;
	order: number;
}
interface ExternalSheet {
	url: string;
	text: string;
}

const blockTags = new Set([
	"html",
	"body",
	"div",
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"section",
	"article",
	"aside",
	"header",
	"footer",
	"main",
	"nav",
	"form",
	"fieldset",
	"pre",
	"blockquote",
	"ol",
	"ul",
	"dl",
	"dt",
	"dd",
	"figure",
	"figcaption",
	"address",
	"details",
	"summary",
	"hr",
]);
const hiddenTags = new Set([
	"head",
	"script",
	"style",
	"template",
	"link",
	"meta",
	"base",
	"title",
]);
const instances = new WeakMap<DocumentTree, DocumentStyles>();

function userAgentDisplay(node: Readonly<DocumentNode>) {
	if (
		hiddenTags.has(node.tagName) ||
		Object.hasOwn(node.attributes, "hidden") ||
		(node.tagName === "input" &&
			node.attributes.type?.toLowerCase() === "hidden")
	)
		return "none";
	if (node.tagName === "li") return "list-item";
	if (node.tagName === "table") return "table";
	if (node.tagName === "tr") return "table-row";
	if (["td", "th"].includes(node.tagName)) return "table-cell";
	if (node.tagName === "tbody") return "table-row-group";
	return blockTags.has(node.tagName) || node.kind === "document"
		? "block"
		: "inline";
}

function outranks(candidate: Winner, previous: Winner) {
	return (
		Number(candidate.declaration.important) -
			Number(previous.declaration.important) ||
		Number(candidate.inline) - Number(previous.inline) ||
		compareSpecificity(candidate.specificity, previous.specificity) ||
		candidate.order - previous.order
	);
}

export class DocumentStyles {
	readonly limits: Readonly<StyleLimits>;
	private viewportValue: Readonly<StyleViewport> = Object.freeze({
		width: 1280,
		height: 720,
	});
	private readonly queries: DocumentQueries;
	private readonly external = new Map<number, ExternalSheet>();
	private readonly loadIssues: Record<string, number> = Object.create(null);
	private readonly unregister: () => unknown;
	private computed = new Map<number, Readonly<VisibilityStyle>>();
	private revision = -1;
	private closed = false;
	private info = {
		rules: 0,
		declarations: 0,
		work: 0,
		codeUnits: 0,
		issues: {} as Readonly<Record<string, number>>,
	};

	constructor(
		private readonly tree: DocumentTree,
		limits: Partial<StyleLimits> = {},
	) {
		this.limits = Object.freeze({
			maxCodeUnits: 524_288,
			maxRules: 4096,
			maxDeclarations: 16_384,
			maxWork: 5_000_000,
			maxSheets: 32,
			...limits,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError("invalid-input", "Invalid style limit");
		this.queries = new DocumentQueries(tree, {
			maxIndexedNodes: tree.limits.maxNodes,
			maxResults: tree.limits.maxNodes,
			maxWork: this.limits.maxWork,
		});
		this.unregister = tree.onClose(() => this.close());
	}

	get viewport() {
		return this.viewportValue;
	}
	setViewport(width: number, height: number) {
		this.ensureOpen();
		if (
			![width, height].every(
				(value) => Number.isSafeInteger(value) && value >= 1 && value <= 16_384,
			)
		)
			throw new AgentBrowserError("invalid-input", "Invalid CSS viewport");
		if (width === this.viewport.width && height === this.viewport.height)
			return;
		this.viewportValue = Object.freeze({ width, height });
		this.tree.invalidatePresentation();
	}

	setExternalSheet(id: number, url: string, text: string) {
		this.ensureOpen();
		if (typeof url !== "string" || url.length > 16_384)
			throw new AgentBrowserError("invalid-input", "Invalid stylesheet URL");
		if (
			this.tree.get(id).tagName !== "link" ||
			typeof text !== "string" ||
			text.length > this.limits.maxCodeUnits
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Invalid or oversized external stylesheet",
			);
		if (!this.external.has(id) && this.external.size >= this.limits.maxSheets)
			throw new AgentBrowserError(
				"resource-limit",
				"External stylesheet count exceeded",
			);
		const total = [...this.external.entries()].reduce(
			(size, [key, sheet]) => size + (key === id ? 0 : sheet.text.length),
			text.length,
		);
		if (total > this.limits.maxCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"External stylesheet text limit exceeded",
			);
		this.external.set(id, { url, text });
		this.tree.invalidatePresentation();
	}

	noteLoadIssue(code: string) {
		this.ensureOpen();
		if (
			!/^[a-z-]{1,64}$/.test(code) ||
			(!Object.hasOwn(this.loadIssues, code) &&
				Object.keys(this.loadIssues).length >= 32)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid stylesheet diagnostic",
			);
		this.loadIssues[code] = (this.loadIssues[code] ?? 0) + 1;
		this.tree.invalidatePresentation();
	}

	get(id: number): Readonly<VisibilityStyle> {
		this.refresh();
		const value = this.computed.get(id);
		if (!value)
			throw new AgentBrowserError("not-found", "Style target is not connected");
		return value;
	}

	metrics() {
		this.refresh();
		return Object.freeze({
			partial: true,
			properties: Object.freeze(["display", "visibility"]),
			layout: false,
			viewport: this.viewport,
			externalSheets: this.external.size,
			...this.info,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.external.clear();
		this.computed.clear();
		this.queries.close();
		this.unregister();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document styles are closed");
	}
	private refresh() {
		this.ensureOpen();
		if (this.revision === this.tree.revision) return;
		if (this.revision >= 0) {
			const journal = this.tree.changesSince(this.revision);
			if (
				!journal.reset &&
				journal.changes.every((change) => {
					if (change.kind !== "control") return false;
					const node = this.tree.get(change.target);
					return (
						node.tagName === "textarea" ||
						(node.tagName === "input" &&
							!["checkbox", "radio"].includes(
								node.attributes.type?.toLowerCase() ?? "text",
							))
					);
				})
			) {
				this.revision = this.tree.revision;
				return;
			}
		}
		this.revision = -1;
		this.computed.clear();
		const issues: Record<string, number> = { ...this.loadIssues };
		const issue = (code: string) => {
			issues[code] = (issues[code] ?? 0) + 1;
		};
		const budget: CssParseBudget = {
			rules: 0,
			declarations: 0,
			maxRules: this.limits.maxRules,
			maxDeclarations: this.limits.maxDeclarations,
		};
		let codeUnits = 0;
		let work = 0;
		let order = 0;
		const charge = (amount: number) => {
			work += amount;
			if (work > this.limits.maxWork)
				throw new AgentBrowserError(
					"resource-limit",
					"CSS cascade work limit exceeded",
				);
		};
		const source = (text: string) => {
			codeUnits += text.length;
			if (codeUnits > this.limits.maxCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"CSS source text limit exceeded",
				);
			return text;
		};
		const winners = new Map<number, Map<VisibilityProperty, Winner>>();
		const nodes = [...this.tree.walk()].map((entry) => entry.node);
		const apply = (
			id: number,
			declarations: CssDeclaration[],
			specificity: SelectorSpecificity,
			inline: boolean,
			baseOrder: number,
		) => {
			let properties = winners.get(id);
			if (!properties) {
				properties = new Map();
				winners.set(id, properties);
			}
			for (let index = 0; index < declarations.length; index++) {
				const declaration = declarations[index];
				const candidate: Winner = {
					declaration,
					specificity,
					inline,
					order: baseOrder + index,
				};
				const previous = properties.get(declaration.property);
				if (!previous || outranks(candidate, previous) >= 0)
					properties.set(declaration.property, candidate);
			}
		};
		for (const node of nodes) {
			let text: string | undefined;
			if (
				node.tagName === "style" &&
				(!node.attributes.type ||
					node.attributes.type.trim().toLowerCase() === "text/css")
			)
				text = this.tree.textContent(node.id);
			if (
				node.tagName === "link" &&
				!Object.hasOwn(node.attributes, "disabled") &&
				(!node.attributes.type ||
					node.attributes.type.trim().toLowerCase() === "text/css")
			) {
				const rel =
					node.attributes.rel?.toLowerCase().split(/[\t\n\f\r ]+/) ?? [];
				if (rel.includes("stylesheet") && !rel.includes("alternate")) {
					const sheet = this.external.get(node.id);
					if (sheet) {
						try {
							if (
								new URL(node.attributes.href ?? "", documentBaseUrl(this.tree))
									.href === sheet.url
							)
								text = sheet.text;
							else issue("changed-stylesheet-needs-reload");
						} catch {
							issue("invalid-stylesheet-url");
						}
					} else issue("external-stylesheet-not-loaded");
				}
			}
			if (text === undefined) continue;
			const rules = parseCssRules(
				source(text),
				budget,
				issue,
				node.attributes.media ? [node.attributes.media] : [],
			);
			for (const rule of rules) {
				if (rule.declarations.length === 0) continue;
				const baseOrder = order;
				order += rule.declarations.length;
				if (
					!rule.media.every((media) =>
						cssMediaMatches(media, this.viewport, issue),
					)
				)
					continue;
				if (work >= this.limits.maxWork)
					throw new AgentBrowserError(
						"resource-limit",
						"CSS cascade work limit exceeded",
					);
				let matches: ReadonlyMap<number, SelectorSpecificity>;
				try {
					matches = this.queries.matchingSpecificities(
						rule.selector,
						this.limits.maxWork - work,
					);
				} catch (error) {
					if (
						error instanceof AgentBrowserError &&
						error.code === "resource-limit"
					)
						throw error;
					issue("unimplemented-or-invalid-css-selector");
					continue;
				}
				charge(this.queries.metrics().lastWork);
				charge(matches.size * rule.declarations.length);
				for (const [id, specificity] of matches)
					apply(id, rule.declarations, specificity, false, baseOrder);
			}
		}
		for (const node of nodes) {
			if (!node.attributes.style) continue;
			const declarations = parseCssDeclarations(
				source(node.attributes.style),
				budget,
				issue,
			);
			charge(declarations.length);
			apply(node.id, declarations, [0, 0, 0], true, order);
			order += declarations.length;
		}
		const computed = new Map<number, Readonly<VisibilityStyle>>();
		for (const node of nodes) {
			charge(1);
			const parent =
				node.parent === null ? undefined : computed.get(node.parent);
			const properties = winners.get(node.id);
			let display =
				properties?.get("display")?.declaration.value ?? userAgentDisplay(node);
			if (display === "inherit") display = parent?.display ?? "inline";
			else if (display === "initial" || display === "unset") display = "inline";
			else if (display === "revert") display = userAgentDisplay(node);
			let visibility =
				properties?.get("visibility")?.declaration.value ?? "inherit";
			if (["inherit", "unset", "revert"].includes(visibility))
				visibility = parent?.visibility ?? "visible";
			else if (visibility === "initial") visibility = "visible";
			const displayed = (parent?.displayed ?? true) && display !== "none";
			computed.set(
				node.id,
				Object.freeze({
					display,
					visibility: visibility as VisibilityStyle["visibility"],
					displayed,
					visible: displayed && visibility === "visible",
				}),
			);
		}
		this.computed = computed;
		this.info = {
			rules: budget.rules,
			declarations: budget.declarations,
			codeUnits,
			work,
			issues: Object.freeze(issues),
		};
		this.revision = this.tree.revision;
	}
}

export function documentStyles(tree: DocumentTree) {
	let styles = instances.get(tree);
	if (!styles) {
		styles = new DocumentStyles(tree);
		instances.set(tree, styles);
		tree.onClose(() => instances.delete(tree));
	}
	return styles;
}
