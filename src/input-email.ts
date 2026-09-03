function asciiWhitespace(code: number) {
	return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function trimAscii(value: string) {
	let start = 0;
	let end = value.length;
	while (start < end && asciiWhitespace(value.charCodeAt(start))) start++;
	while (end > start && asciiWhitespace(value.charCodeAt(end - 1))) end--;
	return value.slice(start, end);
}

export function sanitizeEmailValue(value: string, multiple: boolean): string {
	return multiple
		? value.split(",").map(trimAscii).join(",")
		: trimAscii(value.replace(/[\r\n]/g, ""));
}

function validAddress(value: string) {
	const at = value.indexOf("@");
	if (at < 1 || /[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]/.test(value.slice(0, at)))
		return false;
	const domain = value.slice(at + 1);
	if (/[^A-Za-z0-9.-]/.test(domain)) return false;
	let start = 0;
	while (true) {
		const dot = domain.indexOf(".", start);
		const end = dot < 0 ? domain.length : dot;
		if (
			end === start ||
			end - start > 63 ||
			domain[start] === "-" ||
			domain[end - 1] === "-"
		)
			return false;
		if (dot < 0) return true;
		start = dot + 1;
	}
}

export function validEmailValue(value: string, multiple: boolean): boolean {
	if (value === "") return true;
	if (!multiple) return validAddress(value);
	let start = 0;
	while (true) {
		const comma = value.indexOf(",", start);
		const end = comma < 0 ? value.length : comma;
		if (!validAddress(value.slice(start, end))) return false;
		if (comma < 0) return true;
		start = comma + 1;
	}
}
