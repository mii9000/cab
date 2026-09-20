import test from 'node:test';
import assert from 'node:assert/strict';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../lib/installer.js';
import { BASE_FILES, createArchive, serve } from './helpers.js';

async function sandbox(t) {
  const path = await mkdtemp(join(tmpdir(), 'create-cab-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function fixture(t, options) {
  return serve(t, { body: await createArchive(t, options) });
}

test('installs only the approved CAB files into a nested target', async (t) => {
  const root = await sandbox(t);
  const target = join(root, 'new', 'project');
  const result = await install({ targetDirectory: target, sourceUrl: await fixture(t) });
  assert.deepEqual(result, { count: 4, targetDirectory: target });
  for (const [path, contents] of Object.entries(BASE_FILES)) {
    if (path === 'README.md') await assert.rejects(access(join(target, path)), { code: 'ENOENT' });
    else assert.equal(await readFile(join(target, path), 'utf8'), contents);
  }
});

test('reports all conflicts before writing and force replaces regular files', async (t) => {
  const root = await sandbox(t);
  const target = join(root, 'project');
  await mkdir(join(target, '.agents/skills/example'), { recursive: true });
  await writeFile(join(target, 'AGENTS.md'), 'old agent');
  await writeFile(join(target, '.agents/skills/example/SKILL.md'), 'old skill');
  const sourceUrl = await fixture(t);
  await assert.rejects(install({ targetDirectory: target, sourceUrl }), (error) => {
    assert.match(error.message, /AGENTS\.md/);
    assert.match(error.message, /\.agents\/skills\/example\/SKILL\.md/);
    assert.match(error.message, /--force/);
    return true;
  });
  await assert.rejects(access(join(target, '.pi/settings.json')), { code: 'ENOENT' });
  await install({ targetDirectory: target, sourceUrl, force: true });
  assert.equal(await readFile(join(target, 'AGENTS.md'), 'utf8'), BASE_FILES['AGENTS.md']);
});

test('rejects unsafe destination types', async (t) => {
  const root = await sandbox(t);
  const sourceUrl = await fixture(t);
  const target = join(root, 'project');
  await mkdir(target, { recursive: true });
  await mkdir(join(root, 'outside'));
  await symlink(join(root, 'outside'), join(target, '.agents'));
  await assert.rejects(install({ targetDirectory: target, sourceUrl, force: true }), /Unsafe destination \.agents/);
  assert.deepEqual(await readdir(join(root, 'outside')), []);
});

test('rejects a symlink target directory', async (t) => {
  const root = await sandbox(t);
  const target = join(root, 'project');
  const outside = join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, target);
  await assert.rejects(install({ targetDirectory: target, sourceUrl: await fixture(t), force: true }), (error) => {
    assert.equal(error.message, 'Unsafe destination .: symbolic links are not allowed');
    return true;
  });
  assert.deepEqual(await readdir(outside), []);
});

test('reports partial installation when copying fails', async (t) => {
  const root = await sandbox(t);
  const temporaryParent = join(root, 'temporary');
  const target = join(root, 'project');
  await mkdir(temporaryParent);
  let copies = 0;
  await assert.rejects(
    install({
      targetDirectory: target,
      sourceUrl: await fixture(t),
      temporaryParent,
      copyFileImpl: async (...args) => {
        copies += 1;
        if (copies === 2) throw new Error('disk full');
        return copyFile(...args);
      }
    }),
    (error) => {
      assert.match(error.message, /Failed to copy CAB files into/);
      assert.match(error.message, /installation may be partial/);
      assert.match(error.message, /disk full/);
      assert.ok(error.message.includes(target));
      return true;
    }
  );
  assert.ok(copies >= 2);
  assert.deepEqual(await readdir(temporaryParent), []);
  assert.ok((await readdir(target)).length > 0);
});

test('rejects file and directory mismatches', async (t) => {
  const root = await sandbox(t);
  const sourceUrl = await fixture(t);
  const target = join(root, 'project');
  await mkdir(join(target, '.agents'), { recursive: true });
  await mkdir(join(target, 'AGENTS.md'), { recursive: true });
  await assert.rejects(install({ targetDirectory: target, sourceUrl, force: true }), /AGENTS\.md.*regular file/);
  await rm(join(target, 'AGENTS.md'), { recursive: true });
  await rm(join(target, '.agents'), { recursive: true });
  await writeFile(join(target, '.agents'), 'not a directory');
  await assert.rejects(install({ targetDirectory: target, sourceUrl, force: true }), /Unsafe destination \.agents.*directory/);
});

test('cleans temporary files and preserves destination on preflight failures', async (t) => {
  const root = await sandbox(t);
  const temporaryParent = join(root, 'temporary');
  const target = join(root, 'project');
  await mkdir(temporaryParent);
  await mkdir(target);
  await writeFile(join(target, 'sentinel'), 'keep');
  const sourceUrl = await serve(t, { body: Buffer.from('not a tar archive') });
  await assert.rejects(install({ targetDirectory: target, sourceUrl, temporaryParent }), /Failed to extract CAB archive/);
  assert.equal(await readFile(join(target, 'sentinel'), 'utf8'), 'keep');
  assert.deepEqual(await readdir(temporaryParent), []);
});

test('reports HTTP and network errors', async (t) => {
  const root = await sandbox(t);
  const target = join(root, 'project');
  const temporaryParent = join(root, 'temporary');
  await mkdir(temporaryParent);
  const unavailable = await serve(t, { body: Buffer.from(''), status: 503 });
  await assert.rejects(install({ targetDirectory: target, sourceUrl: unavailable, temporaryParent }), /HTTP 503/);
  await assert.rejects(install({ targetDirectory: target, temporaryParent, fetchImpl: async () => { throw new Error('offline'); } }), /offline/);
  assert.deepEqual(await readdir(temporaryParent), []);
});

test('rejects missing and symlink source entries', async (t) => {
  const root = await sandbox(t);
  const target = join(root, 'project');
  const missing = { ...BASE_FILES };
  delete missing['.pi/aliases.json'];
  await assert.rejects(install({ targetDirectory: target, sourceUrl: await fixture(t, { files: missing }) }), /missing \.pi\/aliases\.json/);
  await assert.rejects(
    install({ targetDirectory: target, sourceUrl: await fixture(t, { symlinks: { '.agents/link': '../AGENTS.md' } }) }),
    /CAB source .* must be a regular file or directory/
  );
});
