export interface HtmlDoctypeToken {
	kind: "doctype";
	name: string | null;
	publicId: string | null;
	systemId: string | null;
	forceQuirks: boolean;
}

export function asciiLower(value: string): string {
	return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

export function readHtmlDoctype(
	source: string,
	start: number,
	issue: (code: string) => void,
) {
	let position = start;
	const token: HtmlDoctypeToken = {
		kind: "doctype",
		name: null,
		publicId: null,
		systemId: null,
		forceQuirks: false,
	};
	const finish = (terminated: boolean) => ({ token, position, terminated });
	const eof = () => {
		issue("eof-in-doctype");
		token.forceQuirks = true;
		return finish(false);
	};
	const space = () => {
		const before = position;
		while (position < source.length && /[\t\n\f\r ]/.test(source[position]))
			position++;
		return position !== before;
	};
	const end = () => {
		position++;
		return finish(true);
	};
	const bogus = () => {
		while (position < source.length) {
			const character = source[position++];
			if (character === ">") return finish(true);
			if (character === "\0") issue("unexpected-null-character");
		}
		return finish(false);
	};
	const identifier = (
		field: "publicId" | "systemId",
	): "quote" | "end" | "eof" => {
		const quote = source[position++];
		token[field] = "";
		while (position < source.length) {
			const character = source[position++];
			if (character === quote) return "quote";
			if (character === ">") {
				issue(
					field === "publicId"
						? "abrupt-doctype-public-identifier"
						: "abrupt-doctype-system-identifier",
				);
				token.forceQuirks = true;
				return "end";
			}
			if (character === "\0") issue("unexpected-null-character");
			token[field] += character === "\0" ? "\ufffd" : character;
		}
		return "eof";
	};
	const quoted = () => source[position] === '"' || source[position] === "'";
	if (position === source.length) return eof();
	if (!space() && source[position] !== ">")
		issue("missing-whitespace-before-doctype-name");
	if (position === source.length) return eof();
	if (source[position] === ">") {
		issue("missing-doctype-name");
		token.forceQuirks = true;
		return end();
	}
	token.name = "";
	while (position < source.length && !/[\t\n\f\r >]/.test(source[position])) {
		const character = source[position++];
		if (character === "\0") issue("unexpected-null-character");
		token.name += character === "\0" ? "\ufffd" : asciiLower(character);
	}
	space();
	if (position === source.length) return eof();
	if (source[position] === ">") return end();
	const keyword = asciiLower(source.slice(position, position + 6));
	if (keyword !== "public" && keyword !== "system") {
		issue("invalid-character-sequence-after-doctype-name");
		token.forceQuirks = true;
		return bogus();
	}
	position += 6;
	const separated = space();
	if (position === source.length) return eof();
	if (source[position] === ">") {
		issue(`missing-doctype-${keyword}-identifier`);
		token.forceQuirks = true;
		return end();
	}
	if (!quoted()) {
		issue(`missing-quote-before-doctype-${keyword}-identifier`);
		token.forceQuirks = true;
		return bogus();
	}
	if (!separated) issue(`missing-whitespace-after-doctype-${keyword}-keyword`);
	const first = identifier(keyword === "public" ? "publicId" : "systemId");
	if (first === "end") return finish(true);
	if (first === "eof") return eof();
	const between = space();
	if (position === source.length) return eof();
	if (source[position] === ">") return end();
	if (keyword === "public") {
		if (!quoted()) {
			issue("missing-quote-before-doctype-system-identifier");
			token.forceQuirks = true;
			return bogus();
		}
		if (!between)
			issue("missing-whitespace-between-doctype-public-and-system-identifiers");
		const second = identifier("systemId");
		if (second === "end") return finish(true);
		if (second === "eof") return eof();
		space();
		if (position === source.length) return eof();
		if (source[position] === ">") return end();
	}
	issue("unexpected-character-after-doctype-system-identifier");
	return bogus();
}
