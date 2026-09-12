import { AgentBrowserError } from "./errors.js";
import type { Rgba } from "./raster.js";
import {
	multiplySvgMatrices,
	svgAffineLimits,
	svgIdentity,
	transformSvgPoint,
} from "./svg-affine.js";
import type { SvgMatrix } from "./svg-scene-types.js";

export interface SvgGradientStop {
	readonly offset: number;
	readonly color: Rgba;
}

export interface SvgLinearGradientInput {
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
	readonly stops: readonly SvgGradientStop[];
	readonly transform?: SvgMatrix;
	readonly spreadMethod?: "pad" | "repeat" | "reflect";
	readonly colorInterpolation?: "sRGB" | "linearRGB";
	readonly opacity?: number;
}

function invalid(message: string): never {
	throw new AgentBrowserError(
		"invalid-input",
		`SVG linear gradient: ${message}`,
	);
}

function resource(message: string): never {
	throw new AgentBrowserError(
		"resource-limit",
		`SVG linear gradient: ${message}`,
	);
}

function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", `SVG linear gradient: ${message}`);
}

function debit(charge: (amount: number) => void, amount: number): void {
	if (typeof charge !== "function") invalid("missing work callback");
	charge(amount);
}

function coordinate(value: number): number {
	if (!Number.isFinite(value)) invalid("nonfinite coordinate");
	if (Math.abs(value) > svgAffineLimits.maxCoordinate)
		resource("coordinate limit exceeded");
	return value === 0 ? 0 : value;
}

function opacityValue(value: number): number {
	if (!Number.isFinite(value) || value < 0 || value > 1)
		invalid("opacity outside zero to one");
	return value;
}

function channelValue(value: number): number {
	if (!Number.isInteger(value) || value < 0 || value > 255)
		invalid("invalid RGBA channel");
	return value === 0 ? 0 : value;
}

function inverse(
	transform: SvgMatrix,
	charge: (amount: number) => void,
): SvgMatrix {
	debit(charge, 32);
	const scale = Math.max(...transform.slice(0, 4).map(Math.abs));
	if (scale === 0) unsupported("singular transform");
	const across = transform[0] / scale;
	const down = transform[1] / scale;
	const skew = transform[2] / scale;
	const vertical = transform[3] / scale;
	const determinant = across * vertical - down * skew;
	if (determinant === 0) unsupported("singular transform");
	if (Math.abs(determinant) <= 32 * Number.EPSILON)
		unsupported("ill-conditioned transform");
	const divisor = determinant * scale;
	const linear: SvgMatrix = [
		vertical / divisor,
		-down / divisor,
		-skew / divisor,
		across / divisor,
		0,
		0,
	];
	return multiplySvgMatrices(
		linear,
		[1, 0, 0, 1, -transform[4], -transform[5]],
		charge,
	);
}

export class SvgLinearGradient {
	readonly kind = "linear-gradient";
	readonly #input: Readonly<SvgLinearGradientInput>;
	readonly #inverse: SvgMatrix;
	readonly #scale: number;
	readonly #across: number;
	readonly #down: number;
	readonly #denominator: number;

