import { HtmlTokenizer } from "./html-tokenizer.js";

const rawTags = new Set(
	"script style xmp iframe noembed noframes title textarea".split(" "),
);

export function htmlEncoding(bytes: Uint8Array) {
	const tokenizer = new HtmlTokenizer(
		String.fromCharCode(...bytes.subarray(0, 1024)),
		() => {},
	);
	try {
		for (let token = tokenizer.next(); token; token = tokenizer.next()) {
			if (token.kind !== "start") continue;
			if (rawTags.has(token.name)) tokenizer.raw(token.name);
			if (token.name !== "meta") continue;
			const label =
				token.attributes.charset ??
				(token.attributes["http-equiv"]?.toLowerCase() === "content-type"
					? /charset\s*=\s*["']?([^\s;"']+)/i.exec(
							token.attributes.content ?? "",
						)?.[1]
					: undefined);
			if (!label) continue;
			const encoding = new TextDecoder(label).encoding;
			return encoding.startsWith("utf-16") ? "utf-8" : encoding;
		}
	} catch {}
	return "windows-1252";
}
