import { controlValidity } from "./control-validity.js";
import {
	formControls,
	inputType,
	prepareControlIndex,
	radioGroup,
} from "./controls.js";
import { existingDocumentFiles } from "./document-files.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { isValidationCandidate } from "./form-validation.js";

type ValidityResult = boolean | AgentBrowserError;
type CandidateResult = ValidityResult | null;

function combine(left: ValidityResult, right: CandidateResult): ValidityResult {
	if (left === false || right === false) return false;
	if (left instanceof AgentBrowserError) return left;
	return right instanceof AgentBrowserError ? right : true;
}

export class SelectorValidity {
	private prepared = false;
	private controls = new Map<number, CandidateResult>();
	private forms = new Map<number, ValidityResult>();
	private subtrees = new Map<number, ValidityResult>();
	private radioMissing = new Map<number, boolean>();

	constructor(
		private readonly tree: DocumentTree,
		private readonly charge: (work: number) => void,
		private readonly reserve: (entries: number) => void,
	) {}

	matches(id: number, valid: boolean): boolean {
		const node = this.tree.get(id);
		if (!isHtmlElement(node)) return false;
		const result =
			node.tagName === "form"
				? this.form(id)
				: node.tagName === "fieldset"
					? this.subtree(id)
					: this.control(id);
		if (result instanceof AgentBrowserError) throw result;
		return result === valid;
	}

	private prepare() {
		if (this.prepared) return;
		prepareControlIndex(this.tree, this.charge);
		this.prepared = true;
	}

	private control(id: number): CandidateResult {
		this.charge(1);
		if (this.controls.has(id)) return this.controls.get(id)!;
		const node = this.tree.get(id);
		if (
			!isHtmlElement(node) ||
			!["input", "select", "textarea", "button"].includes(node.tagName)
		)
			return null;
		this.prepare();
		this.reserve(1);
		let result: CandidateResult;
		if (!isValidationCandidate(this.tree, id)) result = null;
		else if (this.tree.getCustomValidity(id)) result = false;
		else {
			try {
				this.preflight(id);
				result = controlValidity(this.tree, id, {}, this.radioMissing).valid;
			} catch (error) {
				if (
					!(error instanceof AgentBrowserError) ||
					error.code !== "unsupported"
				)
					throw error;
				result = error;
			}
		}
		this.controls.set(id, result);
		return result;
	}

	private preflight(id: number) {
		const node = this.tree.get(id);
		for (const value of Object.values(node.attributes))
			this.charge(value.length);
		this.charge(node.control.value?.length ?? 0);
		if (
			node.tagName === "select" ||
			(node.tagName === "textarea" && node.control.value === undefined)
		)
			for (const { node: child } of this.tree.walk(id)) {
				this.charge(1 + child.data.length);
				for (const value of Object.values(child.attributes))
					this.charge(value.length);
			}
		if (node.tagName !== "input") return;
		const type = inputType(node);
		if (
			type === "radio" &&
			node.attributes.name &&
			!this.radioMissing.has(id)
		) {
			const group = radioGroup(this.tree, id);
			this.charge(group.length * 4);
			this.reserve(group.length);
		}
		if (type === "file") {
			const files = existingDocumentFiles(this.tree);
			if (files)
				for (const file of files.selectionMetadata(id))
					this.charge(file.name.length + 2);
		}
	}

	private form(id: number): ValidityResult {
		this.charge(1);
		const cached = this.forms.get(id);
		if (cached !== undefined) return cached;
		this.prepare();
		this.reserve(1);
		const controls = formControls(this.tree, id);
		this.charge(controls.length);
		let result: ValidityResult = true;
		for (const control of controls) {
			result = combine(result, this.control(control.id));
			if (result === false) break;
		}
		this.forms.set(id, result);
		return result;
	}

	private subtree(id: number): ValidityResult {
		this.charge(1);
		const cached = this.subtrees.get(id);
		if (cached !== undefined) return cached;
		this.prepare();
		const stack = [{ id, exit: false }];
		this.reserve(1);
		while (stack.length) {
			this.charge(1);
			const frame = stack.pop()!;
			const node = this.tree.get(frame.id);
			if (!frame.exit) {
				stack.push({ id: frame.id, exit: true });
				for (
					let position = node.children.length - 1;
					position >= 0;
					position--
				) {
					this.charge(1);
					const child = this.tree.get(node.children[position]);
					if (child.kind !== "element" || this.subtrees.has(child.id)) continue;
					this.reserve(1);
					stack.push({ id: child.id, exit: false });
				}
				continue;
			}
			let result = combine(true, this.control(frame.id));
			for (const child of node.children) {
				this.charge(1);
				result = combine(result, this.subtrees.get(child) ?? true);
			}
			this.subtrees.set(frame.id, result);
		}
		return this.subtrees.get(id)!;
	}
}
