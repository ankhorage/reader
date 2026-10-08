import type { ReaderViewProps } from '../../../types/reader.js';

/*** Fail clearly when an entrypoint without web/native platform resolution is used. */
export function ReaderView(_props: ReaderViewProps): never {
  throw new Error(
    '@ankhorage/reader ReaderView requires the browser or react-native package export condition.',
  );
}
