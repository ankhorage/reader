import { describe, expect, test } from 'bun:test';

import type { ReaderViewportState, ReaderViewProps } from '../../types/reader.js';
import { toReaderViewportProps } from './toReaderViewportProps.js';

describe('ReaderView platform-neutral adapter contract', () => {
  test('preserves the canonical source, appearance and controlled navigation command', () => {
    const input: ReaderViewProps = {
      sourceUri: 'https://example.test/book.epub',
      format: 'epub',
      initialLocation: 'epubcfi(/6/2)',
      appearance: { colorScheme: 'sepia', fontScale: 1.25 },
      command: { id: 7, sourceUri: 'https://example.test/book.epub', type: 'next' },
    };

    const props = toReaderViewportProps(input);

    expect(props.sourceUri).toBe(input.sourceUri);
    expect(props.initialLocation).toBe(input.initialLocation);
    expect(props.command).toEqual(input.command);
    expect(props.appearance).toEqual({
      colorScheme: 'sepia',
      fontScale: 1.25,
      lineHeight: 1.5,
    });
  });

  test('forwards normalized state/errors/links without coupling to ZORA', async () => {
    const seen: string[] = [];
    const input: ReaderViewProps = {
      sourceUri: 'file:///book.pdf',
      format: 'pdf',
      onStateChange: (event) => {
        seen.push(event.status);
      },
      onError: (event) => {
        seen.push(event.code);
      },
      onOpenExternalLink: (event) => {
        seen.push(event.url);
      },
    };
    const props = toReaderViewportProps(input);
    const state: ReaderViewportState = {
      canGoNext: false,
      canGoPrevious: false,
      page: 1,
      progress: 0,
      status: 'ready',
    };
    await props.onStateChange(state);
    await props.onError({ code: 'protected-document', format: 'pdf', message: 'Protected' });
    await props.onOpenExternalLink({ url: 'https://example.test/' });

    expect(seen).toEqual(['ready', 'protected-document', 'https://example.test/']);
  });
});
