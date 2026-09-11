import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export class HtmlScaffold {
	private htmlId: number | undefined;
	private headId: number | undefined;
	private bodyId: number | undefined;

	constructor(
		private readonly tree: DocumentTree,
		fragment?: number,
	) {
		this.htmlId = fragment;
		this.headId = fragment;
		this.bodyId = fragment;
	}

	get html(): number {
		return this.existing(this.htmlId);
	}

	get head(): number {
		return this.existing(this.headId);
	}

	get body(): number {
		return this.existing(this.bodyId);
	}

	get hasBody(): boolean {
		return this.bodyId !== undefined;
	}

	startHtml(attributes: Record<string, string> = {}): number {
		if (this.htmlId === undefined) {
			this.htmlId = this.tree.createParserElement("html", attributes);
			this.tree.append(this.tree.root, this.htmlId);
		}
		return this.htmlId;
	}

	startHead(attributes: Record<string, string> = {}): number {
		if (this.headId === undefined) {
			const parent = this.startHtml();
			this.headId = this.tree.createParserElement("head", attributes);
			this.tree.append(parent, this.headId);
		}
		return this.headId;
	}

	startBody(attributes: Record<string, string> = {}): number {
		if (this.bodyId === undefined) {
			this.startHead();
			this.bodyId = this.tree.createParserElement("body", attributes);
			this.tree.append(this.html, this.bodyId);
		}
		return this.bodyId;
	}

	private existing(id: number | undefined): number {
		if (id === undefined)
			throw new AgentBrowserError(
				"unsupported",
				"HTML scaffold is not yet available",
			);
		return id;
	}
}
