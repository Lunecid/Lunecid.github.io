// Small, dependency-free readers and writers for the parts of SFNT / WOFF2 font files the build needs:
// read the cmap and name tables of a WOFF2 file (the coverage guard reads the real shipped file), rewrite the
// name table of an SFNT (OFL Reserved Font Name: a subset must not be published under the original name), and
// merge the glyphs of several TrueType slices of one family into one SFNT (the Korean serif ships in slices).
import { brotliDecompressSync } from 'node:zlib';

// ── WOFF2 ─────────────────────────────────────────────────────────────────────

/** WOFF2 "known table tags", indexed by the low 6 bits of a table directory entry's flags (WOFF2 §5.2). */
const WOFF2_KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc',
  'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

/** @param {Buffer} buf @param {number} pos @returns {[number, number]} value, next position */
function readUIntBase128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[pos + i];
    if (i === 0 && byte === 0x80) throw new Error('WOFF2: UIntBase128 with a leading zero');
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, pos + i + 1];
  }
  throw new Error('WOFF2: UIntBase128 longer than 5 bytes');
}

/** @param {Buffer} buf */
const tagAt = (buf, pos) => buf.toString('latin1', pos, pos + 4);

/**
 * The tables of a WOFF2 file that are stored without a transform (every table except a transformed
 * glyf/loca/hmtx), by tag. Enough for cmap, name, OS/2, fvar, … without reconstructing glyph data.
 * @param {Buffer} buf
 * @returns {Map<string, Buffer>}
 */
export function woff2Tables(buf) {
  if (tagAt(buf, 0) !== 'wOF2') throw new Error('not a WOFF2 file');
  const flavor = tagAt(buf, 4);
  if (flavor === 'ttcf') throw new Error('WOFF2 font collections are not supported');
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  let pos = 48;
  /** @type {{ tag: string; length: number; transformed: boolean }[]} */
  const entries = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++];
    let tag;
    if ((flags & 0x3f) === 0x3f) {
      tag = tagAt(buf, pos);
      pos += 4;
    } else {
      tag = WOFF2_KNOWN_TAGS[flags & 0x3f];
    }
    const version = flags >> 6;
    let origLength;
    [origLength, pos] = readUIntBase128(buf, pos);
    // glyf/loca: version 0 = transformed, 3 = null transform; every other table: version 0 = null transform.
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    let length = origLength;
    if (transformed) [length, pos] = readUIntBase128(buf, pos);
    entries.push({ tag, length, transformed });
  }
  const data = brotliDecompressSync(buf.subarray(pos, pos + totalCompressedSize));
  const tables = new Map();
  let offset = 0;
  for (const entry of entries) {
    if (!entry.transformed) tables.set(entry.tag, data.subarray(offset, offset + entry.length));
    offset += entry.length;
  }
  return tables;
}

// ── SFNT ──────────────────────────────────────────────────────────────────────

/**
 * Every table of an SFNT (TrueType/OpenType) file, by tag, in file order.
 * @param {Buffer} buf
 * @returns {Map<string, Buffer>}
 */
export function sfntTables(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const offset = buf.readUInt32BE(rec + 8);
    const length = buf.readUInt32BE(rec + 12);
    tables.set(tagAt(buf, rec), buf.subarray(offset, offset + length));
  }
  return tables;
}

/** Tables of a WOFF2 or SFNT file (for WOFF2: the untransformed ones). @param {Buffer} buf */
export function fontTables(buf) {
  return tagAt(buf, 0) === 'wOF2' ? woff2Tables(buf) : sfntTables(buf);
}

