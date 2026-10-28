import { Manifest, Publication } from '@readium/shared';
import { describe, expect, test } from 'bun:test';

import { createEpubPositions } from './createEpubPositions.js';

describe('createEpubPositions', () => {
  test('provides Readium positions for every EPUB spine resource', () => {
    const manifest = Manifest.deserialize({
      metadata: { title: 'Rights-cleared fixture' },
      readingOrder: [
        { href: 'EPUB/chapter-1.xhtml', type: 'application/xhtml+xml' },
        { href: 'EPUB/chapter-2.xhtml', title: 'Chapter two', type: 'application/xhtml+xml' },
        { href: 'EPUB/chapter-3.xhtml', type: 'application/xhtml+xml' },
      ],
    });
    if (manifest === undefined) throw new Error('Fixture manifest must deserialize.');
    const publication = new Publication({ manifest });

    const [first, second, final] = createEpubPositions(publication);
    expect(first).toMatchObject({
      href: 'EPUB/chapter-1.xhtml',
      locations: { position: 1, progression: 0, totalProgression: 0 },
      type: 'application/xhtml+xml',
    });
    expect(second).toMatchObject({
      href: 'EPUB/chapter-2.xhtml',
      locations: { position: 2, progression: 0, totalProgression: 1 / 3 },
      title: 'Chapter two',
      type: 'application/xhtml+xml',
    });
    expect(final).toMatchObject({
      href: 'EPUB/chapter-3.xhtml',
      locations: { position: 3, progression: 0, totalProgression: 2 / 3 },
      type: 'application/xhtml+xml',
    });
  });
});
