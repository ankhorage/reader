import { describe, expect, test } from 'bun:test';

const PDF_FIXTURE = new TextEncoder().encode(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
186
%%EOF`);

describe('reader renderer package boundary', () => {
  test('provides the EPUB navigator and archive APIs required by the driver', async () => {
    const [{ EpubNavigator }, { Publication }, { BlobReader, ZipReader }] = await Promise.all([
      import('@readium/navigator'),
      import('@readium/shared'),
      import('@zip.js/zip.js'),
    ]);

    expect(EpubNavigator).toBeFunction();
    expect(Publication).toBeFunction();
    expect(BlobReader).toBeFunction();
    expect(ZipReader).toBeFunction();
  });

  test('provides the PDF loading, worker, and protected-document APIs through the worker-aware entrypoint', async () => {
    const { getDocument, PasswordException, PDFWorker } = await import('pdfjs-dist/webpack.mjs');

    expect(getDocument).toBeFunction();
    expect(PasswordException).toBeFunction();
    expect(PDFWorker).toBeFunction();
  });

  test('loads and releases a PDF through the worker-aware entrypoint', async () => {
    const { getDocument } = await import('pdfjs-dist/webpack.mjs');
    const loadingTask = getDocument({ data: PDF_FIXTURE, stopAtErrors: true });
    const document = await loadingTask.promise;

    expect(document.numPages).toBe(1);

    await loadingTask.destroy();
  });
});