/** @param {Buffer} data */
function checksum(data) {
  let sum = 0;
  const padded = data.length % 4 === 0 ? data : Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/**
 * Serializes tables into an SFNT with a sorted directory, 4-byte aligned tables, correct table checksums
 * and head.checkSumAdjustment.
 * @param {Map<string, Buffer>} tables
 * @param {number} [sfntVersion] 0x00010000 (TrueType) by default
 */
export function writeSfnt(tables, sfntVersion = 0x00010000) {
  const tags = [...tables.keys()].sort();
  const numTables = tags.length;
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(sfntVersion, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(numTables * 16 - searchRange, 10);
  const chunks = [header];
  let offset = header.length;
  let headOffset = -1;
  tags.forEach((tag, i) => {
    let data = /** @type {Buffer} */ (tables.get(tag));
    if (tag === 'head') {
      data = Buffer.from(data);
      data.writeUInt32BE(0, 8); // checkSumAdjustment is computed over the whole file with this field zeroed
      headOffset = offset;
    }
    const rec = 12 + i * 16;
    header.write(tag, rec, 4, 'latin1');
    header.writeUInt32BE(checksum(data), rec + 4);
    header.writeUInt32BE(offset, rec + 8);
    header.writeUInt32BE(data.length, rec + 12);
    const pad = (4 - (data.length % 4)) % 4;
    chunks.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
  });
  const out = Buffer.concat(chunks);
  if (headOffset >= 0) out.writeUInt32BE((0xb1b0afba - checksum(out)) >>> 0, headOffset + 8);
  return out;
}

// ── cmap ──────────────────────────────────────────────────────────────────────

/**
 * Glyph id per code point from the Unicode subtables (formats 4 and 12) of a cmap table; code points mapped
 * to .notdef are left out.
 * @param {Buffer} cmap
 * @returns {Map<number, number>}
 */
export function cmapGlyphs(cmap) {
  const map = new Map();
  const numSubtables = cmap.readUInt16BE(2);
  /** @type {number[]} */
  const offsets = [];
  for (let i = 0; i < numSubtables; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    if (platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))) offsets.push(cmap.readUInt32BE(8 + i * 8));
  }
  for (const offset of offsets) {
    const format = cmap.readUInt16BE(offset);
    if (format === 12) {
      const groups = cmap.readUInt32BE(offset + 12);
      for (let g = 0; g < groups; g++) {
        const at = offset + 16 + g * 12;
        const start = cmap.readUInt32BE(at);
        const end = cmap.readUInt32BE(at + 4);
        const glyph = cmap.readUInt32BE(at + 8);
        for (let c = start; c <= end; c++) if (!map.has(c)) map.set(c, glyph + (c - start));
      }
    } else if (format === 4) {
      const segX2 = cmap.readUInt16BE(offset + 6);
      const ends = offset + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const rangeOffsets = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const end = cmap.readUInt16BE(ends + s);
        const start = cmap.readUInt16BE(starts + s);
        const delta = cmap.readUInt16BE(deltas + s);
        const rangeOffset = cmap.readUInt16BE(rangeOffsets + s);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            glyph = cmap.readUInt16BE(rangeOffsets + s + rangeOffset + (c - start) * 2);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0 && !map.has(c)) map.set(c, glyph);
        }
      }
    }
  }
  return map;
}

/** Code points a cmap table maps to a real glyph (not .notdef). @param {Buffer} cmap @returns {Set<number>} */
export const cmapCodePoints = (cmap) => new Set(cmapGlyphs(cmap).keys());

/**
 * A format 4 cmap (BMP only) mapping each code point to its glyph id; platform 0/3 and 3/1 records.
 * @param {Map<number, number>} mapping code point → glyph id
 */
