import { chromium } from '@playwright/test';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { expect, test } from 'bun:test';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, createServer } from 'vite';

test('loads the packed browser entrypoint through a standalone Vite consumer', async () => {
  const directory = await mkdtemp('/private/tmp/reader-browser-consumer-');
  const consumerPath = join(directory, 'consumer');
  const temporaryDirectory = join(directory, '.tmp');
  await mkdir(temporaryDirectory);
  const environment = {
    ...process.env,
    BUN_INSTALL_CACHE_DIR: join(directory, '.bun-cache'),
    TMPDIR: temporaryDirectory,
    npm_config_cache: join(directory, '.npm'),
  };
  const packed = Bun.spawnSync(
    ['npm', 'pack', '--ignore-scripts', '--pack-destination', directory],
    {
      env: environment,
    },
  );
  expect(packed.exitCode).toBe(0);

  const archive = new TextDecoder().decode(packed.stdout).trim();
  await mkdir(consumerPath);
  await mkdir(join(consumerPath, 'src'));
  await writeFile(
    join(consumerPath, 'index.html'),
    '<!doctype html><html><head><style>html, body, #root { height: 100%; margin: 0; }</style></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  );
  await writeFile(
    join(consumerPath, 'src', 'main.tsx'),
    "import React from 'react'; import { createRoot } from 'react-dom/client'; import { ReaderView } from '@ankhorage/reader'; createRoot(document.querySelector('#root')).render(React.createElement(ReaderView, { format: 'epub', sourceUri: '/missing.epub', onError: (error) => document.body.dataset.error = error.message }));",
  );
  await writeFile(
    join(consumerPath, 'package.json'),
    JSON.stringify({
      name: 'reader-browser-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@ankhorage/reader': join(directory, archive),
        react: '19.2.3',
        'react-dom': '19.2.3',
        vite: '7.2.2',
      },
    }),
  );
  const installed = Bun.spawnSync(['bun', 'install'], { cwd: consumerPath, env: environment });
  if (installed.exitCode !== 0) throw new Error(new TextDecoder().decode(installed.stderr));
  await Promise.all([
    access(join(consumerPath, 'index.html')),
    access(join(consumerPath, 'src', 'main.tsx')),
    access(join(consumerPath, 'package.json')),
    access(join(consumerPath, 'node_modules', '@ankhorage', 'reader', 'dist', 'index.web.js')),
  ]);
  await build({
    build: { emptyOutDir: true, outDir: 'dist' },
    configFile: false,
    logLevel: 'error',
    root: consumerPath,
  });
  const server = await createServer({
    appType: 'mpa',
    configFile: false,
    root: consumerPath,
    logLevel: 'error',
    server: { fs: { allow: [consumerPath] } },
  });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => failedRequests.push(request.url()));
    await page.goto(server.resolvedUrls?.local[0] ?? 'http://localhost:5173', {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => document.body.dataset.error !== undefined);
    expect(await page.locator('body').getAttribute('data-error')).toContain(
      'Reader source request failed',
    );
    expect(failedRequests).not.toContain(`${server.resolvedUrls?.local[0]}src/main.tsx`);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([
      'Failed to load resource: the server responded with a status of 404 (Not Found)',
    ]);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { force: true, recursive: true });
  }
}, 30_000);

