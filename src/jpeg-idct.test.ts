import { expect, it } from "vitest";
import {
	inverseJpegBlock,
	jpegInverseBlockWork,
	scaleJpegQuantization,
} from "./jpeg-idct.js";

const basis = Float64Array.from(
	{ length: 64 },
	(_, index) =>
		((index % 8 === 0 ? Math.SQRT1_2 : 1) *
			Math.cos(
				((2 * Math.floor(index / 8) + 1) * (index % 8) * Math.PI) / 16,
			)) /
		2,
);
function reference(coefficients: Int32Array, quantization: Uint16Array) {
	const result = new Float64Array(64);
	for (let row = 0; row < 8; row++)
		for (let column = 0; column < 8; column++) {
			let sum = 0;
			for (let vertical = 0; vertical < 8; vertical++)
				for (let horizontal = 0; horizontal < 8; horizontal++)
					sum +=
						coefficients[vertical * 8 + horizontal] *
						quantization[vertical * 8 + horizontal] *
						basis[row * 8 + vertical] *
						basis[column * 8 + horizontal];
			result[row * 8 + column] = sum;
		}
	return result;
}
function verify(coefficients: Int32Array, quantization: Uint16Array) {
	const expected = reference(coefficients, quantization);
	const raw = new Float64Array(64);
	const output = new Uint8Array(64);
	inverseJpegBlock(
		coefficients,
		0,
		scaleJpegQuantization(quantization),
		raw,
		output,
		0,
		8,
	);
	const magnitude = coefficients.reduce(
		(sum, value, index) => sum + Math.abs(value * quantization[index]),
		0,
	);
	let maximum = 0;
	for (let index = 0; index < 64; index++) {
		maximum = Math.max(maximum, Math.abs(raw[index] - expected[index]));
		expect(
			Math.abs(
				output[index] -
					Math.max(0, Math.min(255, Math.round(expected[index] + 128))),
			),
		).toBeLessThanOrEqual(1);
	}
	expect(maximum).toBeLessThanOrEqual(Math.max(1, magnitude) * 1e-13);
}

it.each(Array.from({ length: 64 }, (_, index) => index))(
	"agrees with the direct cosine definition for frequency %s and both signs",
	(frequency) => {
		for (const amplitude of [-1024, -11, -1, 1, 11, 1023]) {
			const coefficients = new Int32Array(64);
			coefficients[frequency] = amplitude;
			verify(
				coefficients,
				Uint16Array.from(
					{ length: 64 },
					(_, index) => ((index * 37) % 255) + 1,
				),
			);
		}
	},
);

it("matches a direct mathematical oracle across dense and sparse deterministic 16-bit quantizers", () => {
	let state = 851;
	const random = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state;
	};
	for (let attempt = 0; attempt < 256; attempt++) {
		const coefficients = Int32Array.from({ length: 64 }, () =>
			random() % 3 === 0 ? 0 : (random() % 2048) - 1024,
		);
		const quantization = Uint16Array.from(
			{ length: 64 },
			() => (random() % 65535) + 1,
		);
		verify(coefficients, quantization);
	}
});

it("respects coefficient offsets and padded output strides without modifying input or neighboring pixels", () => {
	const coefficients = new Int32Array(128).fill(99);
	coefficients.fill(0, 64);
	coefficients[64] = 16;
	const original = coefficients.slice();
	const quantization = new Uint16Array(64).fill(8);
	const output = new Uint8Array(200).fill(77);
	inverseJpegBlock(
		coefficients,
		64,
		scaleJpegQuantization(quantization),
		new Float64Array(64),
		output,
		17,
		13,
	);
	for (let index = 0; index < output.length; index++) {
		const relative = index - 17;
		const inside =
			relative >= 0 && Math.floor(relative / 13) < 8 && relative % 13 < 8;
		expect(output[index]).toBe(inside ? 144 : 77);
	}
	expect(coefficients).toEqual(original);
	expect(quantization.every((value) => value === 8)).toBe(true);
});

it("accounts for dequantization, five multiplications per one-dimensional transform and output visits", () => {
	expect(jpegInverseBlockWork).toBe(64 + 16 * 5 + 64);
});
