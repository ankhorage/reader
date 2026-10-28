import { chromium, type Browser, type Frame, type Page } from '@playwright/test';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { expect, test } from 'bun:test';
import { access, appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview, type PreviewServer } from 'vite';

const GUTENBERG_ALICE_URL = 'https://www.gutenberg.org/ebooks/11.epub.images';
const TEST_TIMEOUT = 45_000;
const CHECKPOINT_FILE = process.env.READER_BROWSER_CHECKPOINT_FILE;

test(
  'loads the packed browser entrypoint through a standalone Vite consumer',
  async () => {
    await withPackedConsumer(async ({ start, writeEntry }) => {
      await writeEntry(readerEntry('/missing.epub', 'epub'));
      const { page, serverUrl } = await start();
      await page.goto(serverUrl, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.body.dataset.error !== undefined);
      expect(await page.locator('body').getAttribute('data-error')).toContain(
        'Reader source request failed',
      );
    });
  },
  TEST_TIMEOUT,
);

for (const strictMode of [false, true]) {
  test(
    `keeps a packed EPUB reader stable across parent rerenders and cleans up switched sources (${strictMode ? 'StrictMode' : 'normal mode'})`,
    async () => {
      await withPackedConsumer(async ({ consumerPath, start, writeEntry }) => {
        await writeFile(
          join(consumerPath, 'public', 'first.epub'),
          await createMinimalEpub('First'),
        );
        await writeFile(
          join(consumerPath, 'public', 'second.epub'),
          await createMinimalEpub('Second'),
        );
        await writeEntry(`import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReaderView } from '@ankhorage/reader';
${navigatorMetricsInstrumentation()}
const root = createRoot(document.querySelector('#root'));
function Consumer() {
  const [command, setCommand] = useState();
  const [sourceUri, setSourceUri] = useState('/first.epub');
  const [rerenders, setRerenders] = useState(0);
  window.readerNext = () => setCommand({ id: 1, sourceUri, type: 'next' });
  window.readerPrevious = () => setCommand({ id: 2, sourceUri, type: 'previous' });
  window.readerRerender = () => setRerenders((value) => value + 1);
  window.readerSwitch = () => setSourceUri('/second.epub');
  window.readerUnmount = () => root.unmount();
  document.body.dataset.rerenders = String(rerenders);
  return React.createElement(ReaderView, {
    command,
    format: 'epub',
    sourceUri,
    onError: (error) => { document.body.dataset.error = error.message; },
    onStateChange: (state) => {
      document.body.dataset.states = JSON.stringify([...(JSON.parse(document.body.dataset.states || '[]')), state]);
      document.body.dataset.status = state.status;
    },
  });
}
root.render(${strictMode ? 'React.createElement(StrictMode, null, React.createElement(Consumer))' : 'React.createElement(Consumer)'});`);
        const { diagnostics, page, serverUrl } = await start();
        await page.goto(serverUrl, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.body.dataset.status === 'ready', {
          timeout: 20_000,
        });
        const firstChapterFrame = await waitForFrameText(page, 'First chapter.', diagnostics);
        expect(await firstChapterFrame.locator('body').innerText()).toContain('First chapter.');
        await captureFrameDiagnostics(page, diagnostics);
        expect((await page.screenshot()).byteLength).toBeGreaterThan(0);
        const loadingCount = await page
          .locator('body')
          .evaluate(
            (body) =>
              JSON.parse(body.dataset.states || '[]').filter(
                (state: { status?: string }) => state.status === 'loading',
              ).length,
          );
        await page.evaluate(() => window.readerRerender());
        await page.evaluate(() => window.readerRerender());
        await page.evaluate(() => window.readerRerender());
        await page.waitForFunction(() => document.body.dataset.rerenders === '3');
        expect(
          await page
            .locator('body')
            .evaluate(
              (body) =>
                JSON.parse(body.dataset.states || '[]').filter(
                  (state: { status?: string }) => state.status === 'loading',
                ).length,
            ),
        ).toBe(loadingCount);
        await page.evaluate(() => window.readerNext());
        await waitForFrameText(page, 'Second chapter.', diagnostics);
        await waitForTrigger(page, 'nextControl');
        await page.evaluate(() => window.readerPrevious());
        await waitForFrameText(page, 'First chapter.', diagnostics);
        await waitForTrigger(page, 'previousControl');
        await page.evaluate(() => window.readerSwitch());
        await waitForFrameText(page, 'Second volume opening.', diagnostics);
        expect(await page.locator('body').getAttribute('data-error')).toBeNull();
        await page.evaluate(() => window.readerUnmount());
        await page.waitForFunction(() => document.querySelectorAll('iframe').length === 0);
        await page.waitForFunction(
          () => window.readerNavigatorMetrics.destroys === window.readerNavigatorMetrics.loads,
        );
      });
    },
    TEST_TIMEOUT,
  );
}