	constructor(input: SvgLinearGradientInput, charge: (amount: number) => void) {
		debit(charge, 16);
		if (!input || typeof input !== "object" || Array.isArray(input))
			invalid("invalid input record");
		const x1 = coordinate(input.x1);
		const y1 = coordinate(input.y1);
		const x2 = coordinate(input.x2);
		const y2 = coordinate(input.y2);
		const spreadMethod =
			input.spreadMethod === undefined ? "pad" : input.spreadMethod;
		if (!["pad", "repeat", "reflect"].includes(spreadMethod))
			invalid("invalid spread method");
		const colorInterpolation =
			input.colorInterpolation === undefined
				? "sRGB"
				: input.colorInterpolation;
		if (!["sRGB", "linearRGB"].includes(colorInterpolation))
			invalid("invalid color interpolation");
		if (colorInterpolation !== "sRGB")
			unsupported("linearRGB interpolation awaits primary evidence");
		const opacity = opacityValue(
			input.opacity === undefined ? 1 : input.opacity,
		);
		const suppliedTransform =
			input.transform === undefined ? svgIdentity : input.transform;
		if (!Array.isArray(suppliedTransform) || suppliedTransform.length !== 6)
			invalid("invalid transform");
		for (const value of suppliedTransform) coordinate(value);
		const transform = multiplySvgMatrices(
			svgIdentity,
			suppliedTransform,
			charge,
		);
		const inverseTransform = inverse(transform, charge);
		const suppliedStops = input.stops;
		if (!Array.isArray(suppliedStops) || suppliedStops.length < 1)
			invalid("at least one stop required");
		const count = suppliedStops.length;
		if (count > 256) resource("stop limit exceeded");
		debit(charge, count * 12);
		if (suppliedStops.length !== count)
			invalid("stops changed during charging");
		const stops: SvgGradientStop[] = [];
		let previous = 0;
		for (let index = 0; index < count; index++) {
			const stop = suppliedStops[index];
			if (!stop || typeof stop !== "object" || Array.isArray(stop))
				invalid("invalid stop record");
			const offset = stop.offset;
			if (!Number.isFinite(offset) || offset < previous || offset > 1)
				invalid("stops must be canonical nondecreasing offsets in zero to one");
			const color = stop.color;
			if (!Array.isArray(color) || color.length !== 4)
				invalid("invalid RGBA color");
			const red = channelValue(color[0]);
			const green = channelValue(color[1]);
			const blue = channelValue(color[2]);
			const alpha = channelValue(color[3]);
			const copiedColor: Rgba = Object.freeze([red, green, blue, alpha]);
			stops.push(
				Object.freeze({
					offset: offset === 0 ? 0 : offset,
					color: copiedColor,
				}),
			);
			previous = offset;
		}
		this.#input = Object.freeze({
			x1,
			y1,
			x2,
			y2,
			spreadMethod,
			colorInterpolation,
			opacity,
			transform,
			stops: Object.freeze(stops),
		});
		this.#inverse = inverseTransform;
		this.#scale = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
		this.#across = this.#scale === 0 ? 0 : (x2 - x1) / this.#scale;
		this.#down = this.#scale === 0 ? 0 : (y2 - y1) / this.#scale;
		this.#denominator = this.#across * this.#across + this.#down * this.#down;
		Object.freeze(this);
	}

	sample(
		horizontal: number,
		vertical: number,
		charge: (amount: number) => void,
	): Rgba {
		debit(charge, 24);
		coordinate(horizontal);
		coordinate(vertical);
		const stops = this.#input.stops;
		if (stops.length === 1 || this.#scale === 0)
			return this.#color(stops[stops.length - 1].color);
		const point = transformSvgPoint(this.#inverse, {
			x: horizontal,
			y: vertical,
		});
		let position =
			(((point.x - this.#input.x1) / this.#scale) * this.#across +
				((point.y - this.#input.y1) / this.#scale) * this.#down) /
			this.#denominator;
		if (!Number.isFinite(position))
			resource("projection precision limit exceeded");
		if (this.#input.spreadMethod !== "pad") {
			if (Math.abs(position) > Number.MAX_SAFE_INTEGER)
				resource("spread precision limit exceeded");
			if (this.#input.spreadMethod === "repeat")
				position -= Math.floor(position);
			else {
				position -= 2 * Math.floor(position / 2);
				if (position > 1) position = 2 - position;
			}
		}
		if (position < stops[0].offset) return this.#color(stops[0].color);
		if (position >= stops[stops.length - 1].offset)
			return this.#color(stops[stops.length - 1].color);
		let lower = 0;
		let upper = stops.length;
		while (lower < upper) {
			debit(charge, 2);
			const middle = lower + Math.floor((upper - lower) / 2);
			if (stops[middle].offset <= position) lower = middle + 1;
			else upper = middle;
		}
		const first = stops[lower - 1];
		const second = stops[lower];
		const fraction = (position - first.offset) / (second.offset - first.offset);
		return Object.freeze([
			Math.round(
				first.color[0] + (second.color[0] - first.color[0]) * fraction,
			),
			Math.round(
				first.color[1] + (second.color[1] - first.color[1]) * fraction,
			),
			Math.round(
				first.color[2] + (second.color[2] - first.color[2]) * fraction,
			),
			Math.round(
				(first.color[3] + (second.color[3] - first.color[3]) * fraction) *
					(this.#input.opacity ?? 1),
			),
		]);
	}

	#color(color: Rgba): Rgba {
		const opacity = this.#input.opacity ?? 1;
		return opacity === 1
			? color
			: Object.freeze([
					color[0],
					color[1],
					color[2],
					Math.round(color[3] * opacity),
				]);
	}

	transformed(
		matrix: SvgMatrix,
		charge: (amount: number) => void,
	): SvgLinearGradient {
		debit(charge, 1);
		return new SvgLinearGradient(
			{
				...this.#input,
				transform: multiplySvgMatrices(
					matrix,
					this.#input.transform ?? svgIdentity,
					charge,
				),
			},
			charge,
		);
	}

	withOpacity(
		opacity: number,
		charge: (amount: number) => void,
	): SvgLinearGradient {
		debit(charge, 1);
		return new SvgLinearGradient(
			{
				...this.#input,
				opacity: opacityValue(opacity) * (this.#input.opacity ?? 1),
			},
			charge,
		);
	}
}
