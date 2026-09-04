import { isSubmitButton } from "./button-type.js";
import {
	controlChecked,
	controlValue,
	formControls,
	formOwner,
	inputType,
	isControlDisabled,
	isInsideDatalist,
	optionValue,
	selectedOptions,
} from "./controls.js";
import { existingDocumentFiles } from "./document-files.js";
import { documentBaseTarget, documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type NetworkRequest, parseNetworkUrl } from "./network.js";

export interface FormUpload {
	name: string;
	type?: string;
	data: Uint8Array;
}
export interface FormSubmissionOptions {
	submitter?: string;
	files?: ReadonlyMap<number, readonly FormUpload[]>;
	imagePosition?: { x: number; y: number };
	maxBytes?: number;
	maxEntries?: number;
	boundary?: string;
}
export interface PreparedFormSubmission {
	request: NetworkRequest;
	formRef: string;
	submitterRef?: string;
	target: string;
	skipValidation: boolean;
}
interface Entry {
	name: string;
	value: string | FormUpload;
}
const encoder = new TextEncoder();

function crlf(value: string) {
	return value.replace(/\r\n|\r|\n/g, "\r\n");
}
function quoted(value: string) {
	return value.replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/"/g, "%22");
}
export function resolveFormSubmitter(
	tree: DocumentTree,
	formReference: string,
	reference?: string,
) {
	const form = tree.resolve(formReference);
	if (form.tagName !== "form")
		throw new AgentBrowserError("invalid-input", "Expected a form reference");
	const submitter =
		reference === undefined ? undefined : tree.resolve(reference);
	if (
		submitter &&
		(!isSubmitButton(tree, submitter) ||
			formOwner(tree, submitter.id) !== form.id ||
			isControlDisabled(tree, submitter.id))
	)
		throw new AgentBrowserError("not-actionable", "Invalid form submitter");
	return { form, submitter };
}

function direction(tree: DocumentTree, id: number) {
	let node: Readonly<DocumentNode> | undefined = tree.get(id);
	while (node) {
		const dir = node.attributes.dir?.toLowerCase();
		if (dir === "ltr" || dir === "rtl") return dir;
		if (dir === "auto")
			throw new AgentBrowserError(
				"unsupported",
				"Automatic text direction is not implemented",
			);
		node = node.parent === null ? undefined : tree.get(node.parent);
	}
	return "ltr";
}