test(
  'renders a separately obtained rights-cleared EPUB in the packed consumer',
  async () => {
    await withPackedConsumer(async ({ consumerPath, start, writeEntry }) => {
      await writeFile(
        join(consumerPath, 'public', 'alice.epub'),
        await downloadRightsClearedEpub(),
      );
      await writeEntry(readerEntry('/alice.epub', 'epub'));
      const { diagnostics, page, serverUrl } = await start();
      await page.goto(serverUrl, { waitUntil: 'networkidle' });
      const frame = await waitForFramePattern(page, /Project Gutenberg|Alice/i, diagnostics);
      expect(await frame.locator('body').innerText()).toMatch(/Project Gutenberg|Alice/i);
      expect(await page.locator('body').getAttribute('data-error')).toBeNull();
    });
  },
  TEST_TIMEOUT,
);

test(
  'renders the first page of a packed PDF consumer',
  async () => {
    await withPackedConsumer(async ({ consumerPath, start, writeEntry }) => {
      await writeFile(join(consumerPath, 'public', 'book.pdf'), createMinimalPdf());
      await writeEntry(pdfReaderEntry());
      const { diagnostics, page, serverUrl } = await start();
      const pdfResponse = page.waitForResponse((response) => response.url().endsWith('/book.pdf'));
      await page.goto(serverUrl, { waitUntil: 'networkidle' });
      await pdfResponse;
      await checkpoint('pdf-source-fetched');
      await waitForReaderReady(page, diagnostics);
      await checkpoint('pdf-reader-ready');
      await waitForPdfRender(page, diagnostics);
      await checkpoint('pdf-canvas-drawn');
      await expectPdfPage(page, 1, 2, 0);
      await checkpoint('pdf-first-page-assertions-completed');
      expect(await page.locator('body').getAttribute('data-error')).toBeNull();
    });
  },
  TEST_TIMEOUT,
);

test(
  'navigates next and previous pages in a packed PDF consumer',
  async () => {
    await withPackedConsumer(async ({ consumerPath, start, writeEntry }) => {
      await writeFile(join(consumerPath, 'public', 'book.pdf'), createMinimalPdf());
      await writeEntry(pdfReaderEntry());
      const { diagnostics, page, serverUrl } = await start();
      await page.goto(serverUrl, { waitUntil: 'networkidle' });
      await waitForReaderReady(page, diagnostics);
      await waitForPdfRender(page, diagnostics);
      await page.evaluate(() => window.readerNext());
      await checkpoint('pdf-next-command-dispatched');
      await waitForPdfPage(page, diagnostics, 'Second PDF page');
      await waitForTrigger(page, 'nextControl');
      await expectPdfPage(page, 2, 2, 1);
      await checkpoint('pdf-second-page-verified');
      await page.evaluate(() => window.readerPrevious());
      await waitForPdfPage(page, diagnostics, 'First PDF page');
      await waitForTrigger(page, 'previousControl');
      await expectPdfPage(page, 1, 2, 0);
      await checkpoint('pdf-previous-page-verified');
    });
  },
  TEST_TIMEOUT,
);

