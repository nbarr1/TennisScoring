import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const nextCliCandidates = [
  join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'),
  join(cwd, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next')
];

const nextCli = nextCliCandidates.find((candidate) => existsSync(candidate));

if (!nextCli) {
  console.error('Unable to locate Next.js CLI in local or workspace node_modules.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [nextCli, 'build'], {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
