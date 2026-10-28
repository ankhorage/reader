import { appendFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const diagnosticsDirectory = await mkdtemp(join(tmpdir(), 'reader-browser-acceptance-'));
const checkpointFile = join(diagnosticsDirectory, 'checkpoints.jsonl');
const stdoutFile = join(diagnosticsDirectory, 'stdout.log');
const stderrFile = join(diagnosticsDirectory, 'stderr.log');
const environment = { ...process.env, READER_BROWSER_CHECKPOINT_FILE: checkpointFile };
const testProcess = Bun.spawn(
  ['bun', 'test', 'test/browser/packedReaderSmoke.test.ts', ...process.argv.slice(2)],
  {
    cwd: import.meta.dir + '/../..',
    env: environment,
    stderr: 'pipe',
    stdout: 'pipe',
  },
);
const watchdog = setTimeout(() => {
  void checkpoint('process-watchdog-expired');
  testProcess.kill('SIGTERM');
}, 120_000);

try {
  await checkpoint('browser-test-runner-started');
  const [exitCode, stdout, stderr] = await Promise.all([
    testProcess.exited,
    new Response(testProcess.stdout).text(),
    new Response(testProcess.stderr).text(),
  ]);
  await Promise.all([writeFile(stdoutFile, stdout), writeFile(stderrFile, stderr)]);
  await checkpoint('bun-test-runner-exited');
  if (exitCode !== 0)
    throw new Error(`Browser acceptance failed. Diagnostics: ${diagnosticsDirectory}`);
} finally {
  clearTimeout(watchdog);
}

console.log(`Browser acceptance diagnostics: ${diagnosticsDirectory}`);

async function checkpoint(stage: string): Promise<void> {
  await appendFile(
    checkpointFile,
    `${JSON.stringify({ stage, timestamp: new Date().toISOString() })}\n`,
  );
}
