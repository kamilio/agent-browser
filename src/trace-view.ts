import {
	describeTraceFrame,
	readTraceFile,
	type ReviewTrace,
} from "./trace-review.js";

export function mountTraceReview(document: Document) {
	const element = (id: string) => {
		const value = document.getElementById(id);
		if (!value) throw new Error(`Missing trace review element: ${id}`);
		return value;
	};
	const file = element("trace-file") as HTMLInputElement;
	const frames = element("trace-frame") as HTMLSelectElement;
	const previous = element("trace-previous") as HTMLButtonElement;
	const next = element("trace-next") as HTMLButtonElement;
	const clearButton = element("trace-clear");
	const status = element("trace-status");
	let trace: ReviewTrace | undefined;
	let selected = 0;
	let generation = 0;
	let pending: AbortController | undefined;
	let closed = false;
	function render() {
		previous.disabled = !trace || selected === 0;
		next.disabled = !trace || selected >= trace.frames.length - 1;
		frames.disabled = !trace?.frames.length;
		frames.value = String(selected);
		const frame = trace?.frames[selected];
		const output = frame
			? describeTraceFrame(frame)
			: {
					snapshotText: "No frame selected.",
					networkText: "No frame selected.",
					metadataText: "No frame selected.",
				};
		element("trace-snapshot").textContent = output.snapshotText;
		element("trace-network").textContent = output.networkText;
		element("trace-metadata").textContent = output.metadataText;
	}
	function clear() {
		generation++;
		pending?.abort();
		pending = undefined;
		trace = undefined;
		selected = 0;
		file.value = "";
		frames.replaceChildren();
		status.textContent =
			"Choose an exported trace. Files stay in this window; no connection is needed.";
		render();
	}
	function chooseFile() {
		if (closed) return;
		const chosen = file.files?.[0];
		clear();
		if (!chosen) return;
		const controller = new AbortController();
		pending = controller;
		const current = generation;
		status.textContent = "Validating local trace…";
		void readTraceFile(chosen, controller.signal)
			.then(
				(loaded) => {
					if (closed || current !== generation || controller.signal.aborted)
						return;
					trace = loaded;
					const choices = loaded.frames.map((frame, index) => {
						const option = document.createElement("option");
						option.value = String(index);
						option.textContent = `${index + 1}. ${frame.action.command} · ${frame.action.outcome} · ${frame.atMs.toFixed(1)} ms`;
						return option;
					});
					frames.replaceChildren(...choices);
					status.textContent = `${loaded.frames.length} frames · ${loaded.droppedFrames} omitted · ${loaded.startedAt} to ${loaded.endedAt}. Page text may be sensitive.`;
					render();
				},
				(error: unknown) => {
					if (closed || current !== generation || controller.signal.aborted)
						return;
					status.textContent =
						error instanceof Error ? error.message : "Cannot read trace file";
				},
			)
			.finally(() => {
				if (pending === controller) pending = undefined;
			});
	}
	function chooseFrame() {
		if (closed || !trace || !/^\d+$/.test(frames.value)) return;
		const index = Number(frames.value);
		if (index >= trace.frames.length) return;
		selected = index;
		render();
	}
	function previousFrame() {
		if (!closed && trace && selected > 0) {
			selected--;
			render();
		}
	}
	function nextFrame() {
		if (!closed && trace && selected + 1 < trace.frames.length) {
			selected++;
			render();
		}
	}
	function clearTrace() {
		if (!closed) clear();
	}
	file.addEventListener("change", chooseFile);
	frames.addEventListener("change", chooseFrame);
	previous.addEventListener("click", previousFrame);
	next.addEventListener("click", nextFrame);
	clearButton.addEventListener("click", clearTrace);
	clear();
	return {
		close() {
			if (closed) return;
			closed = true;
			file.removeEventListener("change", chooseFile);
			frames.removeEventListener("change", chooseFrame);
			previous.removeEventListener("click", previousFrame);
			next.removeEventListener("click", nextFrame);
			clearButton.removeEventListener("click", clearTrace);
			clear();
		},
	};
}