test(
  'cleans up a packed PDF consumer after source switching and unmount',
  async () => {
    await withPackedConsumer(async ({ consumerPath, start, writeEntry }) => {
      await writeFile(join(consumerPath, 'public', 'book.pdf'), createMinimalPdf());
      await writeFile(join(consumerPath, 'public', 'second.pdf'), createMinimalPdf());
      await writeEntry(pdfReaderEntry());
      const { diagnostics, page, serverUrl } = await start();
      await page.goto(serverUrl, { waitUntil: 'networkidle' });
      await waitForReaderReady(page, diagnostics);
      await waitForPdfRender(page, diagnostics);
      await page.evaluate(() => window.readerSwitch());
      await waitForReaderReady(page, diagnostics);
      await waitForPdfRender(page, diagnostics);
      await page.evaluate(() => window.readerUnmount());
      await checkpoint('pdf-reader-unmounted');
      await page.waitForFunction(() => document.querySelector('.reader-pdf-page') === null);
      await checkpoint('pdf-driver-resources-cleaned');
    });
  },
  TEST_TIMEOUT,
);

interface PackedConsumer {
  readonly consumerPath: string;
  readonly start: () => Promise<StartedConsumer>;
  readonly writeEntry: (source: string) => Promise<void>;
}

interface StartedConsumer {
  readonly diagnostics: BrowserDiagnostics;
  readonly page: Page;
  readonly serverUrl: string;
}

interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly frameEvents: string[];
  readonly networkErrors: string[];
  readonly pageErrors: string[];
}

async function withPackedConsumer(run: (consumer: PackedConsumer) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'reader-browser-consumer-'));
  let browser: Browser | undefined;
  let server: PreviewServer | undefined;
  try {
    const consumerPath = join(directory, 'consumer');
    await mkdir(join(consumerPath, 'src'), { recursive: true });
    await mkdir(join(consumerPath, 'public'));
    await writeFile(join(consumerPath, 'index.html'), consumerHtml());
    const archive = await packReader(directory);
    await writeFile(join(consumerPath, 'package.json'), consumerPackage(directory, archive));
    const installed = Bun.spawnSync(['bun', 'install'], {
      cwd: consumerPath,
      env: consumerEnvironment(directory),
    });
    if (installed.exitCode !== 0) throw new Error(new TextDecoder().decode(installed.stderr));
    await checkpoint('packed-package-installed');
    const writeEntry = async (source: string) =>
      writeFile(join(consumerPath, 'src', 'main.tsx'), source);
    const start = async () => {
      await access(join(consumerPath, 'src', 'main.tsx'));
      const built = Bun.spawnSync(['bunx', 'vite', 'build'], {
        cwd: consumerPath,
        env: consumerEnvironment(directory),
      });
      if (built.exitCode !== 0) throw new Error(new TextDecoder().decode(built.stderr));
      await checkpoint('vite-production-build-finished');
      await access(join(consumerPath, 'src', 'main.tsx'));
      const outputPath = join(consumerPath, 'dist');
      await access(join(outputPath, 'index.html'));
      server = await preview({
        appType: 'mpa',
        configFile: false,
        logLevel: 'error',
        root: consumerPath,
      });
      await checkpoint('vite-server-listening');
      browser = await chromium.launch(browserLaunchOptions());
      await checkpoint('chromium-launched');
      const page = await browser.newPage({ viewport: { height: 640, width: 960 } });
      const diagnostics = observeBrowser(page);
      return {
        diagnostics,
        page,
        serverUrl: server.resolvedUrls?.local[0] ?? 'http://localhost:5173',
      };
    };
    await run({
      consumerPath,
      start,
      writeEntry,
    });
    await checkpoint('bun-test-callback-returned');
  } finally {
    await browser?.close();
    await checkpoint('browser-closed');
    await server?.close();
    await checkpoint('vite-server-closed');
    await rm(directory, { force: true, recursive: true });
    await checkpoint('temporary-directory-removed');
  }
}

