const rotation = 2 * Math.cos(Math.PI / 8);
const outerRotation = 2 * (Math.cos(Math.PI / 8) - Math.sin(Math.PI / 8));
const innerRotation = -2 * (Math.cos(Math.PI / 8) + Math.sin(Math.PI / 8));
const scales = Float64Array.from({ length: 8 }, (_, frequency) =>
	frequency === 0 || frequency === 4
		? 1
		: Math.SQRT2 * Math.cos((frequency * Math.PI) / 16),
);

export const jpegInverseBlockWork = 208;

export function scaleJpegQuantization(quantization: Uint16Array): Float64Array {
	return Float64Array.from(
		quantization,
		(value, index) =>
			(value * scales[Math.floor(index / 8)] * scales[index % 8]) / 8,
	);
}

function inverseLine(values: Float64Array, offset: number, step: number) {
	const frequency0 = values[offset];
	const frequency1 = values[offset + step];
	const frequency2 = values[offset + step * 2];
	const frequency3 = values[offset + step * 3];
	const frequency4 = values[offset + step * 4];
	const frequency5 = values[offset + step * 5];
	const frequency6 = values[offset + step * 6];
	const frequency7 = values[offset + step * 7];
	const evenBase = frequency0 + frequency4;
	const evenDifference = frequency0 - frequency4;
	const evenPair = frequency2 + frequency6;
	const evenRotation = (frequency2 - frequency6) * Math.SQRT2 - evenPair;
	const even0 = evenBase + evenPair;
	const even1 = evenDifference + evenRotation;
	const even2 = evenDifference - evenRotation;
	const even3 = evenBase - evenPair;
	const oddMiddle = frequency5 + frequency3;
	const oddMiddleDifference = frequency5 - frequency3;
	const oddEdges = frequency1 + frequency7;
	const oddEdgeDifference = frequency1 - frequency7;
	const oddTotal = oddEdges + oddMiddle;
	const oddDifference = (oddEdges - oddMiddle) * Math.SQRT2;
	const oddTurn = (oddMiddleDifference + oddEdgeDifference) * rotation;
	const oddOuter = oddEdgeDifference * outerRotation - oddTurn;
	const oddInner = oddMiddleDifference * innerRotation + oddTurn;
	const odd2 = oddInner - oddTotal;
	const odd1 = oddDifference - odd2;
	const odd0 = oddOuter + odd1;
	values[offset] = even0 + oddTotal;
	values[offset + step * 7] = even0 - oddTotal;
	values[offset + step] = even1 + odd2;
	values[offset + step * 6] = even1 - odd2;
	values[offset + step * 2] = even2 + odd1;
	values[offset + step * 5] = even2 - odd1;
	values[offset + step * 3] = even3 - odd0;
	values[offset + step * 4] = even3 + odd0;
}

export function inverseJpegBlock(
	coefficients: Int32Array,
	offset: number,
	scaledQuantization: Float64Array,
	working: Float64Array,
	output: Uint8Array,
	outputOffset: number,
	outputStride: number,
): void {
	for (let index = 0; index < 64; index++)
		working[index] = coefficients[offset + index] * scaledQuantization[index];
	for (let row = 0; row < 8; row++) inverseLine(working, row * 8, 1);
	for (let column = 0; column < 8; column++) inverseLine(working, column, 8);
	for (let row = 0; row < 8; row++)
		for (let column = 0; column < 8; column++)
			output[outputOffset + row * outputStride + column] = Math.max(
				0,
				Math.min(255, Math.round(working[row * 8 + column] + 128)),
			);
}
