import type { DOMProps } from 'expo/dom';

export type ReaderDocumentFormat = 'epub' | 'pdf';
export type ReaderStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ReaderNavigationTrigger =
  | 'swipe'
  | 'previousControl'
  | 'nextControl'
  | 'keyboard'
  | 'location';
export type ReaderErrorCode =
  | 'invalid-document'
  | 'load-failed'
  | 'protected-document'
  | 'unsupported-format';

export interface ReaderLocationChangeEvent {
  readonly format: ReaderDocumentFormat;
  readonly locator: string;
  readonly page: number;
  readonly pageCount?: number;
  readonly progression: number;
  readonly chapterId?: string;
  readonly chapterTitle?: string;
  readonly trigger: ReaderNavigationTrigger;
}

export interface ReaderErrorEvent {
  readonly code: ReaderErrorCode;
  readonly format?: ReaderDocumentFormat;
  readonly message: string;
}

export interface ReaderAppearance {
  readonly colorScheme: 'dark' | 'light' | 'sepia' | 'system';
  readonly fontScale: number;
  readonly lineHeight: number;
}

export interface ReaderCommand {
  readonly id: number;
  readonly sourceUri: string;
  readonly type: 'next' | 'previous';
}

export interface ReaderViewStyle {
  readonly width?: number | `${number}%`;
  readonly height?: number | `${number}%`;
  readonly flex?: number;
}

export interface ReaderViewProps {
  readonly sourceUri: string;
  readonly format: ReaderDocumentFormat;
  readonly appearance?: Partial<ReaderAppearance>;
  readonly initialLocation?: string;
  readonly command?: ReaderCommand;
  readonly style?: ReaderViewStyle;
  readonly onStateChange?: (state: ReaderViewportState) => void | Promise<void>;
  readonly onError?: (event: ReaderErrorEvent) => void | Promise<void>;
  readonly onOpenExternalLink?: (event: { readonly url: string }) => void | Promise<void>;
}

export interface ReaderViewportState {
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  readonly location?: ReaderLocationChangeEvent;
  readonly page: number;
  readonly pageCount?: number;
  readonly progress: number;
  readonly status: 'loading' | 'ready';
}

export interface ReaderViewportProps {
  readonly appearance: ReaderAppearance;
  readonly command?: ReaderCommand;
  readonly format: ReaderDocumentFormat;
  readonly initialLocation?: string;
  readonly onError: (event: ReaderErrorEvent) => Promise<void>;
  readonly onOpenExternalLink: (event: { readonly url: string }) => Promise<void>;
  readonly onStateChange: (state: ReaderViewportState) => Promise<void>;
  readonly sourceUri: string;
  readonly dom?: DOMProps;
}

export interface ReaderDriverState {
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  readonly chapterId?: string;
  readonly chapterTitle?: string;
  readonly locator: string;
  readonly page: number;
  readonly pageCount?: number;
  readonly progression: number;
}

export interface ReaderDriver {
  readonly direction: 'ltr' | 'rtl';
  destroy(): Promise<void>;
  getState(): ReaderDriverState;
  goNext(trigger: ReaderLocationChangeEvent['trigger']): Promise<void>;
  goPrevious(trigger: ReaderLocationChangeEvent['trigger']): Promise<void>;
}

export interface ReaderTouchStart {
  readonly interactive: boolean;
  readonly x: number;
  readonly y: number;
}
