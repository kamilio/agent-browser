import { AgentBrowserError } from "./errors.js";
import type {
	GridTrack,
	GridTrackContribution,
	GridTrackSizing,
	GridTrackSizingOptions,
} from "./grid-types.js";
import { layoutNumber, resolveLayoutLength } from "./layout-values.js";

export const gridTrackSizingLimits = Object.freeze({
	maxTracks: 4096,
	maxItems: 4096,
	maxWork: 8_000_000,
});

type TrackKind = "fixed" | "auto" | "min-content" | "max-content" | "flex";
interface TrackFunction {
	kind: TrackKind;
	value: number;
}
interface TrackState {
	minimum: TrackFunction;
	maximum: TrackFunction;
	base: number;
	limit: number;
	fit: number;
	infinitelyGrowable: boolean;
}
type ContributionKind = "minimum" | "minContent" | "maxContent";
type Charge = (amount?: number) => void;

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function trackFunction(
	value: string,
	availableSpace: number | null,
	allowFlex: boolean,
): TrackFunction {
	if (typeof value !== "string") invalid("Invalid Grid track function");
	if (value.length > 8192)
		throw new AgentBrowserError(
			"resource-limit",
			"Grid track source limit exceeded",
		);
	if (value === "auto" || value === "min-content" || value === "max-content")
		return { kind: value, value: 0 };
	const flex = /^(\d*\.\d+|\d+)(?:e([+-]?\d+))?fr$/.exec(value);
	if (flex) {
		if (!allowFlex) invalid("Flexible Grid track minimum is invalid");
		const factor = Number(value.slice(0, -2));
		if (!Number.isFinite(factor))
			throw new AgentBrowserError(
				"resource-limit",
				"Grid flex factor overflow",
			);
		return { kind: "flex", value: layoutNumber(factor) };
	}
	const resolved = resolveLayoutLength(value, availableSpace ?? 0);
	if (availableSpace === null && value.includes("%"))
		return { kind: "auto", value: 0 };
	return { kind: "fixed", value: resolved };
}

function intrinsic(kind: TrackKind): boolean {
	return kind === "auto" || kind === "min-content" || kind === "max-content";
}

function sum(values: readonly number[], charge: Charge): number {
	let total = 0;
	for (const value of values) {
		charge();
		total = layoutNumber(total + value);
	}
	return total;
}

function distribute(
	space: number,
	indices: readonly number[],
	increases: number[],
	sizes: readonly number[],
	limit: (index: number) => number,
	weight: (index: number) => number,
	charge: Charge,
): number {
	let active = indices.filter((index) => {
		charge();
		return (
			sizes[index]! + increases[index]! < limit(index) && weight(index) > 0
		);
	});
	while (space > 0 && active.length) {
		let totalWeight = 0;
		for (const index of active) {
			charge();
			totalWeight += weight(index);
		}
		let consumed = 0;
		const next: number[] = [];
		for (const index of active) {
			charge();
			const capacity = Math.max(
				0,
				limit(index) - sizes[index]! - increases[index]!,
			);
			const addition = Math.min(
				capacity,
				space * (weight(index) / totalWeight),
			);
			increases[index] = layoutNumber(increases[index]! + addition);
			consumed += addition;
			if (addition < capacity) next.push(index);
		}
		const remaining = Math.max(0, space - consumed);
		if (next.length === active.length || remaining >= space) return remaining;
		space = remaining;
		active = next;
	}
	return space;
}

function flexFraction(
	tracks: readonly TrackState[],
	start: number,
	end: number,
	space: number,
	gap: number,
	charge: Charge,
): number {
	let leftover = space - gap * Math.max(0, end - start - 1);
	let active: number[] = [];
	for (let index = start; index < end; index++) {
		charge();
		const track = tracks[index]!;
		if (track.maximum.kind === "flex" && track.maximum.value > 0)
			active.push(index);
		else leftover -= track.base;
	}
	while (active.length) {
		let factors = 0;
		for (const index of active) {
			charge();
			factors += tracks[index]!.maximum.value;
		}
		const fraction = Math.max(0, leftover) / Math.max(1, factors);
		const next: number[] = [];
		for (const index of active) {
			charge();
			const track = tracks[index]!;
			if (fraction * track.maximum.value < track.base) leftover -= track.base;
			else next.push(index);
		}
		if (next.length === active.length) return layoutNumber(fraction);
		active = next;
	}
	return 0;
}

