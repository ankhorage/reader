# Public API

## ReaderAppearance

Kind: `type`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:27:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| colorScheme | property | `"dark" \| "light" \| "sepia" \| "system"` | yes |  |
| fontScale | property | `number` | yes |  |
| lineHeight | property | `number` | yes |  |

## ReaderCommand

Kind: `type`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:33:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| id | property | `number` | yes |  |
| sourceUri | property | `string` | yes |  |
| type | property | `"next" \| "previous"` | yes |  |

## ReaderDocumentFormat

Kind: `unknown`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:3:1`

## ReaderErrorCode

Kind: `unknown`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:7:1`

## ReaderErrorEvent

Kind: `type`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:21:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| code | property | `ReaderErrorCode` | yes |  |
| format | property | `ReaderDocumentFormat` | no |  |
| message | property | `string` | yes |  |

## ReaderLocationChangeEvent

Kind: `type`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:10:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| chapterId | property | `string` | no |  |
| chapterTitle | property | `string` | no |  |
| format | property | `ReaderDocumentFormat` | yes |  |
| locator | property | `string` | yes |  |
| page | property | `number` | yes |  |
| pageCount | property | `number` | no |  |
| progression | property | `number` | yes |  |
| trigger | property | `ReaderNavigationTrigger` | yes |  |

## ReaderNavigationTrigger

Kind: `unknown`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:5:1`

## ReaderStatus

Kind: `unknown`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:4:1`

## ReaderView

Kind: `function`
Module: `src/features/reader/adapters/ReaderView.tsx`
Source: `src/features/reader/adapters/ReaderView.tsx:4:1`

Fail clearly when an entrypoint without web/native platform resolution is used.

### Signatures

- `(_props: ReaderViewProps) => never`
  - _props: `ReaderViewProps`
  - returns: `never`

## ReaderViewportState

Kind: `type`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:57:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| canGoNext | property | `boolean` | yes |  |
| canGoPrevious | property | `boolean` | yes |  |
| location | property | `ReaderLocationChangeEvent` | no |  |
| page | property | `number` | yes |  |
| pageCount | property | `number` | no |  |
| progress | property | `number` | yes |  |
| status | property | `"loading" \| "ready"` | yes |  |

## ReaderViewProps

Kind: `type`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:45:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| appearance | property | `Partial<ReaderAppearance>` | no |  |
| command | property | `ReaderCommand` | no |  |
| format | property | `ReaderDocumentFormat` | yes |  |
| initialLocation | property | `string` | no |  |
| onError | property | `(event: ReaderErrorEvent) => void \| Promise<void>` | no |  |
| onOpenExternalLink | property | `(event: { readonly url: string; }) => void \| Promise<void>` | no |  |
| onStateChange | property | `(state: ReaderViewportState) => void \| Promise<void>` | no |  |
| sourceUri | property | `string` | yes |  |
| style | property | `ReaderViewStyle` | no |  |

## ReaderViewStyle

Kind: `type`
Module: `src/types/reader.ts`
Source: `src/types/reader.ts:39:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| flex | property | `number` | no |  |
| height | property | `number \| `${number}%`` | no |  |
| width | property | `number \| `${number}%`` | no |  |