export function buildCmap4(mapping) {
  const points = [...mapping.keys()].sort((a, b) => a - b);
  if (points.some((c) => c > 0xfffe)) throw new Error('buildCmap4: code point outside the BMP');
  // One segment per run of consecutive code points with consecutive glyph ids (idDelta form).
  /** @type {{ start: number; end: number; delta: number }[]} */
  const segments = [];
  for (const c of points) {
    const glyph = /** @type {number} */ (mapping.get(c));
    const last = segments[segments.length - 1];
    if (last && c === last.end + 1 && ((c + last.delta) & 0xffff) === glyph) last.end = c;
    else segments.push({ start: c, end: c, delta: (glyph - c) & 0xffff });
  }
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const segCount = segments.length;
  const entrySelector = Math.floor(Math.log2(segCount));
  const searchRange = 2 ** entrySelector * 2;
  const subLength = 16 + segCount * 8;
  const sub = Buffer.alloc(subLength);
  sub.writeUInt16BE(4, 0);
  sub.writeUInt16BE(subLength, 2);
  sub.writeUInt16BE(0, 4);
  sub.writeUInt16BE(segCount * 2, 6);
  sub.writeUInt16BE(searchRange, 8);
  sub.writeUInt16BE(entrySelector, 10);
  sub.writeUInt16BE(segCount * 2 - searchRange, 12);
  segments.forEach((seg, i) => {
    sub.writeUInt16BE(seg.end, 14 + i * 2);
    sub.writeUInt16BE(seg.start, 16 + segCount * 2 + i * 2);
    sub.writeUInt16BE(seg.delta, 16 + segCount * 4 + i * 2);
    sub.writeUInt16BE(0, 16 + segCount * 6 + i * 2);
  });
  const head = Buffer.alloc(4 + 2 * 8);
  head.writeUInt16BE(0, 0);
  head.writeUInt16BE(2, 2);
  head.writeUInt16BE(0, 4);
  head.writeUInt16BE(3, 6);
  head.writeUInt32BE(head.length, 8);
  head.writeUInt16BE(3, 12);
  head.writeUInt16BE(1, 14);
  head.writeUInt32BE(head.length, 16);
  return Buffer.concat([head, sub]);
}

// ── name ──────────────────────────────────────────────────────────────────────

/** @typedef {{ platformID: number; encodingID: number; languageID: number; nameID: number; value: string }} NameRecord */

/** Unicode (0) and Windows (3) platform strings are UTF-16BE; Macintosh (1) strings are 8-bit. @param {number} platformID */
const utf16 = (platformID) => platformID === 0 || platformID === 3;

/**
 * @param {Buffer} name the name table
 * @returns {NameRecord[]}
 */
export function parseName(name) {
  const count = name.readUInt16BE(2);
  const storage = name.readUInt16BE(4);
  /** @type {NameRecord[]} */
  const records = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const platformID = name.readUInt16BE(at);
    const encodingID = name.readUInt16BE(at + 2);
    const languageID = name.readUInt16BE(at + 4);
    const nameID = name.readUInt16BE(at + 6);
    const length = name.readUInt16BE(at + 8);
    const offset = name.readUInt16BE(at + 10);
    const raw = name.subarray(storage + offset, storage + offset + length);
    const value = utf16(platformID) ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
    records.push({ platformID, encodingID, languageID, nameID, value });
  }
  return records;
}

/**
 * A format 0 name table.
 * @param {NameRecord[]} records
 */