function entriesFor(
	tree: DocumentTree,
	formId: number,
	submitter: number | undefined,
	options: FormSubmissionOptions,
	maxEntries: number,
	maxBytes: number,
	includeFileData: boolean,
) {
	const entries: Entry[] = [];
	let bytes = 0;
	const add = (name: string, value: Entry["value"]) => {
		bytes +=
			encoder.encode(name).byteLength +
			(typeof value === "string"
				? encoder.encode(value).byteLength
				: (includeFileData ? value.data.byteLength : 0) +
					encoder.encode(value.name).byteLength);
		if (bytes > maxBytes || entries.length >= maxEntries)
			throw new AgentBrowserError(
				"resource-limit",
				"Form entry limit exceeded",
			);
		entries.push({
			name,
			value:
				typeof value === "string"
					? value
					: {
							name: value.name,
							type: value.type,
							data: includeFileData ? value.data.slice() : new Uint8Array(),
						},
		});
	};
	for (const node of formControls(tree, formId)) {
		if (isControlDisabled(tree, node.id) || isInsideDatalist(tree, node.id))
			continue;
		if (!["input", "textarea", "select", "button"].includes(node.tagName))
			continue;
		const type = inputType(node);
		if (
			node.tagName === "button" ||
			(node.tagName === "input" &&
				["submit", "image", "reset", "button"].includes(type))
		) {
			if (!isSubmitButton(tree, node) || node.id !== submitter) continue;
		}
		if (
			node.tagName === "input" &&
			["checkbox", "radio"].includes(type) &&
			!controlChecked(tree, node.id)
		)
			continue;
		const name = node.attributes.name ?? "";
		if (node.tagName === "input" && type === "image") {
			const position = options.imagePosition ?? { x: 0, y: 0 };
			if (
				![position.x, position.y].every(
					(value) => Number.isSafeInteger(value) && value >= 0,
				)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid image submit coordinates",
				);
			add(`${name ? `${name}.` : ""}x`, String(position.x));
			add(`${name ? `${name}.` : ""}y`, String(position.y));
			continue;
		}
		if (!name) continue;
		if (node.tagName === "select") {
			for (const option of selectedOptions(tree, node.id))
				if (!isControlDisabled(tree, option.id))
					add(name, optionValue(tree, option.id));
		} else if (node.tagName === "input" && type === "file") {
			const files = options.files?.get(node.id) ?? [];
			if (!Array.isArray(files) || files.length > maxEntries)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid form upload list",
				);
			for (const file of files) {
				if (
					!file ||
					typeof file.name !== "string" ||
					!(file.data instanceof Uint8Array) ||
					(file.type !== undefined &&
						(typeof file.type !== "string" ||
							file.type.length > 256 ||
							/[^\x20-\x7e]/.test(file.type)))
				)
					throw new AgentBrowserError("invalid-input", "Invalid form upload");
				add(name, file);
			}
			if (!files.length)
				add(name, {
					name: "",
					type: "application/octet-stream",
					data: new Uint8Array(),
				});
		} else
			add(
				name,
				node.tagName === "input" && type === "hidden" && name === "_charset_"
					? "UTF-8"
					: controlValue(tree, node.id),
			);
		if (
			node.attributes.dirname &&
			(node.tagName === "textarea" ||
				(node.tagName === "input" &&
					["text", "search", "tel", "url", "email"].includes(type)))
		)
			add(node.attributes.dirname, direction(tree, node.id));
	}
	return entries;
}

