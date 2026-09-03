import type { ControlState, DocumentNode } from "./document.js";
import {
	inputType,
	inputTypeName,
	inputValueMode,
	sanitizeInputValue,
} from "./input-values.js";

interface InputNode extends Omit<DocumentNode, "control"> {
	control: ControlState;
}

export interface InputValueChange {
	value: string | undefined;
	dirty: boolean;
	defaultValue?: string;
}

export class DocumentInputValues {
	private readonly dirty = new Set<number>();
	constructor(private readonly node: (id: number) => InputNode) {}

	initialize(id: number, source: { state: DocumentInputValues; id: number }) {
		if (source.state.dirty.has(source.id)) this.dirty.add(id);
	}

	markDirty(id: number) {
		this.dirty.add(id);
	}
	reset(id: number) {
		this.dirty.delete(id);
	}
	close() {
		this.dirty.clear();
	}

	prepare(
		id: number,
		attribute: string,
		next: string | undefined,
	): InputValueChange | undefined {
		if (attribute !== "value" && attribute !== "type") return undefined;
		const node = this.node(id);
		if (node.tagName !== "input") return undefined;
		const dirty = this.dirty.has(id);
		if (attribute === "value")
			return dirty ? undefined : { value: undefined, dirty: false };
		const before = inputType(node);
		const after = inputTypeName(next);
		if (before === after) return undefined;
		const beforeMode = inputValueMode(before);
		const afterMode = inputValueMode(after);
		const initial = node.attributes.value ?? "";
		const current = sanitizeInputValue(
			before,
			node.control.value ?? initial,
			node.attributes,
		);
		if (afterMode === "value") {
			const value = sanitizeInputValue(
				after,
				beforeMode === "value" ? current : initial,
				node.attributes,
			);
			const nextDirty = beforeMode === "value" && dirty;
			return {
				value:
					!nextDirty &&
					value === sanitizeInputValue(after, initial, node.attributes)
						? undefined
						: value,
				dirty: nextDirty,
			};
		}
		return {
			value: undefined,
			dirty,
			...(beforeMode === "value" && afterMode !== "filename" && current !== ""
				? { defaultValue: current }
				: {}),
		};
	}

	apply(id: number, change: InputValueChange) {
		const node = this.node(id);
		if (change.value === undefined)
			Reflect.deleteProperty(node.control, "value");
		else node.control.value = change.value;
		if (change.dirty) this.dirty.add(id);
		else this.dirty.delete(id);
	}
}
