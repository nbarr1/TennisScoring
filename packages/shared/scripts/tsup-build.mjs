import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const args = ['src/index.ts', '--format', 'esm,cjs', '--dts'];
const cliCandidates = [
  join(cwd, 'node_modules', 'tsup', 'dist', 'cli-default.js'),
  join(cwd, '..', '..', 'node_modules', 'tsup', 'dist', 'cli-default.js')
];

const cliPath = cliCandidates.find((candidate) => existsSync(candidate));

if (!cliPath) {
  console.error('Unable to locate tsup CLI in package or workspace node_modules.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliPath, ...args], {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
