import { calendarCoordinate, daysBeforeYear } from "./calendar-validity.js";
import { validNumberValue } from "./input-number.js";

const numericTypes = [
	"number",
	"range",
	"date",
	"month",
	"week",
	"time",
	"datetime-local",
];
const dayMilliseconds = 86_400_000;
const maximumTimestamp = 8_640_000_000_000_000;
const minimumTimestamp = -62_135_596_800_000;

export function inputValueAsNumber(type: string, value: string): number {
	if (!numericTypes.includes(type)) return Number.NaN;
	if (type === "number" || type === "range")
		return validNumberValue(value) ? Number(value) : Number.NaN;
	const current = calendarCoordinate(type, value);
	if (!current) return Number.NaN;
	if (type === "time") return Number(current.units);
	if (current.year.length > 6 || Number(current.year) > 275760)
		return Number.NaN;
	if (type === "month") {
		if (current.year === "275760" && current.units > 8n) return Number.NaN;
		return (Number(current.year) - 1970) * 12 + Number(current.units);
	}
	const timestamp = Number(
		(daysBeforeYear(BigInt(current.year)) - 719162n) * BigInt(dayMilliseconds) +
			current.units,
	);
	return timestamp >= minimumTimestamp && timestamp <= maximumTimestamp
		? timestamp
		: Number.NaN;
}

function positiveDayTime(value: number): number {
	const remainder = value % dayMilliseconds;
	return remainder < 0 ? remainder + dayMilliseconds : remainder;
}

function clockString(value: number): string {
	const hour = Math.floor(value / 3_600_000);
	const minute = Math.floor(value / 60_000) % 60;
	const second = Math.floor(value / 1000) % 60;
	const fraction = value % 1000;
	let result = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
	if (second || fraction) result += `:${String(second).padStart(2, "0")}`;
	if (fraction)
		result += `.${String(fraction).padStart(3, "0").replace(/0+$/, "")}`;
	return result;
}

function dateString(date: Date): string {
	return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekString(timestamp: number, date: Date): string {
	const midnight = Math.floor(timestamp / dayMilliseconds) * dayMilliseconds;
	const weekday = (date.getUTCDay() + 6) % 7;
	const thursday = new Date(midnight + (3 - weekday) * dayMilliseconds);
	const year = thursday.getUTCFullYear();
	if (!Number.isFinite(year) || year < 1) return "";
	const januaryFourth = new Date(0);
	januaryFourth.setUTCFullYear(year, 0, 4);
	const firstMonday =
		januaryFourth.getTime() -
		((januaryFourth.getUTCDay() + 6) % 7) * dayMilliseconds;
	const week = Math.floor((midnight - firstMonday) / (7 * dayMilliseconds)) + 1;
	return `${String(year).padStart(4, "0")}-W${String(week).padStart(2, "0")}`;
}

export function inputNumberValue(type: string, raw: unknown): string {
	if (
		typeof raw === "bigint" ||
		typeof raw === "symbol" ||
		typeof raw === "function" ||
		(typeof raw === "object" && raw !== null)
	)
		throw new TypeError(
			"valueAsNumber supports primitive numeric conversion only",
		);
	const value = Number(raw);
	if (value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)
		throw new TypeError("valueAsNumber cannot be infinite");
	if (!numericTypes.includes(type))
		throw new DOMException(
			"valueAsNumber does not apply to this input type",
			"InvalidStateError",
		);
	if (Number.isNaN(value)) return "";
	if (type === "number" || type === "range") return String(value);
	const rounded = Math.sign(value) * Math.round(Math.abs(value));
	if (type === "time") return clockString(positiveDayTime(rounded));
	if (type === "month") {
		const year = 1970 + Math.floor(rounded / 12);
		const month = ((rounded % 12) + 12) % 12;
		if (year < 1 || year > 275760 || (year === 275760 && month > 8)) return "";
		return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
	}
	if (rounded < minimumTimestamp || rounded > maximumTimestamp) return "";
	const date = new Date(rounded);
	if (type === "week") return weekString(rounded, date);
	const result = dateString(date);
	return type === "datetime-local"
		? `${result}T${clockString(positiveDayTime(rounded))}`
		: result;
}
