import { build } from 'tsup';

const watch = process.argv.includes('--watch');

await build({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: !watch,
  watch,
  target: 'es2020'
});
