const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
	let value = index;
	for (let bit = 0; bit < 8; bit++)
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	crcTable[index] = value >>> 0;
}

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length) {
	let checksum = 0xffffffff;
	for (let index = start; index < end; index++)
		checksum = (checksum >>> 8) ^ crcTable[(checksum ^ bytes[index]) & 255];
	return (checksum ^ 0xffffffff) >>> 0;
}

export function adler32(bytes: Uint8Array) {
	let low = 1;
	let high = 0;
	for (let offset = 0; offset < bytes.length; offset += 5552) {
		const end = Math.min(offset + 5552, bytes.length);
		for (let index = offset; index < end; index++) {
			low += bytes[index];
			high += low;
		}
		low %= 65521;
		high %= 65521;
	}
	return ((high << 16) | low) >>> 0;
}
