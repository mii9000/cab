import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as tar from 'tar';

export const BASE_FILES = {
  'AGENTS.md': 'agent rules\n',
  '.agents/skills/example/SKILL.md': 'example skill\n',
  '.pi/settings.json': '{"theme":"default"}\n',
  '.pi/aliases.json': '{}\n',
  'README.md': 'must not be copied\n'
};

export async function createArchive(t, { files = BASE_FILES, symlinks = {} } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'cab-fixture-'));
  const repository = join(workspace, 'cab-main');
  const archive = join(workspace, 'cab.tgz');
  for (const [path, contents] of Object.entries(files)) {
    const destination = join(repository, ...path.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  for (const [path, target] of Object.entries(symlinks)) {
    const destination = join(repository, ...path.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await symlink(target, destination);
  }
  await tar.c({ cwd: workspace, file: archive, gzip: true }, ['cab-main']);
  const body = await readFile(archive);
  t.after(() => rm(workspace, { recursive: true, force: true }));
  return body;
}

export async function serve(t, { body, status = 200 }) {
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'content-type': 'application/gzip' });
    response.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/cab.tgz`;
}
