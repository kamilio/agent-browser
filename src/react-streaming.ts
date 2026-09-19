import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

export interface ReactStreamingReport {
	readonly policy: "react-completion-source-v1";
	readonly rendered: false;
	readonly verified: false;
	readonly boundaries: number;
	readonly segments: number;
	readonly unresolved: number;
}

const callPattern = /\$R([CS])\("([BSP]:[0-9a-f]+)","([SP]:[0-9a-f]+)"\);?\s*/g;
const tailPattern = /(?:\$R[CS]\("[BSP]:[0-9a-f]+","[SP]:[0-9a-f]+"\);?\s*)+$/;
const helperDigests = new Map<string, "C" | "S">([
	["ae43f2863da498ae6e297e928af4b7bb581afa935a8f2f3105606210f5e134c0", "S"],
	["7a3c441a297b4368e7168f53d44323873b11a160d3567f2d4695187785c22646", "C"],
]);
const themeDigests = new Set([
	"9f8eaf3f0496b8c0b45bbd37a41a1f226bfcd99dbac68e0b5f29afd04f5c68f9",
]);

function flightData(source: string): boolean {
	const trimmed = source.endsWith(";") ? source.slice(0, -1).trim() : source;
	const prefix = [
		"self.__next_f.push(",
		"(self.__next_f=self.__next_f||[]).push(",
	].find((value) => trimmed.startsWith(value));
	if (!prefix || !trimmed.endsWith(")")) return false;
	try {
		const payload: unknown = JSON.parse(trimmed.slice(prefix.length, -1));
		return (
			Array.isArray(payload) &&
			payload.length >= 1 &&
			payload.length <= 2 &&
			typeof payload[0] === "number" &&
			(payload.length === 1 || typeof payload[1] === "string")
		);
	} catch {
		return false;
	}
}

async function sourceDigest(source: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(source),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export async function reconstructReactStreams(
	tree: DocumentTree,
	signal?: AbortSignal,
): Promise<Readonly<ReactStreamingReport>> {
	const checkpoint = () => {
		if (signal?.aborted)
			throw new AgentBrowserError(
				"aborted",
				"Streaming source projection aborted",
			);
	};
	checkpoint();
	const order = new Map<number, number>();
	const identifiers = new Map<string, number | null>();
	const scripts: number[] = [];
	const pending = [tree.root];
	while (pending.length) {
		checkpoint();
		const current = pending.pop();
		if (current === undefined) break;
		const node = tree.get(current);
		order.set(current, order.size);
		if (order.size > tree.limits.maxNodes)
			throw new AgentBrowserError(
				"resource-limit",
				"Streaming source node limit exceeded",
			);
		if (node.attributes.id !== undefined)
			identifiers.set(
				node.attributes.id,
				identifiers.has(node.attributes.id) ? null : current,
			);
		if (isHtmlElement(node, "script")) scripts.push(current);
		if (
			isHtmlElement(node, "template") ||
			isHtmlElement(node, "noscript") ||
			(node.kind === "element" && !isHtmlElement(node))
		)
			continue;
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]);
	}
	const connected = (id: number) => {
		let current: number | null = id;
		for (
			let depth = 0;
			current !== null && depth <= tree.limits.maxDepth;
			depth++
		) {
			if (current === tree.root) return true;
			current = tree.get(current).parent;
		}
		return false;
	};
	const precedes = (first: number, second: number) => {
		const firstOrder = order.get(first);
		const secondOrder = order.get(second);
		return (
			firstOrder !== undefined &&
			secondOrder !== undefined &&
			firstOrder < secondOrder
		);
	};
	const resolve = (
		name: string,
		script: number,
	): Readonly<DocumentNode> | undefined => {
		const id = identifiers.get(name);
		if (
			id === undefined ||
			id === null ||
			!precedes(id, script) ||
			!connected(id)
		)
			return;
		return tree.get(id);
	};
	let boundaries = 0;
	let segments = 0;
	let unresolved = 0;
	let calls = 0;
	const declared = new Set<string>();
	for (const script of scripts) {
		checkpoint();
		const element = tree.get(script);
		if (
			element.attributes.src !== undefined ||
			!["", "text/javascript", "application/javascript"].includes(
				(element.attributes.type ?? "").trim().toLowerCase(),
			)
		)
			continue;
		const source = tree.textContent(script).trim();
		if (flightData(source)) continue;
		if (source.length > 8192) {
			declared.clear();
			continue;
		}
		const tail = tailPattern.exec(source);
		if (!tail) {
			const knownTheme =
				declared.size > 0 && themeDigests.has(await sourceDigest(source));
			checkpoint();
			if (knownTheme) continue;
			declared.clear();
			continue;
		}
		const prefix = source.slice(0, tail.index).trim();
		if (prefix) {
			const kind = helperDigests.get(await sourceDigest(prefix));
			checkpoint();
			if (!kind) {
				declared.clear();
				continue;
			}
			declared.add(kind);
		}
		for (const match of tail[0].matchAll(callPattern)) {
			checkpoint();
			if (++calls > 256)
				throw new AgentBrowserError(
					"resource-limit",
					"Streaming completion call limit exceeded",
				);
			const [kind, first, second] = match.slice(1);
			const boundary = resolve(kind === "C" ? first : second, script);
			const segment = resolve(kind === "C" ? second : first, script);
			if (
				!declared.has(kind) ||
				!boundary ||
				!segment ||
				!isHtmlElement(boundary, "template") ||
				!isHtmlElement(segment, "div") ||
				!Object.hasOwn(segment.attributes, "hidden") ||
				segment.parent === null ||
				!isHtmlElement(tree.get(segment.parent), "body") ||
				boundary.parent === null ||
				!precedes(boundary.id, segment.id) ||
				!(kind === "C"
					? first.startsWith("B:") && second.startsWith("S:")
					: first.startsWith("S:") && second.startsWith("P:"))
			) {
				unresolved++;
				continue;
			}
			const parent = tree.get(boundary.parent);
			const position = parent.children.indexOf(boundary.id);
			let end = boundary.id;
			let opening: Readonly<DocumentNode> | undefined;
			if (kind === "C") {
				opening =
					position > 0 ? tree.get(parent.children[position - 1]) : undefined;
				if (
					!opening ||
					opening.kind !== "comment" ||
					!["$?", "$~"].includes(opening.data)
				) {
					unresolved++;
					continue;
				}
				let nesting = 0;
				let found = false;
				for (
					let index = position + 1;
					index < parent.children.length;
					index++
				) {
					checkpoint();
					const sibling = tree.get(parent.children[index]);
					if (sibling.kind !== "comment") continue;
					if (["/$", "/&"].includes(sibling.data)) {
						if (nesting-- === 0) {
							end = sibling.id;
							found = true;
							break;
						}
					} else if (["$", "$?", "$~", "$!", "&"].includes(sibling.data))
						nesting++;
				}
				if (!found || !precedes(end, segment.id)) {
					unresolved++;
					continue;
				}
			}
			for (const child of segment.children) {
				checkpoint();
				tree.insert(parent.id, child, kind === "C" ? end : boundary.id);
			}
			if (kind === "C" && opening) {
				for (const child of parent.children.slice(
					position,
					parent.children.indexOf(end),
				))
					tree.remove(child);
				tree.setData(opening.id, "$");
				boundaries++;
			} else {
				tree.remove(boundary.id);
				segments++;
			}
			tree.remove(segment.id);
		}
	}
	return Object.freeze({
		policy: "react-completion-source-v1",
		rendered: false,
		verified: false,
		boundaries,
		segments,
		unresolved,
	});
}