function multipart(
	entries: readonly Entry[],
	maxBytes: number,
	requestedBoundary?: string,
) {
	const boundary =
		requestedBoundary ??
		`----agent-browser-${crypto.randomUUID().replace(/-/g, "")}`;
	if (typeof boundary !== "string" || !/^[a-z0-9_-]{1,70}$/i.test(boundary))
		throw new AgentBrowserError("invalid-input", "Invalid multipart boundary");
	const chunks: Uint8Array[] = [];
	let length = 0;
	const append = (value: string | Uint8Array) => {
		const chunk = typeof value === "string" ? encoder.encode(value) : value;
		length += chunk.byteLength;
		if (length > maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Encoded form byte limit exceeded",
			);
		chunks.push(chunk);
	};
	const delimiter = encoder.encode(`--${boundary}`);
	const payload = (value: string | Uint8Array) => {
		const data = typeof value === "string" ? encoder.encode(value) : value;
		for (let offset = 0; offset <= data.length - delimiter.length; offset++) {
			if (offset && (data[offset - 2] !== 13 || data[offset - 1] !== 10))
				continue;
			if (delimiter.every((byte, index) => data[offset + index] === byte))
				throw new AgentBrowserError(
					"invalid-input",
					"Multipart boundary collides with payload",
				);
		}
		append(data);
	};
	for (const entry of entries) {
		const name = quoted(crlf(entry.name));
		if (typeof entry.value === "string") {
			append(
				`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`,
			);
			payload(crlf(entry.value));
		} else {
			append(
				`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${quoted(entry.value.name)}"\r\nContent-Type: ${entry.value.type || "application/octet-stream"}\r\n\r\n`,
			);
			payload(entry.value.data);
		}
		append("\r\n");
	}
	append(`--${boundary}--\r\n`);
	const body = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.length;
	}
	return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export function prepareFormSubmission(
	tree: DocumentTree,
	formReference: string,
	options: FormSubmissionOptions = {},
): PreparedFormSubmission {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		(options.files !== undefined && !(options.files instanceof Map))
	)
		throw new AgentBrowserError("invalid-input", "Invalid form options");
	const form = tree.resolve(formReference);
	if (form.tagName !== "form")
		throw new AgentBrowserError("invalid-input", "Expected a form reference");
	const maxBytes = options.maxBytes ?? 1_048_576;
	const maxEntries = options.maxEntries ?? 5000;
	if (
		!Number.isSafeInteger(maxBytes) ||
		maxBytes < 1 ||
		maxBytes > 67_108_864 ||
		!Number.isSafeInteger(maxEntries) ||
		maxEntries < 1 ||
		maxEntries > 50_000
	)
		throw new AgentBrowserError("invalid-input", "Invalid form limits");
	const { submitter } = resolveFormSubmitter(
		tree,
		formReference,
		options.submitter,
	);
	const methodValue = (
		submitter?.attributes.formmethod ??
		form.attributes.method ??
		"get"
	).toLowerCase();
	if (methodValue === "dialog")
		throw new AgentBrowserError(
			"unsupported",
			"Dialog form submission is not implemented",
		);
	const method = methodValue === "post" ? "POST" : "GET";
	const action =
		submitter?.attributes.formaction ?? form.attributes.action ?? "";
	let url: URL;
	try {
		url = new URL(
			action || tree.url,
			action ? documentBaseUrl(tree) : tree.url,
		);
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid form action URL");
	}
	url = parseNetworkUrl(url.href);
	const encodingValue = (
		submitter?.attributes.formenctype ??
		form.attributes.enctype ??
		""
	).toLowerCase();
	const enctype = ["multipart/form-data", "text/plain"].includes(encodingValue)
		? encodingValue
		: "application/x-www-form-urlencoded";
	const accepted =
		form.attributes["accept-charset"]?.trim().split(/[\t\n\f\r ]+/) ?? [];
	if (
		accepted.length &&
		!accepted.some((value) => value.toLowerCase() === "utf-8")
	)
		throw new AgentBrowserError(
			"unsupported",
			"Only UTF-8 form submission is implemented",
		);
	const entries = entriesFor(
		tree,
		form.id,
		submitter?.id,
		options.files === undefined
			? { ...options, files: existingDocumentFiles(tree)?.filesForSubmission() }
			: options,
		maxEntries,
		maxBytes,
		method === "POST" && enctype === "multipart/form-data",
	);
	const request: NetworkRequest = { url: url.href, method };
	const pairs = entries.map(
		(entry) =>
			[
				crlf(entry.name),
				crlf(typeof entry.value === "string" ? entry.value : entry.value.name),
			] as const,
	);
	if (method === "GET") {
		url.search = new URLSearchParams(
			pairs.map(([name, value]) => [name, value]),
		).toString();
		if (encoder.encode(url.href).byteLength > maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Encoded form URL limit exceeded",
			);
		request.url = url.href;
	} else if (enctype === "multipart/form-data") {
		const encoded = multipart(entries, maxBytes, options.boundary);
		request.body = encoded.body;
		request.headers = { "content-type": encoded.contentType };
	} else {
		const body =
			enctype === "text/plain"
				? pairs.map(([name, value]) => `${name}=${value}\r\n`).join("")
				: new URLSearchParams(
						pairs.map(([name, value]) => [name, value]),
					).toString();
		if (encoder.encode(body).byteLength > maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Encoded form byte limit exceeded",
			);
		request.body = encoder.encode(body);
		request.headers = { "content-type": enctype };
	}
	if (method === "POST")
		request.headers = { ...request.headers, origin: new URL(tree.url).origin };
	return {
		request,
		formRef: formReference,
		...(options.submitter ? { submitterRef: options.submitter } : {}),
		target:
			(submitter?.attributes.formtarget ??
				form.attributes.target ??
				documentBaseTarget(tree)) ||
			"_self",
		skipValidation:
			Object.hasOwn(form.attributes, "novalidate") ||
			(!!submitter && Object.hasOwn(submitter.attributes, "formnovalidate")),
	};
}
