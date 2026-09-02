import { expect, it } from "vitest";
import {
	ScriptFrameDecoder,
	scriptFrame,
	scriptFrameLimit,
} from "./node-script-protocol.js";

it("preserves split Unicode and escaped line breaks across arbitrary chunks", () => {
	const decoder = new ScriptFrameDecoder();
	const input = { text: "日本語 🦊\nnext" };
	const bytes = Buffer.from(scriptFrame(input));
	const messages: unknown[] = [];
	for (const byte of bytes) messages.push(...decoder.push(Buffer.from([byte])));
	expect(messages).toEqual([input]);
	decoder.finish();
});

it("handles multiple complete messages without merging their state", () => {
	const decoder = new ScriptFrameDecoder();
	expect(
		decoder.push(
			Buffer.from(`${scriptFrame({ first: 1 })}${scriptFrame({ second: 2 })}`),
		),
	).toEqual([{ first: 1 }, { second: 2 }]);
	decoder.finish();
});

it("rejects invalid UTF-8 instead of changing code or response data", () => {
	const decoder = new ScriptFrameDecoder();
	expect(() => decoder.push(Buffer.from([34, 255, 34, 10]))).toThrow();
});

it("rejects invalid, partial, oversized and excessive messages", () => {
	expect(() =>
		new ScriptFrameDecoder().push(Buffer.from("not-json\n")),
	).toThrow("Invalid script protocol");
	const partial = new ScriptFrameDecoder();
	partial.push(Buffer.from('{"unfinished":'));
	expect(() => partial.finish()).toThrow("Incomplete");
	expect(() =>
		new ScriptFrameDecoder().push(Buffer.alloc(scriptFrameLimit + 1, 32)),
	).toThrow("limit");
	expect(() => scriptFrame("x".repeat(scriptFrameLimit))).toThrow("limit");
	expect(() =>
		new ScriptFrameDecoder().push(Buffer.from("{}\n".repeat(17))),
	).toThrow("burst");
});
