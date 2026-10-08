import type { ReaderErrorCode } from '../../../types/reader.js';

export class ReaderDocumentError extends Error {
  constructor(
    readonly code: ReaderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReaderDocumentError';
  }
}