export function buildName(records) {
  const sorted = [...records].sort(
    (a, b) => a.platformID - b.platformID || a.encodingID - b.encodingID || a.languageID - b.languageID || a.nameID - b.nameID,
  );
  const strings = sorted.map((r) =>
    utf16(r.platformID) ? Buffer.from(r.value, 'utf16le').swap16() : Buffer.from(r.value, 'latin1'),
  );
  const header = Buffer.alloc(6 + sorted.length * 12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(sorted.length, 2);
  header.writeUInt16BE(header.length, 4);
  let offset = 0;
  sorted.forEach((r, i) => {
    const at = 6 + i * 12;
    header.writeUInt16BE(r.platformID, at);
    header.writeUInt16BE(r.encodingID, at + 2);
    header.writeUInt16BE(r.languageID, at + 4);
    header.writeUInt16BE(r.nameID, at + 6);
    header.writeUInt16BE(strings[i].length, at + 8);
    header.writeUInt16BE(offset, at + 10);
    offset += strings[i].length;
  });
  return Buffer.concat([header, ...strings]);
}

/**
 * Rewrites the name table of an SFNT: `rename` returns the new value of a record (or null to drop it);
 * `extra` records are added (e.g. a name ID 10 description saying where the font was derived from).
 * @param {Buffer} sfnt
 * @param {(record: NameRecord) => string | null} rename
 * @param {NameRecord[]} [extra]
 */
export function renameSfnt(sfnt, rename, extra = []) {
  const tables = sfntTables(sfnt);
  const name = tables.get('name');
  if (!name) throw new Error('renameSfnt: no name table');
  const records = parseName(name).flatMap((r) => {
    const value = rename(r);
    return value === null ? [] : [{ ...r, value }];
  });
  const copy = new Map(tables);
  copy.set('name', buildName([...records, ...extra]));
  return writeSfnt(copy, sfnt.readUInt32BE(0));
}

// ── merge ─────────────────────────────────────────────────────────────────────

/**
 * Rewrites one glyph's GlyphVariationData so every tuple carries its own peak (no shared-tuple references),
 * which lets glyph variation data from fonts with different shared-tuple lists live in one gvar table.
 * @param {Buffer} data @param {number} axisCount @param {number[][]} shared
 */
function embedPeakTuples(data, axisCount, shared) {
  if (data.length === 0) return data;
  const countField = data.readUInt16BE(0);
  const count = countField & 0x0fff;
  const dataOffset = data.readUInt16BE(2);
  /** @type {Buffer[]} */
  const headers = [];
  let pos = 4;
  for (let t = 0; t < count; t++) {
    const size = data.readUInt16BE(pos);
    const index = data.readUInt16BE(pos + 2);
    pos += 4;
    let peak;
    if (index & 0x8000) {
      peak = Array.from({ length: axisCount }, (_, a) => data.readInt16BE(pos + a * 2));
      pos += axisCount * 2;
    } else {
      peak = shared[index & 0x0fff];
      if (!peak) throw new Error('gvar: shared tuple index out of range');
    }
    /** @type {number[]} */
    let region = [];
    if (index & 0x4000) {
      region = Array.from({ length: axisCount * 2 }, (_, a) => data.readInt16BE(pos + a * 2));
      pos += axisCount * 4;
    }
    const b = Buffer.alloc(4 + axisCount * 2 + region.length * 2);
    b.writeUInt16BE(size, 0);
    b.writeUInt16BE(0x8000 | (index & 0x6000), 2); // EMBEDDED_PEAK_TUPLE, keep INTERMEDIATE/PRIVATE_POINTS
    [...peak, ...region].forEach((v, a) => b.writeInt16BE(v, 4 + a * 2));
    headers.push(b);
  }
  const head = Buffer.alloc(4);
  head.writeUInt16BE(countField, 0);
  head.writeUInt16BE(4 + headers.reduce((n, b) => n + b.length, 0), 2);
  return Buffer.concat([head, ...headers, data.subarray(dataOffset)]);
}

/** @param {Buffer} gvar */
function readGvar(gvar) {
  const axisCount = gvar.readUInt16BE(4);
  const sharedCount = gvar.readUInt16BE(6);
  const sharedOffset = gvar.readUInt32BE(8);
  const long = (gvar.readUInt16BE(14) & 1) === 1;
  const arrayOffset = gvar.readUInt32BE(16);
  const shared = Array.from({ length: sharedCount }, (_, i) =>
    Array.from({ length: axisCount }, (_, a) => gvar.readInt16BE(sharedOffset + (i * axisCount + a) * 2)),
  );
  /** @param {number} i */
  const offsetAt = (i) => (long ? gvar.readUInt32BE(20 + i * 4) : gvar.readUInt16BE(20 + i * 2) * 2);
  /** @param {number} gid */
  const glyph = (gid) =>
    embedPeakTuples(gvar.subarray(arrayOffset + offsetAt(gid), arrayOffset + offsetAt(gid + 1)), axisCount, shared);
  return { axisCount, glyph };
}

/**
 * Merges TrueType (glyf) fonts that are slices of one family (same metrics, axes and names; each slice a
 * different set of characters) into one SFNT: glyph 0 (.notdef) of the first slice, then every other glyph of
 * every slice, with a new cmap, hmtx, loca, glyf, gvar (when variable) and the counts and bounds in
 * head/hhea/maxp/OS/2 updated. Layout tables, HVAR and vertical metrics must already be dropped from the
 * slices; composite glyphs are not supported (the Korean serif has none).
 * @param {Buffer[]} slices SFNT buffers
 */
export function mergeGlyfSlices(slices) {
  const parsed = slices.map((buf) => {
    const t = sfntTables(buf);
    for (const tag of ['GSUB', 'GPOS', 'GDEF', 'BASE', 'HVAR', 'VVAR', 'MVAR', 'vhea', 'vmtx', 'VORG', 'CFF ', 'CFF2']) {
      if (t.has(tag)) throw new Error(`mergeGlyfSlices: drop the ${tag} table from the slices first`);
    }
    const table = (/** @type {string} */ tag) => {
      const data = t.get(tag);
      if (!data) throw new Error(`mergeGlyfSlices: no ${tag} table`);
      return data;
    };
    const [head, hhea, maxp, loca, glyf, hmtx] = ['head', 'hhea', 'maxp', 'loca', 'glyf', 'hmtx'].map(table);
    const numGlyphs = maxp.readUInt16BE(4);
    const longLoca = head.readInt16BE(50) === 1;
    const numH = hhea.readUInt16BE(34);
    /** @param {number} i */
    const locaAt = (i) => (longLoca ? loca.readUInt32BE(i * 4) : loca.readUInt16BE(i * 2) * 2);
    /** @param {number} gid */
    const glyphData = (gid) => {
      const data = glyf.subarray(locaAt(gid), locaAt(gid + 1));
      if (data.length > 0 && data.readInt16BE(0) < 0) throw new Error('mergeGlyfSlices: composite glyphs are not supported');
      return data;
    };
    /** @param {number} gid @returns {[number, number]} advance width, left side bearing */
    const metrics = (gid) => [
      hmtx.readUInt16BE(Math.min(gid, numH - 1) * 4),
      gid < numH ? hmtx.readInt16BE(gid * 4 + 2) : hmtx.readInt16BE(numH * 4 + (gid - numH) * 2),
    ];
    const gvarTable = t.get('gvar');
    return { t, numGlyphs, glyphData, metrics, maxp, cmap: cmapGlyphs(table('cmap')), gvar: gvarTable ? readGvar(gvarTable) : null };
  });
  if (parsed.some((p) => p.gvar) && !parsed.every((p) => p.gvar)) {
    throw new Error('mergeGlyfSlices: some slices are variable and some are not');
  }

  /** @type {{ slice: number; gid: number }[]} */
  const order = [{ slice: 0, gid: 0 }];
  /** @type {Map<number, number>} */
  const mapping = new Map();
  parsed.forEach((p, slice) => {
    /** @type {Map<number, number>} */
    const newId = new Map();
    for (let gid = 1; gid < p.numGlyphs; gid++) {
      newId.set(gid, order.length);
      order.push({ slice, gid });
    }
    for (const [cp, gid] of p.cmap) {
      const id = newId.get(gid);
      if (id !== undefined && !mapping.has(cp)) mapping.set(cp, id);
    }
  });
  const n = order.length;
  const glyphs = order.map(({ slice, gid }) => parsed[slice].glyphData(gid));
  const mets = order.map(({ slice, gid }) => parsed[slice].metrics(gid));

  // glyf + long loca, each glyph padded to 4 bytes
  const loca = Buffer.alloc((n + 1) * 4);
  /** @type {Buffer[]} */
  const glyfParts = [];
  let offset = 0;
  glyphs.forEach((g, i) => {
    loca.writeUInt32BE(offset, i * 4);
    const pad = (4 - (g.length % 4)) % 4;
    glyfParts.push(g, Buffer.alloc(pad));
    offset += g.length + pad;
  });
  loca.writeUInt32BE(offset, n * 4);

  const hmtx = Buffer.alloc(n * 4);
  mets.forEach(([advance, lsb], i) => {
    hmtx.writeUInt16BE(advance, i * 4);
    hmtx.writeInt16BE(lsb, i * 4 + 2);
  });

  // bounds from the glyph headers (xMin, yMin, xMax, yMax); empty glyphs have none
  const inked = glyphs.flatMap((g, i) =>
    g.length >= 10 ? [{ box: [2, 4, 6, 8].map((at) => g.readInt16BE(at)), advance: mets[i][0], lsb: mets[i][1] }] : [],
  );
  const base = parsed[0].t;
  const tables = new Map(base);
  const head = Buffer.from(/** @type {Buffer} */ (base.get('head')));
  const hhea = Buffer.from(/** @type {Buffer} */ (base.get('hhea')));
  if (inked.length > 0) {
    head.writeInt16BE(Math.min(...inked.map((g) => g.box[0])), 36);
    head.writeInt16BE(Math.min(...inked.map((g) => g.box[1])), 38);
    head.writeInt16BE(Math.max(...inked.map((g) => g.box[2])), 40);
    head.writeInt16BE(Math.max(...inked.map((g) => g.box[3])), 42);
    hhea.writeInt16BE(Math.min(...inked.map((g) => g.lsb)), 12);
    hhea.writeInt16BE(Math.min(...inked.map((g) => g.advance - g.lsb - (g.box[2] - g.box[0]))), 14);
    hhea.writeInt16BE(Math.max(...inked.map((g) => g.lsb + (g.box[2] - g.box[0]))), 16);
  }
  head.writeInt16BE(1, 50); // indexToLocFormat: long offsets
  hhea.writeUInt16BE(Math.max(...mets.map((m) => m[0])), 10);
  hhea.writeUInt16BE(n, 34);
  const maxp = Buffer.from(parsed[0].maxp);
  maxp.writeUInt16BE(n, 4);
  if (maxp.readUInt32BE(0) === 0x00010000) {
    for (let at = 6; at + 2 <= maxp.length; at += 2) maxp.writeUInt16BE(Math.max(...parsed.map((p) => p.maxp.readUInt16BE(at))), at);
  }
  const os2 = base.get('OS/2');
  if (os2) {
    const copy = Buffer.from(os2);
    const cps = [...mapping.keys()];
    copy.writeUInt16BE(Math.min(0xffff, ...cps), 64); // usFirstCharIndex
    copy.writeUInt16BE(Math.min(0xffff, Math.max(...cps)), 66); // usLastCharIndex
    tables.set('OS/2', copy);
  }
  tables.set('head', head);
  tables.set('hhea', hhea);
  tables.set('maxp', maxp);
  tables.set('hmtx', hmtx);
  tables.set('loca', loca);
  tables.set('glyf', Buffer.concat(glyfParts));
  tables.set('cmap', buildCmap4(mapping));

  if (parsed[0].gvar) {
    const axisCount = parsed[0].gvar.axisCount;
    const datas = order.map(({ slice, gid }) => {
      const data = /** @type {NonNullable<typeof parsed[0]['gvar']>} */ (parsed[slice].gvar).glyph(gid);
      return data.length % 2 === 0 ? data : Buffer.concat([data, Buffer.alloc(1)]); // keep every entry 2-byte aligned
    });
    const headerLength = 20 + (n + 1) * 4;
    const gvar = Buffer.alloc(headerLength);
    gvar.writeUInt16BE(1, 0); // majorVersion
    gvar.writeUInt16BE(axisCount, 4);
    gvar.writeUInt16BE(0, 6); // sharedTupleCount: every tuple carries its own peak
    gvar.writeUInt32BE(headerLength, 8);
    gvar.writeUInt16BE(n, 12);
    gvar.writeUInt16BE(1, 14); // flags: long offsets
    gvar.writeUInt32BE(headerLength, 16);
    let at = 0;
    datas.forEach((d, i) => {
      gvar.writeUInt32BE(at, 20 + i * 4);
      at += d.length;
    });
    gvar.writeUInt32BE(at, 20 + n * 4);
    tables.set('gvar', Buffer.concat([gvar, ...datas]));
  }
  return writeSfnt(tables, 0x00010000);
}
