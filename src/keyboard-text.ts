export function previousOffset(value: string, offset: number) {
	if (
		offset > 1 &&
		/[\uDC00-\uDFFF]/.test(value[offset - 1]) &&
		/[\uD800-\uDBFF]/.test(value[offset - 2])
	)
		return offset - 2;
	return Math.max(0, offset - 1);
}

export function nextOffset(value: string, offset: number) {
	return Math.min(
		value.length,
		offset + ((value.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1),
	);
}