export function sizeGridTracks(
	inputTracks: readonly GridTrack[],
	contributions: readonly GridTrackContribution[],
	options: GridTrackSizingOptions,
): Readonly<GridTrackSizing> {
	if (!Array.isArray(inputTracks) || !Array.isArray(contributions) || !options)
		invalid("Invalid Grid track sizing inputs");
	if (
		inputTracks.length > gridTrackSizingLimits.maxTracks ||
		contributions.length > gridTrackSizingLimits.maxItems
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Grid track sizing input limit exceeded",
		);
	const { availableSpace, gap, stretchAuto = false, mode = "normal" } = options;
	if (availableSpace !== null) layoutNumber(availableSpace);
	layoutNumber(gap);
	if (
		!["normal", "min-content", "max-content"].includes(mode) ||
		typeof stretchAuto !== "boolean"
	)
		invalid("Invalid Grid track sizing options");
	const maxWork =
		options.maxWork === undefined
			? gridTrackSizingLimits.maxWork
			: options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > gridTrackSizingLimits.maxWork
	)
		invalid("Invalid Grid track sizing work limit");
	let work = 0;
	const charge: Charge = (amount = 1) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Grid track sizing work limit exceeded",
			);
	};
	charge();
	for (const item of contributions) {
		charge();
		if (
			!item ||
			!Number.isSafeInteger(item.start) ||
			!Number.isSafeInteger(item.end) ||
			item.start < 0 ||
			item.end <= item.start ||
			item.end > inputTracks.length
		)
			invalid("Invalid Grid contribution span");
		layoutNumber(item.minimum);
		layoutNumber(item.minContent);
		layoutNumber(item.maxContent);
		if (item.minimum > item.minContent || item.minContent > item.maxContent)
			invalid("Invalid Grid contribution size ordering");
	}
	const tracks: TrackState[] = Array.from(inputTracks, (input) => {
		charge();
		if (!input) invalid("Invalid Grid track");
		for (const value of [input.minimum, input.maximum, input.fitContent])
			if (typeof value === "string") charge(value.length);
		const minimum = trackFunction(input.minimum, availableSpace, false);
		const maximum = trackFunction(input.maximum, availableSpace, true);
		let fit = Number.POSITIVE_INFINITY;
		if (input.fitContent !== undefined) {
			if (minimum.kind !== "auto" || maximum.kind !== "max-content")
				invalid("Invalid Grid fit-content track");
			const bound = trackFunction(input.fitContent, availableSpace, false);
			if (bound.kind === "fixed") fit = bound.value;
			else if (!(availableSpace === null && input.fitContent.includes("%")))
				invalid("Invalid Grid fit-content limit");
		}
		const base = minimum.kind === "fixed" ? minimum.value : 0;
		const limit =
			maximum.kind === "fixed"
				? Math.max(base, maximum.value)
				: Number.POSITIVE_INFINITY;
		return { minimum, maximum, base, limit, fit, infinitelyGrowable: false };
	});
	const gutters = layoutNumber(gap * Math.max(0, tracks.length - 1));
	const indices = tracks.map((_, index) => index);
	const flexibleItems: GridTrackContribution[] = [];
	const spanning: GridTrackContribution[] = [];
	const limited = (
		item: GridTrackContribution,
		kind: "minContent" | "maxContent",
	): number => {
		let cap = gap * (item.end - item.start - 1);
		for (let index = item.start; index < item.end; index++) {
			charge();
			const track = tracks[index]!;
			if (track.maximum.kind === "fixed")
				cap = layoutNumber(cap + track.maximum.value);
			else if (item.end - item.start === 1 && Number.isFinite(track.fit))
				cap = track.fit;
			else return item[kind];
		}
		return Math.max(item.minimum, Math.min(item[kind], cap));
	};
	for (const item of contributions) {
		let crossesFlex = false;
		for (let index = item.start; index < item.end; index++) {
			charge();
			if (tracks[index]!.maximum.kind === "flex") crossesFlex = true;
		}
		if (crossesFlex) {
			flexibleItems.push(item);
			continue;
		}
		if (item.end - item.start > 1) {
			spanning.push(item);
			continue;
		}
		const track = tracks[item.start]!;
		if (track.minimum.kind === "min-content")
			track.base = Math.max(track.base, item.minContent);
		else if (track.minimum.kind === "max-content")
			track.base = Math.max(track.base, item.maxContent);
		else if (track.minimum.kind === "auto")
			track.base = Math.max(
				track.base,
				mode === "normal" ? item.minimum : limited(item, "minContent"),
			);
		if (intrinsic(track.maximum.kind)) {
			const content =
				track.maximum.kind === "min-content"
					? item.minContent
					: Math.min(item.maxContent, track.fit);
			track.limit = Math.max(
				Number.isFinite(track.limit) ? track.limit : 0,
				content,
			);
		}
		track.limit = Math.max(track.base, track.limit);
	}

	const phase = (
		items: readonly GridTrackContribution[],
		target: "base" | "limit",
		affected: (track: TrackState) => boolean,
		kind: ContributionKind,
		useLimited: boolean,
		flexible: boolean,
	): void => {
		charge(tracks.length);
		const sizes = tracks.map((track) =>
			Number.isFinite(track[target]) ? track[target] : track.base,
		);
		const planned = tracks.map(() => 0);
		const touched = new Set<number>();
		for (const item of items) {
			const selected: number[] = [];
			const others: number[] = [];
			let occupied = gap * (item.end - item.start - 1);
			let factorSum = 0;
			for (let index = item.start; index < item.end; index++) {
				charge();
				const track = tracks[index]!;
				occupied = layoutNumber(occupied + sizes[index]!);
				if (affected(track) && (!flexible || track.maximum.kind === "flex")) {
					selected.push(index);
					touched.add(index);
				} else if (!flexible) others.push(index);
				if (track.maximum.kind === "flex") factorSum += track.maximum.value;
			}
			if (!selected.length) continue;
			const contribution =
				useLimited && kind !== "minimum" ? limited(item, kind) : item[kind];
			let space = Math.max(0, contribution - occupied);
			if (!space) continue;
			charge(tracks.length);
			const increases = tracks.map(() => 0);
			const weight = (index: number): number => {
				if (!flexible) return 1;
				const factor = tracks[index]!.maximum.value;
				return factorSum >= 1
					? factor
					: factor + (1 - factorSum) / selected.length;
			};
			space = distribute(
				space,
				selected,
				increases,
				sizes,
				(index) => {
					const track = tracks[index]!;
					if (target === "base") return Math.min(track.limit, track.fit);
					return Number.isFinite(track.limit) && !track.infinitelyGrowable
						? track.limit
						: track.fit;
				},
				weight,
				charge,
			);
			space = distribute(
				space,
				others,
				increases,
				sizes,
				(index) => {
					const track = tracks[index]!;
					if (target === "base") return Math.min(track.limit, track.fit);
					return Number.isFinite(track.limit) && !track.infinitelyGrowable
						? track.limit
						: track.fit;
				},
				() => 1,
				charge,
			);
			while (space > 0) {
				const preferred = selected.filter((index) => {
					charge();
					const track = tracks[index]!;
					return (
						intrinsic(track.maximum.kind) &&
						(kind !== "maxContent" ||
							target === "limit" ||
							track.maximum.kind !== "min-content") &&
						sizes[index]! + increases[index]! < track.fit
					);
				});
				if (target === "limit" && !preferred.length) break;
				const beyond = preferred.length ? preferred : selected;
				const remaining = distribute(
					space,
					beyond,
					increases,
					sizes,
					(index) =>
						preferred.length ? tracks[index]!.fit : Number.POSITIVE_INFINITY,
					weight,
					charge,
				);
				if (remaining >= space) break;
				space = remaining;
			}
			for (let index = item.start; index < item.end; index++) {
				charge();
				planned[index] = Math.max(planned[index]!, increases[index]!);
			}
		}
		for (const index of indices) {
			charge();
			const track = tracks[index]!;
			if (target === "limit" && !touched.has(index) && !planned[index])
				continue;
			track[target] = layoutNumber(sizes[index]! + planned[index]!);
		}
	};
	const processItems = (
		items: readonly GridTrackContribution[],
		flexible: boolean,
	): void => {
		if (!items.length) return;
		phase(
			items,
			"base",
			(track) => intrinsic(track.minimum.kind),
			mode === "normal" ? "minimum" : "minContent",
			mode !== "normal",
			flexible,
		);
		phase(
			items,
			"base",
			(track) =>
				track.minimum.kind === "min-content" ||
				track.minimum.kind === "max-content",
			"minContent",
			false,
			flexible,
		);
		if (mode === "max-content")
			phase(
				items,
				"base",
				(track) =>
					track.minimum.kind === "auto" || track.minimum.kind === "max-content",
				"maxContent",
				true,
				flexible,
			);
		phase(
			items,
			"base",
			(track) => track.minimum.kind === "max-content",
			"maxContent",
			false,
			flexible,
		);
		for (const track of tracks) {
			charge();
			track.limit = Math.max(track.limit, track.base);
			track.infinitelyGrowable = !Number.isFinite(track.limit);
		}
		if (!flexible) {
			phase(
				items,
				"limit",
				(track) => intrinsic(track.maximum.kind),
				"minContent",
				false,
				false,
			);
			phase(
				items,
				"limit",
				(track) =>
					track.maximum.kind === "auto" || track.maximum.kind === "max-content",
				"maxContent",
				false,
				false,
			);
		}
		for (const track of tracks) {
			charge();
			track.limit = Math.max(track.limit, track.base);
			track.infinitelyGrowable = false;
		}
	};
	spanning.sort((left, right) => {
		charge();
		return left.end - left.start - (right.end - right.start);
	});
	for (let start = 0; start < spanning.length; ) {
		let end = start + 1;
		while (
			end < spanning.length &&
			spanning[end]!.end - spanning[end]!.start ===
				spanning[start]!.end - spanning[start]!.start
		) {
			charge();
			end++;
		}
		processItems(spanning.slice(start, end), false);
		start = end;
	}
	processItems(flexibleItems, true);
	for (const track of tracks) {
		charge();
		if (!Number.isFinite(track.limit)) track.limit = track.base;
	}
	const bases = tracks.map((track) => track.base);
	let extent = layoutNumber(sum(bases, charge) + gutters);
	if (mode !== "min-content") {
		if (mode === "max-content" || availableSpace === null) {
			for (const track of tracks) {
				charge();
				track.base = track.limit;
			}
		} else if (availableSpace > extent) {
			const increases = tracks.map(() => 0);
			distribute(
				availableSpace - extent,
				indices,
				increases,
				bases,
				(index) => tracks[index]!.limit,
				() => 1,
				charge,
			);
			for (const index of indices) {
				charge();
				tracks[index]!.base = layoutNumber(bases[index]! + increases[index]!);
			}
		}
		let fraction = 0;
		if (availableSpace !== null && mode !== "max-content")
			fraction = flexFraction(
				tracks,
				0,
				tracks.length,
				availableSpace,
				gap,
				charge,
			);
		else {
			for (const track of tracks) {
				charge();
				if (track.maximum.kind === "flex")
					fraction = Math.max(
						fraction,
						track.base / Math.max(1, track.maximum.value),
					);
			}
			for (const item of flexibleItems) {
				charge();
				fraction = Math.max(
					fraction,
					flexFraction(
						tracks,
						item.start,
						item.end,
						item.maxContent,
						gap,
						charge,
					),
				);
			}
		}
		for (const track of tracks) {
			charge();
			if (track.maximum.kind === "flex")
				track.base = layoutNumber(
					Math.max(track.base, fraction * track.maximum.value),
				);
		}
	}
	const sizes = tracks.map((track) => track.base);
	extent = layoutNumber(sum(sizes, charge) + gutters);
	if (
		stretchAuto &&
		mode === "normal" &&
		availableSpace !== null &&
		extent < availableSpace
	) {
		const auto = indices.filter((index) => {
			charge();
			return tracks[index]!.maximum.kind === "auto";
		});
		if (auto.length) {
			const addition = (availableSpace - extent) / auto.length;
			for (const index of auto) {
				charge();
				sizes[index] = layoutNumber(sizes[index]! + addition);
			}
		}
	}
	const offsets: number[] = [];
	let cursor = 0;
	for (const index of indices) {
		charge();
		offsets.push(cursor);
		cursor = layoutNumber(cursor + sizes[index]!);
		if (index + 1 < tracks.length) cursor = layoutNumber(cursor + gap);
	}
	offsets.push(cursor);
	return Object.freeze({
		sizes: Object.freeze(sizes),
		offsets: Object.freeze(offsets),
		extent: cursor,
		metrics: Object.freeze({ work }),
	});
}
