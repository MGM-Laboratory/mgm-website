/**
 * A minimal ZIP writer (store method, no compression) for the .xlsx export
 * and the "all uploaded files" download. Entries are CRC-32 checked and
 * their names flagged as UTF-8. It builds the archive from byte chunks, so
 * the browser never holds more than the files themselves plus the headers.
 */

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 (IEEE 802.3), continuing from `crc` when given. */
export function crc32(data: Uint8Array, crc = 0): number {
  let value = (crc ^ 0xffffffff) >>> 0;
  for (const byte of data) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export type ZipEntry = { name: string; data: Uint8Array; date?: Date };

const encoder = new TextEncoder();

/** Makes a path safe inside an archive: no absolute paths, no `..`, no odd characters. */
export function safeZipPath(path: string): string {
  return path
    .split("/")
    .map((part) =>
      part
        .replace(/[\u0000-\u001f<>:"\\|?*]+/g, "_")
        .replace(/^\.+$/, "_")
        .trim()
        .slice(0, 120),
    )
    .filter(Boolean)
    .join("/");
}

/** Appends " (2)", " (3)"... before the extension when a name is already taken. */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) {
    taken.add(name.toLowerCase());
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} (${n})${extension}`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

export class ZipWriter {
  private chunks: Uint8Array[] = [];
  private central: Uint8Array[] = [];
  private offset = 0;
  private count = 0;

  add(entry: ZipEntry) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const { time, day } = dosDateTime(entry.date ?? new Date());
    if (size > 0xffffffff || this.offset > 0xffffffff) {
      throw new Error("The archive is over 4 GB, which this writer can't do.");
    }

    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // UTF-8 names
    view.setUint16(8, 0, true); // stored
    view.setUint16(10, time, true);
    view.setUint16(12, day, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    local.set(name, 30);

    const header = new Uint8Array(46 + name.length);
    const centralView = new DataView(header.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // made by
    centralView.setUint16(6, 20, true); // needed
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, day, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comment
    centralView.setUint16(34, 0, true); // disk
    centralView.setUint16(36, 0, true); // internal attributes
    centralView.setUint32(38, 0, true); // external attributes
    centralView.setUint32(42, this.offset, true);
    header.set(name, 46);

    this.chunks.push(local, entry.data);
    this.central.push(header);
    this.offset += local.length + size;
    this.count += 1;
  }

  addText(name: string, text: string, date?: Date) {
    this.add({ name, data: encoder.encode(text), date });
  }

  get size() {
    return this.offset;
  }

  /** The archive's bytes, as chunks (for a Blob) . */
  finish(): Uint8Array[] {
    if (this.count > 0xffff) throw new Error("Too many files for one archive (65,535 at most).");
    const centralSize = this.central.reduce((total, chunk) => total + chunk.length, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, this.count, true);
    view.setUint16(10, this.count, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, this.offset, true);
    return [...this.chunks, ...this.central, end];
  }

  /** The whole archive as one array (small archives and tests). */
  toBytes(): Uint8Array {
    const parts = this.finish();
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let position = 0;
    for (const part of parts) {
      out.set(part, position);
      position += part.length;
    }
    return out;
  }
}
