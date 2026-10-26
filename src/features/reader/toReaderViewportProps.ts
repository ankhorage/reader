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
