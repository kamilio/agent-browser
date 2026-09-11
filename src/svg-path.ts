import type { SvgPathSegment, SvgPoint } from "./svg-path-types.js";

export type { SvgPathSegment, SvgPoint } from "./svg-path-types.js";

export interface SvgPathLimits {
	readonly maxSourceCodeUnits: number;
	readonly maxSegments: number;
	readonly maxCoordinate: number;
}

export const svgPathLimits: Readonly<SvgPathLimits> = Object.freeze({
	maxSourceCodeUnits: 262_144,
	maxSegments: 16_384,
	maxCoordinate: 1_000_000_000,
});

export function parseSvgPath(
	source: string,
	charge: (amount: number) => void,
	limits: Partial<SvgPathLimits> = {},
): readonly SvgPathSegment[] {
	charge(1);
	if (typeof source !== "string")
		throw new TypeError("Expected SVG path string");
	function limit(name: keyof SvgPathLimits): number {
		const supplied = limits[name];
		const value = supplied === undefined ? svgPathLimits[name] : supplied;
		if (
			!Number.isSafeInteger(value) ||
			value <= 0 ||
			value > svgPathLimits[name]
		)
			throw new RangeError(`Invalid SVG path limit: ${name}`);
		return value;
	}
	const maxSourceCodeUnits = limit("maxSourceCodeUnits");
	const maxSegments = limit("maxSegments");
	const maxCoordinate = limit("maxCoordinate");
	if (source.length > maxSourceCodeUnits)
		throw new RangeError("SVG path source limit exceeded");
	charge(source.length * 4 + 8);
	const segments: SvgPathSegment[] = [];
	let position = 0;
	let command = "";
	let commaAllowed = false;
	let current: SvgPoint = Object.freeze({ x: 0, y: 0 });
	let initial = current;
	let previous: SvgPathSegment | undefined;

	function syntax(): never {
		throw new SyntaxError(`Invalid SVG path at code unit ${position}`);
	}
	function whitespace(): void {
		while (position < source.length) {
			const code = source.charCodeAt(position);
			if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;
			position++;
		}
	}
	function digit(): boolean {
		const code = source.charCodeAt(position);
		return code >= 48 && code <= 57;
	}
	function bounded(value: number): number {
		if (!Number.isFinite(value) || Math.abs(value) > maxCoordinate)
			throw new RangeError("SVG path coordinate limit exceeded");
		return value === 0 ? 0 : value;
	}
	function number(flag = false): number {
		whitespace();
		if (source[position] === ",") {
			if (!commaAllowed) syntax();
			position++;
			whitespace();
		}
		commaAllowed = true;
		if (flag) {
			const value = source[position];
			if (value !== "0" && value !== "1") syntax();
			position++;
			return value === "1" ? 1 : 0;
		}
		const start = position;
		if (source[position] === "+" || source[position] === "-") position++;
		let digits = 0;
		while (digit()) {
			position++;
			digits++;
		}
		if (source[position] === ".") {
			position++;
			while (digit()) {
				position++;
				digits++;
			}
		}
		if (digits === 0) syntax();
		if (source[position] === "e" || source[position] === "E") {
			position++;
			if (source[position] === "+" || source[position] === "-") position++;
			if (!digit()) syntax();
			while (digit()) position++;
		}
		charge((position - start) * 2 + 1);
		return bounded(Number(source.slice(start, position)));
	}
	function point(across: number, down: number): SvgPoint {
		return Object.freeze({ x: bounded(across), y: bounded(down) });
	}
	function endpoint(relative: boolean): SvgPoint {
		const across = number();
		const down = number();
		return point(
			across + (relative ? current.x : 0),
			down + (relative ? current.y : 0),
		);
	}
	function reflect(control: SvgPoint): SvgPoint {
		return point(2 * current.x - control.x, 2 * current.y - control.y);
	}
	function reserve(): void {
		if (segments.length >= maxSegments)
			throw new RangeError("SVG path segment limit exceeded");
		charge(16);
	}
	function append(segment: SvgPathSegment): void {
		segments.push(Object.freeze(segment));
		previous = segment;
		current = segment.end;
	}

	while (true) {
		whitespace();
		if (position === source.length) break;
		if ("MmLlHhVvCcSsQqTtAaZz".includes(source[position])) {
			command = source[position++];
			commaAllowed = false;
		} else if (!command) syntax();
		const operation = command.toUpperCase();
		const relative = command !== operation;
		if (segments.length === 0 && operation !== "M") syntax();
		reserve();
		switch (operation) {
			case "M": {
				const end = endpoint(relative);
				append({ kind: "move", end });
				initial = end;
				command = relative ? "l" : "L";
				break;
			}
			case "L":
				append({ kind: "line", start: current, end: endpoint(relative) });
				break;
			case "H": {
				const across = number() + (relative ? current.x : 0);
				append({ kind: "line", start: current, end: point(across, current.y) });
				break;
			}
			case "V": {
				const down = number() + (relative ? current.y : 0);
				append({ kind: "line", start: current, end: point(current.x, down) });
				break;
			}
			case "C": {
				const control1 = endpoint(relative);
				const control2 = endpoint(relative);
				const end = endpoint(relative);
				append({ kind: "cubic", start: current, control1, control2, end });
				break;
			}
			case "S": {
				const control1 =
					previous?.kind === "cubic" ? reflect(previous.control2) : current;
				const control2 = endpoint(relative);
				const end = endpoint(relative);
				append({ kind: "cubic", start: current, control1, control2, end });
				break;
			}
			case "Q": {
				const control = endpoint(relative);
				const end = endpoint(relative);
				append({ kind: "quadratic", start: current, control, end });
				break;
			}
			case "T": {
				const control =
					previous?.kind === "quadratic" ? reflect(previous.control) : current;
				const end = endpoint(relative);
				append({ kind: "quadratic", start: current, control, end });
				break;
			}
			case "A": {
				const radiusX = Math.abs(number());
				const radiusY = Math.abs(number());
				const rotation = number();
				const largeArc = number(true) === 1;
				const sweep = number(true) === 1;
				const end = endpoint(relative);
				append({
					kind: "arc",
					start: current,
					end,
					radiusX,
					radiusY,
					rotation,
					largeArc,
					sweep,
				});
				break;
			}
			case "Z":
				append({ kind: "close", start: current, end: initial });
				command = "";
				break;
			default:
				syntax();
		}
	}
	return Object.freeze(segments);
}
