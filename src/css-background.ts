import { normalizeCssColor } from "./css-color.js";

export const initialBackgroundValues = Object.freeze({
	"background-image": "none",
	"background-position": "0% 0%",
	"background-size": "auto",
	"background-repeat": "repeat",
	"background-attachment": "scroll",
	"background-origin": "padding-box",
	"background-clip": "border-box",
	"background-color": "transparent",
});
export type CssBackgroundProperty = keyof typeof initialBackgroundValues;
export const cssBackgroundProperties = Object.freeze(
	Object.keys(initialBackgroundValues) as CssBackgroundProperty[],
);
export type NeutralBackgroundProperty = Exclude<
	CssBackgroundProperty,
	"background-color"
>;
export type BackgroundLayer = Readonly<
	Record<NeutralBackgroundProperty, string>
>;
const wide = new Set(["initial", "inherit", "unset", "revert"]);
const maximumBackgroundCodeUnits = 16384;
const trimCss = (value: string) =>
	value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");

export function backgroundImageUrl(value: string): string | undefined {
	if (value.length > maximumBackgroundCodeUnits) return undefined;
	const match = /^url\(([\s\S]*)\)$/i.exec(trimCss(value));
	if (!match) return undefined;
	const body = trimCss(match[1]);
	if (!body || /[\\\x00-\x1f\x7f]/.test(body)) return undefined;
	const quote = body[0];
	if (quote === '"' || quote === "'") {
		if (body[body.length - 1] !== quote || body.length < 3) return undefined;
		const url = body.slice(1, -1);
		return url.includes(quote) ? undefined : url;
	}
	return /[\s"'()]/.test(body) ? undefined : body;
}

function backgroundLength(
	value: string,
	nonnegative = false,
): string | undefined {
	const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(px|%)?$/.exec(
		value,
	);
	if (!match) return undefined;
	const amount = Number(match[1]);
	if (
		!Number.isFinite(amount) ||
		(nonnegative && amount < 0) ||
		(!match[2] && amount !== 0)
	)
		return undefined;
	return `${amount}${match[2] ?? "px"}`;
}

function backgroundPosition(value: string): string | undefined {
	const parts = value.split(" ");
	if (parts.length < 1 || parts.length > 2) return undefined;
	const horizontal: Readonly<Record<string, string>> = {
		left: "0%",
		center: "50%",
		right: "100%",
	};
	const vertical: Readonly<Record<string, string>> = {
		top: "0%",
		center: "50%",
		bottom: "100%",
	};
	let [first, second] = parts;
	if (second === undefined) {
		if (first === "top" || first === "bottom") return `50% ${vertical[first]}`;
		const position = Object.hasOwn(horizontal, first)
			? horizontal[first]
			: backgroundLength(first);
		return position === undefined ? undefined : `${position} 50%`;
	}
	if (
		Object.hasOwn(vertical, first) &&
		Object.hasOwn(horizontal, second) &&
		(first !== "center" || second !== "center")
	)
		[first, second] = [second, first];
	const across = Object.hasOwn(horizontal, first)
		? horizontal[first]
		: backgroundLength(first);
	const down = Object.hasOwn(vertical, second)
		? vertical[second]
		: backgroundLength(second);
	return across === undefined || down === undefined
		? undefined
		: `${across} ${down}`;
}

function backgroundTokens(source: string): string[] | undefined {
	if (
		source.length > maximumBackgroundCodeUnits ||
		/[\\\x00-\x08\x0b\x0e-\x1f\x7f]/.test(source)
	)
		return undefined;
	const tokens: string[] = [];
	let token = "";
	let depth = 0;
	let quote = "";
	for (const character of source) {
		if (quote) {
			if (/[\n\r\f]/.test(character)) return undefined;
			if (character === quote) quote = "";
		} else if (character === '"' || character === "'") {
			if (depth === 0) return undefined;
			quote = character;
		} else if (character === "(") {
			if (++depth > 1) return undefined;
		} else if (character === ")") {
			if (--depth < 0) return undefined;
		} else if (depth === 0) {
			if (character === ",") return undefined;
			if (/[\t\n\f\r ]/.test(character) || character === "/") {
				if (token) tokens.push(token);
				token = "";
				if (character === "/") tokens.push(character);
				if (tokens.length > 16) return undefined;
				continue;
			}
		}
		token += character;
	}
	if (depth !== 0 || quote) return undefined;
	if (token) tokens.push(token);
	return tokens.length > 16 ? undefined : tokens;
}

export function isNeutralBackgroundProperty(
	name: string,
): name is NeutralBackgroundProperty {
	return (
		name !== "background-color" && Object.hasOwn(initialBackgroundValues, name)
	);
}

export function parseBackgroundComponent(
	name: NeutralBackgroundProperty,
	source: string,
): string | undefined {
	if (source.length > maximumBackgroundCodeUnits) return undefined;
	const value = trimCss(source)
		.toLowerCase()
		.replace(/[\t\n\f\r ]+/g, " ");
	if (wide.has(value)) return value;
	if (name === "background-image") {
		if (value === "none") return value;
		const url = backgroundImageUrl(source);
		if (url === undefined) return undefined;
		const quote = url.includes('"') ? "'" : '"';
		return `url(${quote}${url}${quote})`;
	}
	if (name === "background-position") return backgroundPosition(value);
	if (name === "background-size") {
		if (value === "contain" || value === "cover") return value;
		const parts = value.split(" ");
		if (parts.length > 2) return undefined;
		const sizes = parts.map((part) =>
			part === "auto" ? part : backgroundLength(part, true),
		);
		if (sizes.some((size) => size === undefined)) return undefined;
		return sizes.every((size) => size === "auto") ? "auto" : sizes.join(" ");
	}
	if (name === "background-repeat") {
		if (value === "repeat-x") return "repeat no-repeat";
		if (value === "repeat-y") return "no-repeat repeat";
		const parts = value.split(" ");
		if (
			parts.length > 2 ||
			parts.some((part) => !["repeat", "no-repeat"].includes(part))
		)
			return undefined;
		return parts.length === 1 || parts[0] === parts[1] ? parts[0] : value;
	}
	if (name === "background-origin" || name === "background-clip")
		return ["border-box", "padding-box", "content-box"].includes(value)
			? value
			: undefined;
	return value === "scroll" ? value : undefined;
}

export function parseBackgroundShorthand(
	source: string,
): { property: CssBackgroundProperty; value: string }[] | undefined {
	if (source.length > maximumBackgroundCodeUnits) return undefined;
	const value = trimCss(source).toLowerCase();
	if (wide.has(value))
		return cssBackgroundProperties.map((property) => ({ property, value }));
	const tokens = backgroundTokens(source);
	if (!tokens?.length) return undefined;
	const values: Record<CssBackgroundProperty, string> = {
		...initialBackgroundValues,
	};
	const seen = new Set<CssBackgroundProperty>();
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		const keyword = token.toLowerCase();
		if (wide.has(keyword) || keyword === "/") return undefined;
		let property: CssBackgroundProperty;
		let parsed: string | undefined;
		if (keyword === "none" || /^url\(/i.test(token)) {
			property = "background-image";
			parsed = parseBackgroundComponent(property, token);
		} else if (
			["repeat", "no-repeat", "repeat-x", "repeat-y"].includes(keyword)
		) {
			property = "background-repeat";
			let repeat = keyword;
			if (
				["repeat", "no-repeat"].includes(keyword) &&
				["repeat", "no-repeat"].includes(tokens[index + 1]?.toLowerCase())
			)
				repeat += ` ${tokens[++index].toLowerCase()}`;
			parsed = parseBackgroundComponent(property, repeat);
		} else if (keyword === "scroll") {
			property = "background-attachment";
			parsed = keyword;
		} else if (["border-box", "padding-box", "content-box"].includes(keyword)) {
			property = "background-origin";
			parsed = keyword;
			values["background-clip"] = keyword;
			if (
				["border-box", "padding-box", "content-box"].includes(
					tokens[index + 1]?.toLowerCase(),
				)
			)
				values["background-clip"] = tokens[++index].toLowerCase();
		} else {
			parsed = normalizeCssColor(token);
			property = "background-color";
			if (parsed === undefined) {
				property = "background-position";
				const pair =
					tokens[index + 1] === undefined
						? undefined
						: parseBackgroundComponent(
								property,
								`${token} ${tokens[index + 1]}`,
							);
				parsed = pair ?? parseBackgroundComponent(property, token);
				if (pair !== undefined) index++;
				if (tokens[index + 1] === "/") {
					index += 2;
					if (tokens[index] === undefined) return undefined;
					const sizePair =
						tokens[index + 1] === undefined
							? undefined
							: parseBackgroundComponent(
									"background-size",
									`${tokens[index]} ${tokens[index + 1]}`,
								);
					const size =
						sizePair ??
						parseBackgroundComponent("background-size", tokens[index]);
					if (size === undefined || wide.has(size)) return undefined;
					values["background-size"] = size;
					if (sizePair !== undefined) index++;
				}
			}
		}
		if (parsed === undefined || seen.has(property)) return undefined;
		seen.add(property);
		values[property] = parsed;
	}
	return cssBackgroundProperties.map((property) => ({
		property,
		value: values[property],
	}));
}

export function serializeBackgroundValues(
	values: readonly string[],
	complete = false,
): string {
	if (values.length !== cssBackgroundProperties.length) return "";
	if (values.some((value) => wide.has(value)))
		return values.every((value) => value === values[0]) ? values[0] : "";
	if (
		!complete &&
		cssBackgroundProperties.every(
			(property, index) =>
				property === "background-color" ||
				values[index] === initialBackgroundValues[property],
		)
	)
		return values[values.length - 1];
	const [image, position, size, repeat, attachment, origin, clip, color] =
		values;
	return `${color} ${image} ${repeat} ${attachment} ${position} / ${size} ${origin} ${clip}`;
}
