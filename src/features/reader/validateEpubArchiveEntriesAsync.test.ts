import type { Entry } from '@zip.js/zip.js';
import {
  ERR_OVERLAPPING_ENTRY,
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js';
import { describe, expect, test } from 'bun:test';

import { validateEpubArchiveEntriesAsync } from './epub/validateEpubArchiveEntriesAsync.js';

describe('validateEpubArchiveEntriesAsync archive budgets', () => {
  test('accepts a bounded archive and preflights every file without extracting it', async () => {
    const entries = await createArchiveEntries([
      ['mimetype', 'application/epub+zip'],
      ['META-INF/container.xml', '<container />'],
    ]);

    expect(validateEpubArchiveEntriesAsync(entries)).resolves.toBeUndefined();
    expect(entries.every((entry) => entry.directory || entry.localDirectory)).toBe(true);
  });

  test('rejects excessive entry counts before reading entry data', async () => {
    const [entry] = await createArchiveEntries([['mimetype', 'application/epub+zip']]);

    if (entry === undefined) throw new Error('Expected an EPUB fixture entry.');
    expect(validateEpubArchiveEntriesAsync(Array<Entry>(10_001).fill(entry))).rejects.toThrow(
      'exceeds the 10000-entry limit',
    );
    expect(entry.localDirectory).toBeUndefined();
  });

  test('rejects an oversized entry before reading entry data', async () => {
    const [entry] = await createArchiveEntries([['chapter.xhtml', '<p>Chapter</p>']]);
    if (entry === undefined) throw new Error('Expected an EPUB fixture entry.');
    entry.uncompressedSize = 64 * 1024 * 1024 + 1;
    entry.compressedSize = entry.uncompressedSize;

    expect(validateEpubArchiveEntriesAsync([entry])).rejects.toThrow(
      'exceeds the 67108864-byte uncompressed limit',
    );
    expect(entry.localDirectory).toBeUndefined();
  });

  test('rejects excessive aggregate expansion before reading entry data', async () => {
    const entries = await createArchiveEntries(
      Array.from({ length: 9 }, (_, index) => [`chapter-${index}.xhtml`, '<p>Chapter</p>']),
    );

    for (const entry of entries) {
      if (entry === undefined) throw new Error('Expected an EPUB fixture entry.');
    entry.uncompressedSize = 64 * 1024 * 1024;
      entry.compressedSize = entry.uncompressedSize;
    }

    expect(validateEpubArchiveEntriesAsync(entries)).rejects.toThrow(
      'exceeds the 536870912-byte aggregate uncompressed limit',
    );
    expect(entries.every((entry) => !entry.localDirectory)).toBe(true);
  });

  test('rejects suspicious compression ratios before reading entry data', async () => {
    const [entry] = await createArchiveEntries([['chapter.xhtml', '<p>Chapter</p>']]);
    if (entry === undefined) throw new Error('Expected an EPUB fixture entry.');
    entry.uncompressedSize = 10_001;
    if (entry === undefined) throw new Error('Expected an EPUB fixture entry.');
    entry.compressedSize = 100;

    expect(validateEpubArchiveEntriesAsync([entry])).rejects.toThrow(
      'exceeds the 100:1 compression-ratio limit',
    );
    expect(entry.localDirectory).toBeUndefined();
  });
});

describe('validateEpubArchiveEntriesAsync archive structure', () => {
  test('rejects invalid declared sizes before reading entry data', async () => {
    const [entry] = await createArchiveEntries([['chapter.xhtml', '<p>Chapter</p>']]);
    if (entry === undefined) throw new Error('Expected an EPUB fixture entry.');
    entry.compressedSize = Number.NaN;

    expect(validateEpubArchiveEntriesAsync([entry])).rejects.toThrow('declares invalid sizes');
    expect(entry.localDirectory).toBeUndefined();
  });

  test('rejects overlapping entry ranges during the no-extraction preflight', async () => {
    const archive = await createArchive([
      ['first.txt', 'same'],
      ['other.txt', 'same'],
    ]);
    const [firstOffset, secondOffset] = findSignatureOffsets(archive, 0x02014b50);
    if (firstOffset === undefined || secondOffset === undefined) {
      throw new Error('Expected two central directory offsets.');
    }
    const archiveView = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const firstLocalHeaderOffset = archiveView.getUint32(firstOffset + 42, true);
    const firstCentralFilename = archive.slice(
      firstOffset + 46,
      firstOffset + 46 + 'first.txt'.length,
    );
    archive.set(firstCentralFilename, secondOffset + 46);
    archiveView.setUint32(secondOffset + 42, firstLocalHeaderOffset, true);
    const entries = await readArchiveEntries(archive, 'balanced');

    expect(validateEpubArchiveEntriesAsync(entries)).rejects.toThrow(ERR_OVERLAPPING_ENTRY);
  });
});

async function createArchive(
  files: readonly (readonly [filename: string, content: string])[],
): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter());

  for (const [filename, content] of files) {
    await writer.add(filename, new TextReader(content));
  }

  return writer.close();
}

async function createArchiveEntries(
  files: readonly (readonly [filename: string, content: string])[],
): Promise<Entry[]> {
  return readArchiveEntries(await createArchive(files));
}

function findSignatureOffsets(data: Uint8Array, signature: number): number[] {
  const offsets: number[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let offset = 0; offset <= data.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) {
      offsets.push(offset);
    }
  }

  return offsets;
}

async function readArchiveEntries(
  data: Uint8Array,
  strictness: 'balanced' | 'strict' = 'strict',
): Promise<Entry[]> {
  const reader = new ZipReader(new Uint8ArrayReader(data), {
    strictness,
  });

  return reader.getEntries({ strictness });
}
