const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    Math.floor((date.getSeconds() & 0x3f) / 2);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);

  return { dosTime, dosDate };
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function createZip(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const now = new Date();
  const { dosDate, dosTime } = toDosTimeDate(now);

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const localData = concatBytes(localParts);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localData.length, true);
  endView.setUint16(20, 0, true);

  return concatBytes([localData, centralDirectory, end]);
}

function findEndOfCentralDirectory(data: Uint8Array) {
  const maxCommentLength = 0xffff;
  const minEndSize = 22;
  const start = Math.max(0, data.length - minEndSize - maxCommentLength);

  for (let i = data.length - minEndSize; i >= start; i--) {
    const view = new DataView(data.buffer, data.byteOffset + i, 4);
    if (view.getUint32(0, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return i;
    }
  }

  throw new Error("Invalid zip file: end of central directory not found");
}

export function readZip(data: Uint8Array) {
  const endOffset = findEndOfCentralDirectory(data);
  const endView = new DataView(data.buffer, data.byteOffset + endOffset, 22);
  const totalEntries = endView.getUint16(10, true);
  const centralDirectoryOffset = endView.getUint32(16, true);

  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();

  let offset = centralDirectoryOffset;
  for (let i = 0; i < totalEntries; i++) {
    const centralView = new DataView(data.buffer, data.byteOffset + offset, 46);
    const signature = centralView.getUint32(0, true);
    if (signature !== CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new Error("Invalid zip file: malformed central directory");
    }

    const compressionMethod = centralView.getUint16(10, true);
    if (compressionMethod !== 0) {
      throw new Error("Unsupported zip compression method");
    }

    const compressedSize = centralView.getUint32(20, true);
    const fileNameLength = centralView.getUint16(28, true);
    const extraLength = centralView.getUint16(30, true);
    const commentLength = centralView.getUint16(32, true);
    const localHeaderOffset = centralView.getUint32(42, true);

    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = decoder.decode(data.slice(nameStart, nameEnd));

    const localView = new DataView(
      data.buffer,
      data.byteOffset + localHeaderOffset,
      30,
    );
    const localSignature = localView.getUint32(0, true);
    if (localSignature !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error("Invalid zip file: malformed local header");
    }

    const localFileNameLength = localView.getUint16(26, true);
    const localExtraLength = localView.getUint16(28, true);

    const fileStart =
      localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const fileEnd = fileStart + compressedSize;

    entries.set(name, data.slice(fileStart, fileEnd));

    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}