async function packReader(directory: string): Promise<string> {
  const packed = Bun.spawnSync(
    ['npm', 'pack', '--ignore-scripts', '--pack-destination', directory],
    {
      env: consumerEnvironment(directory),
    },
  );
  expect(packed.exitCode).toBe(0);
  return new TextDecoder().decode(packed.stdout).trim();
}

function consumerEnvironment(directory: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BUN_INSTALL_CACHE_DIR: join(directory, '.bun-cache'),
    TMPDIR: join(directory, '.tmp'),
    npm_config_cache: join(directory, '.npm'),
  };
}

function consumerHtml(): string {
  return '<!doctype html><html><head><style>html, body, #root { height: 100%; margin: 0; }</style></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
}

function consumerPackage(directory: string, archive: string): string {
  return JSON.stringify({
    name: 'reader-browser-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@ankhorage/reader': join(directory, archive),
      react: '19.2.3',
      'react-dom': '19.2.3',
      vite: '7.2.2',
    },
  });
}

function readerEntry(sourceUri: string, format: 'epub' | 'pdf'): string {
  return `import React from 'react'; import { createRoot } from 'react-dom/client'; import { ReaderView } from '@ankhorage/reader'; ${format === 'epub' ? navigatorMetricsInstrumentation() : ''} createRoot(document.querySelector('#root')).render(React.createElement(ReaderView, { format: '${format}', sourceUri: '${sourceUri}', onError: (error) => { document.body.dataset.error = error.message; } }));`;
}

function pdfReaderEntry(): string {
  return `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReaderView } from '@ankhorage/reader';
const root = createRoot(document.querySelector('#root'));
function Consumer() {
  const [command, setCommand] = useState();
  const [sourceUri, setSourceUri] = useState('/book.pdf');
  window.readerNext = () => setCommand({ id: 1, sourceUri, type: 'next' });
  window.readerPrevious = () => setCommand({ id: 2, sourceUri, type: 'previous' });
  window.readerSwitch = () => setSourceUri('/second.pdf');
  window.readerUnmount = () => root.unmount();
  return React.createElement(ReaderView, {
    command, format: 'pdf', sourceUri,
    onError: (error) => { document.body.dataset.error = error.message; },
    onStateChange: (state) => {
      document.body.dataset.states = JSON.stringify([...(JSON.parse(document.body.dataset.states || '[]')), state]);
      document.body.dataset.status = state.status;
    },
  });
}
root.render(React.createElement(Consumer));`;
}

function browserLaunchOptions(): Parameters<typeof chromium.launch>[0] {
  return process.env.CI === 'true' ? { chromiumSandbox: false } : {};
}

function navigatorMetricsInstrumentation(): string {
  return `import { EpubNavigator } from '@readium/navigator';
window.readerNavigatorMetrics = { constructions: 0, destroys: 0, loads: 0 };
const originalLoad = EpubNavigator.prototype.load;
EpubNavigator.prototype.load = async function(...args) {
  window.readerNavigatorMetrics.constructions += 1;
  window.readerNavigatorMetrics.loads += 1;
  return originalLoad.apply(this, args);
};
const originalDestroy = EpubNavigator.prototype.destroy;
EpubNavigator.prototype.destroy = async function(...args) {
  window.readerNavigatorMetrics.destroys += 1;
  return originalDestroy.apply(this, args);
};`;
}

async function waitForFrameText(
  page: Page,
  text: string,
  diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    frameEvents: [],
    networkErrors: [],
    pageErrors: [],
  },
): Promise<Frame> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const frameText = await Promise.all(
      page
        .frames()
        .slice(1)
        .map(async (frame) => ({
          frame,
          text: await frame
            .locator('body')
            .textContent({ timeout: 250 })
            .catch(() => ''),
        })),
    );
    const chapterFrame = frameText.find((entry) => entry.text?.includes(text));
    if (chapterFrame) return chapterFrame.frame;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `The Readium iframe did not render ${text}. ${JSON.stringify(await captureFrameDiagnostics(page, diagnostics))}`,
  );
}

