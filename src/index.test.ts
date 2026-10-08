import { describe, expect, test } from 'bun:test';

import { ReaderView } from './index.js';

describe('@ankhorage/reader export conditions', () => {
  test('requires explicit platform selection for the fallback entrypoint', () => {
    expect(() => ReaderView({ sourceUri: 'book.epub', format: 'epub' })).toThrow(
      'browser or react-native package export condition',
    );
  });
});
