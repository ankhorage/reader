import React from 'react';
import { View } from 'react-native';

import type { ReaderViewProps } from '../../../types/reader.js';
import ReaderViewport from '../ReaderViewport.js';
import { toReaderViewportProps } from '../toReaderViewportProps.js';

const DOM_CONFIGURATION = {
  allowsInlineMediaPlayback: false,
  javaScriptCanOpenWindowsAutomatically: false,
  mediaPlaybackRequiresUserAction: true,
  originWhitelist: ['about:blank', 'blob:*'],
  scrollEnabled: false,
  style: { flex: 1, minHeight: 360 },
  unstable_useExpoModulesBridge: false,
};

/*** Host the same EPUB/PDF DOM viewport in Expo's isolated native DOM WebView. */
export function ReaderView(props: ReaderViewProps): React.ReactElement {
  return (
    <View style={props.style ?? { flex: 1, minHeight: 360 }}>
      <ReaderViewport
        {...toReaderViewportProps(props)}
        dom={DOM_CONFIGURATION}
      />
    </View>
  );
}