async function waitForFramePattern(
  page: Page,
  pattern: RegExp,
  diagnostics: BrowserDiagnostics,
): Promise<Frame> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const frames = page.frames().slice(1);
    const matchingFrame = await Promise.any(
      frames.map(async (frame) => {
        const text = await frame.locator('body').innerText({ timeout: 250 });
        if (!pattern.test(text)) throw new Error('Frame does not contain the expected text.');
        return frame;
      }),
    ).catch(() => undefined);
    if (matchingFrame) return matchingFrame;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `The Readium iframe did not render ${pattern}. ${JSON.stringify(await captureFrameDiagnostics(page, diagnostics))}`,
  );
}

function observeBrowser(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    frameEvents: [],
    networkErrors: [],
    pageErrors: [],
    pdfEvents: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('frameattached', (frame) => diagnostics.frameEvents.push(`attached ${frame.url()}`));
  page.on('framedetached', (frame) => diagnostics.frameEvents.push(`detached ${frame.url()}`));
  page.on('framenavigated', (frame) => diagnostics.frameEvents.push(`navigated ${frame.url()}`));
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => diagnostics.networkErrors.push(request.url()));
  return diagnostics;
}

async function captureFrameDiagnostics(
  page: Page,
  diagnostics: BrowserDiagnostics,
): Promise<unknown> {
  const frames = await Promise.all(
    page.frames().map(async (frame) => ({
      parentUrl: frame.parentFrame()?.url(),
      text: await frame
        .locator('body')
        .textContent({ timeout: 250 })
        .catch(() => undefined),
      url: frame.url(),
    })),
  );
  const iframes = await page.locator('iframe').evaluateAll((elements) =>
    elements.map((element) => {
      const frame = element as HTMLIFrameElement;
      const style = getComputedStyle(frame);
      const bounds = frame.getBoundingClientRect();
      return {
        attributes: Object.fromEntries(
          [...frame.attributes].map(({ name, value }) => [name, value]),
        ),
        connected: frame.isConnected,
        height: bounds.height,
        visibility: {
          display: style.display,
          opacity: style.opacity,
          visibility: style.visibility,
        },
        width: bounds.width,
      };
    }),
  );
  return {
    ...diagnostics,
    frames,
    iframes,
    navigatorMetrics: await page.evaluate(() => window.readerNavigatorMetrics),
    readerViewport: await page.locator('[aria-label="Reader viewport"]').evaluate((element) => ({
      html: element.innerHTML,
      visibility: getComputedStyle(element).visibility,
    })),
  };
}

async function waitForPdfRender(page: Page, diagnostics: BrowserDiagnostics): Promise<void> {
  const locator = page.locator('.reader-pdf-page');
  try {
    await locator.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    throw new Error(
      `The PDF text layer did not become visible. ${JSON.stringify(await captureFrameDiagnostics(page, diagnostics))}`,
    );
  }
  expect(await locator.locator('canvas').boundingBox()).not.toBeNull();
}

async function waitForReaderReady(page: Page, diagnostics: BrowserDiagnostics): Promise<void> {
  try {
    await page.waitForFunction(() => document.body.dataset.status === 'ready', { timeout: 20_000 });
  } catch {
    throw new Error(
      `The reader did not become ready. ${JSON.stringify(await captureFrameDiagnostics(page, diagnostics))}`,
    );
  }
}

async function waitForPdfPage(
  page: Page,
  diagnostics: BrowserDiagnostics,
  text: string,
): Promise<void> {
  await waitForPdfRender(page, diagnostics);
  await page.waitForFunction(
    (expectedText) =>
      [...document.querySelectorAll('.reader-pdf-text-layer')].some((element) =>
        element.textContent?.includes(expectedText),
      ),
    text,
  );
}

