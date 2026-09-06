import { AgentBrowserError } from "./errors.js";
import { type HidShortItem, tokenizeHidShortItems } from "./hid-short-items.js";

export interface FidoHidReportLayout {
	collectionOffset: number;
	input: { reportId: number; reportBytes: number };
	output: { reportId: number; reportBytes: number };
}

interface GlobalState {
	usagePage: number;
	logicalMin: number;
	logicalMax: number;
	reportSize: number;
	reportCount: number;
	reportId: number;
}

interface UsageInterval {
	page: number;
	minimum: number;
	maximum: number;
}

interface DescriptorCollection {
	type: number;
	usage: number;
	offset: number;
	parent: number | undefined;
	application: number | undefined;
}

interface ReportField {
	owner: number;
	flags: number;
	size: number;
	count: number;
	logicalMin: number;
	logicalMax: number;
	usages: readonly UsageInterval[];
	bitOffset: number;
}

interface ReportGroup {
	direction: "input" | "output" | "feature";
	reportId: number;
	bits: number;
	fields: ReportField[];
}

const maximumDepth = 32;
const maximumCollections = 256;
const maximumFields = 1024;
const maximumGroups = 256;
const maximumLocalUsages = 256;
const maximumReportBits = 65536;
const fidoUsagePage = 0xf1d0;
const fidoApplicationUsage = 0xf1d00001;

function invalidDescriptor(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid HID report descriptor.",
	);
}

function unsupportedLayout(): never {
	throw new AgentBrowserError(
		"unsupported",
		"Unsupported FIDO HID report layout.",
	);
}

function limitExceeded(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"HID report descriptor limit exceeded.",
	);
}

function unsignedData(data: Uint8Array): number {
	if (data.length !== 1 && data.length !== 2 && data.length !== 4)
		invalidDescriptor();
	let value = 0;
	for (let index = 0; index < data.length; index++)
		value += data[index] * 2 ** (index * 8);
	return value;
}

function signedData(data: Uint8Array): number {
	const value = unsignedData(data);
	const modulus = 2 ** (data.length * 8);
	return value >= modulus / 2 ? value - modulus : value;
}

class DescriptorState {
	private globals: GlobalState = {
		usagePage: 0,
		logicalMin: 0,
		logicalMax: 0,
		reportSize: 0,
		reportCount: 0,
		reportId: 0,
	};
	private readonly globalStack: GlobalState[] = [];
	private readonly collections: DescriptorCollection[] = [];
	private readonly collectionStack: number[] = [];
	private readonly groups = new Map<string, ReportGroup>();
	private usages: UsageInterval[] = [];
	private pendingMinimum:
		| { interval: UsageInterval; extended: boolean }
		| undefined;
	private hasShortUsages = false;
	private fieldCount = 0;
	private numberedFields: boolean | undefined;

	consume(item: HidShortItem): void {
		if (item.type === "global") this.consumeGlobal(item);
		else if (item.type === "local") this.consumeLocal(item);
		else {
			if (this.pendingMinimum !== undefined) invalidDescriptor();
			this.consumeMain(item);
			this.usages = [];
			this.hasShortUsages = false;
		}
	}

	finish(): readonly FidoHidReportLayout[] {
		if (
			this.pendingMinimum !== undefined ||
			this.globalStack.length !== 0 ||
			this.collectionStack.length !== 0
		)
			invalidDescriptor();
		const layouts: FidoHidReportLayout[] = [];
		for (const [owner, collection] of this.collections.entries()) {
			if (collection.type !== 1 || collection.usage !== fidoApplicationUsage)
				continue;
			const inputs: ReportGroup[] = [];
			const outputs: ReportGroup[] = [];
			for (const group of this.groups.values()) {
				if (!group.fields.some((field) => field.owner === owner)) continue;
				if (group.direction === "input") inputs.push(group);
				if (group.direction === "output") outputs.push(group);
			}
			if (inputs.length !== 1 || outputs.length !== 1) unsupportedLayout();
			layouts.push({
				collectionOffset: collection.offset,
				input: this.qualifyGroup(inputs[0], owner),
				output: this.qualifyGroup(outputs[0], owner),
			});
		}
		return layouts;
	}

	private guardUsagePage(page: number): void {
		if (page !== this.globals.usagePage && this.hasShortUsages)
			unsupportedLayout();
	}

	private consumeGlobal(item: HidShortItem): void {
		if (item.tag > 11) unsupportedLayout();
		if (item.tag === 10 || item.tag === 11) {
			if (item.data.length !== 0) invalidDescriptor();
			if (item.tag === 10) {
				if (this.globalStack.length >= maximumDepth) limitExceeded();
				this.globalStack.push({ ...this.globals });
			} else {
				const restored = this.globalStack.pop();
				if (restored === undefined) invalidDescriptor();
				this.guardUsagePage(restored.usagePage);
				this.globals = restored;
			}
			return;
		}
		const value = unsignedData(item.data);
		switch (item.tag) {
			case 0:
				if (value > 65535) invalidDescriptor();
				this.guardUsagePage(value);
				this.globals.usagePage = value;
				break;
			case 1:
				this.globals.logicalMin = signedData(item.data);
				break;
			case 2:
				this.globals.logicalMax =
					this.globals.logicalMin < 0 ? signedData(item.data) : value;
				break;
			case 3:
			case 4:
			case 5:
			case 6:
				break;
			case 7:
			case 9:
				if (value > maximumReportBits) limitExceeded();
				if (item.tag === 7) this.globals.reportSize = value;
				else this.globals.reportCount = value;
				break;
			case 8:
				if (item.data.length !== 1 || value === 0) invalidDescriptor();
				this.globals.reportId = value;
				break;
		}
	}

