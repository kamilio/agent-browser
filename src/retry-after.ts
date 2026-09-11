export interface RetryAfterAdvice {
	readonly kind: "delay-seconds" | "http-date";
	readonly delaySeconds: number;
	readonly retryAt: string;
}

export const retryAfterLimits = Object.freeze({
	maxHeaderNames: 128,
	maxValues: 16,
	maxValueCodeUnits: 128,
	maxDelaySeconds: 86_400,
});

const months = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const longDays = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

function headerValue(headers: object): string | undefined {
	const prototype = Object.getPrototypeOf(headers);
	if (prototype !== null && prototype !== Object.prototype) return undefined;
	const names = Reflect.ownKeys(headers);
	if (names.length > retryAfterLimits.maxHeaderNames) return undefined;
	let selected: string | undefined;
	let count = 0;
	for (const name of names) {
		if (typeof name !== "string" || name.length > 128) return undefined;
		if (name.toLowerCase() !== "retry-after") continue;
		const field = Object.getOwnPropertyDescriptor(headers, name);
		if (!field || !Object.hasOwn(field, "value")) return undefined;
		const value: unknown = field.value;
		const values: unknown[] = [];
		if (typeof value === "string") values.push(value);
		else if (Array.isArray(value)) {
			const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
			if (!Number.isSafeInteger(length) || length < 1 || length > 16)
				return undefined;
			for (let index = 0; index < length; index++) {
				const item = Object.getOwnPropertyDescriptor(value, String(index));
				if (!item || !Object.hasOwn(item, "value")) return undefined;
				values.push(item.value);
			}
		} else return undefined;
		for (const item of values) {
			if (
				++count > retryAfterLimits.maxValues ||
				typeof item !== "string" ||
				item.length > retryAfterLimits.maxValueCodeUnits ||
				/[^\t\x20-\x7e]/.test(item)
			)
				return undefined;
			const normalized = item.replace(/^[ \t]+|[ \t]+$/g, "");
			if (!normalized || (selected !== undefined && selected !== normalized))
				return undefined;
			selected = normalized;
		}
	}
	return selected;
}

function dateTimestamp(value: string, receivedAt: number): number | undefined {
	const imf =
		/^([A-Z][a-z]{2}), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
			value,
		);
	const obsolete = imf
		? null
		: /^([A-Z][a-z]+), (\d{2})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
				value,
			);
	const ascii =
		imf || obsolete
			? null
			: /^([A-Z][a-z]{2}) ([A-Z][a-z]{2}) ( \d|\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
					value,
				);
	const match = imf ?? obsolete ?? ascii;
	if (!match) return undefined;
	const weekday = (obsolete ? longDays : shortDays).indexOf(match[1]);
	const month = months.indexOf(match[ascii ? 2 : 3]);
	const day = Number(match[ascii ? 3 : 2]);
	let year = Number(match[ascii ? 7 : 4]);
	const hour = Number(match[ascii ? 4 : 5]);
	const minute = Number(match[ascii ? 5 : 6]);
	const second = Number(match[ascii ? 6 : 7]);
	if (
		weekday < 0 ||
		month < 0 ||
		day < 1 ||
		day > 31 ||
		hour > 23 ||
		minute > 59 ||
		second > 60 ||
		(second === 60 && (hour !== 23 || minute !== 59))
	)
		return undefined;
	if (obsolete)
		year +=
			Math.floor((new Date(receivedAt).getUTCFullYear() + 50) / 100) * 100;
	const date = new Date(0);
	date.setUTCFullYear(year, month, day);
	date.setUTCHours(hour, minute, Math.min(second, 59), 0);
	if (obsolete) {
		const future = new Date(receivedAt);
		future.setUTCFullYear(future.getUTCFullYear() + 50);
		if (date.getTime() + (second === 60 ? 1000 : 0) > future.getTime()) {
			year -= 100;
			date.setUTCFullYear(year, month, day);
		}
	}
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month ||
		date.getUTCDate() !== day ||
		date.getUTCDay() !== weekday
	)
		return undefined;
	return date.getTime() + (second === 60 ? 1000 : 0);
}

export function parseRetryAfter(
	headers: Readonly<Record<string, string | readonly string[]>>,
	receivedAt: number,
): Readonly<RetryAfterAdvice> | undefined {
	try {
		if (
			!headers ||
			typeof headers !== "object" ||
			!Number.isSafeInteger(receivedAt) ||
			!Number.isFinite(new Date(receivedAt).getTime())
		)
			return undefined;
		const value = headerValue(headers);
		if (value === undefined) return undefined;
		const numeric = /^\d+$/.test(value);
		const seconds = numeric ? Number(value) : undefined;
		const timestamp = numeric
			? receivedAt + (seconds ?? 0) * 1000
			: dateTimestamp(value, receivedAt);
		if (
			timestamp === undefined ||
			!Number.isFinite(new Date(timestamp).getTime())
		)
			return undefined;
		const delaySeconds = numeric
			? seconds
			: Math.max(0, Math.ceil((timestamp - receivedAt) / 1000));
		if (
			delaySeconds === undefined ||
			!Number.isSafeInteger(delaySeconds) ||
			delaySeconds > retryAfterLimits.maxDelaySeconds
		)
			return undefined;
		return Object.freeze({
			kind: numeric ? "delay-seconds" : "http-date",
			delaySeconds,
			retryAt: new Date(timestamp).toISOString(),
		});
	} catch {
		return undefined;
	}
}
