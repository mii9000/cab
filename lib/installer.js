import { copyFile, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as tar from 'tar';

export const SOURCE_URL = 'https://codeload.github.com/mii9000/cab/tar.gz/refs/heads/main';
const REQUIRED_FILES = ['AGENTS.md', '.pi/settings.json', '.pi/aliases.json'];

const at = (root, path) => join(root, ...path.split('/'));

async function lstatOrNull(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function unsafe(path, reason) {
  throw new Error(`Unsafe destination ${path}: ${reason}`);
}

async function assertSource(path, relativePath, directory = false) {
  const stats = await lstatOrNull(path);
  if (!stats) throw new Error(`CAB source is missing ${relativePath}`);
  if (directory ? !stats.isDirectory() : !stats.isFile()) {
    throw new Error(`CAB source ${relativePath} must be ${directory ? 'a directory' : 'a regular file'}`);
  }
}

async function filesUnder(root, directory) {
  await assertSource(at(root, directory), directory, true);
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const stats = await lstat(path);
      const relativePath = relative(root, path).split(sep).join('/');
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) files.push(relativePath);
      else throw new Error(`CAB source ${relativePath} must be a regular file or directory`);
    }
  }
  await visit(at(root, directory));
  return files;
}

async function sourceFiles(root) {
  for (const path of REQUIRED_FILES) await assertSource(at(root, path), path);
  return [...REQUIRED_FILES, ...(await filesUnder(root, '.agents'))].sort();
}

function parentDirectories(files) {
  const directories = new Set();
  for (const file of files) {
    const parts = file.split('/').slice(0, -1);
    for (let length = 1; length <= parts.length; length += 1) {
      directories.add(parts.slice(0, length).join('/'));
    }
  }
  return [...directories].sort((a, b) => a.split('/').length - b.split('/').length);
}

async function preflight(target, files, force) {
  const targetStats = await lstatOrNull(target);
  if (targetStats?.isSymbolicLink()) unsafe('.', 'symbolic links are not allowed');
  if (targetStats && !targetStats.isDirectory()) unsafe('.', 'expected a directory');

  for (const directory of parentDirectories(files)) {
    const stats = await lstatOrNull(at(target, directory));
    if (!stats) continue;
    if (stats.isSymbolicLink()) unsafe(directory, 'symbolic links are not allowed');
    if (!stats.isDirectory()) unsafe(directory, 'expected a directory');
  }

  const conflicts = [];
  for (const file of files) {
    const stats = await lstatOrNull(at(target, file));
    if (!stats) continue;
    if (stats.isSymbolicLink()) unsafe(file, 'symbolic links are not allowed');
    if (!stats.isFile()) unsafe(file, 'expected a regular file');
    if (!force) conflicts.push(file);
  }
  if (conflicts.length) {
    throw new Error(`CAB files already exist:\n${conflicts.map((path) => `- ${path}`).join('\n')}\nRun again with --force to replace regular files.`);
  }
}

export async function install({
  targetDirectory,
  force = false,
  sourceUrl = SOURCE_URL,
  fetchImpl = globalThis.fetch,
  temporaryParent = tmpdir(),
  copyFileImpl = copyFile
}) {
  const target = resolve(targetDirectory);
  const temporaryDirectory = await mkdtemp(join(temporaryParent, 'create-cab-'));
  try {
    let response;
    try { response = await fetchImpl(sourceUrl); }
    catch (error) { throw new Error(`Failed to download CAB: ${error.message}`, { cause: error }); }
    if (!response.ok) throw new Error(`Failed to download CAB: HTTP ${response.status}`);

    const archive = join(temporaryDirectory, 'cab.tgz');
    const extracted = join(temporaryDirectory, 'extracted');
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    await mkdir(extracted);
    try {
      await tar.x({ cwd: extracted, file: archive, preservePaths: false, strict: true });
    } catch (error) {
      throw new Error(`Failed to extract CAB archive: ${error.message}`, { cause: error });
    }

    const roots = await readdir(extracted, { withFileTypes: true });
    if (roots.length !== 1 || !roots[0].isDirectory()) throw new Error('CAB archive must contain one repository directory');
    const repositoryRoot = join(extracted, roots[0].name);
    const files = await sourceFiles(repositoryRoot);
    await preflight(target, files, force);

    try {
      for (const path of files) {
        const destination = at(target, path);
        await mkdir(dirname(destination), { recursive: true });
        await copyFileImpl(at(repositoryRoot, path), destination);
      }
    } catch (error) {
      throw new Error(`Failed to copy CAB files into ${target}; installation may be partial: ${error.message}`, { cause: error });
    }
    return { count: files.length, targetDirectory: target };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
