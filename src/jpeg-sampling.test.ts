import { expect, it } from "vitest";
import {
	JpegSampleRows,
	jpegSamplingWorkingBytes,
	type JpegSamplePlane,
} from "./jpeg-sampling.js";

function reference(
	source: JpegSamplePlane,
	column: number,
	row: number,
	maxHorizontal: number,
	maxVertical: number,
) {
	const sourceX = Math.max(
		0,
		Math.min(
			source.width - 1,
			((column + 0.5) * source.horizontal) / maxHorizontal - 0.5,
		),
	);
	const sourceY = Math.max(
		0,
		Math.min(
			source.height - 1,
			((row + 0.5) * source.vertical) / maxVertical - 0.5,
		),
	);
	const left = Math.floor(sourceX);
	const top = Math.floor(sourceY);
	const right = Math.min(source.width - 1, left + 1);
	const bottom = Math.min(source.height - 1, top + 1);
	const horizontal = sourceX - left;
	const vertical = sourceY - top;
	const upper =
		source.samples[top * source.stride + left] * (1 - horizontal) +
		source.samples[top * source.stride + right] * horizontal;
	const lower =
		source.samples[bottom * source.stride + left] * (1 - horizontal) +
		source.samples[bottom * source.stride + right] * horizontal;
	return Math.round(upper * (1 - vertical) + lower * vertical);
}
function fixture(
	width: number,
	height: number,
	horizontal: number,
	vertical: number,
	maxHorizontal: number,
	maxVertical: number,
) {
	const sourceWidth = Math.ceil((width * horizontal) / maxHorizontal);
	const sourceHeight = Math.ceil((height * vertical) / maxVertical);
	const stride = sourceWidth + 3;
	const samples = Uint8Array.from(
		{ length: stride * sourceHeight },
		(_, index) => (index * 71) % 256,
	);
	const source = {
		width: sourceWidth,
		height: sourceHeight,
		stride,
		samples,
		horizontal,
		vertical,
	};
	let work = 0;
	const rows = new JpegSampleRows(
		source,
		width,
		height,
		maxHorizontal,
		maxVertical,
		(units) => {
			work += units;
		},
	);
	return { source, rows, work: () => work };
}

it.each(
	Array.from({ length: 16 }, (_, index) => [
		(index % 4) + 1,
		Math.floor(index / 4) + 1,
	]),
)(
	"matches direct centered bilinear samples for factors %s/%s, edges and out-of-order row access",
	(horizontal, vertical) => {
		for (const [width, height] of [
			[1, 1],
			[7, 9],
			[17, 13],
			[31, 23],
		]) {
			const { source, rows } = fixture(
				width,
				height,
				horizontal,
				vertical,
				4,
				4,
			);
			for (const row of [
				...Array.from({ length: height }, (_, index) => index),
				...Array.from({ length: height }, (_, index) => height - index - 1),
			]) {
				const actual = [...rows.read(row)];
				expect(actual).toEqual(
					Array.from({ length: width }, (_, column) =>
						reference(source, column, row, 4, 4),
					),
				);
			}
		}
	},
);

it("reuses full-resolution sample storage instead of interpolating or copying it", () => {
	const { source, rows, work } = fixture(17, 13, 2, 2, 2, 2);
	const value = rows.read(4);
	expect(value.buffer).toBe(source.samples.buffer);
	expect(value.byteOffset).toBe(source.samples.byteOffset + source.stride * 4);
	expect(work()).toBe(17);
	expect(jpegSamplingWorkingBytes(17, 2, 2, 2, 2)).toBe(0);
});

it("preserves exact direct-formula rounding for non-power-of-two sampling ratios", () => {
	for (const maxHorizontal of [2, 3, 4])
		for (const maxVertical of [2, 3, 4])
			for (let horizontal = 1; horizontal <= maxHorizontal; horizontal++)
				for (let vertical = 1; vertical <= maxVertical; vertical++) {
					const { source, rows } = fixture(
						19,
						11,
						horizontal,
						vertical,
						maxHorizontal,
						maxVertical,
					);
					for (let row = 0; row < 11; row++)
						expect([...rows.read(row)]).toEqual(
							Array.from({ length: 19 }, (_, column) =>
								reference(source, column, row, maxHorizontal, maxVertical),
							),
						);
				}
});

it("caches horizontal expansions across adjacent vertical output rows", () => {
	const { rows, work } = fixture(16, 16, 1, 1, 2, 2);
	const initial = work();
	rows.read(0);
	const first = work();
	rows.read(1);
	const second = work();
	rows.read(2);
	const third = work();
	expect(first - initial).toBe(8 + 16 * 2 + 16);
	expect(second - first).toBe(8 + 16 * 2 + 16 * 2);
	expect(third - second).toBe(8 + 16 * 2);
	const repeated = [...rows.read(2)];
	expect([...rows.read(2)]).toEqual(repeated);
	expect(work()).toBe(third);
});

it("accounts for two Float64 row caches, one output row and optional horizontal mappings", () => {
	expect(jpegSamplingWorkingBytes(1024, 1, 1, 2, 2)).toBe(1024 * 33);
	expect(jpegSamplingWorkingBytes(1024, 2, 1, 2, 2)).toBe(1024 * 17);
});

it.each([-1, 13, 0.5, Number.NaN])(
	"rejects invalid output row %s before reading",
	(row) => {
		const { rows, work } = fixture(17, 13, 1, 1, 2, 2);
		const initial = work();
		expect(() => rows.read(row)).toThrow(/sample row/);
		expect(work()).toBe(initial);
	},
);

it("propagates work-budget failures before computing a row", () => {
	const source = fixture(17, 13, 1, 1, 2, 2).source;
	let allowed = true;
	const rows = new JpegSampleRows(source, 17, 13, 2, 2, () => {
		if (!allowed) throw new Error("budget");
	});
	allowed = false;
	expect(() => rows.read(0)).toThrow("budget");
});
