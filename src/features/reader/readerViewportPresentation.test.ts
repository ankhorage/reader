import { describe, expect, test } from 'bun:test';

import { READER_STYLES } from './readerViewportPresentation.js';

describe('reader stylesheet isolation', () => {
  test('does not mutate host application root, body or generic elements', () => {
    expect(READER_STYLES).not.toContain(':root, body, #root');
    expect(READER_STYLES).not.toContain('* { box-sizing');
    expect(READER_STYLES).toContain('.reader-root { position: absolute; inset: 0');
  });
});
