import React from 'react';

import type { ReaderViewProps } from '../../../types/reader.js';
import ReaderViewport from '../ReaderViewport.js';
import { toReaderViewportProps } from '../toReaderViewportProps.js';

const DEFAULT_WEB_STYLE: React.CSSProperties = {
  height: '100%',
  minHeight: 360,
  position: 'relative',
  width: '100%',
};

/*** Render the standalone EPUB/PDF viewport directly in a browser-owned DOM region. */
export function ReaderView(props: ReaderViewProps): React.ReactElement {
  const style =
    props.style === undefined ? DEFAULT_WEB_STYLE : { ...DEFAULT_WEB_STYLE, ...props.style };

  return (
    <div style={style}>
      <ReaderViewport {...toReaderViewportProps(props)} />
    </div>
  );
}
