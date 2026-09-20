#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../lib/installer.js';

const USAGE = `Usage: create-cab [directory] [--force]

Install CAB configuration into a local directory.

Options:
  --force  Replace existing regular files
  --help   Show this help
`;

export function parseArgs(argv) {
  let directory;
  let force = false;
  let help = false;
  for (const argument of argv) {
    if (argument === '--force') force = true;
    else if (argument === '--help') help = true;
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (directory) throw new Error('Only one directory may be provided');
    else directory = argument;
  }
  return { directory, force, help };
}

export async function run(argv, {
  cwd = process.cwd(), installImpl = install, stdout = process.stdout, stderr = process.stderr
} = {}) {
  try {
    const { directory, force, help } = parseArgs(argv);
    if (help) {
      stdout.write(USAGE);
      return 0;
    }
    const targetDirectory = resolve(cwd, directory ?? '.');
    const result = await installImpl({ targetDirectory, force });
    stdout.write(`Installed ${result.count} CAB files in ${result.targetDirectory}\n`);
    return 0;
  } catch (error) {
    stderr.write(`create-cab: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exitCode = await run(process.argv.slice(2));
}
