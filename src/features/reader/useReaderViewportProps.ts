import React from 'react';

import type { ReaderViewportProps, ReaderViewProps } from '../../types/reader.js';

/*** Adapt ReaderView props while retaining stable callbacks that always use the latest consumer handlers. */
export function useReaderViewportProps(props: ReaderViewProps): ReaderViewportProps {
  const { appearance, command, format, initialLocation, sourceUri } = props;
  const callbacks = useReaderCallbacks(props);
  const { colorScheme, fontScale, lineHeight } = appearance ?? {};

  return React.useMemo(
    () => ({
      appearance: {
        colorScheme: colorScheme ?? 'system',
        fontScale: fontScale ?? 1,
        lineHeight: lineHeight ?? 1.5,
      },
      ...(command === undefined ? {} : { command }),
      format,
      ...(initialLocation === undefined ? {} : { initialLocation }),
      ...callbacks,
      sourceUri,
    }),
    [callbacks, colorScheme, command, fontScale, format, initialLocation, lineHeight, sourceUri],
  );
}

/*** Keep viewport callback identities stable while dispatching to the consumer's current implementations. */
function useReaderCallbacks(
  props: ReaderViewProps,
): Pick<ReaderViewportProps, 'onError' | 'onOpenExternalLink' | 'onStateChange'> {
  const callbacksRef = React.useRef({
    onError: props.onError,
    onOpenExternalLink: props.onOpenExternalLink,
    onStateChange: props.onStateChange,
  });
  React.useLayoutEffect(() => {
    callbacksRef.current = {
      onError: props.onError,
      onOpenExternalLink: props.onOpenExternalLink,
      onStateChange: props.onStateChange,
    };
  }, [props.onError, props.onOpenExternalLink, props.onStateChange]);

  return React.useMemo(
    () => ({
      onError: async (event) => {
        await callbacksRef.current.onError?.(event);
      },
      onOpenExternalLink: async (event) => {
        await callbacksRef.current.onOpenExternalLink?.(event);
      },
      onStateChange: async (state) => {
        await callbacksRef.current.onStateChange?.(state);
      },
    }),
    [],
  );
}
