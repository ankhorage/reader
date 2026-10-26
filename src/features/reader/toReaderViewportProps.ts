import React from 'react';

import type { ReaderViewportProps, ReaderViewProps } from '../../types/reader.js';

/*** Adapt the independent public ReaderView API to the serializable DOM viewport boundary. */
export function toReaderViewportProps(props: ReaderViewProps): ReaderViewportProps {
  return {
    sourceUri: props.sourceUri,
    format: props.format,
    appearance: {
      colorScheme: props.appearance?.colorScheme ?? 'system',
      fontScale: props.appearance?.fontScale ?? 1,
      lineHeight: props.appearance?.lineHeight ?? 1.5,
    },
    ...(props.initialLocation === undefined ? {} : { initialLocation: props.initialLocation }),
    ...(props.command === undefined ? {} : { command: props.command }),
    onError: async (event) => {
      await props.onError?.(event);
    },
    onOpenExternalLink: async (event) => {
      await props.onOpenExternalLink?.(event);
    },
    onStateChange: async (state) => {
      await props.onStateChange?.(state);
    },
  };
}

/*** Preserve callback identity so ReaderView state notifications do not remount its driver. */
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

/*** Preserve callback identity so ReaderView state notifications do not remount its driver. */
function useReaderCallbacks(props: ReaderViewProps) {
  const {
    onError: reportError,
    onOpenExternalLink: openExternalLink,
    onStateChange: reportState,
  } = props;
  const onError = React.useCallback<ReaderViewportProps['onError']>(
    async (event) => {
      await reportError?.(event);
    },
    [reportError],
  );
  const onOpenExternalLink = React.useCallback<ReaderViewportProps['onOpenExternalLink']>(
    async (event) => {
      await openExternalLink?.(event);
    },
    [openExternalLink],
  );
  const onStateChange = React.useCallback<ReaderViewportProps['onStateChange']>(
    async (state) => {
      await reportState?.(state);
    },
    [reportState],
  );
  return React.useMemo(
    () => ({ onError, onOpenExternalLink, onStateChange }),
    [onError, onOpenExternalLink, onStateChange],
  );
}