async function expectPdfPage(
  page: Page,
  expectedPage: number,
  expectedPageCount: number,
  expectedProgression: number,
): Promise<void> {
  const state = await page.locator('body').evaluate((body) => {
    const states = JSON.parse(body.dataset.states || '[]') as Array<{
      location?: { page?: number; pageCount?: number; progression?: number };
    }>;
    return states.at(-1);
  });
  expect(state?.location?.page).toBe(expectedPage);
  expect(state?.location?.pageCount).toBe(expectedPageCount);
  expect(state?.location?.progression).toBe(expectedProgression);
}

async function checkpoint(stage: string): Promise<void> {
  if (CHECKPOINT_FILE === undefined) return;
  await appendFile(
    CHECKPOINT_FILE,
    `${JSON.stringify({ stage, timestamp: new Date().toISOString() })}\n`,
  );
}

async function waitForTrigger(page: Page, trigger: string): Promise<void> {
  await page.waitForFunction(
    (expectedTrigger) =>
      JSON.parse(document.body.dataset.states || '[]').some(
        (state: { location?: { trigger?: string } }) => state.location?.trigger === expectedTrigger,
      ),
    trigger,
  );
}

async function downloadRightsClearedEpub(): Promise<Uint8Array> {
  const response = await fetch(GUTENBERG_ALICE_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok)
    throw new Error(`Could not download the rights-cleared EPUB: ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 10_000_000)
    throw new Error('Unexpected rights-cleared EPUB size.');
  return bytes;
}

async function createMinimalEpub(label: string): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter());
  await Promise.all([
    writer.add('mimetype', new TextReader('application/epub+zip')),
    writer.add(
      'META-INF/container.xml',
      new TextReader(
        '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/package.opf" /></rootfiles></container>',
      ),
    ),
    writer.add(
      'OPS/package.opf',
      new TextReader(
        '<?xml version="1.0"?><package version="3.0" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" /><item id="one" href="one.xhtml" media-type="application/xhtml+xml" /><item id="two" href="two.xhtml" media-type="application/xhtml+xml" /></manifest><spine><itemref idref="one" /><itemref idref="two" /></spine></package>',
      ),
    ),
    writer.add(
      'OPS/nav.xhtml',
      new TextReader(
        '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol><li><a href="one.xhtml">One</a></li><li><a href="two.xhtml">Two</a></li></ol></nav></body></html>',
      ),
    ),
    writer.add(
      'OPS/one.xhtml',
      new TextReader(
        `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><title>One</title></head><body><h1>${label === 'Second' ? 'Second volume opening.' : 'First chapter.'}</h1></body></html>`,
      ),
    ),
    writer.add(
      'OPS/two.xhtml',
      new TextReader(
        '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><title>Two</title></head><body><h1>Second chapter.</h1></body></html>',
      ),
    ),
  ]);
  return writer.close();
}

function createMinimalPdf(): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    pdfStream('BT /F1 24 Tf 72 720 Td (First PDF page) Tj ET'),
    pdfStream('BT /F1 24 Tf 72 720 Td (Second PDF page) Tj ET'),
  ];
  const header = '%PDF-1.4\n';
  const body = objects.reduce(
    (source, object, index) => `${source}${index + 1} 0 obj\n${object}\nendobj\n`,
    '',
  );
  const offsets = objects.reduce<number[]>(
    (positions, _object, index) =>
      positions.concat(
        new TextEncoder().encode(`${header}${bodyBefore(objects, index)}`).byteLength,
      ),
    [],
  );
  const start = new TextEncoder().encode(`${header}${body}`).byteLength;
  return new TextEncoder().encode(
    `${header}${body}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`,
  );
}

function bodyBefore(objects: string[], end: number): string {
  return objects
    .slice(0, end)
    .reduce((source, object, index) => `${source}${index + 1} 0 obj\n${object}\nendobj\n`, '');
}

function pdfStream(content: string): string {
  return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
}
