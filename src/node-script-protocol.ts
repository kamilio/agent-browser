import { AgentBrowserError } from "./errors.js";

export const scriptFrameLimit = 2_097_152;

export class ScriptFrameDecoder {
	private readonly decoder = new TextDecoder("utf8", { fatal: true });
	private text = "";
	private bytes = 0;

	push(chunk: Buffer): unknown[] {
		const messages: unknown[] = [];
		let start = 0;
		while (start < chunk.length) {
			const newline = chunk.indexOf(10, start);
			const end = newline < 0 ? chunk.length : newline;
			this.bytes += end - start;
			if (this.bytes > scriptFrameLimit)
				throw new AgentBrowserError(
					"resource-limit",
					"Script protocol frame limit exceeded",
				);
			this.text += this.decoder.decode(chunk.subarray(start, end), {
				stream: true,
			});
			if (newline < 0) break;
			this.text += this.decoder.decode();
			if (messages.length >= 16)
				throw new AgentBrowserError(
					"resource-limit",
					"Script protocol message burst exceeded",
				);
			try {
				messages.push(JSON.parse(this.text));
			} catch {
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid script protocol JSON",
				);
			}
			this.text = "";
			this.bytes = 0;
			start = end + 1;
		}
		return messages;
	}

	finish() {
		if (this.bytes !== 0)
			throw new AgentBrowserError(
				"invalid-input",
				"Incomplete script protocol frame",
			);
	}
}

export function scriptFrame(value: unknown): string {
	const data = JSON.stringify(value);
	if (typeof data !== "string" || Buffer.byteLength(data) > scriptFrameLimit)
		throw new AgentBrowserError(
			"resource-limit",
			"Script protocol frame limit exceeded",
		);
	return `${data}\n`;
}
