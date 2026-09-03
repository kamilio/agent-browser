const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function fullMatch(pattern: RegExp, value: string) {
	const match = pattern.exec(value);
	return match?.[0] === value ? match : null;
}

function yearCycle(year: string): number | undefined {
	return /[1-9]/.test(year) ? Number(year.slice(-4)) % 400 : undefined;
}

function leapYear(cycle: number) {
	return cycle === 0 || (cycle % 4 === 0 && cycle % 100 !== 0);
}

function validDate(value: string, monthOnly = false) {
	const parts = fullMatch(
		monthOnly
			? /^([0-9]{4,})-([0-9]{2})$/
			: /^([0-9]{4,})-([0-9]{2})-([0-9]{2})$/,
		value,
	);
	if (!parts) return false;
	const cycle = yearCycle(parts[1]);
	const month = Number(parts[2]);
	if (cycle === undefined || month < 1 || month > 12) return false;
	if (monthOnly) return true;
	const day = Number(parts[3]);
	const maximum = month === 2 && leapYear(cycle) ? 29 : monthDays[month - 1];
	return day >= 1 && day <= maximum;
}

function validWeek(value: string) {
	const parts = fullMatch(/^([0-9]{4,})-W([0-9]{2})$/, value);
	if (!parts) return false;
	const cycle = yearCycle(parts[1]);
	if (cycle === undefined) return false;
	const previous = (cycle || 400) - 1;
	const weekday =
		(previous + Math.floor(previous / 4) - Math.floor(previous / 100)) % 7;
	const maximum = weekday === 3 || (weekday === 2 && leapYear(cycle)) ? 53 : 52;
	const week = Number(parts[2]);
	return week >= 1 && week <= maximum;
}

function timeParts(value: string) {
	const parts = fullMatch(
		/^([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]{1,3}))?)?$/,
		value,
	);
	if (
		!parts ||
		Number(parts[1]) > 23 ||
		Number(parts[2]) > 59 ||
		Number(parts[3] ?? 0) > 59
	)
		return null;
	return parts;
}

function localDateTime(value: string) {
	const separator = value.search(/[T ]/);
	if (separator < 0) return "";
	const date = value.slice(0, separator);
	if (!validDate(date)) return "";
	const time = timeParts(value.slice(separator + 1));
	if (!time) return "";
	const fraction = (time[4] ?? "").replace(/0+$/, "");
	const seconds =
		Number(time[3] ?? 0) !== 0 || fraction
			? `:${time[3]}${fraction ? `.${fraction}` : ""}`
			: "";
	return `${date}T${time[1]}:${time[2]}${seconds}`;
}

export function sanitizeCalendarInput(
	type: string,
	value: string,
): string | undefined {
	switch (type) {
		case "date":
			return validDate(value) ? value : "";
		case "month":
			return validDate(value, true) ? value : "";
		case "week":
			return validWeek(value) ? value : "";
		case "time":
			return timeParts(value) ? value : "";
		case "datetime-local":
			return localDateTime(value);
		default:
			return undefined;
	}
}
