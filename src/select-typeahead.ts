import { isControlDisabled, optionLabel } from "./controls.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export const selectTypeaheadLimits = Object.freeze({
	timeoutMs: 1000,
	maxPrefixCodeUnits: 128,
	maxLabelCodeUnits: 4096,
	maxScannedCodeUnits: 65_536,
});

function fold(value: string) {
	return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export class SelectTypeahead {
	private state:
		| { id: number; time: number; buffer: string; repeating?: string }
		| undefined;
	constructor(private readonly tree: DocumentTree) {
		const unsubscribe = tree.onChange((change) => {
			if (
				change.kind === "focus" ||
				(change.kind === "remove" && tree.activeElement !== this.state?.id)
			)
				this.reset();
		});
		tree.onClose(() => {
			this.reset();
			unsubscribe();
		});
	}
	reset() {
		this.state = undefined;
	}
	active(id: number, time: number) {
		return (
			this.state?.id === id &&
			time >= this.state.time &&
			time - this.state.time <= selectTypeaheadLimits.timeoutMs
		);
	}
	find(
		id: number,
		key: string,
		time: number,
		options: readonly Readonly<DocumentNode>[],
		selected: number | undefined,
	): number | undefined {
		this.tree.get(id);
		if (!Number.isFinite(time))
			throw new AgentBrowserError("invalid-input", "Invalid typeahead time");
		if (this.state?.id === id && time < this.state.time) return;
		const previous = this.active(id, time) ? this.state : undefined;
		const buffer = (previous?.buffer ?? "") + key;
		if (buffer.length > selectTypeaheadLimits.maxPrefixCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Select typeahead prefix limit exceeded",
			);
		const cycling = previous?.repeating === key;
		const prefix = fold(cycling ? key : buffer);
		const current = options.findIndex((option) => option.id === selected);
		const start = current < 0 ? 0 : current + (previous && !cycling ? 0 : 1);
		let scanned = 0;
		let match: number | undefined;
		if (prefix)
			for (let offset = 0; offset < options.length; offset++) {
				const option = options[(start + offset) % options.length];
				if (isControlDisabled(this.tree, option.id)) continue;
				const label = optionLabel(this.tree, option.id);
				scanned += label.length;
				if (
					label.length > selectTypeaheadLimits.maxLabelCodeUnits ||
					scanned > selectTypeaheadLimits.maxScannedCodeUnits
				)
					throw new AgentBrowserError(
						"resource-limit",
						"Select typeahead label limit exceeded",
					);
				if (
					fold(label.replace(/[\t\n\f\r ]+/g, " ").trimStart()).startsWith(
						prefix,
					)
				) {
					match = option.id;
					break;
				}
			}
		this.state = {
			id,
			time,
			buffer,
			repeating: !previous || cycling ? key : undefined,
		};
		return match;
	}
}