	private consumeLocal(item: HidShortItem): void {
		if (item.tag > 2) unsupportedLayout();
		const value = unsignedData(item.data);
		const page =
			item.data.length === 4
				? Math.floor(value / 65536)
				: this.globals.usagePage;
		const usage = value % 65536;
		if (item.data.length !== 4) this.hasShortUsages = true;
		if (item.tag === 2) {
			const pending = this.pendingMinimum;
			if (pending === undefined) invalidDescriptor();
			if (pending.extended !== (item.data.length === 4)) unsupportedLayout();
			const minimum = pending.interval;
			if (minimum.page !== page || minimum.minimum > usage) invalidDescriptor();
			minimum.maximum = usage;
			this.usages.push(minimum);
			this.pendingMinimum = undefined;
			return;
		}
		if (item.tag === 1 && this.pendingMinimum !== undefined)
			invalidDescriptor();
		if (
			this.usages.length + (this.pendingMinimum === undefined ? 0 : 1) >=
			maximumLocalUsages
		)
			limitExceeded();
		const interval = { page, minimum: usage, maximum: usage };
		if (item.tag === 1)
			this.pendingMinimum = { interval, extended: item.data.length === 4 };
		else this.usages.push(interval);
	}

	private consumeMain(item: HidShortItem): void {
		if (item.tag === 10) {
			if (item.data.length !== 1 || this.usages.length === 0)
				invalidDescriptor();
			if (
				this.collectionStack.length >= maximumDepth ||
				this.collections.length >= maximumCollections
			)
				limitExceeded();
			const parent = this.collectionStack.at(-1);
			const owner = this.collections.length;
			const usage = this.usages[0];
			this.collections.push({
				type: item.data[0],
				usage: usage.page * 65536 + usage.minimum,
				offset: item.offset,
				parent,
				application:
					item.data[0] === 1
						? owner
						: parent === undefined
							? undefined
							: this.collections[parent].application,
			});
			this.collectionStack.push(owner);
			return;
		}
		if (item.tag === 12) {
			if (item.data.length !== 0 || this.collectionStack.length === 0)
				invalidDescriptor();
			this.collectionStack.pop();
			return;
		}
		if (item.tag !== 8 && item.tag !== 9 && item.tag !== 11)
			unsupportedLayout();
		this.addField(
			item.tag === 8 ? "input" : item.tag === 9 ? "output" : "feature",
			unsignedData(item.data),
		);
	}

	private addField(direction: ReportGroup["direction"], flags: number): void {
		const globals = this.globals;
		if (
			globals.logicalMax < globals.logicalMin ||
			globals.reportSize === 0 ||
			globals.reportCount === 0
		)
			invalidDescriptor();
		const collection = this.collectionStack.at(-1);
		const owner =
			collection === undefined
				? undefined
				: this.collections[collection].application;
		if (owner === undefined) unsupportedLayout();
		const numbered = globals.reportId !== 0;
		if (this.numberedFields !== undefined && this.numberedFields !== numbered)
			unsupportedLayout();
		this.numberedFields = numbered;
		if (
			this.fieldCount >= maximumFields ||
			globals.reportSize > Math.floor(maximumReportBits / globals.reportCount)
		)
			limitExceeded();
		const bits = globals.reportSize * globals.reportCount;
		const key = `${direction}:${globals.reportId}`;
		let group = this.groups.get(key);
		if (group === undefined) {
			if (this.groups.size >= maximumGroups) limitExceeded();
			group = { direction, reportId: globals.reportId, bits: 0, fields: [] };
			this.groups.set(key, group);
		}
		if (group.bits > maximumReportBits - bits) limitExceeded();
		group.fields.push({
			owner,
			flags,
			size: globals.reportSize,
			count: globals.reportCount,
			logicalMin: globals.logicalMin,
			logicalMax: globals.logicalMax,
			usages: this.usages,
			bitOffset: group.bits,
		});
		group.bits += bits;
		this.fieldCount++;
	}

	private qualifyGroup(
		group: ReportGroup,
		owner: number,
	): { reportId: number; reportBytes: number } {
		for (const field of group.fields) {
			if (
				field.owner !== owner ||
				field.flags !== 2 ||
				field.size !== 8 ||
				field.logicalMin !== 0 ||
				field.logicalMax !== 255 ||
				field.usages.length === 0 ||
				field.usages.some((usage) => usage.page !== fidoUsagePage)
			)
				unsupportedLayout();
		}
		if (group.bits % 8 !== 0 || group.bits < 56 || group.bits > 512)
			unsupportedLayout();
		return { reportId: group.reportId, reportBytes: group.bits / 8 };
	}
}

export function discoverFidoHidReportLayouts(
	bytes: Uint8Array,
): readonly FidoHidReportLayout[] {
	const items = tokenizeHidShortItems(bytes);
	const state = new DescriptorState();
	for (const item of items) state.consume(item);
	return state.finish();
}
