import { AgentBrowserError } from "./errors.js";
import type { SvgPoint } from "./svg-path-types.js";
import type { SvgMatrix } from "./svg-scene-types.js";

export const svgIdentity: SvgMatrix = Object.freeze([1, 0, 0, 1, 0, 0]);
export const svgAffineLimits = Object.freeze({
	maxSourceCodeUnits: 4096,
	maxTransforms: 128,
	maxCoordinate: 1e9,
});

function bounded(value: number) {
	if (
		!Number.isFinite(value) ||
		Math.abs(value) > svgAffineLimits.maxCoordinate
	)
		throw new AgentBrowserError(
			"resource-limit",
			"SVG affine coordinate limit exceeded",
		);
	return value === 0 ? 0 : value;
}

function product(first: number, second: number) {
	const result = bounded(first * second);
	if (result === 0 && first !== 0 && second !== 0)
		throw new AgentBrowserError(
			"resource-limit",
			"SVG affine precision limit exceeded",
		);
	return result;
}

function affineCoordinate(
	firstCoefficient: number,
	firstCoordinate: number,
	secondCoefficient: number,
	secondCoordinate: number,
	translation = 0,
) {
	const combined = bounded(
		product(firstCoefficient, firstCoordinate) +
			product(secondCoefficient, secondCoordinate),
	);
	return bounded(combined + translation);
}

function trimSvgWhitespace(value: string) {
	return value.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
}

function matrix(values: readonly number[]): SvgMatrix {
	if (!Array.isArray(values) || values.length !== 6)
		throw new AgentBrowserError("invalid-input", "Invalid SVG matrix");
	return Object.freeze(values.map(bounded)) as unknown as SvgMatrix;
}

export function multiplySvgMatrices(
	first: SvgMatrix,
	second: SvgMatrix,
	charge: (amount: number) => void,
): SvgMatrix {
	charge(24);
	const left = matrix(first);
	const right = matrix(second);
	return matrix([
		affineCoordinate(left[0], right[0], left[2], right[1]),
		affineCoordinate(left[1], right[0], left[3], right[1]),
		affineCoordinate(left[0], right[2], left[2], right[3]),
		affineCoordinate(left[1], right[2], left[3], right[3]),
		affineCoordinate(left[0], right[4], left[2], right[5], left[4]),
		affineCoordinate(left[1], right[4], left[3], right[5], left[5]),
	]);
}

export function transformSvgPoint(
	transform: SvgMatrix,
	point: SvgPoint,
): SvgPoint {
	const value = matrix(transform);
	const across = bounded(point.x);
	const down = bounded(point.y);
	return Object.freeze({
		x: affineCoordinate(value[0], across, value[2], down, value[4]),
		y: affineCoordinate(value[1], across, value[3], down, value[5]),
	});
}

export function parseSvgTransform(
	source: string | undefined,
	charge: (amount: number) => void,
): SvgMatrix {
	if (source === undefined) return svgIdentity;
	if (typeof source !== "string")
		throw new AgentBrowserError("invalid-input", "Invalid SVG transform");
	if (source.length > svgAffineLimits.maxSourceCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"SVG transform source limit exceeded",
		);
	charge(source.length * 2 + 1);
	if (/[^\t\n\r\x20-\x7e]/.test(source))
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported SVG transform syntax",
		);
	let remaining = trimSvgWhitespace(source);
	let result = svgIdentity;
	let count = 0;
	while (remaining) {
		if (++count > svgAffineLimits.maxTransforms)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG transform count limit exceeded",
			);
		const parsed = /^([A-Za-z]+)[\t\n\r ]*\(([^()]*)\)/.exec(remaining);
		if (!parsed)
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported SVG transform syntax",
			);
		const argumentsText = trimSvgWhitespace(parsed[2]);
		if (!argumentsText || /^,|,$|,[\t\n\r ]*,/.test(argumentsText))
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported SVG transform arguments",
			);
		const tokens = argumentsText.split(/[\t\n\r ,]+/);
		if (
			tokens.length > 6 ||
			tokens.some(
				(token) => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token),
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported SVG transform arguments",
			);
		const values = tokens.map((token) => bounded(Number(token)));
		let local: SvgMatrix;
		const name = parsed[1];
		if (name === "matrix" && values.length === 6) local = matrix(values);
		else if (
			name === "translate" &&
			(values.length === 1 || values.length === 2)
		)
			local = matrix([1, 0, 0, 1, values[0], values[1] ?? 0]);
		else if (name === "scale" && (values.length === 1 || values.length === 2))
			local = matrix([values[0], 0, 0, values[1] ?? values[0], 0, 0]);
		else if (
			name === "rotate" &&
			(values.length === 1 || values.length === 3)
		) {
			const angle = ((values[0] % 360) * Math.PI) / 180;
			const cosine = Math.cos(angle);
			const sine = Math.sin(angle);
			const across = values[1] ?? 0;
			const down = values[2] ?? 0;
			local = matrix([
				cosine,
				sine,
				-sine,
				cosine,
				affineCoordinate(across, 1 - cosine, down, sine),
				affineCoordinate(down, 1 - cosine, across, -sine),
			]);
		} else if ((name === "skewX" || name === "skewY") && values.length === 1) {
			const tangent = Math.tan(((values[0] % 360) * Math.PI) / 180);
			local =
				name === "skewX"
					? matrix([1, 0, tangent, 1, 0, 0])
					: matrix([1, tangent, 0, 1, 0, 0]);
		} else
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported SVG transform function",
			);
		result = multiplySvgMatrices(result, local, charge);
		remaining = trimSvgWhitespace(remaining.slice(parsed[0].length));
		if (remaining.startsWith(",")) {
			remaining = trimSvgWhitespace(remaining.slice(1));
			if (!remaining)
				throw new AgentBrowserError(
					"unsupported",
					"Trailing SVG transform separator",
				);
		}
	}
	return result;
}
