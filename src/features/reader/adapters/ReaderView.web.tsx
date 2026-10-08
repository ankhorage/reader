import React from 'react';

import type { ReaderViewProps } from '../../../types/reader.js';
import ReaderViewport from '../ReaderViewport.js';
import { toReaderViewportProps } from '../toReaderViewportProps.js';

/*** Render the standalone EPUB/PDF viewport directly in a browser-owned DOM region. */
export function ReaderView(props: ReaderViewProps): React.ReactElement {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 360,
        position: 'relative',
        width: '100%',
        ...props.style,
      }}
    >
      <ReaderViewport {...toReaderViewportProps(props)} />
    </div>
  );
}
