import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../bin/create-cab.js';

const execFileAsync = promisify(execFile);
function capture() {
  let value = '';
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

test('--help prints usage without installing', async () => {
  const stdout = capture();
  const stderr = capture();
  let called = false;
  const code = await run(['--help'], { installImpl: async () => { called = true; }, stdout: stdout.stream, stderr: stderr.stream });
  assert.equal(code, 0);
  assert.match(stdout.value(), /Usage: create-cab/);
  assert.equal(stderr.value(), '');
  assert.equal(called, false);
});

test('defaults to cwd and prints the installation summary', async () => {
  const stdout = capture();
  const stderr = capture();
  let received;
  const targetDirectory = resolve('/work');
  const code = await run([], {
    cwd: '/work',
    installImpl: async (options) => { received = options; return { count: 4, targetDirectory }; },
    stdout: stdout.stream,
    stderr: stderr.stream
  });
  assert.equal(code, 0);
  assert.deepEqual(received, { targetDirectory, force: false });
  assert.equal(stdout.value(), `Installed 4 CAB files in ${targetDirectory}\n`);
  assert.equal(stderr.value(), '');
});

test('resolves explicit target and forwards --force', async () => {
  const stdout = capture();
  const stderr = capture();
  let received;
  const targetDirectory = resolve('/work', 'projects/app');
  const code = await run(['projects/app', '--force'], {
    cwd: '/work',
    installImpl: async (options) => { received = options; return { count: 4, targetDirectory }; },
    stdout: stdout.stream,
    stderr: stderr.stream
  });
  assert.equal(code, 0);
  assert.deepEqual(received, { targetDirectory, force: true });
  assert.equal(stderr.value(), '');
});

test('rejects unknown flags and extra directories', async (t) => {
  for (const [argv, message] of [[['--unknown'], 'Unknown option: --unknown'], [['one', 'two'], 'Only one directory may be provided']]) {
    await t.test(message, async () => {
      const stdout = capture();
      const stderr = capture();
      const code = await run(argv, { stdout: stdout.stream, stderr: stderr.stream });
      assert.equal(code, 1);
      assert.equal(stdout.value(), '');
      assert.match(stderr.value(), new RegExp(message.replaceAll('-', '\\-')));
    });
  }
});

test('prints an operational error without a stack trace', async () => {
  const stdout = capture();
  const stderr = capture();
  const code = await run([], {
    installImpl: async () => { throw new Error('network offline'); },
    stdout: stdout.stream,
    stderr: stderr.stream
  });
  assert.equal(code, 1);
  assert.equal(stdout.value(), '');
  assert.equal(stderr.value(), 'create-cab: network offline\n');
  assert.doesNotMatch(stderr.value(), /Error:|\n\s+at /);
});

test('the executable runs directly, including through an npm-style symlink', async (t) => {
  const executable = fileURLToPath(new URL('../bin/create-cab.js', import.meta.url));
  const { stdout, stderr } = await execFileAsync(process.execPath, [executable, '--help']);
  assert.match(stdout, /Usage: create-cab/);
  assert.equal(stderr, '');

  const directory = await mkdtemp(join(tmpdir(), 'create-cab-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const link = join(directory, 'create-cab');
  await symlink(executable, link);
  const linked = await execFileAsync(process.execPath, [link, '--help']);
  assert.match(linked.stdout, /Usage: create-cab/);
  assert.equal(linked.stderr, '');
});