test('keeps a packed EPUB reader mounted when inline callbacks update its parent', async () => {
  const directory = await mkdtemp('/private/tmp/reader-browser-epub-');
  const consumerPath = join(directory, 'consumer');
  const temporaryDirectory = join(directory, '.tmp');
  await mkdir(temporaryDirectory);
  const environment = {
    ...process.env,
    BUN_INSTALL_CACHE_DIR: join(directory, '.bun-cache'),
    TMPDIR: temporaryDirectory,
    npm_config_cache: join(directory, '.npm'),
  };
  const packed = Bun.spawnSync(
    ['npm', 'pack', '--ignore-scripts', '--pack-destination', directory],
    {
      env: environment,
    },
  );
  expect(packed.exitCode).toBe(0);
  const archive = new TextDecoder().decode(packed.stdout).trim();
  await mkdir(consumerPath);
  await mkdir(join(consumerPath, 'src'));
  await writeFile(
    join(consumerPath, 'index.html'),
    '<!doctype html><html><head><style>html, body, #root { height: 100%; margin: 0; }</style></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  );
  await writeFile(join(consumerPath, 'book.epub'), await createMinimalEpub());
  await writeFile(
    join(consumerPath, 'src', 'main.tsx'),
    `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReaderView } from '@ankhorage/reader';
function Consumer() {
  const [renders, setRenders] = useState(0);
  const [command, setCommand] = useState();
  window.readerNext = () => { document.body.dataset.command = 'sent'; setCommand({ id: 1, sourceUri: '/book.epub', type: 'next' }); };
  return React.createElement(ReaderView, {
    command,
    format: 'epub',
    sourceUri: '/book.epub',
    onError: (error) => { document.body.dataset.error = error.message; },
    onStateChange: (state) => {
      document.body.dataset.states = JSON.stringify([...(JSON.parse(document.body.dataset.states || '[]')), state]);
      document.body.dataset.status = state.status;
      setRenders((value) => value + 1);
    },
  });
}
createRoot(document.querySelector('#root')).render(React.createElement(Consumer));`,
  );
  await writeFile(
    join(consumerPath, 'package.json'),
    JSON.stringify({
      name: 'reader-browser-epub-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@ankhorage/reader': join(directory, archive),
        react: '19.2.3',
        'react-dom': '19.2.3',
        vite: '7.2.2',
      },
    }),
  );
  const installed = Bun.spawnSync(['bun', 'install'], { cwd: consumerPath, env: environment });
  if (installed.exitCode !== 0) throw new Error(new TextDecoder().decode(installed.stderr));
  await build({
    build: { emptyOutDir: true, outDir: 'dist' },
    configFile: false,
    logLevel: 'error',
    root: consumerPath,
  });
  const server = await createServer({
    appType: 'mpa',
    configFile: false,
    logLevel: 'error',
    root: consumerPath,
    server: { fs: { allow: [consumerPath] } },
  });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(server.resolvedUrls?.local[0] ?? 'http://localhost:5173', {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => document.body.dataset.status === 'ready');
    await page.evaluate(() => window.readerNext());
    await page.waitForFunction(() =>
      JSON.parse(document.body.dataset.states || '[]').some(
        (state) => state.location?.trigger === 'nextControl',
      ),
    );
    const states = JSON.parse((await page.locator('body').getAttribute('data-states')) ?? '[]');
    expect(states.filter((state: { status: string }) => state.status === 'loading')).toHaveLength(
      1,
    );
    expect(
      states.some(
        (state: { location?: { chapterId?: string } }) =>
          state.location?.chapterId === 'OPS/one.xhtml',
      ),
    ).toBe(true);
    expect(
      states.some(
        (state: { location?: { trigger?: string } }) => state.location?.trigger === 'nextControl',
      ),
    ).toBe(true);
    expect(await page.locator('iframe').count()).toBeGreaterThan(0);
    expect(await page.locator('body').getAttribute('data-error')).toBeNull();
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { force: true, recursive: true });
  }
}, 30_000);

async function createMinimalEpub(): Promise<Uint8Array> {
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
        '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Navigation</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol><li><a href="one.xhtml">One</a></li><li><a href="two.xhtml">Two</a></li></ol></nav></body></html>',
      ),
    ),
    writer.add(
      'OPS/one.xhtml',
      new TextReader(
        '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><title>One</title></head><body><h1>One</h1><p>First chapter.</p></body></html>',
      ),
    ),
    writer.add(
      'OPS/two.xhtml',
      new TextReader(
        '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8" /><title>Two</title></head><body><h1>Two</h1><p>Second chapter.</p></body></html>',
      ),
    ),
  ]);
  return writer.close();
}
